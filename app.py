"""
Flask web server for Heston-Kou Stock Price Modelling
"""

from flask import Flask, render_template, request, jsonify, Response
from heston_kou_engine import run_analysis, simulate_heston_kou_mc
import os

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max

DEFAULT_RESULTS_CACHE = {}


def get_default_results(num_paths=10000):
    global DEFAULT_RESULTS_CACHE
    if num_paths not in DEFAULT_RESULTS_CACHE:
        sample_path = os.path.join(os.path.dirname(__file__), 'olah dataa.csv')
        if os.path.exists(sample_path):
            with open(sample_path, 'r', encoding='utf-8') as f:
                content = f.read()
            res = run_analysis(content, num_paths=num_paths)
            res['filename'] = 'olah dataa.csv'
            res['total_rows'] = 237
            DEFAULT_RESULTS_CACHE[num_paths] = res
    return DEFAULT_RESULTS_CACHE.get(num_paths)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/default-results', methods=['GET'])
def default_results():
    try:
        paths = request.args.get('paths', default=10000, type=int)
        results = get_default_results(num_paths=paths)
        if results:
            return jsonify(results)
        return jsonify({'error': 'Default data not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/download-template', methods=['GET'])
def download_template():
    sample_path = os.path.join(os.path.dirname(__file__), 'olah dataa.csv')
    if os.path.exists(sample_path):
        with open(sample_path, 'r', encoding='utf-8') as f:
            content = f.read()
    else:
        content = "Date;Adj Close\n13/01/2025;408\n14/01/2025;418\n15/01/2025;406\n16/01/2025;410\n17/01/2025;400\n20/01/2025;404\n21/01/2025;408\n"
    return Response(
        content,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=template_saham_heston_kou.csv"}
    )


@app.route('/api/analyze', methods=['POST'])
def analyze():
    if 'file' not in request.files:
        return jsonify({'error': 'File tidak ditemukan'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Tidak ada file yang dipilih'}), 400

    if not file.filename.endswith('.csv'):
        return jsonify({'error': 'File harus berformat CSV'}), 400

    try:
        paths = request.form.get('paths', default=10000, type=int)
        csv_content = file.read().decode('utf-8')
        results = run_analysis(csv_content, num_paths=paths)
        results['filename'] = file.filename
        results['total_rows'] = len(results.get('historical', {}).get('prices', []))
        return jsonify(results)
    except Exception as e:
        return jsonify({'error': f'Gagal memproses data: {str(e)}'}), 500


@app.route('/api/simulate-mc', methods=['POST'])
def simulate_mc():
    """
    Simulasi ulang Monte Carlo instan dengan jumlah lintasan berbeda
    tanpa perlu kalkulasi ulang FDT atau optimasi parameter.
    """
    try:
        data = request.get_json(force=True) or {}
        paths = int(data.get('paths', 10000))
        seed = int(data.get('seed', 42))

        # Parameter Heston & Kou
        S0 = float(data.get('S0', 408))
        V0 = float(data.get('V0', 0.05))
        kappa = float(data.get('kappa', 2.0))
        theta = float(data.get('theta', 0.05))
        sigma_v = float(data.get('sigma_v', 0.3))
        rho = float(data.get('rho', -0.5))
        mu_est = float(data.get('mu', 0.1))
        lam = float(data.get('lambda', 0.05))
        p = float(data.get('p', 0.5))
        eta1 = float(data.get('eta1', 10.0))
        eta2 = float(data.get('eta2', 10.0))

        mc_res = simulate_heston_kou_mc(
            S0=S0, V0=V0, kappa=kappa, theta=theta, sigma_v=sigma_v, rho=rho,
            mu_est=mu_est, lam=lam, p=p, eta1=eta1, eta2=eta2,
            Nsteps=237, paths=paths, seed=seed
        )
        return jsonify(mc_res)
    except Exception as e:
        return jsonify({'error': f'Gagal simulasi Monte Carlo: {str(e)}'}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)

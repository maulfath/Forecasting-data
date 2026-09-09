"""
Flask web server for Heston-Kou Stock Price Modelling
"""

from flask import Flask, render_template, request, jsonify, Response
from heston_kou_engine import run_analysis

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max


import os

DEFAULT_RESULTS = None

def get_default_results():
    global DEFAULT_RESULTS
    if DEFAULT_RESULTS is None:
        sample_path = os.path.join(os.path.dirname(__file__), 'olah dataa.csv')
        if os.path.exists(sample_path):
            with open(sample_path, 'r', encoding='utf-8') as f:
                content = f.read()
            DEFAULT_RESULTS = run_analysis(content)
            DEFAULT_RESULTS['filename'] = 'olah dataa.csv'
            DEFAULT_RESULTS['total_rows'] = 237
    return DEFAULT_RESULTS


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/default-results', methods=['GET'])
def default_results():
    try:
        results = get_default_results()
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
        csv_content = file.read().decode('utf-8')
        results = run_analysis(csv_content)
        results['filename'] = file.filename
        results['total_rows'] = len(results.get('historical', {}).get('prices', []))
        return jsonify(results)
    except Exception as e:
        return jsonify({'error': f'Gagal memproses data: {str(e)}'}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)

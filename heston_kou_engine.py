"""
Heston-Kou Stock Price Modelling Engine
Modul komputasi untuk analisis harga saham menggunakan model Heston-Kou.
"""

import numpy as np
import pandas as pd
from scipy.integrate import quad
from scipy.optimize import minimize_scalar
import warnings
import io

warnings.filterwarnings('ignore')


def run_analysis(csv_content):
    """
    Menjalankan seluruh analisis Heston-Kou dari data CSV.
    Returns dictionary berisi semua hasil analisis.
    """
    # 1. DISKRETISASI: LOG-PRICE & LOG-RETURN
    try:
        df = pd.read_csv(io.StringIO(csv_content), sep=None, engine='python')
    except Exception:
        df = pd.read_csv(io.StringIO(csv_content), sep=';')

    # Cari kolom Date dan Price secara fleksibel
    date_col = None
    price_col = None
    for col in df.columns:
        clean_col = str(col).strip().lower()
        if clean_col in ['date', 'tanggal', 'timestamp', 'time']:
            date_col = col
        elif clean_col in ['adj close', 'adj_close', 'close', 'penutupan', 'price', 'harga']:
            price_col = col

    if not date_col:
        date_col = df.columns[0]
    if not price_col:
        price_col = df.columns[1] if len(df.columns) > 1 else df.columns[0]

    df[date_col] = pd.to_datetime(df[date_col], dayfirst=True, errors="coerce")
    df[price_col] = df[price_col].astype(str).str.replace(",", "", regex=False)
    df[price_col] = pd.to_numeric(df[price_col], errors="coerce")

    df = df.dropna(subset=[date_col, price_col]).copy()
    df = df[df[price_col] > 0].copy()
    df = df.sort_values(date_col).reset_index(drop=True)

    df["X"] = np.log(df[price_col])
    df["r"] = df["X"].diff()
    df = df.dropna(subset=["r"]).reset_index(drop=True)

    dt = 1 / 237
    df["dt"] = dt

    # DETEKSI JUMP (MAD)
    rvals = df["r"].values
    median_r = np.median(rvals)
    mad = np.median(np.abs(rvals - median_r))
    c = 4.0
    threshold = c * mad

    df["abs_dev"] = np.abs(df["r"] - median_r)
    df["is_jump"] = (df["abs_dev"] > threshold).astype(int)

    # RETURN CLEAN
    df["r_clean"] = df["r"].where(df["is_jump"] == 0, np.nan)

    # PROXY VARIANS
    df["v_proxy"] = (df["r_clean"] ** 2) / dt
    df["v_proxy_ma10"] = df["v_proxy"].rolling(10, min_periods=1).mean()
    df["v_proxy_ma20"] = df["v_proxy"].rolling(20, min_periods=1).mean()

    out = df[[date_col, price_col, "X", "r", "abs_dev", "is_jump", "r_clean",
              "v_proxy", "v_proxy_ma10", "v_proxy_ma20", "dt"]].copy()

    # 2. STATISTIK LOMPATAN
    df_jump = out[out['is_jump'] == 1].copy()
    df_jump['Date'] = pd.to_datetime(df_jump['Date'])

    lompatan_naik = []
    lompatan_turun = []
    for _, row in df_jump.iterrows():
        entry = {
            'tanggal': row['Date'].strftime('%d-%m-%Y'),
            'return': round(float(row['r']), 4)
        }
        if row['r'] > 0:
            lompatan_naik.append(entry)
        else:
            lompatan_turun.append(entry)

    # 3. ESTIMASI PARAMETER HESTON-KOU
    total_years = len(out) * dt
    num_jumps = len(df_jump)
    lambda_jump = num_jumps / total_years

    jump_sizes = df_jump['r'].values
    pos_jumps = jump_sizes[jump_sizes > 0]
    neg_jumps = jump_sizes[jump_sizes < 0]

    if num_jumps > 0:
        p_prob = len(pos_jumps) / num_jumps
        q_prob = 1.0 - p_prob
    else:
        p_prob = 0.5
        q_prob = 0.5

    eta1 = 1.0 / np.mean(pos_jumps) if len(pos_jumps) > 0 else 0.0
    eta2 = 1.0 / np.mean(np.abs(neg_jumps)) if len(neg_jumps) > 0 else 0.0

    # Estimasi Parameter Heston
    v = out['v_proxy_ma20'].values
    valid_idx = np.isfinite(v)
    v = v[valid_idx]

    if len(v) > 10:
        v_curr = v[:-1]
        v_next = v[1:]
        Y = (v_next - v_curr) / dt
        X = v_curr
        slope, intercept = np.polyfit(X, Y, 1)
        kappa = -slope
        theta = intercept / kappa

        residuals = Y - (intercept + slope * X)
        sigma_v = np.std(residuals) / np.sqrt(np.mean(X) * dt)

        df_reg = out.dropna(subset=['v_proxy_ma20', 'r_clean']).copy()
        if len(df_reg) > 10:
            v_reg = df_reg['v_proxy_ma20'].values
            r_reg = df_reg['r_clean'].values
            v_c = v_reg[:-1]
            v_n = v_reg[1:]
            dV_dt = (v_n - v_c) / dt
            resid_reg = dV_dt - (intercept + slope * v_c)
            r_next_reg = r_reg[1:]
            rho = float(np.corrcoef(r_next_reg, resid_reg)[0, 1])
        else:
            rho = 0
    else:
        kappa, theta, sigma_v, rho = 0, 0, 0, 0

    mean_total_return = out['r'].mean()
    mu_est = (mean_total_return / dt) + (0.5 * theta)

    # 4. SIMULASI MONTE CARLO
    lam = lambda_jump
    p = p_prob
    S0 = float(out['Adj Close'].iloc[-1])
    if 'v_proxy_ma20' in out.columns:
        V0 = float(out['v_proxy_ma20'].dropna().iloc[-1])
    else:
        V0 = float(out['v_proxy'].dropna().iloc[-1])
    V0 = max(V0, 1e-8)

    paths = 10000
    Nsteps = 237
    T = 1.0
    dt_sim = T / Nsteps
    np.random.seed(42)

    kJ = p * eta1 / (eta1 - 1) + (1 - p) * eta2 / (eta2 + 1) - 1

    if sigma_v > 5:
        v_series = out['v_proxy_ma20'].dropna().values
        v_lag = v_series[:-1]
        dv = np.diff(v_series)
        X_mat = np.column_stack([np.ones(len(v_lag)), v_lag])
        alpha_hat, beta_hat = np.linalg.lstsq(X_mat, dv, rcond=None)[0]
        residual_new = dv - (alpha_hat + beta_hat * v_lag)
        sigma_v_new = np.sqrt(np.mean((residual_new ** 2) / (np.maximum(v_lag, 1e-8) * dt_sim)))
        sigma_v = float(sigma_v_new)

    prices = np.zeros((paths, Nsteps + 1))
    variances = np.zeros((paths, Nsteps + 1))
    prices[:, 0] = S0
    variances[:, 0] = V0

    S_t = np.full(paths, S0, dtype=float)
    v_t = np.full(paths, V0, dtype=float)

    for t in range(1, Nsteps + 1):
        Z1 = np.random.normal(0, 1, paths)
        Z2 = np.random.normal(0, 1, paths)
        dW1 = np.sqrt(dt_sim) * Z1
        dW2 = np.sqrt(dt_sim) * (rho * Z1 + np.sqrt(max(1 - rho**2, 0)) * Z2)
        v_pos = np.maximum(v_t, 0)

        jump_count = np.random.poisson(lam * dt_sim, paths)
        jumps = np.zeros(paths)
        idx_jump = np.where(jump_count > 0)[0]

        for i in idx_jump:
            total_jump = 0.0
            for _ in range(jump_count[i]):
                u = np.random.uniform()
                if u < p:
                    total_jump += np.random.exponential(scale=1 / eta1)
                else:
                    total_jump -= np.random.exponential(scale=1 / eta2)
            jumps[i] = total_jump

        S_t = S_t * np.exp((mu_est - lam * kJ - 0.5 * v_pos) * dt_sim + np.sqrt(v_pos) * dW1 + jumps)
        v_new = v_t + kappa * (theta - v_pos) * dt_sim + sigma_v * np.sqrt(v_pos) * dW2
        v_t = np.maximum(v_new, 0)

        prices[:, t] = S_t
        variances[:, t] = v_t

    # Lintasan representatif
    time_grid = np.arange(Nsteps + 1)
    final_prices = prices[:, -1]
    mean_final_temp = np.mean(final_prices)

    candidate_n = 500
    candidate_idx = np.argsort(np.abs(final_prices - mean_final_temp))[:candidate_n]
    down_counts = np.array([np.sum(np.diff(prices[i, :]) < 0) for i in candidate_idx])
    rep_path_idx = candidate_idx[np.argmax(down_counts)]
    mc_one_line_price = prices[rep_path_idx, :].tolist()

    # Statistik probabilistik
    mean_final = float(np.mean(final_prices))
    median_final = float(np.median(final_prices))
    std_final = float(np.std(final_prices))
    p05_final = float(np.percentile(final_prices, 5))
    p95_final = float(np.percentile(final_prices, 95))
    prob_up = float(np.mean(final_prices > S0))

    # Histogram data
    x_max = p95_final * 1.25
    final_prices_plot = final_prices[final_prices <= x_max]
    hist_counts, hist_edges = np.histogram(final_prices_plot, bins=40, density=False)

    # 5. ANALISIS FDT
    k_J_fdt = (p * eta1) / (eta1 - 1) + ((1 - p) * eta2) / (eta2 + 1) - 1

    def phi_heston_kou(u):
        i = 1j
        b = kappa - rho * sigma_v * i * u
        d = np.sqrt(b**2 + sigma_v**2 * (u**2 + i * u))
        g = (b - d) / (b + d)
        C = (i * u * (mu_est - lam * k_J_fdt) * T +
             (kappa * theta / sigma_v**2) * ((b - d) * T - 2 * np.log((1 - g * np.exp(-d * T)) / (1 - g))))
        D = ((b - d) / sigma_v**2 * ((1 - np.exp(-d * T)) / (1 - g * np.exp(-d * T))))
        phi_Y = (p * eta1) / (eta1 - i * u) + ((1 - p) * eta2) / (eta2 + i * u)
        jump_term = lam * T * (phi_Y - 1)
        return np.exp(i * u * np.log(S0) + C + D * V0 + jump_term)

    def integrand_prob(u):
        K = S0
        value = np.exp(-1j * u * np.log(K)) * phi_heston_kou(u) / (1j * u)
        return value.real

    integral_value, _ = quad(integrand_prob, 1e-8, 500, limit=300)
    prob_fdt = 0.5 + (1 / np.pi) * integral_value

    def density_fdt(S_val):
        if S_val <= 0:
            return 0
        x = np.log(S_val)
        def integrand_pdf(u):
            value = np.exp(-1j * u * x) * phi_heston_kou(u)
            return value.real
        integral_pdf, _ = quad(integrand_pdf, 0, 200, limit=200)
        return (1 / np.pi) * integral_pdf / S_val

    # Target harga FDT
    price_grid_search = np.linspace(100, 8000, 500)
    density_grid_search = np.array([density_fdt(S_val) for S_val in price_grid_search])
    idx_max = np.argmax(density_grid_search)
    lower_bound = price_grid_search[max(idx_max - 3, 0)]
    upper_bound = price_grid_search[min(idx_max + 3, len(price_grid_search) - 1)]

    result_mode = minimize_scalar(lambda S_val: -density_fdt(S_val),
                                  bounds=(lower_bound, upper_bound), method="bounded")
    target_fdt = float(result_mode.x)

    # FDT density curve
    price_grid_plot = np.linspace(100, 15000, 300)
    density_grid_plot = np.array([density_fdt(S_val) for S_val in price_grid_plot])

    # Data historis untuk grafik
    hist_dates = out['Date'].dt.strftime('%Y-%m-%d').tolist()
    hist_prices = out['Adj Close'].tolist()

    # Return semua hasil
    return {
        'historical': {
            'dates': hist_dates,
            'prices': hist_prices,
        },
        'jump_detection': {
            'mad': round(float(mad), 10),
            'threshold': round(float(threshold), 10),
            'total_jumps': int(num_jumps),
            'lompatan_naik': lompatan_naik,
            'lompatan_turun': lompatan_turun,
        },
        'kou_params': {
            'lambda': round(float(lambda_jump), 6),
            'p': round(float(p_prob), 6),
            'q': round(float(q_prob), 6),
            'eta1': round(float(eta1), 6),
            'eta2': round(float(eta2), 6),
        },
        'heston_params': {
            'kappa': round(float(kappa), 6),
            'theta': round(float(theta), 6),
            'sigma_v': round(float(sigma_v), 6),
            'rho': round(float(rho), 6),
            'mu': round(float(mu_est), 6),
        },
        'monte_carlo': {
            'paths': paths,
            'steps': Nsteps,
            'representative_path': mc_one_line_price,
            'time_grid': time_grid.tolist(),
        },
        'statistics': {
            'S0': round(float(S0), 4),
            'mean_final': round(mean_final, 4),
            'median_final': round(median_final, 4),
            'std_final': round(std_final, 4),
            'p05': round(p05_final, 4),
            'p95': round(p95_final, 4),
            'prob_up_mc': round(prob_up, 6),
        },
        'histogram': {
            'counts': hist_counts.tolist(),
            'edges': hist_edges.tolist(),
        },
        'fdt': {
            'prob_fdt': round(float(prob_fdt), 6),
            'target_price': round(target_fdt, 4),
            'price_grid': price_grid_plot.tolist(),
            'density_grid': density_grid_plot.tolist(),
        }
    }

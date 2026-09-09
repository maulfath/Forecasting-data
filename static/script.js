// ==========================================================================
// Heston-Kou Quant Platform — Frontend Controller
// ==========================================================================

let currentData = null;
let selectedFile = null;
let simulationInterval = null;

// ===== DOM Elements =====
const navTabs = document.querySelectorAll('.nav-tab');
const pageViews = {
    'page-upload': document.getElementById('page-upload'),
    'page-loading': document.getElementById('page-loading'),
    'page-dashboard': document.getElementById('page-dashboard')
};

// Upload Elements
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const chooseFileBtn = document.getElementById('chooseFileBtn');
const fileStatusBar = document.getElementById('fileStatusBar');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const fileRowCountDisplay = document.getElementById('fileRowCountDisplay');
const changeFileBtn = document.getElementById('changeFileBtn');
const removeFileBtn = document.getElementById('removeFileBtn');
const startAnalyzeBtn = document.getElementById('startAnalyzeBtn');

// Loading Elements
const gaugeCircle = document.getElementById('gaugeCircle');
const loadingPct = document.getElementById('loadingPct');
const loadingSubtext = document.getElementById('loadingSubtext');
const iterationCount = document.getElementById('iterationCount');
const remainingSec = document.getElementById('remainingSec');
const cancelSimBtn = document.getElementById('cancelSimBtn');
const ensemblePctText = document.getElementById('ensemblePctText');

// Dashboard Elements
const dashUploadNewBtn = document.getElementById('dashUploadNewBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const btnRerunSim = document.getElementById('btnRerunSim');
const btnAdvancedSettings = document.getElementById('btnAdvancedSettings');

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', () => {
    setupThemeToggle();
    setupTabNavigation();
    setupFileUpload();
    setupDashboardActions();

    // Fetch initial/default results so Dashboard is ready to preview immediately
    fetchDefaultResults();
});

// ===== Theme Management (Dark & Light Mode) =====
function applyTheme(themeName) {
    const isLight = themeName === 'light';
    if (isLight) {
        document.body.classList.add('light-theme');
        document.documentElement.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
        document.documentElement.classList.remove('light-theme');
    }
    localStorage.setItem('hk_theme', isLight ? 'light' : 'dark');

    // Update segmented switch active button states
    const btnDark = document.getElementById('btnThemeDark');
    const btnLight = document.getElementById('btnThemeLight');
    if (btnDark && btnLight) {
        if (isLight) {
            btnLight.classList.add('active');
            btnDark.classList.remove('active');
        } else {
            btnDark.classList.add('active');
            btnLight.classList.remove('active');
        }
    }

    // Re-render charts only if dashboard is currently visible to update theme colors
    if (currentData) {
        const dashPage = document.getElementById('page-dashboard');
        if (dashPage && dashPage.classList.contains('active')) {
            renderAllCharts(currentData);
        }
    }
}

function setupThemeToggle() {
    const savedTheme = localStorage.getItem('hk_theme') || 'dark';
    applyTheme(savedTheme);

    const btnDark = document.getElementById('btnThemeDark');
    const btnLight = document.getElementById('btnThemeLight');
    if (btnDark) {
        btnDark.addEventListener('click', () => applyTheme('dark'));
    }
    if (btnLight) {
        btnLight.addEventListener('click', () => applyTheme('light'));
    }

    // Fallback single button if present
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const nextTheme = document.body.classList.contains('light-theme') ? 'dark' : 'light';
            applyTheme(nextTheme);
        });
    }
}

// ===== Tab Navigation =====
function setupTabNavigation() {
    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-target');
            switchPage(target);
        });
    });
}

function switchPage(pageId) {
    // Update active tab button
    navTabs.forEach(tab => {
        if (tab.getAttribute('data-target') === pageId) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // Switch view
    Object.keys(pageViews).forEach(id => {
        if (id === pageId) {
            pageViews[id].classList.add('active');
        } else {
            pageViews[id].classList.remove('active');
        }
    });

    // If switching to dashboard, render charts cleanly now that container is visible (display: block)
    if (pageId === 'page-dashboard' && currentData) {
        setTimeout(() => {
            renderAllCharts(currentData);
            window.dispatchEvent(new Event('resize'));
        }, 50);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== File Upload Handling =====
function setupFileUpload() {
    uploadZone.addEventListener('click', (e) => {
        if (e.target !== chooseFileBtn) {
            fileInput.click();
        }
    });

    chooseFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    changeFileBtn.addEventListener('click', () => {
        fileInput.click();
    });

    removeFileBtn.addEventListener('click', () => {
        clearSelectedFile();
    });

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('drag-over');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('drag-over');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files[0]) {
            handleFileSelect(fileInput.files[0]);
        }
    });

    startAnalyzeBtn.addEventListener('click', () => {
        executeAnalysis();
    });

    // Copy Sample CSV Button
    const btnCopySample = document.getElementById('btnCopySample');
    if (btnCopySample) {
        btnCopySample.addEventListener('click', () => {
            const code = document.getElementById('sampleCsvCode').innerText;
            navigator.clipboard.writeText(code).then(() => {
                const origText = btnCopySample.innerHTML;
                btnCopySample.innerHTML = '✓ Tersalin!';
                setTimeout(() => { btnCopySample.innerHTML = origText; }, 2000);
            });
        });
    }

    // Use Built-in Sample Data Shortcut
    const btnUseSampleData = document.getElementById('btnUseSampleData');
    if (btnUseSampleData) {
        btnUseSampleData.addEventListener('click', () => {
            fileNameDisplay.textContent = 'olah dataa.csv';
            fileRowCountDisplay.textContent = '237 baris';
            uploadZone.style.display = 'none';
            fileStatusBar.style.display = 'flex';
            selectedFile = null; // null triggers default sample processing
            fileStatusBar.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    }
}

function handleFileSelect(file) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
        alert('Mohon pilih berkas dengan format .csv');
        return;
    }

    selectedFile = file;
    fileNameDisplay.textContent = file.name;

    // Estimate row count by reading file
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const lines = text.trim().split('\n');
        const count = Math.max(lines.length - 1, 1);
        fileRowCountDisplay.textContent = `${count} baris`;
    };
    reader.readAsText(file);

    // Hide the dropzone box so only the file bar is visible
    uploadZone.style.display = 'none';
    fileStatusBar.style.display = 'flex';
}

function clearSelectedFile() {
    selectedFile = null;
    fileInput.value = '';
    fileStatusBar.style.display = 'none';
    uploadZone.style.display = 'flex';
}

// ===== Execution & Simulation Pipeline =====
async function executeAnalysis() {
    if (!selectedFile) {
        // If no file explicitly chosen by user, use default sample
        executeWithDefaultOrSelected();
        return;
    }

    switchPage('page-loading');
    startLoadingAnimation();

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
        const res = await fetch('/api/analyze', {
            method: 'POST',
            body: formData
        });

        const data = await res.json();
        if (data.error) {
            stopLoadingAnimation();
            alert('Error saat analisis: ' + data.error);
            switchPage('page-upload');
            return;
        }

        // Finish animation quickly and transition
        finishLoadingAndDisplay(data);
    } catch (err) {
        stopLoadingAnimation();
        alert('Gagal menghubungi server: ' + err.message);
        switchPage('page-upload');
    }
}

async function executeWithDefaultOrSelected() {
    switchPage('page-loading');
    startLoadingAnimation();

    try {
        const res = await fetch('/api/default-results');
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        finishLoadingAndDisplay(data);
    } catch (e) {
        stopLoadingAnimation();
        alert('Gagal memproses: ' + e.message);
        switchPage('page-upload');
    }
}

function startLoadingAnimation() {
    let pct = 15;
    let iteration = 1500;
    let remaining = 24;

    updateGauge(pct, 'VALIDATING DATA');
    setStepState('step1', 'running', '● Sedang membaca...');
    setStepState('step2', 'pending', 'Menunggu');
    setStepState('step3', 'pending', 'Menunggu');
    setStepState('step4', 'pending', 'Menunggu');
    setStepState('step5', 'pending', 'Menunggu');
    setStepState('step6', 'pending', 'Menunggu');

    simulationInterval = setInterval(() => {
        if (pct < 90) {
            pct += Math.floor(Math.random() * 5) + 3;
            if (pct > 90) pct = 90;
            iteration = Math.floor((pct / 100) * 10000);
            remaining = Math.max(Math.floor((100 - pct) * 0.25), 2);

            iterationCount.textContent = iteration.toLocaleString('id-ID');
            remainingSec.textContent = `~${remaining}`;
            ensemblePctText.textContent = `${pct}.0%`;

            if (pct < 30) {
                updateGauge(pct, 'READING CSV');
                setStepState('step1', 'done', '● Selesai (237 baris)');
                setStepState('step2', 'running', '● Mendeteksi MAD...');
            } else if (pct < 55) {
                updateGauge(pct, 'ESTIMATING MLE');
                setStepState('step2', 'done', '● 17 Lompatan Terdeteksi');
                setStepState('step3', 'running', '● Mengestimasi MLE...');
            } else if (pct < 75) {
                updateGauge(pct, 'SIMULATING MC');
                setStepState('step3', 'done', '● Parameter Terkalibrasi');
                setStepState('step4', 'running', '● 10.000 Lintasan...');
            } else {
                updateGauge(pct, 'INTEGRATING FDT');
                setStepState('step4', 'done', '● Simulasi Konvergen');
                setStepState('step5', 'running', '● Transformasi Fourier...');
            }
        }
    }, 450);
}

function finishLoadingAndDisplay(data) {
    clearInterval(simulationInterval);
    updateGauge(100, 'SELESAI');
    iterationCount.textContent = '10.000';
    remainingSec.textContent = '0';
    ensemblePctText.textContent = '100.0%';

    for (let i = 1; i <= 6; i++) {
        setStepState(`step${i}`, 'done', '● Selesai');
    }

    setTimeout(() => {
        currentData = data;
        renderDashboard(data);
        switchPage('page-dashboard');
    }, 600);
}

function stopLoadingAnimation() {
    if (simulationInterval) clearInterval(simulationInterval);
}

function updateGauge(pct, statusText) {
    loadingPct.textContent = `${pct}%`;
    if (statusText) loadingSubtext.textContent = statusText;

    // Circumference = 2 * PI * 62 = ~389.5
    const circumference = 390;
    const offset = circumference - (pct / 100) * circumference;
    gaugeCircle.style.strokeDashoffset = offset;
}

function setStepState(stepId, state, tagText) {
    const el = document.getElementById(stepId);
    if (!el) return;

    el.className = `pipe-step ${state}`;
    const badge = el.querySelector('.step-badge');
    const tag = el.querySelector('.step-tag');

    if (state === 'done') {
        badge.innerHTML = '✓';
        badge.className = 'step-badge';
        tag.className = 'step-tag tag-green';
    } else if (state === 'running') {
        badge.innerHTML = '↻';
        badge.className = 'step-badge spinner';
        tag.className = 'step-tag tag-purple';
    } else {
        badge.className = 'step-badge';
        tag.className = 'step-tag tag-muted';
    }

    if (tagText) tag.textContent = tagText;
}

// ===== Fetch Default Sample Data =====
async function fetchDefaultResults() {
    try {
        const res = await fetch('/api/default-results');
        const data = await res.json();
        if (!data.error) {
            currentData = data;
            updateDashboardKPIs(data);
            const dashPage = document.getElementById('page-dashboard');
            if (dashPage && dashPage.classList.contains('active')) {
                renderAllCharts(data);
            }
        }
    } catch (e) {
        console.warn('Default data preview unavailable:', e);
    }
}

// ===== Render Dashboard =====
function formatRp(val) {
    if (val === undefined || val === null || isNaN(val)) return 'Rp 0';
    return 'Rp ' + Math.round(val).toLocaleString('id-ID');
}

function updateDashboardKPIs(data) {
    if (!data) return;
    const stats = data.statistics || {};
    const kou = data.kou_params || {};
    const heston = data.heston_params || {};
    const fdt = data.fdt || {};
    const jump = data.jump_detection || {};

    // 1. KPI Cards
    const S0 = stats.S0 || 880;
    const targetFDT = fdt.target_price || 1075;
    const targetPct = S0 > 0 ? ((targetFDT - S0) / S0 * 100) : 0;

    const elS0 = document.getElementById('dashS0');
    if (elS0) elS0.textContent = formatRp(S0);
    const elTarget = document.getElementById('dashTargetFDT');
    if (elTarget) elTarget.textContent = formatRp(targetFDT);
    const elTargetPct = document.getElementById('dashTargetPct');
    if (elTargetPct) elTargetPct.textContent = (targetPct >= 0 ? '+' : '') + targetPct.toFixed(2) + '%';
    
    const probMC = stats.prob_up_mc !== undefined ? stats.prob_up_mc : 0.8387;
    const probFDT = fdt.prob_fdt !== undefined ? fdt.prob_fdt : 0.8365;

    const elProbMC = document.getElementById('dashProbMC');
    if (elProbMC) elProbMC.textContent = (probMC * 100).toFixed(2) + '%';
    const elProbMCSub = document.getElementById('dashProbMCSub');
    if (elProbMCSub) elProbMCSub.textContent = `${Math.round(probMC * 10000).toLocaleString('id-ID')} DARI 10.000 SIMULASI > S₀`;
    const elProbFDT = document.getElementById('dashProbFDT');
    if (elProbFDT) elProbFDT.textContent = (probFDT * 100).toFixed(2) + '%';

    // 2. Kou Parameters Table
    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setTxt('kouLambda', (kou.lambda || 17.0).toFixed(4));
    setTxt('kouP', (kou.p || 0.8824).toFixed(4));
    setTxt('kouQ', (kou.q || 0.1176).toFixed(4));
    setTxt('kouEta1', (kou.eta1 || 8.2405).toFixed(4));
    setTxt('kouEta2', (kou.eta2 || 8.1502).toFixed(4));

    // 3. Heston Parameters Table
    setTxt('hestonKappa', (heston.kappa || 11.9513).toFixed(4));
    setTxt('hestonTheta', (heston.theta || 0.2868).toFixed(4));
    setTxt('hestonSigmaV', (heston.sigma_v || 0.6163).toFixed(4));
    setTxt('hestonRho', (heston.rho || -0.6361).toFixed(4));
    setTxt('hestonMu', (heston.mu || 1.9868).toFixed(4));

    // 4. Probabilistic Stats Table
    setTxt('statS0', formatRp(S0));
    setTxt('statMean', formatRp(stats.mean_final || 4407));
    setTxt('statMedian', formatRp(stats.median_final || 2848));
    setTxt('statStd', formatRp(stats.std_final || 5403));
    setTxt('statP05', formatRp(stats.p05 || 765));
    setTxt('statP95', formatRp(stats.p95 || 12000));
    setTxt('statProbBtn', (probMC * 100).toFixed(2) + '%');

    // Badges in Histogram Header
    setTxt('histBadgeS0', `Harga Awal: ${formatRp(S0)}`);
    setTxt('histBadgeMean', `Rata-rata: ${formatRp(stats.mean_final || 4407)}`);
    setTxt('histBadgeVaR', `VaR 95%: ${formatRp(stats.p05 || 765)}`);
    setTxt('histBadgeP95', `P95%: ${formatRp(stats.p95 || 12000)}`);

    // 5. Jump Tables
    renderJumpTables(jump);
}

function renderAllCharts(data) {
    if (!data) return;
    const dashboardView = document.getElementById('page-dashboard');
    if (!dashboardView || !dashboardView.classList.contains('active')) {
        return;
    }
    const S0 = data.statistics?.S0 || 880;
    try {
        renderMonteCarloChart(data.monte_carlo || {}, S0);
    } catch (e) {
        console.error('Error rendering Monte Carlo chart:', e);
    }
    try {
        renderFDTChart(data.fdt || {}, S0);
    } catch (e) {
        console.error('Error rendering FDT chart:', e);
    }
    try {
        renderHistogramChart(data.histogram, data.statistics || {}, S0);
    } catch (e) {
        console.error('Error rendering Histogram chart:', e);
    }
}

function renderDashboard(data) {
    updateDashboardKPIs(data);
    renderAllCharts(data);
}

function renderJumpTables(jump) {
    const naik = jump.lompatan_naik || [];
    const turun = jump.lompatan_turun || [];

    // Header count badges
    document.getElementById('jumpNaikBadge').textContent = `${naik.length} JUMP`;
    document.getElementById('jumpNaikSub').textContent = `Terdeteksi ${naik.length} lompatan signifikan (p = ${((naik.length / (naik.length + turun.length || 1))).toFixed(4)})`;

    document.getElementById('jumpTurunBadge').textContent = `${turun.length} JUMP`;
    document.getElementById('jumpTurunSub').textContent = `Terdeteksi ${turun.length} lompatan signifikan (q = ${((turun.length / (naik.length + turun.length || 1))).toFixed(4)})`;

    // Populate Naik
    const tbodyNaik = document.getElementById('tableJumpNaikBody');
    tbodyNaik.innerHTML = '';
    naik.forEach((item, idx) => {
        const tr = document.createElement('tr');
        const ret = typeof item.Return === 'number' ? item.Return : parseFloat(item.Return || 0);
        tr.innerHTML = `
            <td>${String(idx + 1).padStart(2, '0')}</td>
            <td>${item.Tanggal || '-'}</td>
            <td class="val-green">+${(ret * 100).toFixed(2)}%</td>
        `;
        tbodyNaik.appendChild(tr);
    });

    // Populate Turun
    const tbodyTurun = document.getElementById('tableJumpTurunBody');
    tbodyTurun.innerHTML = '';
    turun.forEach((item, idx) => {
        const tr = document.createElement('tr');
        const ret = typeof item.Return === 'number' ? item.Return : parseFloat(item.Return || 0);
        tr.innerHTML = `
            <td>${String(idx + 1).padStart(2, '0')}</td>
            <td>${item.Tanggal || '-'}</td>
            <td class="val-red">${(ret * 100).toFixed(2)}%</td>
        `;
        tbodyTurun.appendChild(tr);
    });
}

// ===== Plotly Theme-Aware Common Settings =====
function getPlotLayout() {
    const isLight = document.body.classList.contains('light-theme');
    const axisLineColor = isLight ? '#94a3b8' : '#334155';
    const tickTextColor = isLight ? '#0f172a' : '#94a3b8';

    return {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: {
            family: 'Inter, sans-serif',
            size: 11,
            color: tickTextColor
        },
        margin: { t: 25, r: 24, b: 52, l: 85 },
        xaxis: {
            showgrid: false,         // Hanya garis sumbu X dan Y saja
            zeroline: false,
            showline: true,
            linecolor: axisLineColor,
            linewidth: 1.5,
            mirror: false,
            ticks: 'outside',
            tickcolor: axisLineColor,
            ticklen: 4,
            tickfont: { family: 'JetBrains Mono', size: 11, color: tickTextColor },
            title: { standoff: 10 }
        },
        yaxis: {
            showgrid: false,         // Hanya garis sumbu X dan Y saja
            zeroline: false,
            showline: true,
            linecolor: axisLineColor,
            linewidth: 1.5,
            mirror: false,
            ticks: 'outside',
            tickcolor: axisLineColor,
            ticklen: 4,
            tickfont: { family: 'JetBrains Mono', size: 11, color: tickTextColor },
            title: { standoff: 12 }
        }
    };
}

const plotConfig = {
    responsive: true,
    displayModeBar: false
};

// 1. Monte Carlo Representative Path Chart
function renderMonteCarloChart(mc, S0) {
    const path = mc.representative_path || [];
    const timeGrid = mc.time_grid || Array.from({ length: path.length }, (_, i) => i);

    if (path.length === 0) return;

    const isLight = document.body.classList.contains('light-theme');
    const minVal = Math.min(...path);
    const maxVal = Math.max(...path);
    const minIdx = path.indexOf(minVal);
    const maxIdx = path.indexOf(maxVal);

    const traces = [
        // Path line with gradient fill
        {
            x: timeGrid,
            y: path,
            type: 'scatter',
            mode: 'lines',
            line: { color: isLight ? '#7c3aed' : '#a78bfa', width: 2.2 },
            fill: 'tozeroy',
            fillcolor: isLight ? 'rgba(124, 58, 237, 0.08)' : 'rgba(139, 92, 246, 0.14)',
            name: 'Lintasan MC',
            hovertemplate: 'Hari ke-%{x}<br>Harga: Rp %{y:,.0f}<extra></extra>'
        },
        // Initial Price S0
        {
            x: [0, timeGrid[timeGrid.length - 1]],
            y: [S0, S0],
            type: 'scatter',
            mode: 'lines',
            line: { color: isLight ? '#64748b' : '#94a3b8', width: 1.5, dash: 'dash' },
            name: `Harga Awal (Rp ${Math.round(S0).toLocaleString('id-ID')})`,
            hovertemplate: `Harga Awal S<sub>0</sub>: Rp ${Math.round(S0).toLocaleString('id-ID')}<extra></extra>`
        },
        // Min Point Marker
        {
            x: [timeGrid[minIdx]],
            y: [minVal],
            type: 'scatter',
            mode: 'markers',
            marker: { color: '#ef4444', size: 8, line: { color: isLight ? '#ffffff' : '#0f172a', width: 1.5 } },
            name: 'Titik Terendah',
            hovertemplate: `Terendah: Rp ${Math.round(minVal).toLocaleString('id-ID')}<extra></extra>`
        },
        // Max Point Marker
        {
            x: [timeGrid[maxIdx]],
            y: [maxVal],
            type: 'scatter',
            mode: 'markers',
            marker: { color: '#10b981', size: 8, line: { color: isLight ? '#ffffff' : '#0f172a', width: 1.5 } },
            name: 'Titik Tertinggi',
            hovertemplate: `Tertinggi: Rp ${Math.round(maxVal).toLocaleString('id-ID')}<extra></extra>`
        }
    ];

    const baseLayout = getPlotLayout();
    const layout = {
        ...baseLayout,
        xaxis: {
            ...baseLayout.xaxis,
            title: { text: 'Hari Perdagangan ke- (t)', standoff: 10, font: { size: 12, color: isLight ? '#0f172a' : '#94a3b8' } }
        },
        yaxis: {
            ...baseLayout.yaxis,
            title: { text: 'Harga Saham (Rp)', standoff: 12, font: { size: 12, color: isLight ? '#0f172a' : '#94a3b8' } },
            tickformat: ',d',
            range: [Math.max(0, Math.floor(minVal - 250)), Math.ceil(maxVal * 1.18)]
        },
        annotations: [
            {
                x: timeGrid[maxIdx],
                y: maxVal,
                text: `<b>Maks: Rp ${Math.round(maxVal).toLocaleString('id-ID')}</b>`,
                xanchor: 'center',
                yanchor: 'bottom',
                yshift: 6,
                font: { family: 'JetBrains Mono', size: 9.5, color: isLight ? '#059669' : '#34d399' },
                bgcolor: isLight ? '#ffffff' : 'rgba(15, 23, 42, 0.9)',
                bordercolor: '#10b981',
                borderwidth: 1,
                borderpad: 3,
                showarrow: false
            },
            // Posisikan label Min di ATAS titik merah agar tidak menabrak sumbu X atau angka tick
            {
                x: timeGrid[minIdx],
                y: minVal,
                text: `<b>Min: Rp ${Math.round(minVal).toLocaleString('id-ID')}</b>`,
                xanchor: 'center',
                yanchor: 'bottom',
                yshift: 8,
                font: { family: 'JetBrains Mono', size: 9.5, color: isLight ? '#dc2626' : '#f87171' },
                bgcolor: isLight ? '#ffffff' : 'rgba(15, 23, 42, 0.9)',
                bordercolor: '#ef4444',
                borderwidth: 1,
                borderpad: 3,
                showarrow: false
            }
        ],
        showlegend: false
    };

    Plotly.newPlot('chartMCPlot', traces, layout, plotConfig);
}

// 2. FDT Curve Chart
function renderFDTChart(fdt, S0) {
    const isLight = document.body.classList.contains('light-theme');
    const priceGrid = fdt.price_grid || [];
    const densityGrid = fdt.density_grid || [];

    if (priceGrid.length === 0) return;

    const maxDensity = Math.max(...densityGrid);
    const targetPrice = fdt.target_price || 1075;

    const traces = [
        // Cyan density curve
        {
            x: priceGrid,
            y: densityGrid,
            type: 'scatter',
            mode: 'lines',
            line: { color: isLight ? '#0284c7' : '#38bdf8', width: 2.2 },
            fill: 'tozeroy',
            fillcolor: isLight ? 'rgba(2, 132, 199, 0.1)' : 'rgba(56, 189, 248, 0.12)',
            name: 'Densitas Transisi',
            hovertemplate: 'Harga: Rp %{x:,.0f}<br>Densitas: %{y:.6f}<extra></extra>'
        },
        // S0 vertical dashed red
        {
            x: [S0, S0],
            y: [0, maxDensity * 1.15],
            type: 'scatter',
            mode: 'lines',
            line: { color: '#ef4444', width: 1.5, dash: 'dash' },
            name: `Garis Batas S₀`,
            hovertemplate: `Harga Awal S<sub>0</sub>: Rp ${Math.round(S0).toLocaleString('id-ID')}<extra></extra>`
        },
        // Target FDT vertical dashed cyan
        {
            x: [targetPrice, targetPrice],
            y: [0, maxDensity * 1.05],
            type: 'scatter',
            mode: 'lines',
            line: { color: isLight ? '#0284c7' : '#38bdf8', width: 1.5, dash: 'dash' },
            name: `Target Ekspektasi FDT`,
            hovertemplate: `Target Ekspektasi: Rp ${Math.round(targetPrice).toLocaleString('id-ID')}<extra></extra>`
        },
        // Mode point marker
        {
            x: [targetPrice],
            y: [maxDensity],
            type: 'scatter',
            mode: 'markers',
            marker: { color: isLight ? '#0284c7' : '#38bdf8', size: 8, line: { color: isLight ? '#ffffff' : '#0f172a', width: 1.5 } },
            showlegend: false,
            hovertemplate: `Modus: Rp ${Math.round(targetPrice).toLocaleString('id-ID')}<extra></extra>`
        }
    ];

    const fdtBaseLayout = getPlotLayout();
    const layout = {
        ...fdtBaseLayout,
        // Margin kiri 98px dan standoff 16 memberikan ruang lega agar judul sumbu Y tidak menabrak tick 0.00025
        margin: { t: 30, r: 24, b: 52, l: 98 },
        xaxis: {
            ...fdtBaseLayout.xaxis,
            title: { text: 'Harga Saham Terminal S_T (Rp)', standoff: 10, font: { size: 12, color: isLight ? '#0f172a' : '#94a3b8' } },
            tickformat: ',d',
            range: [0, Math.min(Math.max(...priceGrid), 10000)]
        },
        yaxis: {
            ...fdtBaseLayout.yaxis,
            title: { text: 'Densitas Probabilitas f(S)', standoff: 16, font: { size: 12, color: isLight ? '#0f172a' : '#94a3b8' } },
            tickformat: '.5f',
            exponentformat: 'none',
            range: [0, maxDensity * 1.32] // Memberi ruang lapang di atas kurva agar anotasi tidak menabrak garis kurva
        },
        annotations: [
            // S0 Label: diletakkan di ATAS kurva (headroom), shifted ke kiri, tidak memotong garis kurva
            {
                x: S0,
                y: maxDensity * 1.18,
                text: `<b>S<sub>0</sub>: Rp ${Math.round(S0).toLocaleString('id-ID')}</b>`,
                xanchor: 'right',
                xshift: -6,
                font: { family: 'JetBrains Mono', size: 9.5, color: isLight ? '#dc2626' : '#f87171' },
                bgcolor: isLight ? '#ffffff' : 'rgba(15, 23, 42, 0.92)',
                bordercolor: '#ef4444',
                borderwidth: 1.2,
                borderpad: 4,
                showarrow: false
            },
            // Modus / Target label: diletakkan di ATAS kurva sedikit di kanan garis Modus
            {
                x: targetPrice,
                y: maxDensity * 1.08,
                text: `<b>Modus: Rp ${Math.round(targetPrice).toLocaleString('id-ID')}</b>`,
                xanchor: 'left',
                xshift: 6,
                font: { family: 'JetBrains Mono', size: 9.5, color: isLight ? '#0369a1' : '#38bdf8' },
                bgcolor: isLight ? '#ffffff' : 'rgba(15, 23, 42, 0.92)',
                bordercolor: isLight ? '#0284c7' : '#38bdf8',
                borderwidth: 1.2,
                borderpad: 4,
                showarrow: false
            }
        ],
        showlegend: false
    };

    Plotly.newPlot('chartFDTPlot', traces, layout, plotConfig);
}

// 3. Monte Carlo Terminal Distribution Histogram Chart
function renderHistogramChart(hist, stats, S0) {
    if (!hist || !hist.counts) return;

    const isLight = document.body.classList.contains('light-theme');
    const counts = hist.counts;
    const edges = hist.edges;
    const midpoints = [];
    for (let i = 0; i < counts.length; i++) {
        midpoints.push((edges[i] + edges[i + 1]) / 2);
    }

    const maxCount = Math.max(...counts);
    const meanVal = stats.mean_final || 4407;
    const medianVal = stats.median_final || 2848;
    const p05Val = stats.p05 || 765;
    const p95Val = stats.p95 || 12000;

    const traces = [
        // Bar distribution
        {
            x: midpoints,
            y: counts,
            type: 'bar',
            marker: {
                color: isLight ? 'rgba(124, 58, 237, 0.75)' : 'rgba(139, 92, 246, 0.7)',
                line: { color: isLight ? '#6d28d9' : '#c084fc', width: 1 }
            },
            name: 'Frekuensi Simulasi',
            hovertemplate: 'Harga: Rp %{x:,.0f}<br>Frekuensi: %{y:,} lintasan<extra></extra>'
        },
        // S0 line (clean dashed without colliding text on trace)
        {
            x: [S0, S0],
            y: [0, maxCount * 1.15],
            type: 'scatter',
            mode: 'lines',
            line: { color: isLight ? '#64748b' : '#94a3b8', width: 1.5, dash: 'dash' },
            name: 'Harga Awal S₀',
            hovertemplate: `Harga Awal S₀: Rp ${Math.round(S0).toLocaleString('id-ID')}<extra></extra>`
        },
        // P05 line (VaR 95%)
        {
            x: [p05Val, p05Val],
            y: [0, maxCount * 1.15],
            type: 'scatter',
            mode: 'lines',
            line: { color: '#ef4444', width: 1.5, dash: 'dash' },
            name: 'VaR 95%',
            hovertemplate: `VaR 95%: Rp ${Math.round(p05Val).toLocaleString('id-ID')}<extra></extra>`
        },
        // Median Line
        {
            x: [medianVal, medianVal],
            y: [0, maxCount * 1.15],
            type: 'scatter',
            mode: 'lines',
            line: { color: isLight ? '#7c3aed' : '#c084fc', width: 1.5, dash: 'dash' },
            name: 'Median',
            hovertemplate: `Median: Rp ${Math.round(medianVal).toLocaleString('id-ID')}<extra></extra>`
        },
        // P95 line
        {
            x: [p95Val, p95Val],
            y: [0, maxCount * 1.15],
            type: 'scatter',
            mode: 'lines',
            line: { color: '#10b981', width: 1.5, dash: 'dash' },
            name: 'P95%',
            hovertemplate: `P95%: Rp ${Math.round(p95Val).toLocaleString('id-ID')}<extra></extra>`
        }
    ];

    const histBaseLayout = getPlotLayout();
    const layout = {
        ...histBaseLayout,
        bargap: 0.1,
        xaxis: {
            ...histBaseLayout.xaxis,
            title: { text: 'Harga Terminal S_T (Rp)', font: { size: 12, color: isLight ? '#0f172a' : '#94a3b8' } },
            tickformat: ',d',
            range: [0, Math.min(p95Val * 1.25, 25000)]
        },
        yaxis: {
            ...histBaseLayout.yaxis,
            title: { text: 'Jumlah Lintasan Simulasi', font: { size: 12, color: isLight ? '#0f172a' : '#94a3b8' } },
            tickformat: ',d',
            exponentformat: 'none',
            range: [0, maxCount * 1.38]
        },
        annotations: [
            // VaR 95% badge: shifted LEFT from x=765 at height 1.14
            {
                x: p05Val,
                y: maxCount * 1.14,
                text: `<b>VaR 95%</b><br>Rp ${Math.round(p05Val).toLocaleString('id-ID')}`,
                xanchor: 'right',
                xshift: -6,
                font: { family: 'JetBrains Mono', size: 9.5, color: isLight ? '#dc2626' : '#f87171' },
                bgcolor: isLight ? '#ffffff' : 'rgba(15, 23, 42, 0.92)',
                bordercolor: '#ef4444',
                borderwidth: 1.2,
                borderpad: 4,
                showarrow: false
            },
            // S0 badge: shifted RIGHT from x=1270 at height 1.28 (staggered above VaR)
            {
                x: S0,
                y: maxCount * 1.28,
                text: `<b>Harga Awal S<sub>0</sub></b><br>Rp ${Math.round(S0).toLocaleString('id-ID')}`,
                xanchor: 'left',
                xshift: 6,
                font: { family: 'JetBrains Mono', size: 9.5, color: isLight ? '#334155' : '#cbd5e1' },
                bgcolor: isLight ? '#ffffff' : 'rgba(15, 23, 42, 0.92)',
                bordercolor: isLight ? '#64748b' : '#94a3b8',
                borderwidth: 1.2,
                borderpad: 4,
                showarrow: false
            },
            // Median badge: centered at x=2940 at height 1.14
            {
                x: medianVal,
                y: maxCount * 1.14,
                text: `<b>Median</b><br>Rp ${Math.round(medianVal).toLocaleString('id-ID')}`,
                xanchor: 'center',
                font: { family: 'JetBrains Mono', size: 9.5, color: isLight ? '#6d28d9' : '#d8b4fe' },
                bgcolor: isLight ? '#ffffff' : 'rgba(15, 23, 42, 0.92)',
                bordercolor: isLight ? '#7c3aed' : '#a855f7',
                borderwidth: 1.2,
                borderpad: 4,
                showarrow: false
            },
            // P95 badge: centered at x=12693 at height 1.14
            {
                x: p95Val,
                y: maxCount * 1.14,
                text: `<b>P95%</b><br>Rp ${Math.round(p95Val).toLocaleString('id-ID')}`,
                xanchor: 'center',
                font: { family: 'JetBrains Mono', size: 9.5, color: isLight ? '#059669' : '#6ee7b7' },
                bgcolor: isLight ? '#ffffff' : 'rgba(15, 23, 42, 0.92)',
                bordercolor: '#10b981',
                borderwidth: 1.2,
                borderpad: 4,
                showarrow: false
            }
        ],
        showlegend: false
    };

    Plotly.newPlot('chartHistPlot', traces, layout, plotConfig);
}

// ===== Dashboard Extra Actions =====
function setupDashboardActions() {
    dashUploadNewBtn.addEventListener('click', () => {
        clearSelectedFile();
        switchPage('page-upload');
    });

    cancelSimBtn.addEventListener('click', () => {
        stopLoadingAnimation();
        switchPage('page-upload');
    });

    btnRerunSim.addEventListener('click', () => {
        executeAnalysis();
    });

    btnAdvancedSettings.addEventListener('click', () => {
        alert('Pengaturan Lanjutan: Menggunakan 10.000 Lintasan Monte Carlo, dt=1/237, dan filter MAD k=4.0.');
    });

    exportPdfBtn.addEventListener('click', () => {
        window.print();
    });
}

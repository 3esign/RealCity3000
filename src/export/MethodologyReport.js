import { getMethodologyHTML } from '../ui/AboutModal.js';

export function generateReportHTML(state) {
  const currentParams = JSON.stringify(state.params, null, 2);
  const metricsJson = JSON.stringify(state.metrics, null, 2);
  const historyCsv = state.metricsHistory.map(row => 
    `${row.year},${row.population},${row.urbanDensityPct},${row.averageLandValue},${row.pollutionIndex}`
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>RealCity3000 — Scientific Urban Growth Report</title>
  <style>
    body {
      font-family: 'SF Pro Display', -apple-system, 'Inter', sans-serif;
      line-height: 1.6;
      color: #1e293b;
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
    }
    h1, h2, h3 {
      color: #0f172a;
    }
    h1 {
      border-bottom: 2px solid #00f0ff;
      padding-bottom: 12px;
      font-size: 28px;
    }
    .meta-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 16px;
      margin: 20px 0;
      font-family: monospace;
      font-size: 13px;
    }
    .math-eq {
      background: #f1f5f9;
      padding: 12px;
      border-left: 3px solid #00f0ff;
      font-family: monospace;
      margin: 16px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 10px;
      text-align: left;
    }
    th {
      background: #f1f5f9;
    }
  </style>
  <script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>
  <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
</head>
<body>
  <h1>RealCity3000 // Scientific Urban Growth Report</h1>
  <p>Developed by: <strong>Union Nikola Tesla University Academic Staff Team</strong></p>
  <p>Report generated dynamically on: <strong>${new Date().toLocaleString()}</strong></p>

  <h2>1. Active Simulation State</h2>
  <div class="meta-box">
    <strong>Parameters Configured:</strong>
    <pre>${currentParams}</pre>
    <br>
    <strong>Current Metrics Readout:</strong>
    <pre>${metricsJson}</pre>
  </div>

  <h2>2. Scientific Methodology Details</h2>
  ${getMethodologyHTML()}

  <h2>3. Historical Progression Metrics</h2>
  <table>
    <thead>
      <tr>
        <th>Year</th>
        <th>Population</th>
        <th>Density %</th>
        <th>Average Land Value</th>
        <th>Pollution Index</th>
      </tr>
    </thead>
    <tbody>
      ${state.metricsHistory.map(row => `
        <tr>
          <td>${row.year}</td>
          <td>${row.population}</td>
          <td>${row.urbanDensityPct}%</td>
          <td>$${row.averageLandValue.toFixed(2)}</td>
          <td>${row.pollutionIndex.toFixed(3)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <hr>
  <p style="text-align: center; font-size: 11px; color: #64748b;">RealCity3000 Open-Source GIS Urban Planning Sandbox. Developed by Union Nikola Tesla University Academic Staff Team. Generated locally via browser engine.</p>
</body>
</html>`;
}

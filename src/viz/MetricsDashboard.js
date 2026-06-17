import store from '../state/store.js';

export class MetricsDashboard {
  constructor() {
    this.distCanvas = document.getElementById('landuse-distribution-chart');
    this.distCtx = this.distCanvas ? this.distCanvas.getContext('2d') : null;

    this.timeCanvas = document.getElementById('timeline-metrics-chart');
    this.timeCtx = this.timeCanvas ? this.timeCanvas.getContext('2d') : null;
    
    this.colors = {
      R: '#ffa500',
      C: '#00d4ff',
      I: '#8b5cf6',
      Inst: '#f43f5e',
      other: '#475569'
    };
  }

  updateDashboard() {
    const state = store.getState();
    const metrics = state.metrics;
    
    const maxPop = state.gridWidth * state.gridHeight * 10;
    const popPct = ((metrics.population / maxPop) * 100).toFixed(2);
    const valPct = metrics.averageLandValue.toFixed(1);

    // Update KPI Card Numbers
    document.getElementById('metric-population').textContent = `${popPct}%`;
    document.getElementById('metric-density').textContent = `${metrics.urbanDensityPct}%`;
    document.getElementById('metric-value').textContent = `${valPct}%`;
    document.getElementById('metric-pollution').textContent = metrics.pollutionIndex.toFixed(3);

    // Update KPI Trend Indicators
    this.updateTrend('population', metrics.population);
    this.updateTrend('density', metrics.urbanDensityPct);
    this.updateTrend('value', metrics.averageLandValue);
    this.updateTrend('pollution', metrics.pollutionIndex);

    // Update RCI Demand Heights
    document.getElementById('rci-res-bar').style.height = `${metrics.rciDemand.r}%`;
    document.getElementById('rci-com-bar').style.height = `${metrics.rciDemand.c}%`;
    document.getElementById('rci-ind-bar').style.height = `${metrics.rciDemand.i}%`;

    // Redraw charts
    this.drawDistributionChart();
    this.drawTimelineChart();
  }

  updateTrend(id, currentVal) {
    const history = store.getState().metricsHistory;
    const trendEl = document.getElementById(`trend-${id}`);
    if (!trendEl) return;
    
    if (history.length < 2) {
      trendEl.className = 'trend neutral';
      trendEl.innerHTML = `<i class="fa-solid fa-minus"></i> 0%`;
      return;
    }

    // Get previous step value
    const prevKey = history[history.length - 2];
    let prevVal = 0;
    if (id === 'population') prevVal = prevKey.population;
    else if (id === 'density') prevVal = prevKey.urbanDensityPct;
    else if (id === 'value') prevVal = prevKey.averageLandValue;
    else if (id === 'pollution') prevVal = prevKey.pollutionIndex;

    if (prevVal === 0) {
      trendEl.className = 'trend neutral';
      trendEl.innerHTML = `<i class="fa-solid fa-minus"></i> 0%`;
      return;
    }

    const pctChange = ((currentVal - prevVal) / prevVal) * 100.0;
    const sign = pctChange > 0 ? '+' : '';
    const arrow = pctChange > 0 ? '<i class="fa-solid fa-arrow-up"></i>' : pctChange < 0 ? '<i class="fa-solid fa-arrow-down"></i>' : '<i class="fa-solid fa-minus"></i>';
    
    let trendClass = 'neutral';
    if (pctChange > 0) trendClass = 'green';
    if (pctChange < 0) trendClass = 'red';
    
    // Invert pollution trend color (pollution going down is green)
    if (id === 'pollution') {
      if (pctChange > 0) trendClass = 'red';
      if (pctChange < 0) trendClass = 'green';
    }

    trendEl.className = `trend ${trendClass}`;
    trendEl.innerHTML = `${arrow} ${sign}${pctChange.toFixed(1)}%`;
  }

  drawDistributionChart() {
    if (!this.distCtx) return;
    const ctx = this.distCtx;
    ctx.clearRect(0, 0, this.distCanvas.width, this.distCanvas.height);

    const state = store.getState();
    const grid = state.grid;
    if (!grid) return;

    let r = 0, c = 0, i = 0, inst = 0, vacant = 0;
    const h = grid.length;
    const w = grid[0].length;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const type = grid[y][x].type;
        if (type.startsWith('RESIDENTIAL')) r++;
        else if (type === 'COMMERCIAL') c++;
        else if (type === 'INDUSTRIAL') i++;
        else if (type === 'INSTITUTIONAL') inst++;
        else vacant++;
      }
    }

    const total = r + c + i + inst + vacant;
    const slices = [
      { val: r, color: this.colors.R, label: 'Res' },
      { val: c, color: this.colors.C, label: 'Com' },
      { val: i, color: this.colors.I, label: 'Ind' },
      { val: inst, color: this.colors.Inst, label: 'Inst' },
      { val: vacant, color: this.colors.other, label: 'Vac' }
    ];

    // Draw Donut
    const cx = 65;
    const cy = 65;
    const radius = 45;
    const thickness = 14;

    let startAngle = -Math.PI / 2;

    slices.forEach(slice => {
      if (slice.val === 0) return;
      const sliceAngle = (slice.val / total) * (Math.PI * 2);

      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
      ctx.strokeStyle = slice.color;
      ctx.lineWidth = thickness;
      ctx.stroke();

      startAngle += sliceAngle;
    });

    // Draw Legend text next to it
    ctx.font = '10px "Inter", sans-serif';
    ctx.fillStyle = '#94a3b8';
    
    slices.forEach((slice, idx) => {
      const percentage = total > 0 ? ((slice.val / total) * 100).toFixed(0) : '0';
      const ly = 25 + idx * 22;
      
      // Color box
      ctx.fillStyle = slice.color;
      ctx.fillRect(135, ly - 7, 8, 8);
      
      // Label
      ctx.fillStyle = '#f1f5f9';
      ctx.fillText(`${slice.label}: ${percentage}%`, 150, ly);
    });
  }

  drawTimelineChart() {
    if (!this.timeCtx) return;
    const ctx = this.timeCtx;
    ctx.clearRect(0, 0, this.timeCanvas.width, this.timeCanvas.height);

    const history = store.getState().metricsHistory;
    if (history.length === 0) return;

    const w = this.timeCanvas.width;
    const h = this.timeCanvas.height;

    // Draw grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
    ctx.moveTo(0, h / 4); ctx.lineTo(w, h / 4);
    ctx.moveTo(0, 3 * h / 4); ctx.lineTo(w, 3 * h / 4);
    ctx.stroke();

    // Map population timeline
    const maxVal = Math.max(...history.map(pt => pt.population), 1000);
    const minVal = Math.min(...history.map(pt => pt.population), 0);
    const range = maxVal - minVal;

    ctx.beginPath();
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;

    const pointsCount = history.length;
    const stepX = pointsCount > 1 ? w / (pointsCount - 1) : w;

    // Store point positions for hover
    this._timelinePoints = [];

    history.forEach((pt, idx) => {
      const px = idx * stepX;
      // Map range to height (flip Y)
      const py = h - 10 - ((pt.population - minVal) / range) * (h - 20);
      
      this._timelinePoints.push({ x: px, y: py, step: idx, population: pt.population, density: pt.urbanDensityPct, value: pt.averageLandValue, pollution: pt.pollutionIndex });

      if (idx === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    });
    ctx.stroke();

    // Fill area under line
    if (pointsCount > 1) {
      ctx.lineTo((pointsCount - 1) * stepX, h);
      ctx.lineTo(0, h);
      ctx.fillStyle = 'rgba(0, 240, 255, 0.04)';
      ctx.fill();
    }
  }

  initChartTooltips() {
    // Create shared chart tooltip element
    this.chartTooltip = document.createElement('div');
    this.chartTooltip.className = 'chart-hover-tooltip';
    this.chartTooltip.style.cssText = `
      position: fixed; display: none; pointer-events: none; z-index: 9999;
      background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(0, 240, 255, 0.3);
      border-radius: 8px; padding: 8px 12px; font-size: 11px; color: #e2e8f0;
      font-family: 'Inter', sans-serif; backdrop-filter: blur(12px);
      box-shadow: 0 8px 32px rgba(0,0,0,0.5); line-height: 1.5;
    `;
    document.body.appendChild(this.chartTooltip);

    // Donut chart hover
    if (this.distCanvas) {
      this.distCanvas.addEventListener('mousemove', (e) => {
        const rect = this.distCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        
        // Check if mouse is over donut region
        const cx = 65, cy = 65, radius = 45;
        const dx = mx - cx, dy = my - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > radius - 16 && dist < radius + 16) {
          const angle = Math.atan2(dy, dx);
          const normAngle = angle < -Math.PI / 2 ? angle + Math.PI * 2.5 : angle + Math.PI / 2;
          
          const state = store.getState();
          const grid = state.grid;
          if (!grid) return;
          
          let r = 0, c = 0, ind = 0, inst = 0, vacant = 0;
          const h = grid.length, w = grid[0].length;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const type = grid[y][x].type;
              if (type.startsWith('RESIDENTIAL')) r++;
              else if (type === 'COMMERCIAL') c++;
              else if (type === 'INDUSTRIAL') ind++;
              else if (type === 'INSTITUTIONAL') inst++;
              else vacant++;
            }
          }
          const total = r + c + ind + inst + vacant;
          const slices = [
            { val: r, color: this.colors.R, label: 'Residential', count: r },
            { val: c, color: this.colors.C, label: 'Commercial', count: c },
            { val: ind, color: this.colors.I, label: 'Industrial', count: ind },
            { val: inst, color: this.colors.Inst, label: 'Institutional', count: inst },
            { val: vacant, color: this.colors.other, label: 'Vacant/Other', count: vacant }
          ];

          let cumAngle = 0;
          let hoveredSlice = null;
          for (const s of slices) {
            if (s.val === 0) continue;
            const sliceAngle = (s.val / total) * (Math.PI * 2);
            if (normAngle >= cumAngle && normAngle < cumAngle + sliceAngle) {
              hoveredSlice = s;
              break;
            }
            cumAngle += sliceAngle;
          }

          if (hoveredSlice) {
            const pct = ((hoveredSlice.val / total) * 100).toFixed(1);
            this.chartTooltip.innerHTML = `
              <div style="color: ${hoveredSlice.color}; font-weight: 600;">${hoveredSlice.label}</div>
              <div>${pct}% (${hoveredSlice.count} cells)</div>
            `;
            this.chartTooltip.style.display = 'block';
          }
        } else {
          this.chartTooltip.style.display = 'none';
        }

        let tx = e.clientX + 14;
        let ty = e.clientY + 14;
        if (tx + 150 > window.innerWidth) tx = e.clientX - 160;
        if (ty + 60 > window.innerHeight) ty = e.clientY - 70;
        this.chartTooltip.style.left = `${tx}px`;
        this.chartTooltip.style.top = `${ty}px`;
      });

      this.distCanvas.addEventListener('mouseleave', () => {
        this.chartTooltip.style.display = 'none';
      });
    }

    // Timeline chart hover
    if (this.timeCanvas) {
      this.timeCanvas.addEventListener('mousemove', (e) => {
        if (!this._timelinePoints || this._timelinePoints.length === 0) return;
        
        const rect = this.timeCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        
        // Find nearest point
        let nearest = this._timelinePoints[0];
        let minDist = Infinity;
        for (const pt of this._timelinePoints) {
          const d = Math.abs(pt.x - mx);
          if (d < minDist) { minDist = d; nearest = pt; }
        }

        if (minDist < 30) {
          this.chartTooltip.innerHTML = `
            <div style="color: #00f0ff; font-weight: 600;">Step ${nearest.step}</div>
            <div>Pop: ${nearest.population}</div>
            <div>Density: ${nearest.density?.toFixed(1) ?? 0}%</div>
            <div>Value: ${nearest.value?.toFixed(1) ?? 0}</div>
            <div>Pollution: ${nearest.pollution?.toFixed(3) ?? 0}</div>
          `;
          this.chartTooltip.style.display = 'block';
        } else {
          this.chartTooltip.style.display = 'none';
        }

        let tx = e.clientX + 14;
        let ty = e.clientY + 14;
        if (tx + 150 > window.innerWidth) tx = e.clientX - 160;
        if (ty + 60 > window.innerHeight) ty = e.clientY - 70;
        this.chartTooltip.style.left = `${tx}px`;
        this.chartTooltip.style.top = `${ty}px`;
      });

      this.timeCanvas.addEventListener('mouseleave', () => {
        this.chartTooltip.style.display = 'none';
      });
    }
  }
}
export default MetricsDashboard;

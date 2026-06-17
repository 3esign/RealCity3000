import store from '../state/store.js';
import { eventBus } from '../utils/eventBus.js';

export class Canvas2DRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.firstLoad = true;
    
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    
    this.colors = {
      VACANT: '#2a2d35',
      RESIDENTIAL_LOW: '#d4a574',
      RESIDENTIAL_HIGH: '#e87040',
      COMMERCIAL: '#00d4ff',
      INDUSTRIAL: '#8b5cf6',
      GREEN_SPACE: '#22c55e',
      FOREST: '#059669',
      WATER: '#0ea5e9',
      ROAD: '#94a3b8',
      BROWNFIELD: '#b45309',
      AGRICULTURAL: '#eab308',
      INSTITUTIONAL: '#f43f5e'
    };

    this.resizeCanvas();
    this.setupEvents();
  }

  resizeCanvas() {
    const parent = this.canvas.parentElement;
    this.canvas.width = parent.clientWidth;
    this.canvas.height = parent.clientHeight;
  }

  setupEvents() {
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.draw();
    });

    // Zoom on wheel
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = 1.1;
      const mouseX = e.clientX - this.canvas.getBoundingClientRect().left;
      const mouseY = e.clientY - this.canvas.getBoundingClientRect().top;
      
      // Keep zoom centered on mouse
      const beforeZoomX = (mouseX - this.panX) / this.zoom;
      const beforeZoomY = (mouseY - this.panY) / this.zoom;
      
      if (e.deltaY < 0) {
        this.zoom = Math.min(this.zoom * zoomFactor, 20.0);
      } else {
        this.zoom = Math.max(this.zoom / zoomFactor, 0.4);
      }
      
      this.panX = mouseX - beforeZoomX * this.zoom;
      this.panY = mouseY - beforeZoomY * this.zoom;
      this.draw();
    });

    // Interact (pan only) on mousedown
    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.startX = e.clientX - this.panX;
      this.startY = e.clientY - this.panY;
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        this.panX = e.clientX - this.startX;
        this.panY = e.clientY - this.startY;
        this.draw();
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    // Cell hover tooltip
    this.hoverTooltip = document.createElement('div');
    this.hoverTooltip.className = 'cell-hover-tooltip';
    this.hoverTooltip.style.cssText = `
      position: fixed; display: none; pointer-events: none; z-index: 9999;
      background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(0, 240, 255, 0.3);
      border-radius: 8px; padding: 10px 14px; font-size: 11px; color: #e2e8f0;
      font-family: 'Inter', sans-serif; backdrop-filter: blur(12px);
      box-shadow: 0 8px 32px rgba(0,0,0,0.5); min-width: 160px; line-height: 1.6;
    `;
    document.body.appendChild(this.hoverTooltip);

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        this.hoverTooltip.style.display = 'none';
        return;
      }

      const state = store.getState();
      const grid = state.grid;
      if (!grid) return;

      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const w = state.gridWidth;
      const h = state.gridHeight;
      const cellW = (this.canvas.width * 0.75) / w;
      const cellH = (this.canvas.height * 0.75) / h;
      const size = Math.min(cellW, cellH) * this.zoom;

      const gridX = Math.floor((mouseX - this.panX) / size);
      const gridY = Math.floor((mouseY - this.panY) / size);

      if (gridX >= 0 && gridX < w && gridY >= 0 && gridY < h) {
        const cell = grid[gridY][gridX];
        const zoneLabel = cell.type.replace(/_/g, ' ');
        const densityBar = '█'.repeat(Math.round(cell.density * 5)) + '░'.repeat(5 - Math.round(cell.density * 5));
        
        this.hoverTooltip.innerHTML = `
          <div style="color: #00f0ff; font-weight: 600; margin-bottom: 4px; font-size: 12px;">Cell [${gridX}, ${gridY}]</div>
          <div><span style="color: #94a3b8;">Zone:</span> <span style="color: ${this.colors[cell.type] || '#e2e8f0'}; font-weight: 600;">${zoneLabel}</span></div>
          <div><span style="color: #94a3b8;">Density:</span> ${densityBar} ${(cell.density * 100).toFixed(0)}%</div>
          <div><span style="color: #94a3b8;">Land Value:</span> <span style="color: #eab308;">${cell.landValue?.toFixed(1) ?? '0.0'}</span></div>
          <div><span style="color: #94a3b8;">Pollution:</span> <span style="color: ${cell.pollution > 0.5 ? '#ef4444' : '#22c55e'};">${(cell.pollution * 100).toFixed(0)}%</span></div>
          <div><span style="color: #94a3b8;">Access:</span> ${(cell.accessibility * 100).toFixed(0)}%</div>
          ${cell.population ? `<div><span style="color: #94a3b8;">Pop:</span> ${cell.population}</div>` : ''}
        `;
        this.hoverTooltip.style.display = 'block';

        let tx = e.clientX + 16;
        let ty = e.clientY + 16;
        const tw = this.hoverTooltip.offsetWidth;
        const th = this.hoverTooltip.offsetHeight;
        if (tx + tw > window.innerWidth - 10) tx = e.clientX - tw - 16;
        if (ty + th > window.innerHeight - 10) ty = e.clientY - th - 16;
        this.hoverTooltip.style.left = `${tx}px`;
        this.hoverTooltip.style.top = `${ty}px`;
      } else {
        this.hoverTooltip.style.display = 'none';
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoverTooltip.style.display = 'none';
    });
  }


  draw() {
    const state = store.getState();
    const grid = state.grid;
    if (!grid) return;

    const ctx = this.ctx;
    ctx.fillStyle = '#08080c'; // CAD Dark Background
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const w = state.gridWidth;
    const h = state.gridHeight;
    
    // Auto-fit grid to canvas on first load
    const cellW = (this.canvas.width * 0.75) / w;
    const cellH = (this.canvas.height * 0.75) / h;
    const size = Math.min(cellW, cellH) * this.zoom;

    if (this.firstLoad) {
      this.panX = (this.canvas.width - w * size) / 2;
      this.panY = (this.canvas.height - h * size) / 2;
      this.firstLoad = false;
    }

    ctx.save();
    ctx.translate(this.panX, this.panY);

    // Draw background coordinate grid lines every 5 cells
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= w; i += 5) {
      ctx.beginPath();
      ctx.moveTo(i * size, 0);
      ctx.lineTo(i * size, h * size);
      ctx.stroke();
    }
    for (let j = 0; j <= h; j += 5) {
      ctx.beginPath();
      ctx.moveTo(0, j * size);
      ctx.lineTo(w * size, j * size);
      ctx.stroke();
    }

    // Render cells (Culling active)
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const cell = grid[r][c];
        const cx = c * size;
        const cy = r * size;

        // Skip draw if cell lies completely offscreen (Viewport Culling)
        if (
          cx + this.panX < -size || 
          cx + this.panX > this.canvas.width || 
          cy + this.panY < -size || 
          cy + this.panY > this.canvas.height
        ) {
          continue;
        }

        // 1. Draw Base Land Use/Tile
        if (cell.type === 'ROAD') {
          ctx.fillStyle = '#1e293b'; // Road surface (slate grey)
          ctx.fillRect(cx, cy, size, size);
          
          // Draw lane lines
          if (size > 8) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            const conn = cell.connections || {};
            if (conn.E || conn.W) {
              ctx.moveTo(cx, cy + size / 2);
              ctx.lineTo(cx + size, cy + size / 2);
            } else {
              ctx.moveTo(cx + size / 2, cy);
              ctx.lineTo(cx + size / 2, cy + size);
            }
            ctx.stroke();
            ctx.setLineDash([]); // Reset
          }
        } else if (cell.type === 'WATER') {
          ctx.fillStyle = '#0f52ba'; // Sapphire water blue
          ctx.fillRect(cx, cy, size, size);
          // Draw mini waves pattern for CAD look
          if (size > 14) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.beginPath();
            ctx.moveTo(cx + size * 0.2, cy + size * 0.5);
            ctx.lineTo(cx + size * 0.4, cy + size * 0.4);
            ctx.lineTo(cx + size * 0.6, cy + size * 0.5);
            ctx.stroke();
          }
        } else {
          // Normal zoning background fill
          ctx.fillStyle = this.colors[cell.type] || '#2a2d35';
          ctx.fillRect(cx, cy, size, size);
        }

        // 2. Draw active developed building footprints
        const isDeveloped = cell.type.startsWith('RESIDENTIAL') || cell.type === 'COMMERCIAL' || cell.type === 'INDUSTRIAL' || cell.type === 'INSTITUTIONAL';
        if (isDeveloped && cell.density > 0) {
          const padding = Math.max(2, size * 0.15);
          const bWidth = size - padding * 2;
          const bHeight = size - padding * 2;
          
          // Draw building shadow/footprint core (very dark background)
          ctx.fillStyle = 'rgba(8, 8, 12, 0.7)';
          ctx.fillRect(cx + padding, cy + padding, bWidth, bHeight);

          // Draw building outline color-coded by zoning
          ctx.strokeStyle = this.colors[cell.type] || '#fff';
          ctx.lineWidth = Math.min(2.5, Math.max(1, size * 0.06));
          ctx.strokeRect(cx + padding, cy + padding, bWidth, bHeight);

          // Draw CAD cross-hair structures inside high-density/commercial footprints
          if (cell.type.endsWith('HIGH') || cell.type === 'COMMERCIAL' || cell.type === 'INDUSTRIAL') {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx + padding, cy + padding);
            ctx.lineTo(cx + size - padding, cy + size - padding);
            ctx.moveTo(cx + size - padding, cy + padding);
            ctx.lineTo(cx + padding, cy + size - padding);
            ctx.stroke();
          }
        }

        // 3. Draw overlay force fields if active
        if (state.forceFieldLayer !== 'none') {
          ctx.fillStyle = this.getOverlayColor(cell, state.forceFieldLayer);
          ctx.fillRect(cx, cy, size, size);
        }

        // 4. Draw outer border grid lines if detailed enough
        if (size > 12) {
          ctx.strokeStyle = 'rgba(255,255,255,0.035)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(cx, cy, size, size);
        }
      }
    }

    ctx.restore();
  }

  getOverlayColor(cell, layer) {
    if (layer === 'accessibility') {
      const alpha = cell.accessibility * 0.7;
      return `rgba(0, 240, 255, ${alpha})`;
    } else if (layer === 'value') {
      const alpha = (cell.landValue / 100.0) * 0.8;
      return `rgba(234, 179, 8, ${alpha})`;
    } else if (layer === 'pollution') {
      const alpha = cell.pollution * 0.7;
      return `rgba(168, 85, 247, ${alpha})`;
    } else if (layer === 'pressure') {
      // Diff difference in neighbors
      const alpha = cell.accessibility * (1.0 - cell.pollution) * 0.8;
      return `rgba(239, 68, 68, ${alpha})`;
    }
    return 'transparent';
  }
}
export default Canvas2DRenderer;

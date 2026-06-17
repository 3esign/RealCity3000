import './styles/main.css';
import './styles/components.css';

import store from './state/store.js';
import { eventBus } from './utils/eventBus.js';
import MapSelector from './map/MapSelector.js';
import OverpassService from './map/OverpassService.js';
import GridGenerator from './map/GridGenerator.js';
import AIVisionService from './map/AIVisionService.js';
import SimulationEngine from './simulation/SimulationEngine.js';
import AIMayorService from './ai/AIMayorService.js';
import HistoricalResearchService from './ai/HistoricalResearchService.js';
import Canvas2DRenderer from './viz/Canvas2DRenderer.js';
import ThreeJSRenderer from './viz/ThreeJSRenderer.js';
import MetricsDashboard from './viz/MetricsDashboard.js';
import ExportService from './export/ExportService.js';
import ValidationService from './export/ValidationService.js';
import { getMethodologyHTML } from './ui/AboutModal.js';
import { PRESET_SCENARIOS } from './simulation/Parameters.js';
import { initTooltips } from './ui/Tooltip.js';

// Global instances
let mapSelector;
let canvas2D;
let three3D;
let dashboard;
const overpassService = new OverpassService();
const gridGenerator = new GridGenerator();
const aiVisionService = new AIVisionService();
const simulationEngine = new SimulationEngine();
const aiMayorService = new AIMayorService();
const historicalService = new HistoricalResearchService();
const exportService = new ExportService();
const validationService = new ValidationService();

let simInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  // Initialize descriptive hover tooltips
  initTooltips();

  // 1. Initialize Leaflet Selector Map
  mapSelector = new MapSelector();
  dashboard = new MetricsDashboard();

  // 2. Setup Phase 1 UI Listeners
  setupPhase1Listeners();

  // 3. Setup Phase 2 (Sandbox) UI Listeners
  setupPhase2Listeners();
}

function setupPhase1Listeners() {
  // Password Eye toggles
  document.querySelectorAll('.toggle-password-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
      } else {
        input.type = 'password';
        btn.innerHTML = '<i class="fa-solid fa-eye"></i>';
      }
    });
  });

  // Universal key toggle
  const universalToggle = document.getElementById('universal-key-toggle');
  const singleKeyContainer = document.getElementById('single-key-container');
  const splitKeysContainer = document.getElementById('split-keys-container');

  universalToggle.addEventListener('change', () => {
    const active = universalToggle.checked;
    store.updateState({ aiUseUniversal: active });
    if (active) {
      singleKeyContainer.classList.remove('hidden');
      splitKeysContainer.classList.add('hidden');
    } else {
      singleKeyContainer.classList.add('hidden');
      splitKeysContainer.classList.remove('hidden');
    }
  });

  // Key configurations on change
  const saveKeys = () => {
    store.updateState({
      aiKeys: {
        universal: document.getElementById('universal-api-key').value,
        vision: document.getElementById('vision-api-key').value,
        mayor: document.getElementById('mayor-api-key').value,
        history: document.getElementById('history-api-key').value
      },
      aiProvider: document.getElementById('universal-provider').value
    });
  };

  document.getElementById('universal-api-key').addEventListener('input', saveKeys);
  document.getElementById('vision-api-key').addEventListener('input', saveKeys);
  document.getElementById('mayor-api-key').addEventListener('input', saveKeys);
  document.getElementById('history-api-key').addEventListener('input', saveKeys);
  document.getElementById('universal-provider').addEventListener('change', saveKeys);

  // Initialize sandbox extraction button
  const extractBtn = document.getElementById('extract-data-btn');
  extractBtn.addEventListener('click', async () => {
    if (extractBtn.classList.contains('disabled')) return;
    
    const state = store.getState();
    if (!state.bbox) return;

    // Show loading spinner overlay
    const loader = document.getElementById('simulation-loading');
    const statusText = document.getElementById('loading-status-text');
    loader.classList.remove('hidden');
    try {
      // 1. Fetch OSM Vector Data
      statusText.textContent = 'Querying OpenStreetMap Overpass API...';
      let parsed;
      let rawOsm = null;
      try {
        rawOsm = await overpassService.fetchMapData(state.bbox);
        statusText.textContent = 'Parsing geometries and highways...';
        parsed = overpassService.parseGeometries(rawOsm);
      } catch (osmErr) {
        console.warn('OSM query failed or timed out. Falling back to procedural layout.', osmErr);
        parsed = overpassService.generateProceduralElements(state.bbox);
        alert('Notice: Overpass API connection timed out or is rate-limited. Seeding the sandbox grid with a procedurally generated road network and buildings instead.');
      }

      // 2. Fetch Historical Research timeline context asynchronously
      statusText.textContent = 'Fetching historical context...';
      historicalService.fetchHistoricalContext(state.bbox).then(historyText => {
        store.updateState({ historicalReport: historyText });
      });

      // 3. Run Satellite Spectrum Analysis first to establish the base landuse grid
      statusText.textContent = 'Analyzing satellite spectrum for natural and brownfield layouts...';
      let visionResult = null;
      try {
        visionResult = await aiVisionService.analyzeSatelliteImage(null);
      } catch (visionErr) {
        console.warn('AI Vision processing failed, utilizing standard base layout.', visionErr);
      }

      // 4. Grid Generation (Satellite base first, then overlay OSM highways & building footprints)
      statusText.textContent = 'Rasterizing cell connectivity and overlaying OSM vectors...';
      const grid = gridGenerator.generateGrid(
        state.bbox,
        parsed,
        state.gridWidth,
        state.gridHeight,
        visionResult
      );

      // 4. Update Store
      store.updateState({
        grid: grid,
        originalGrid: grid.map(row => row.map(c => ({ ...c }))),
        osmRawData: rawOsm,
        buildings: parsed.buildings,
        roads: parsed.roads,
        water: parsed.water,
        simulationYear: 2017,
        metricsHistory: [{
          year: 2017,
          population: 0,
          urbanDensityPct: 0.0,
          averageLandValue: 10.0,
          pollutionIndex: 0.0
        }]
      });

      // Switch View Phase FIRST so DOM parent containers have actual non-zero clientWidth/clientHeight
      document.getElementById('view-map').classList.remove('active');
      document.getElementById('view-map').classList.add('hidden');
      document.getElementById('view-sandbox').classList.remove('hidden');
      document.getElementById('view-sandbox').classList.add('active');

      // 5. Initialize visualizers
      canvas2D = new Canvas2DRenderer('canvas-2d');
      three3D = new ThreeJSRenderer('canvas-3d-container');
      
      canvas2D.draw();
      three3D.rebuildScene();
      
      // Initial step calculation for dashboards
      simulationEngine.runStep();
      dashboard.updateDashboard();

      // Update coordinates readout
      const midLat = ((state.bbox.south + state.bbox.north) / 2).toFixed(5);
      const midLng = ((state.bbox.west + state.bbox.east) / 2).toFixed(5);
      document.getElementById('toolbar-bbox-coords').textContent = `LAT: ${midLat}, LNG: ${midLng} // AREA: ${(state.gridWidth * state.gridHeight).toLocaleString()} cells`;

    } catch (err) {
      alert(`Initialization failed: ${err.message}. Check network connections.`);
    } finally {
      loader.classList.add('hidden');
    }
  });

  // Start screen Academic Documentation downloads
  document.getElementById('start-download-report-btn').addEventListener('click', () => {
    exportService.downloadReport();
  });
  document.getElementById('start-download-text-btn').addEventListener('click', () => {
    exportService.downloadTextReport();
  });
}

function setupPhase2Listeners() {
  // Playback Control Button Bindings
  const playBtn = document.getElementById('sim-play-btn');
  const stepBtn = document.getElementById('sim-step-btn');
  const prevBtn = document.getElementById('sim-prev-btn');
  const resetBtn = document.getElementById('sim-reset-btn');

  const startPlayback = () => {
    const state = store.getState();
    const intervalTime = Math.max(1200 - (state.speed * 50), 30); // map speed slider [1, 25] down to 30ms
    
    simInterval = setInterval(async () => {
      // If AI Mayor active, run API policy cycle
      if (store.getState().aiMayorEnabled) {
        await aiMayorService.runMayorTurn();
      }
      simulationEngine.runStep();
    }, intervalTime);

    playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    playBtn.classList.add('active');
  };

  const stopPlayback = () => {
    clearInterval(simInterval);
    simInterval = null;
    playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    playBtn.classList.remove('active');
  };

  playBtn.addEventListener('click', () => {
    if (simInterval) {
      stopPlayback();
    } else {
      startPlayback();
    }
  });

  stepBtn.addEventListener('click', async () => {
    stopPlayback();
    if (store.getState().aiMayorEnabled) {
      await aiMayorService.runMayorTurn();
    }
    simulationEngine.runStep();
  });

  prevBtn.addEventListener('click', () => {
    // Revert to original seed grid
    stopPlayback();
    const state = store.getState();
    if (state.originalGrid) {
      store.updateState({
        grid: state.originalGrid.map(row => row.map(c => ({ ...c }))),
        simulationYear: 2026,
        metricsHistory: [{
          year: 2026,
          population: 0,
          urbanDensityPct: 0.0,
          averageLandValue: 10.0,
          pollutionIndex: 0.0
        }]
      });
      eventBus.emit('sim-step-completed', { year: 2026, metrics: store.getState().metrics });
    }
  });

  resetBtn.addEventListener('click', () => {
    prevBtn.click();
  });

  // Speed slider
  document.getElementById('sim-speed-slider').addEventListener('input', (e) => {
    const speed = parseInt(e.target.value);
    store.updateState({ speed });
    if (simInterval) {
      stopPlayback();
      startPlayback();
    }
  });

  // Preset Scenario selector change
  const presetSelector = document.getElementById('scenario-preset-selector');
  presetSelector.addEventListener('change', () => {
    const val = presetSelector.value;
    const preset = PRESET_SCENARIOS[val];
    if (preset) {
      store.updateState({
        currentPreset: val,
        params: { ...preset.params }
      });
      // Sync UI sliders
      syncParametersToSliders();
    }
  });

  // Live sliders changes update Store parameters
  document.querySelectorAll('.param-slider').forEach(slider => {
    slider.addEventListener('input', (e) => {
      const name = slider.getAttribute('data-param');
      const val = parseInt(slider.value);
      
      const currentParams = { ...store.getState().params };
      currentParams[name] = val;
      
      store.updateState({ params: currentParams });
      document.getElementById(`val-${name}`).textContent = name === 'taxRate' ? `${val}%` : val;

      // Real-time rebuild for Three.js to immediately scale trees or morph building facade openings
      if (three3D && (store.getState().renderingMode === '3d' || store.getState().renderingMode === 'fps')) {
        three3D.rebuildScene();
      }
    });
  });

  // AI Mayor toggle checkbox
  document.getElementById('ai-mayor-toggle').addEventListener('change', (e) => {
    const active = e.target.checked;
    store.updateState({ aiMayorEnabled: active });
    
    const thoughtsBox = document.getElementById('ai-mayor-thoughts');
    const statusText = document.getElementById('ai-mayor-status');

    if (active) {
      thoughtsBox.classList.remove('hidden');
      statusText.textContent = 'AI Mayor Online';
      statusText.style.color = 'var(--accent)';
    } else {
      thoughtsBox.classList.add('hidden');
      statusText.textContent = 'AI Mayor Offline';
      statusText.style.color = 'var(--text-secondary)';
    }
  });

  // Toolbar View Mode buttons
  document.querySelectorAll('.view-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const mode = btn.getAttribute('data-view');
      store.updateState({ renderingMode: mode });

      const canvas2dEl = document.getElementById('canvas-2d');
      const canvas3dEl = document.getElementById('canvas-3d-container');

      if (mode === '2d') {
        if (three3D && three3D.fpsCameraActive) three3D.exitFPSMode();
        if (three3D) three3D.renderingLoopActive = false; // Pause Three.js loop
        canvas2dEl.classList.remove('hidden');
        canvas3dEl.classList.add('hidden');
        if (canvas2D) {
          canvas2D.resizeCanvas();
          canvas2D.draw();
        }
      } else if (mode === '3d') {
        if (three3D && three3D.fpsCameraActive) three3D.exitFPSMode();
        canvas2dEl.classList.add('hidden');
        canvas3dEl.classList.remove('hidden');
        if (three3D) {
          three3D.renderingLoopActive = true; // Resume Three.js loop
          three3D.resize();
          three3D.rebuildScene();
        }
      } else if (mode === 'fps') {
        canvas2dEl.classList.add('hidden');
        canvas3dEl.classList.remove('hidden');
        if (three3D) {
          three3D.renderingLoopActive = true; // Resume Three.js loop
          three3D.resize();
          three3D.rebuildScene();
          three3D.enterFPSMode();
        }
      }
    });
  });

  // Visual Layer Heatmap selections
  document.querySelectorAll('.layer-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.layer-toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const layer = btn.getAttribute('data-layer');
      store.updateState({ forceFieldLayer: layer });
      
      updateLegendUI(layer);
      
      if (store.getState().renderingMode === '2d') {
        canvas2D.draw();
      }
    });
  });

  // Re-Select area returns back to Leaflet Map Selector
  document.getElementById('return-map-btn').addEventListener('click', () => {
    stopPlayback();
    document.getElementById('view-sandbox').classList.remove('active');
    document.getElementById('view-sandbox').classList.add('hidden');
    document.getElementById('view-map').classList.remove('hidden');
    document.getElementById('view-map').classList.add('active');
  });

  // About Modal trigger
  const aboutModal = document.getElementById('about-modal');
  document.getElementById('about-btn').addEventListener('click', () => {
    document.getElementById('about-modal-body').innerHTML = getMethodologyHTML();
    aboutModal.classList.remove('hidden');
  });

  const closeModal = () => aboutModal.classList.add('hidden');
  document.getElementById('close-about-btn').addEventListener('click', closeModal);
  document.getElementById('close-about-footer-btn').addEventListener('click', closeModal);

  // Methodology Report Download button inside About modal
  document.getElementById('download-report-btn').addEventListener('click', () => {
    exportService.downloadReport();
  });

  document.getElementById('download-text-report-btn').addEventListener('click', () => {
    exportService.downloadTextReport();
  });

  // Export dropdown triggers
  document.getElementById('export-json-btn').addEventListener('click', () => exportService.downloadJSON());
  document.getElementById('export-csv-btn').addEventListener('click', () => exportService.downloadCSV());
  document.getElementById('export-sim-report-btn').addEventListener('click', (e) => {
    if (e.currentTarget.classList.contains('disabled')) {
      e.preventDefault();
      return;
    }
    exportService.downloadSimulationReport();
  });
  document.getElementById('export-png-btn').addEventListener('click', () => {
    const mode = store.getState().renderingMode;
    if (mode === '2d') {
      exportService.downloadPNG('canvas-2d');
    } else {
      // capturing WebGL requires extra setup, defaults to reporting canvas captures
      alert('PNG capture captures active 2D Canvas grids. Switch to 2D view to capture.');
    }
  });

  // Global event bus updates
  eventBus.on('sim-step-completed', () => {
    // Sync the year counter readout in UI
    const year = store.getState().simulationYear;
    const yearStr = String(year).padStart(4, '0');
    const yearEl = document.getElementById('sim-year');
    if (yearEl) yearEl.textContent = `Year ${yearStr}`;

    // Enable/disable simulation report download based on Year 2032 projection completion
    const simReportBtn = document.getElementById('export-sim-report-btn');
    if (simReportBtn) {
      if (year >= 2032) {
        simReportBtn.classList.remove('disabled');
        simReportBtn.setAttribute('data-tooltip', 'Download full text simulation run report including geographical metadata, parameters, and historical year-by-year KPI values');
      } else {
        simReportBtn.classList.add('disabled');
        simReportBtn.setAttribute('data-tooltip', `Download full text simulation run report (locked until Year 2032, current: ${year})`);
      }
    }

    const mode = store.getState().renderingMode;
    if (canvas2D && mode === '2d') canvas2D.draw();
    if (three3D && (mode === '3d' || mode === 'fps')) {
      three3D.rebuildScene();
    }
    dashboard.updateDashboard();
  });

  // grid-painted event hook removed (manual zoning disabled)

  eventBus.on('ai-thinking-started', () => {
    document.getElementById('ai-mayor-status').textContent = 'AI Mayor Thinking...';
    document.getElementById('ai-mayor-status').style.color = 'var(--accent-amber)';
  });

  eventBus.on('ai-thinking-completed', () => {
    document.getElementById('ai-mayor-status').textContent = 'AI Mayor Online';
    document.getElementById('ai-mayor-status').style.color = 'var(--accent)';
    document.getElementById('ai-thought-content').textContent = store.getState().aiMayorThoughts;
  });

  // Historical Validation trigger
  const runValidationBtn = document.getElementById('btn-run-validation');
  if (runValidationBtn) {
    runValidationBtn.addEventListener('click', () => {
      const state = store.getState();
      if (!state.grid || !state.originalGrid) {
        alert("Please load an area first to run validation.");
        return;
      }
      
      runValidationBtn.disabled = true;
      runValidationBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Validating...';
      
      setTimeout(() => {
        try {
          const { localGrid } = validationService.runValidationSimulation(state.grid, state.params);
          const metrics = validationService.calculateMetrics(localGrid, state.originalGrid);
          
          document.getElementById('metric-validation-f1').textContent = metrics.f1.toFixed(3);
          document.getElementById('metric-validation-error').textContent = `${metrics.meanSpatialError.toFixed(1)}m`;
          document.getElementById('metric-validation-precision').textContent = metrics.precision.toFixed(3);
          document.getElementById('metric-validation-recall').textContent = metrics.recall.toFixed(3);
        } catch (err) {
          console.error("Validation failed:", err);
          alert(`Validation failed: ${err.message}`);
        } finally {
          runValidationBtn.disabled = false;
          runValidationBtn.innerHTML = '<i class="fa-solid fa-play"></i> Validate';
        }
      }, 50);
    });
  }

  // Auto Calibration Simulated Annealing trigger
  const autoCalibrateBtn = document.getElementById('btn-auto-calibrate');
  const calibrationProgressContainer = document.getElementById('calibration-progress-container');
  const calibrationProgressPct = document.getElementById('calibration-progress-pct');
  const calibrationProgressBar = document.getElementById('calibration-progress-bar');
  
  if (autoCalibrateBtn) {
    autoCalibrateBtn.addEventListener('click', () => {
      const state = store.getState();
      if (!state.grid || !state.originalGrid) {
        alert("Please load an area first to run calibration.");
        return;
      }
      
      autoCalibrateBtn.disabled = true;
      if (runValidationBtn) runValidationBtn.disabled = true;
      if (calibrationProgressContainer) calibrationProgressContainer.classList.remove('hidden');
      
      validationService.runSimulatedAnnealing(
        state.grid,
        state.originalGrid,
        (progress, bestP, bestF1) => {
          if (calibrationProgressBar) calibrationProgressBar.style.width = `${progress}%`;
          if (calibrationProgressPct) calibrationProgressPct.textContent = `${Math.round(progress)}%`;
          document.getElementById('metric-validation-f1').textContent = bestF1.toFixed(3);
        },
        (bestParams, bestF1) => {
          const newParams = { ...state.params, ...bestParams };
          store.updateState({ params: newParams });
          
          syncParametersToSliders();
          
          const finalResult = validationService.runValidationSimulation(state.grid, newParams);
          const finalMetrics = validationService.calculateMetrics(finalResult.localGrid, state.originalGrid);
          
          document.getElementById('metric-validation-f1').textContent = finalMetrics.f1.toFixed(3);
          document.getElementById('metric-validation-error').textContent = `${finalMetrics.meanSpatialError.toFixed(1)}m`;
          document.getElementById('metric-validation-precision').textContent = finalMetrics.precision.toFixed(3);
          document.getElementById('metric-validation-recall').textContent = finalMetrics.recall.toFixed(3);
          
          autoCalibrateBtn.disabled = false;
          if (runValidationBtn) runValidationBtn.disabled = false;
          
          setTimeout(() => {
            if (calibrationProgressContainer) calibrationProgressContainer.classList.add('hidden');
            if (calibrationProgressBar) calibrationProgressBar.style.width = '0%';
            if (calibrationProgressPct) calibrationProgressPct.textContent = '0%';
          }, 1500);
          
          alert(`Calibration complete! Best F1-Score: ${bestF1.toFixed(3)} found with Diffusion: ${bestParams.diffusion}, Spread: ${bestParams.spread}, Road Gravity: ${bestParams.roadGravity}. Sliders updated.`);
        }
      );
    });
  }
}

function updateLegendUI(layer) {
  const container = document.getElementById('legend-overlay-container');
  if (!container) return;
  
  if (layer === 'none') {
    container.innerHTML = `
      <h4>Land Classification</h4>
      <div class="legend-items">
        <div class="legend-item"><span class="color-box" style="background:#2a2d35;"></span> Vacant</div>
        <div class="legend-item"><span class="color-box" style="background:#d4a574;"></span> Res (Low)</div>
        <div class="legend-item"><span class="color-box" style="background:#e87040;"></span> Res (High)</div>
        <div class="legend-item"><span class="color-box" style="background:#00d4ff;"></span> Commercial</div>
        <div class="legend-item"><span class="color-box" style="background:#8b5cf6;"></span> Industrial</div>
        <div class="legend-item"><span class="color-box" style="background:#22c55e;"></span> Park</div>
        <div class="legend-item"><span class="color-box" style="background:#059669;"></span> Forest</div>
        <div class="legend-item"><span class="color-box" style="background:#0ea5e9;"></span> Water</div>
        <div class="legend-item"><span class="color-box" style="background:#94a3b8;"></span> Highway</div>
        <div class="legend-item"><span class="color-box" style="background:#b45309;"></span> Brownfield</div>
        <div class="legend-item"><span class="color-box" style="background:#eab308;"></span> Agricultural</div>
        <div class="legend-item"><span class="color-box" style="background:#f43f5e;"></span> Institutional</div>
      </div>
    `;
  } else if (layer === 'accessibility') {
    container.innerHTML = `
      <h4>Accessibility Field</h4>
      <div class="legend-items">
        <div class="legend-item" style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
          <div style="height: 12px; width: 100%; background: linear-gradient(to right, rgba(0, 240, 255, 0), rgba(0, 240, 255, 0.7)); border: 1px solid var(--border-solid); border-radius: 2px;"></div>
          <div style="display: flex; justify-content: space-between; font-size: 9px; color: var(--text-secondary);">
            <span>Low Access</span>
            <span>High Access</span>
          </div>
        </div>
      </div>
    `;
  } else if (layer === 'value') {
    container.innerHTML = `
      <h4>Land Value Field</h4>
      <div class="legend-items">
        <div class="legend-item" style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
          <div style="height: 12px; width: 100%; background: linear-gradient(to right, rgba(234, 179, 8, 0), rgba(234, 179, 8, 0.8)); border: 1px solid var(--border-solid); border-radius: 2px;"></div>
          <div style="display: flex; justify-content: space-between; font-size: 9px; color: var(--text-secondary);">
            <span>Low Rent</span>
            <span>Premium Rent</span>
          </div>
        </div>
      </div>
    `;
  } else if (layer === 'pollution') {
    container.innerHTML = `
      <h4>Pollution Footprint</h4>
      <div class="legend-items">
        <div class="legend-item" style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
          <div style="height: 12px; width: 100%; background: linear-gradient(to right, rgba(168, 85, 247, 0), rgba(168, 85, 247, 0.7)); border: 1px solid var(--border-solid); border-radius: 2px;"></div>
          <div style="display: flex; justify-content: space-between; font-size: 9px; color: var(--text-secondary);">
            <span>Clean Air</span>
            <span>Toxic Footprint</span>
          </div>
        </div>
      </div>
    `;
  } else if (layer === 'pressure') {
    container.innerHTML = `
      <h4>Growth Pressure</h4>
      <div class="legend-items">
        <div class="legend-item" style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
          <div style="height: 12px; width: 100%; background: linear-gradient(to right, rgba(239, 68, 68, 0), rgba(239, 68, 68, 0.8)); border: 1px solid var(--border-solid); border-radius: 2px;"></div>
          <div style="display: flex; justify-content: space-between; font-size: 9px; color: var(--text-secondary);">
            <span>No Demand</span>
            <span>High Demand</span>
          </div>
        </div>
      </div>
    `;
  }
}

function syncParametersToSliders() {
  const params = store.getState().params;
  Object.keys(params).forEach(key => {
    const slider = document.querySelector(`.param-slider[data-param="${key}"]`);
    if (slider) {
      slider.value = params[key];
      const valEl = document.getElementById(`val-${key}`);
      if (valEl) {
        valEl.textContent = key === 'taxRate' ? `${params[key]}%` : params[key];
      }
    }
  });
}

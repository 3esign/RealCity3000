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
import { FEATURE_LABELS, resolveFeatureConfig } from './ai/providerCapabilities.js';
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

const AI_FEATURES = ['vision', 'mayor', 'history'];

function getInputValue(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.value = value;
  }
}

function syncAiPanelFieldsFromState() {
  const state = store.getState();
  const universalMode = state.aiUseUniversal;

  setInputValue('universal-api-key', state.aiKeys.universal || '');
  setInputValue('vision-api-key', state.aiKeys.vision || state.aiKeys.universal || '');
  setInputValue('mayor-api-key', state.aiKeys.mayor || state.aiKeys.universal || '');
  setInputValue('history-api-key', state.aiKeys.history || state.aiKeys.universal || '');

  setInputValue('universal-provider', state.aiProvider || 'openai');
  setInputValue('vision-provider', state.visionProvider || state.aiProvider || 'openai');
  setInputValue('mayor-provider', state.mayorProvider || state.aiProvider || 'openai');
  setInputValue('history-provider', state.historyProvider || state.aiProvider || 'openai');

  const universalKeyContainer = document.getElementById('single-key-container');
  const splitKeyContainer = document.getElementById('split-keys-container');
  if (universalKeyContainer && splitKeyContainer) {
    if (universalMode) {
      universalKeyContainer.classList.remove('hidden');
      splitKeyContainer.classList.add('hidden');
    } else {
      universalKeyContainer.classList.add('hidden');
      splitKeyContainer.classList.remove('hidden');
    }
  }
}

function buildAiStateForModeSwitch(universalMode) {
  const state = store.getState();
  const universalKey = getInputValue('universal-api-key');
  const visionKey = getInputValue('vision-api-key');
  const mayorKey = getInputValue('mayor-api-key');
  const historyKey = getInputValue('history-api-key');

  const universalProvider = getInputValue('universal-provider') || state.aiProvider || 'openai';
  const visionProvider = getInputValue('vision-provider') || universalProvider;
  const mayorProvider = getInputValue('mayor-provider') || universalProvider;
  const historyProvider = getInputValue('history-provider') || universalProvider;

  const fallbackKey = universalKey || visionKey || mayorKey || historyKey || state.aiKeys?.universal || '';
  const fallbackProvider = universalProvider || visionProvider || mayorProvider || historyProvider || state.aiProvider || 'openai';

  if (universalMode) {
    return {
      aiUseUniversal: true,
      aiKeys: {
        universal: universalKey || fallbackKey,
        vision: visionKey || universalKey || fallbackKey,
        mayor: mayorKey || universalKey || fallbackKey,
        history: historyKey || universalKey || fallbackKey
      },
      aiProvider: universalProvider || fallbackProvider,
      visionProvider,
      mayorProvider,
      historyProvider
    };
  }

  if (state.aiUseUniversal) {
    const seededKey = universalKey || fallbackKey;
    const seededProvider = universalProvider || fallbackProvider;

    return {
      aiUseUniversal: false,
      aiKeys: {
        universal: seededKey,
        vision: seededKey,
        mayor: seededKey,
        history: seededKey
      },
      aiProvider: seededProvider,
      visionProvider: seededProvider,
      mayorProvider: seededProvider,
      historyProvider: seededProvider
    };
  }

  return {
    aiUseUniversal: false,
    aiKeys: {
      universal: universalKey || fallbackKey,
      vision: visionKey || fallbackKey,
      mayor: mayorKey || fallbackKey,
      history: historyKey || fallbackKey
    },
    aiProvider: universalProvider || fallbackProvider,
    visionProvider,
    mayorProvider,
    historyProvider
  };
}

function saveAiConfigFromUI() {
  store.updateState({
    aiUseUniversal: document.getElementById('universal-key-toggle')?.checked ?? true,
    aiKeys: {
      universal: getInputValue('universal-api-key'),
      vision: getInputValue('vision-api-key'),
      mayor: getInputValue('mayor-api-key'),
      history: getInputValue('history-api-key')
    },
    aiProvider: getInputValue('universal-provider') || 'openai',
    visionProvider: getInputValue('vision-provider') || getInputValue('universal-provider') || 'openai',
    mayorProvider: getInputValue('mayor-provider') || getInputValue('universal-provider') || 'openai',
    historyProvider: getInputValue('history-provider') || getInputValue('universal-provider') || 'openai'
  });

  updateAiReadinessSummary();
}

function updateAiReadinessSummary() {
  const summary = document.getElementById('ai-readiness-summary');
  if (!summary) return;

  const state = store.getState();
  const modeLabel = state.aiUseUniversal ? 'Universal key mode' : 'Split key mode';

  const renderRow = (feature) => {
    const config = resolveFeatureConfig(state, feature);
    const label = FEATURE_LABELS[feature] || feature;

    let rowClass = 'ready';
    let valueText = '';

    if (config.provider === 'local') {
      valueText = 'Local mathematical engine enabled';
    } else if (!config.supported) {
      rowClass = 'error';
      valueText = `Provider "${config.provider}" cannot run ${label.toLowerCase()} here`;
    } else if (!config.apiKey) {
      rowClass = 'warning';
      valueText = `Missing API key for "${config.provider}"`;
    } else {
      valueText = `Ready with ${config.provider}`;
    }

    return `<div class="ai-readiness-row ${rowClass}">
      <span class="label">${label}</span>
      <span class="value">${valueText}</span>
    </div>`;
  };

  summary.innerHTML = `
    <div class="ai-readiness-row ready">
      <span class="label">Mode</span>
      <span class="value">${modeLabel}</span>
    </div>
    ${AI_FEATURES.map(renderRow).join('')}
  `;
}

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  // Initialize descriptive hover tooltips
  initTooltips();

  // 1. Initialize Leaflet Selector Map
  mapSelector = new MapSelector();
  dashboard = new MetricsDashboard();
  dashboard.initChartTooltips();

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

  // Data Source toggles
  const sourceOsmToggle = document.getElementById('source-osm-toggle');
  const sourceAiToggle = document.getElementById('source-ai-toggle');

  if (sourceOsmToggle && sourceAiToggle) {
    sourceOsmToggle.checked = store.getState().fetchOSMData;
    sourceAiToggle.checked = store.getState().useAISatelliteVision;

    sourceOsmToggle.addEventListener('change', () => {
      store.updateState({ fetchOSMData: sourceOsmToggle.checked });
    });

    sourceAiToggle.addEventListener('change', () => {
      store.updateState({ useAISatelliteVision: sourceAiToggle.checked });
    });
  }

  // Universal key toggle
  const universalToggle = document.getElementById('universal-key-toggle');
  const singleKeyContainer = document.getElementById('single-key-container');
  const splitKeysContainer = document.getElementById('split-keys-container');

  syncAiPanelFieldsFromState();
  updateAiReadinessSummary();

  universalToggle.addEventListener('change', () => {
    const active = universalToggle.checked;
    store.updateState(buildAiStateForModeSwitch(active));
    syncAiPanelFieldsFromState();
    saveAiConfigFromUI();
  });

  // Key configurations on change
  const saveKeys = () => saveAiConfigFromUI();

  document.getElementById('universal-api-key').addEventListener('input', saveKeys);
  document.getElementById('vision-api-key').addEventListener('input', saveKeys);
  document.getElementById('mayor-api-key').addEventListener('input', saveKeys);
  document.getElementById('history-api-key').addEventListener('input', saveKeys);
  document.getElementById('universal-provider').addEventListener('change', saveKeys);
  document.getElementById('vision-provider').addEventListener('change', saveKeys);
  document.getElementById('mayor-provider').addEventListener('change', saveKeys);
  document.getElementById('history-provider').addEventListener('change', saveKeys);

  // Helper to log messages in the loading terminal console
  function logToLoader(message, type = 'info') {
    const container = document.getElementById('loading-log-container');
    if (!container) return;
    const time = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.style.marginBottom = '4px';
    line.style.borderBottom = '1px dashed rgba(255, 255, 255, 0.05)';
    line.style.paddingBottom = '2px';
    
    if (type === 'error') {
      line.style.color = '#ff6b6b';
    } else if (type === 'warn') {
      line.style.color = '#ffd43b';
    } else if (type === 'success') {
      line.style.color = '#51cf66';
    } else {
      line.style.color = '#00f0ff';
    }
    line.innerHTML = `<strong>[${time}]</strong> ${message}`;
    container.appendChild(line);
    container.scrollTop = container.scrollHeight;
  }

  // Helper to complete initialization pipeline once vector data is parsed or bypassed
  async function completeInitialization(parsed, rawOsm, isBypassed = false) {
    const state = store.getState();
    const loader = document.getElementById('simulation-loading');
    const statusText = document.getElementById('loading-status-text');

    if (isBypassed) {
      logToLoader('Running grid initialization using AI Satellite Spectrum analysis ONLY...', 'warn');
    }

    // 2. Fetch Historical Research timeline context asynchronously
    statusText.textContent = 'Fetching historical context...';
    logToLoader('Fetching historical research timeline context...', 'info');
    historicalService.fetchHistoricalContext(state.bbox).then(historyText => {
      store.updateState({ historicalReport: historyText });
      logToLoader('Historical research timeline context loaded.', 'success');
    });

    // 3. Run Satellite Spectrum Analysis first to establish the base landuse grid
    // 3. Run Satellite Spectrum Analysis first if enabled
    let visionResult = null;
    if (state.useAISatelliteVision) {
      logToLoader('<br>=====================================', 'info');
      logToLoader('PHASE 2: AI Satellite Vision Analysis', 'info');
      logToLoader('=====================================', 'info');
      statusText.textContent = 'Analyzing satellite spectrum for natural and brownfield layouts...';
      logToLoader('Requesting ESRI static satellite tile for analysis...', 'info');
      try {
        const esriStaticUrl = `https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export?bbox=${state.bbox.west},${state.bbox.south},${state.bbox.east},${state.bbox.north}&bboxSR=4326&imageSR=4326&size=500,500&format=png&f=image`;
        logToLoader(`Static Satellite URL generated. Length: ${esriStaticUrl.length} chars.`, 'info');
        
        const visionConfig = resolveFeatureConfig(state, 'vision');
        if (visionConfig.provider === 'local') {
          logToLoader('Local Mathematical Engine selected for Vision Service. Running local rules...', 'info');
        } else if (!visionConfig.supported) {
          logToLoader(`Provider "${visionConfig.provider}" does not support visual intelligence. Falling back to local terrain heuristics.`, 'warn');
        } else if (visionConfig.apiKey) {
          logToLoader(`Preparing request to AI Vision Service using provider "${visionConfig.provider}"...`, 'info');
        } else {
          logToLoader(`No API key provided for Vision Service with provider "${visionConfig.provider}". Falling back to local terrain heuristics.`, 'warn');
        }
        
        visionResult = await aiVisionService.analyzeSatelliteImage(esriStaticUrl, logToLoader);
        if (visionResult) {
          logToLoader('AI Satellite analysis completed successfully.', 'success');
          if (visionResult.reasoning) {
            logToLoader(`<strong>[AI Vision Reasoning]</strong>: ${visionResult.reasoning}`, 'warn');
          }
          if (visionResult.water) logToLoader(`AI detected: ${visionResult.water.length} water bodies/zones.`, 'info');
          if (visionResult.roads) logToLoader(`AI detected: ${visionResult.roads.length} road networks/corridors.`, 'info');
          if (visionResult.residential) logToLoader(`AI detected: ${visionResult.residential.length} residential neighborhoods.`, 'info');
          if (visionResult.commercial) logToLoader(`AI detected: ${visionResult.commercial.length} commercial zones.`, 'info');
          if (visionResult.industrial) logToLoader(`AI detected: ${visionResult.industrial.length} industrial complexes.`, 'info');
        }
      } catch (visionErr) {
        logToLoader(`AI Vision processing failed, utilizing standard base layout fallback: ${visionErr.message}`, 'warn');
      }
    } else {
      logToLoader('AI Satellite analysis disabled by user settings. Skipping.', 'info');
    }

    // 4. Grid Generation (Satellite base first, then overlay OSM highways & building footprints)
    logToLoader('<br>=====================================', 'info');
    logToLoader('PHASE 3: Grid Assembly & Rasterization', 'info');
    logToLoader('=====================================', 'info');
    statusText.textContent = 'Rasterizing cell connectivity and overlaying OSM vectors...';
    logToLoader('Rasterizing simulation grid cells and geometry networks...', 'info');
    const grid = gridGenerator.generateGrid(
      state.bbox,
      parsed,
      state.gridWidth,
      state.gridHeight,
      visionResult
    );

    // 5. Update Store
    logToLoader('Updating simulation state variables...', 'info');
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

    // 6. Initialize visualizers
    logToLoader('Initializing Canvas 2D and Three.js 3D renderers...', 'info');
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
    
    logToLoader('Simulation sandbox initialized and ready!', 'success');
  }

  // Initialize sandbox extraction button
  const extractBtn = document.getElementById('extract-data-btn');
  extractBtn.addEventListener('click', async () => {
    if (extractBtn.classList.contains('disabled')) return;
    
    const state = store.getState();
    if (!state.bbox) return;

    // Show loading spinner overlay
    const loader = document.getElementById('simulation-loading');
    const statusText = document.getElementById('loading-status-text');
    const logContainer = document.getElementById('loading-log-container');
    
    loader.classList.remove('hidden');
    if (logContainer) logContainer.innerHTML = ''; // Clear logs
    logToLoader('Initializing simulation grid extraction pipeline...', 'info');

    // Remove any previous action buttons
    loader.querySelectorAll('.retry-extract-btn, .bypass-ai-btn, .action-buttons-wrapper').forEach(btn => btn.remove());

    try {
      // 1. Fetch OSM Vector Data from mirrors if enabled
      let parsed = { buildings: [], roads: [], water: [] };
      let rawOsm = null;
      let osmFailed = false;

      if (state.fetchOSMData) {
        logToLoader('=====================================', 'info');
        logToLoader('PHASE 1: OpenStreetMap Extraction', 'info');
        logToLoader('=====================================', 'info');
        statusText.textContent = 'Querying OpenStreetMap Overpass API...';
        logToLoader('Querying OpenStreetMap Overpass servers...', 'info');
        try {
          rawOsm = await overpassService.fetchMapData(state.bbox, logToLoader);
          statusText.textContent = 'Parsing geometries and highways...';
          logToLoader('OpenStreetMap data fetched successfully. Parsing geometries...', 'success');
          parsed = overpassService.parseGeometries(rawOsm);
        } catch (osmErr) {
          logToLoader(`OSM query failed: ${osmErr.message}`, 'error');
          osmFailed = true;
        }
      } else {
        logToLoader('OpenStreetMap (OSM) extraction disabled by user settings.', 'warn');
      }

      if (osmFailed) {
        logToLoader('All Overpass API attempts failed. OSM server is overloaded or timed out.', 'error');
        statusText.textContent = 'OSM Query Failed. Select action to proceed:';

        const btnWrapper = document.createElement('div');
        btnWrapper.className = 'action-buttons-wrapper';
        btnWrapper.style.cssText = 'margin-top: 16px; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;';

        const retryBtn = document.createElement('button');
        retryBtn.className = 'btn btn-accent retry-extract-btn';
        retryBtn.style.cssText = 'padding: 10px 20px; font-size: 13px; cursor: pointer;';
        retryBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Retry OSM';
        retryBtn.addEventListener('click', () => {
          btnWrapper.remove();
          extractBtn.click();
        });

        const hardResetBtn = document.createElement('button');
        hardResetBtn.className = 'btn btn-accent retry-extract-btn';
        hardResetBtn.style.cssText = 'padding: 10px 20px; font-size: 13px; cursor: pointer; background: linear-gradient(135deg, #ef4444, #dc2626);';
        hardResetBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Clear Cache & Retry';
        hardResetBtn.addEventListener('click', () => {
          // Purge all OSM caches from localStorage
          const keysToRemove = [];
          for (let k = 0; k < localStorage.length; k++) {
            const key = localStorage.key(k);
            if (key && key.startsWith('osm_cache_')) keysToRemove.push(key);
          }
          keysToRemove.forEach(k => localStorage.removeItem(k));
          logToLoader(`Purged ${keysToRemove.length} cached OSM entries from localStorage.`, 'warn');
          btnWrapper.remove();
          extractBtn.click();
        });

        const bypassBtn = document.createElement('button');
        bypassBtn.className = 'btn btn-secondary bypass-ai-btn';
        bypassBtn.style.cssText = 'padding: 10px 20px; font-size: 13px; cursor: pointer;';
        bypassBtn.innerHTML = '<i class="fa-solid fa-network-wired"></i> Bypass (Procedural)';
        bypassBtn.addEventListener('click', async () => {
          btnWrapper.remove();
          if (logContainer) logContainer.innerHTML = '';
          logToLoader('User selected OSM Bypass. Generating randomized procedural environment...', 'warn');
          try {
            const proceduralData = overpassService.generateProceduralElements(state.bbox);
            await completeInitialization(proceduralData, null, true);
          } catch (bypassErr) {
            console.error('Bypass initialization error:', bypassErr);
            statusText.textContent = `Bypass Error: ${bypassErr.message}`;
            logToLoader(`Bypass failed: ${bypassErr.message}`, 'error');
          }
          if (!loader.querySelector('.action-buttons-wrapper')) {
            loader.classList.add('hidden');
          }
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-secondary cancel-extract-btn';
        cancelBtn.style.cssText = 'padding: 10px 20px; font-size: 13px; cursor: pointer; background-color: #1e293b; color: #94a3b8; border: 1px solid #334155;';
        cancelBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Cancel & Go Back';
        cancelBtn.addEventListener('click', () => {
          btnWrapper.remove();
          loader.classList.add('hidden');
        });

        btnWrapper.appendChild(retryBtn);
        btnWrapper.appendChild(hardResetBtn);
        btnWrapper.appendChild(bypassBtn);
        btnWrapper.appendChild(cancelBtn);
        
        loader.querySelector('.loading-content, .loader-container, div')?.appendChild(btnWrapper)
          || loader.appendChild(btnWrapper);
        return; // Exit click handler - loader remains visible with buttons
      }

      if (!state.fetchOSMData) {
        if (state.useAISatelliteVision) {
          logToLoader('Initializing simulation using pure AI Satellite Vision...', 'info');
          await completeInitialization({ buildings: [], roads: [], water: [] }, null, true);
        } else {
          logToLoader('Both OSM and AI Satellite Vision disabled. Generating randomized procedural environment...', 'info');
          const proceduralData = overpassService.generateProceduralElements(state.bbox);
          await completeInitialization(proceduralData, null, true);
        }
      } else {
        // Success flow
        await completeInitialization(parsed, rawOsm, false);
      }

    } catch (err) {
      console.error('Initialization error:', err);
      statusText.textContent = `Error: ${err.message}`;
      logToLoader(`Initialization failed with error: ${err.message}`, 'error');
      
      const btnWrapper = document.createElement('div');
      btnWrapper.className = 'action-buttons-wrapper';
      btnWrapper.style.cssText = 'margin-top: 16px; display: flex; gap: 12px; justify-content: center;';

      const retryBtn = document.createElement('button');
      retryBtn.className = 'btn btn-accent retry-extract-btn';
      retryBtn.style.cssText = 'padding: 10px 20px; font-size: 13px; cursor: pointer;';
      retryBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Retry Extraction';
      retryBtn.addEventListener('click', () => {
        btnWrapper.remove();
        extractBtn.click();
      });

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn-secondary cancel-extract-btn';
      cancelBtn.style.cssText = 'padding: 10px 20px; font-size: 13px; cursor: pointer; background-color: #1e293b; color: #94a3b8; border: 1px solid #334155;';
      cancelBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Cancel & Go Back';
      cancelBtn.addEventListener('click', () => {
        btnWrapper.remove();
        loader.classList.add('hidden');
      });

      btnWrapper.appendChild(retryBtn);
      btnWrapper.appendChild(cancelBtn);

      loader.querySelector('.loading-content, .loader-container, div')?.appendChild(btnWrapper)
        || loader.appendChild(btnWrapper);
      return; // Keep loader visible with error + action buttons
    } finally {
      // Only hide loader if no action buttons are present
      if (!loader.querySelector('.retry-extract-btn') && !loader.querySelector('.action-buttons-wrapper')) {
        loader.classList.add('hidden');
      }
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

  // AI Mayor helper to sync LLM provider badge
  const updateMayorTickerBadge = () => {
    const state = store.getState();
    const provider = state.aiUseUniversal ? state.aiProvider : state.mayorProvider;
    const apiKey = state.aiUseUniversal ? state.aiKeys.universal : state.aiKeys.mayor;
    const isLocal = provider === 'local' || !apiKey;
    
    const badge = document.getElementById('ai-mayor-provider-badge');
    if (badge) {
      badge.textContent = isLocal ? 'Local Engine' : provider;
      if (isLocal) {
        badge.style.background = 'rgba(148, 163, 184, 0.1)';
        badge.style.borderColor = 'rgba(148, 163, 184, 0.2)';
        badge.style.color = 'var(--text-secondary)';
      } else {
        badge.style.background = 'rgba(0, 240, 255, 0.1)';
        badge.style.borderColor = 'rgba(0, 240, 255, 0.2)';
        badge.style.color = 'var(--accent)';
      }
    }
  };

  // AI Mayor toggle checkbox
  document.getElementById('ai-mayor-toggle').addEventListener('change', (e) => {
    const active = e.target.checked;
    store.updateState({ aiMayorEnabled: active });
    
    const thoughtsBox = document.getElementById('ai-mayor-thoughts');
    const statusText = document.getElementById('ai-mayor-status');
    const statusDot = document.getElementById('ai-mayor-status-dot');
    const ticker = document.getElementById('ai-mayor-ticker');

    if (active) {
      if (thoughtsBox) thoughtsBox.classList.remove('hidden');
      if (ticker) ticker.classList.remove('hidden');
      if (statusText) {
        statusText.textContent = 'AI Mayor Online';
        statusText.style.color = 'var(--accent)';
      }
      if (statusDot) statusDot.className = 'ai-ticker-dot online';
      updateMayorTickerBadge();
    } else {
      if (thoughtsBox) thoughtsBox.classList.add('hidden');
      if (ticker) ticker.classList.add('hidden');
      if (statusText) {
        statusText.textContent = 'AI Mayor Offline';
        statusText.style.color = 'var(--text-secondary)';
      }
      if (statusDot) statusDot.className = 'ai-ticker-dot offline';
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
    const statusText = document.getElementById('ai-mayor-status');
    const statusDot = document.getElementById('ai-mayor-status-dot');
    if (statusText) {
      statusText.textContent = 'AI Mayor Thinking...';
      statusText.style.color = 'var(--accent-amber)';
    }
    if (statusDot) statusDot.className = 'ai-ticker-dot thinking';
  });

  eventBus.on('ai-thinking-completed', (data) => {
    const statusText = document.getElementById('ai-mayor-status');
    const statusDot = document.getElementById('ai-mayor-status-dot');
    if (statusText) {
      statusText.textContent = 'AI Mayor Online';
      statusText.style.color = 'var(--accent)';
    }
    if (statusDot) statusDot.className = 'ai-ticker-dot online';
    
    const thoughts = store.getState().aiMayorThoughts;
    const thoughtsContent = document.getElementById('ai-thought-content');
    if (thoughtsContent) thoughtsContent.textContent = thoughts;

    if (data) {
      const pingEl = document.getElementById('ai-mayor-ping');
      const pulseEl = document.getElementById('ai-mayor-pulse-count');
      if (pingEl) pingEl.textContent = `Ping: ${data.latency} ms`;
      if (pulseEl) pulseEl.textContent = `Pulse: ${data.pulse}`;
    }
  });

  eventBus.on('ai-thinking-failed', (data) => {
    const statusText = document.getElementById('ai-mayor-status');
    const statusDot = document.getElementById('ai-mayor-status-dot');
    if (statusText) {
      statusText.textContent = 'AI Mayor Error';
      statusText.style.color = 'var(--accent-red)';
    }
    if (statusDot) statusDot.className = 'ai-ticker-dot error';
    
    const thoughtsContent = document.getElementById('ai-thought-content');
    if (thoughtsContent) thoughtsContent.textContent = `Connection failed: ${data.error || 'Unknown error'}`;
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

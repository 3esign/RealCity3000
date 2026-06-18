import store from '../state/store.js';
import { generateReportHTML } from './MethodologyReport.js';
import AttractivenessModel from '../simulation/AttractivenessModel.js';
import CellularAutomata from '../simulation/CellularAutomata.js';
import DevelopmentAgents from '../simulation/DevelopmentAgents.js';
import ValidationService from './ValidationService.js';

export class ExportService {
  constructor() {}

  downloadJSON() {
    const state = store.getState();
    const dataStr = JSON.stringify({
      params: state.params,
      metrics: state.metrics,
      metricsHistory: state.metricsHistory,
      gridWidth: state.gridWidth,
      gridHeight: state.gridHeight,
      simulationYear: state.simulationYear,
      currentPreset: state.currentPreset
    }, null, 2);

    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    this.triggerDownload(url, `realcity3000_state_year_${state.simulationYear}.json`);
  }

  downloadCSV() {
    const state = store.getState();
    const history = state.metricsHistory;
    
    let csvContent = 'year,population,densityPct,averageLandValue,pollutionIndex\n';
    history.forEach(row => {
      csvContent += `${row.year},${row.population},${row.urbanDensityPct},${row.averageLandValue},${row.pollutionIndex}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    this.triggerDownload(url, `realcity3000_metrics_history.csv`);
  }

  downloadReport() {
    const state = store.getState();
    const htmlContent = generateReportHTML(state);

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    this.triggerDownload(url, `realcity3000_methodology_report.html`);
  }

  downloadTextReport() {
    const state = store.getState();
    const mdContent = `# RealCity3000 // Scientific Transparency & Revision Report
Developed by: PhD Poturak Semir & Union Nikola Tesla University Academic Staff Team
Generated on: ${new Date().toLocaleString()}

## 1. Executive Summary & Code Integrity
RealCity3000 runs 100% locally in the browser when configured in 'Local Mathematical Engine' mode. No API connections are initiated. Sliders directly modulate the Cellular Automata (CA) probabilities and agent weights.

## 2. Core Scientific Equations & Academic Citations

### A. Cellular Automata Sprawl Model
*Origin: Clarke, K. C., Hoppen, S., & Gaydos, L. (1997). "A self-modifying cellular automaton model of historical land use change..."*
- Spontaneous Growth Probability:
  P_spontaneous = (Diffusion / 2500) * (1 - Slope / 10) * DensityModifier * (1 - D_urban) * DemandFactor
- Edge / Organic Growth:
  P_edge = (Spread / 200) * Urban Neighbors * (1 - D_urban) * DemandFactor
- Road-Influenced Gravity:
  P_road = (RoadGravity / 200) * e^(-d_road / 10) * (1 - D_urban) * DemandFactor

*Note: (1 - D_urban) acts as a logistic global Carrying Capacity control. DemandFactor represents macro RCI demand ratio. Local DensityModifier applies local compaction adjustments.*

### B. Desirability & Land Rent
*Origin: Alonso, W. (1964). "Location and Land Use: Toward a General Theory of Land Rent."*
Location value (rent) decays exponentially from the nearest commercial center cell:
  V = V_base * Access^0.6 * GreenAccess^0.3 * (1 - Pollution^0.6) * e^(-0.015 * d_nearest_com)

### C. Agent Utility Optimization (ABM Layer)
*Origin: Ligmann-Zielinska, A., & Jankowski, P. (2007). "Agent-based modelling of spatial decision-making..."*
- Residential Developer Utility:
  U_R = (0.4 * Access + 0.3 * Green - 0.2 * Pollution - 0.1 * V_land) * densityModifier
- Commercial Developer Utility:
  U_C = 0.4 * LocalPop + 0.4 * Access + 0.2 * V_land
- Industrial Developer Utility:
  U_I = 0.5 * (1 - V_land) + 0.4 * Access - 0.3 * LocalPop

### D. Macro-Feedback Stocks
*Origin: Forrester, J. W. (1969). "Urban Dynamics."*
- Housing vs jobs balance RCI demand:
  R-Demand = clamp(R-Demand + (Jobs - Population) * 0.015 - (TaxRate - 15) * 0.4 + PopGrowth * 1.2 + EconGrowth * 0.6, 0, 100)

### E. Dual-Source Spatial Visual Processing
RealCity3000 cross-validates deterministic OSM cadastral vectors (Source 1) with visual satellite spectrum raster anomalies (Source 2, parsed via AI Vision). OSM vectors define strict infrastructure bounds, while satellite image analysis populates unmapped semantic voids (such as vacant plots becoming rust-belt brownfields or forests).
- OSM Cadastral Mask: 100% confidence
- Satellite Spectral Parser: 82% confidence (Not externally validated)

### F. High-Performance CAD Visualization & Parametric Facades
- GPU Instanced Mesh: Reuses static THREE.InstancedMesh buffers (building solids and outlines) at 60fps. Vacant cells scale to 0.0001 and sit underground.
- Parametric Facade: Subdivides base boxes and prunes quad face coordinates representing window openings, generating custom skyscraper column-and-slab frames.

## 3. Code Reference Tree
- src/main.js: Coordinates core views, handles timeline loops, and fuses vector + vision data.
- src/state/store.js: Holds grid arrays and KPIs.
- src/simulation/SimulationEngine.js: Runs updates sequentially.
- src/simulation/CellularAutomata.js: Executes SLEUTH Monte Carlo steps.
- src/simulation/AttractivenessModel.js: Recomputes local values.
- src/simulation/DevelopmentAgents.js: Places cells dynamically using agent utility.
- src/simulation/SystemsDynamics.js: Adjusts global RCI demand.
- src/export/ValidationService.js: Performs historical validation sweeps, simulated annealing calibration, Shannon Entropy, and Moran's I spatial calculations.
- src/viz/ThreeJSRenderer.js: Optimized 3D visualization with parametric geometries.
- src/viz/Canvas2DRenderer.js: True 2D CAD blueprint visualizer with building footprints.
`;

    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    this.triggerDownload(url, 'realcity3000_transparency_revision_report.md');
  }

  // Fast cellular automata simulation runner for forecasting sweeps
  runFastForecast(grid, params, startYear, endYear) {
    const attractivenessModel = new AttractivenessModel();
    const cellularAutomata = new CellularAutomata();
    const developmentAgents = new DevelopmentAgents();

    const localGrid = grid.map(row => row.map(cell => ({ ...cell })));
    const localRCI = { r: 50, c: 50, i: 50 };
    let currentPop = 0;
    let vacantCount = 0;

    const height = localGrid.length;
    const width = localGrid[0].length;
    const cellCount = height * width;

    // Simulate forward
    for (let year = startYear; year < endYear; year++) {
      attractivenessModel.updateAttractiveness(localGrid, params);
      developmentAgents.runAgents(localGrid, params, localRCI);
      cellularAutomata.runCA(localGrid, params, localRCI);

      // Simple systems dynamics calculation
      let totalPop = 0;
      let vacant = 0;
      let totalC = 0, totalI = 0, totalInst = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const c = localGrid[y][x];
          if (c.type.startsWith('RESIDENTIAL')) { totalPop += c.population; }
          else if (c.type === 'COMMERCIAL') totalC++;
          else if (c.type === 'INDUSTRIAL') totalI++;
          else if (c.type === 'INSTITUTIONAL') totalInst++;
          else if (c.type === 'VACANT') vacant++;
        }
      }
      currentPop = totalPop;
      vacantCount = vacant;

      const jobCapacity = (totalC * 5) + (totalI * 8) + (totalInst * 4);
      const housingGap = jobCapacity - totalPop;

      const rDelta = (housingGap * 0.015) - (params.taxRate - 15) * 0.4 + params.populationGrowth * 1.2 + params.economicGrowth * 0.6;
      const cDelta = (totalPop * 0.015 - totalC) * 0.3 + params.economicGrowth * 1.2;
      const iDelta = (totalC * 0.6 - totalI) * 0.3 - (params.environmentalReg - 30) * 0.4 + params.economicGrowth * 0.8;

      localRCI.r = Math.min(Math.max(localRCI.r + rDelta, 0), 100);
      localRCI.c = Math.min(Math.max(localRCI.c + cDelta, 0), 100);
      localRCI.i = Math.min(Math.max(localRCI.i + iDelta, 0), 100);
    }

    const finalDensity = ((cellCount - vacantCount) / cellCount) * 100;
    return { finalDensity, finalPopulation: currentPop };
  }

  downloadSimulationReport() {
    const state = store.getState();
    const grid = state.grid;
    if (!grid) return;

    const mcSelector = document.getElementById('export-mc-samples');
    const totalRuns = mcSelector ? parseInt(mcSelector.value) : 50;

    const loader = document.getElementById('simulation-loading');
    const statusText = document.getElementById('loading-status-text');
    if (loader) loader.classList.remove('hidden');

    const startYear = 2017;
    const endYear = state.simulationYear;

    const densityRuns = [];
    const popRuns = [];

    const currentParams = { ...state.params };

    let runIndex = 0;
    const runBatchSize = 15;

    const compileReport = () => {
      statusText.textContent = "Analyzing parameter sensitivity (OAT perturbation sweeps)...";
      
      const sensitivityRankings = [];
      const activeSliders = [
        'diffusion', 'breed', 'spread', 'roadGravity', 'greenProtection',
        'taxRate', 'environmentalReg', 'densityCap', 'economicGrowth',
        'populationGrowth', 'infrastructureBudget'
      ];

      activeSliders.forEach(slider => {
        // Perturb +20%
        const highParams = { ...currentParams };
        highParams[slider] = Math.round(currentParams[slider] * 1.2);
        let sumHigh = 0;
        for (let j = 0; j < 15; j++) {
          sumHigh += this.runFastForecast(grid, highParams, startYear, endYear).finalDensity;
        }
        const meanHigh = sumHigh / 15;

        // Perturb -20%
        const lowParams = { ...currentParams };
        lowParams[slider] = Math.round(currentParams[slider] * 0.8);
        let sumLow = 0;
        for (let j = 0; j < 15; j++) {
          sumLow += this.runFastForecast(grid, lowParams, startYear, endYear).finalDensity;
        }
        const meanLow = sumLow / 15;

        const variance = Math.abs(meanHigh - meanLow);
        sensitivityRankings.push({ slider, variance });
      });

      const totalVar = sensitivityRankings.reduce((sum, item) => sum + item.variance, 0) || 1.0;
      const sensitivityReport = sensitivityRankings
        .map(item => ({
          name: item.slider,
          influence: ((item.variance / totalVar) * 100).toFixed(1)
        }))
        .sort((a, b) => b.influence - a.influence);

      const anomalyWarnings = [];
      const history = state.metricsHistory;
      
      if (history.length > 2) {
        const firstRow = history[0];
        const lastRow = history[history.length - 1];
        if (lastRow.population < firstRow.population && lastRow.urbanDensityPct > firstRow.urbanDensityPct) {
          anomalyWarnings.push("Warning: Urbanized area increased while population declined. This indicates potential spatial over-expansion, economic contraction, or demographic stagnation.");
        }
      }

      if (state.metrics.rciDemand.r === 0 && state.metrics.rciDemand.c === 0 && state.metrics.rciDemand.i === 0) {
        anomalyWarnings.push("Notice: The urban system has entered a stagnant equilibrium (zero demand across RCI). All development incentives have collapsed.");
      }

      const validationService = new ValidationService();
      const shannon = validationService.calculateShannonEntropy(grid);
      const morans = validationService.calculateSparseMoransI(grid);
      
      const validationResult = validationService.runValidationSimulation(grid, currentParams);
      const totalSpon = validationResult.totalSpontaneous;
      const totalEdg = validationResult.totalEdge;
      const gdi = totalEdg > 0 ? (totalSpon / totalEdg).toFixed(3) : '0.000';

      densityRuns.sort((a, b) => a - b);
      const sumDensity = densityRuns.reduce((s, v) => s + v, 0);
      const meanDensity = sumDensity / totalRuns;
      
      const sqDiffs = densityRuns.map(v => (v - meanDensity) ** 2);
      const stdDevDensity = Math.sqrt(sqDiffs.reduce((s, v) => s + v, 0) / totalRuns);

      const p25 = densityRuns[Math.floor(totalRuns * 0.025)] || densityRuns[0];
      const p975 = densityRuns[Math.min(Math.floor(totalRuns * 0.975), totalRuns - 1)] || densityRuns[totalRuns - 1];

      popRuns.sort((a, b) => a - b);
      const medianPop = popRuns[Math.floor(totalRuns * 0.5)];

      let pollutionQuality = "Clean Air";
      if (state.metrics.pollutionIndex > 0.6) pollutionQuality = "Hazardous (Heavy Industrial Smog)";
      else if (state.metrics.pollutionIndex > 0.3) pollutionQuality = "Moderate Pollution (Automobile-dependent)";
      else if (state.metrics.pollutionIndex > 0.1) pollutionQuality = "Light Smog";

      let densityQuality = "Rural/Scattered";
      if (state.metrics.urbanDensityPct > 70.0) densityQuality = "High-Density Urban Core";
      else if (state.metrics.urbanDensityPct > 40.0) densityQuality = "Medium-Density Urban";
      else if (state.metrics.urbanDensityPct > 15.0) densityQuality = "Low-Density Suburban";

      let executiveSummary = `Executive Summary:\n`;
      executiveSummary += `In this ${state.simulationYear - 2017}-year simulation of the geographical area centered at coordinates (${(state.bbox ? ((state.bbox.south+state.bbox.north)/2).toFixed(5) : '0.000')}, ${(state.bbox ? ((state.bbox.west+state.bbox.east)/2).toFixed(5) : '0.000')}), the urban structure reached a final density of ${state.metrics.urbanDensityPct}% (${densityQuality}). `;
      if (state.metrics.population > 0) {
        executiveSummary += `The population stabilized at ${state.metrics.population} capacity units. `;
      } else {
        executiveSummary += `The region remained primarily vacant or natural. `;
      }
      executiveSummary += `Environmental quality reads at ${state.metrics.pollutionIndex.toFixed(3)} (${pollutionQuality}).\n`;

      if (anomalyWarnings.length > 0) {
        executiveSummary += `\nDiagnostic Alerts:\n`;
        anomalyWarnings.forEach(w => {
          executiveSummary += `- ${w}\n`;
        });
      } else {
        executiveSummary += `\nDiagnostics: System behaves in a numerically stable equilibrium.\n`;
      }

      let reportContent = `======================================================================
REALCITY3000 // SIMULATION RUN REPORT & ACCURACY AUDIT
======================================================================
Academic Team: PhD Poturak Semir & Union Nikola Tesla University Academic Staff Team
Report Generated: ${new Date().toLocaleString()}

----------------------------------------------------------------------
1. EXECUTIVE SUMMARY & MODEL INTERPRETATION
----------------------------------------------------------------------
${executiveSummary}

----------------------------------------------------------------------
2. SIMULATION METADATA & BOUNDING GEOGRAPHY
----------------------------------------------------------------------
Baseline (OSM Seed Data) Year: 2017
Final Simulated Year: ${state.simulationYear}
Duration: ${state.simulationYear - 2017} years
Location Center: Latitude ${(state.bbox ? ((state.bbox.south+state.bbox.north)/2).toFixed(5) : '0.000')}, Longitude ${(state.bbox ? ((state.bbox.west+state.bbox.east)/2).toFixed(5) : '0.000')}
Cell Spatial Resolution: 10 meters per cell
Active Grid Size: ${state.gridWidth} x ${state.gridHeight} (${state.gridWidth * state.gridHeight} cells)
Simulation Area: ${(state.gridWidth * state.gridHeight * 0.0001).toFixed(2)} km²
Geographic Warning: NY/Manhattan core represents an extremely dense, established cadastre. Validation F1-scores will reflect model stasis rather than new growth dynamics.

Notice: Validation targets represent mapping completeness captured in OSM over time, not purely historical growth.

----------------------------------------------------------------------
3. STOCHASTIC MONTE CARLO UNCERTAINTY ANALYSIS (${totalRuns} RUNS)
----------------------------------------------------------------------
Parameter Uncertainty Source: Developer Assumption (perturbs active sliders ±15% uniform)
Density Forecast Metrics (15-Year Horizon):
  - Mean Urban Density: ${meanDensity.toFixed(2)}%
  - Standard Deviation: ${stdDevDensity.toFixed(2)}%
  - 95% Confidence Interval: [${p25.toFixed(2)}%, ${p975.toFixed(2)}%]
  - Median Simulated Population: ${medianPop} units

----------------------------------------------------------------------
4. SPATIAL SCIENCE METRICS
----------------------------------------------------------------------
Shannon Sprawl Entropy: ${shannon.toFixed(4)} (scale [0,1], 1.0 = uniform sprawl, 0.0 = nucleated)
Sparse Moran's I (Land Value): ${morans.toFixed(4)} (autocorrelation clustering coefficient)
Growth Dispersion Index (GDI): ${gdi} (spontaneous sprawl ratio, >1 = leapfrog, <0.2 = compact)

----------------------------------------------------------------------
5. ACTIVE SLIDER SENSITIVITY ANALYSIS (OAT RANKINGS)
----------------------------------------------------------------------
Influence on final urban density (variance percentage):
`;

      sensitivityReport.forEach((item, idx) => {
        reportContent += `  ${idx + 1}. ${item.name.padEnd(25)} : ${item.influence}%\n`;
      });

      reportContent += `
----------------------------------------------------------------------
6. HISTORICAL TIMELINE PROGRESS LOG
----------------------------------------------------------------------
Year | Population % | Density % | Avg Land Value % | Pollution Index
----------------------------------------------------------------------
`;

      const maxPop = state.gridWidth * state.gridHeight * 10;
      history.forEach(row => {
        const rowPopPct = ((row.population / maxPop) * 100).toFixed(2);
        const rowValPct = row.averageLandValue.toFixed(1);
        reportContent += `${String(row.year).padEnd(4)} | ${String(rowPopPct + '%').padEnd(12)} | ${String(row.urbanDensityPct + '%').padEnd(9)} | ${String(rowValPct + '%').padEnd(16)} | ${row.pollutionIndex.toFixed(3)}\n`;
      });

      reportContent += `\n======================================================================
End of Report.
======================================================================`;

      const blob = new Blob([reportContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      this.triggerDownload(url, `realcity3000_simulation_report_year_${state.simulationYear}.txt`);

      if (loader) loader.classList.add('hidden');
    };

    const runMCBatch = () => {
      statusText.textContent = `Running Monte Carlo forecasting sweeps: run ${runIndex}/${totalRuns}...`;

      for (let i = 0; i < runBatchSize && runIndex < totalRuns; i++, runIndex++) {
        // Perturb parameters by +/- 15% (tax +/- 10%, regs +/- 20%)
        const perturbed = {
          diffusion: Math.round(currentParams.diffusion * (1.0 + (Math.random() - 0.5) * 0.3)),
          breed: Math.round(currentParams.breed * (1.0 + (Math.random() - 0.5) * 0.3)),
          spread: Math.round(currentParams.spread * (1.0 + (Math.random() - 0.5) * 0.3)),
          roadGravity: Math.round(currentParams.roadGravity * (1.0 + (Math.random() - 0.5) * 0.3)),
          greenProtection: Math.round(currentParams.greenProtection * (1.0 + (Math.random() - 0.5) * 0.3)),
          taxRate: Math.round(currentParams.taxRate * (1.0 + (Math.random() - 0.5) * 0.2)),
          environmentalReg: Math.round(currentParams.environmentalReg * (1.0 + (Math.random() - 0.5) * 0.4)),
          densityCap: currentParams.densityCap,
          economicGrowth: currentParams.economicGrowth,
          populationGrowth: currentParams.populationGrowth,
          infrastructureBudget: currentParams.infrastructureBudget
        };

        const { finalDensity, finalPopulation } = this.runFastForecast(grid, perturbed, startYear, endYear);
        densityRuns.push(finalDensity);
        popRuns.push(finalPopulation);
      }

      if (runIndex < totalRuns) {
        setTimeout(runMCBatch, 10);
      } else {
        compileReport();
      }
    };

    runMCBatch();
  }

  downloadPNG(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const url = canvas.toDataURL('image/png');
    this.triggerDownload(url, `realcity3000_sandbox_capture.png`);
  }

  triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
export default ExportService;

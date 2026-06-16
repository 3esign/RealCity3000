import store from '../state/store.js';
import { generateReportHTML } from './MethodologyReport.js';

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
Developed by: Union Nikola Tesla University Academic Staff Team
Generated on: ${new Date().toLocaleString()}

## 1. Executive Summary & Code Integrity
RealCity3000 runs 100% locally in the browser when configured in 'Local Mathematical Engine' mode. No API connections are initiated. Sliders directly modulate the Cellular Automata (CA) probabilities and agent weights.

## 2. Core Scientific Equations

### A. Cellular Automata Sprawl Model (SLEUTH-inspired)
- Spontaneous Growth Probability:
  P_spontaneous = (Diffusion / 2500) * (1 - Slope / 10) * DensityModifier * (1 - D_urban) * DemandFactor
- Edge / Organic Growth:
  P_edge = (Spread / 200) * Urban Neighbors * (1 - D_urban) * DemandFactor
- Road-Influenced Gravity:
  P_road = (RoadGravity / 200) * e^(-d_road / 10) * (1 - D_urban) * DemandFactor

*Note: (1 - D_urban) acts as a logistic global Carrying Capacity control. DemandFactor represents macro RCI demand ratio. Local DensityModifier applies local compaction adjustments.*

### B. Desirability & Land Rent (Alonso Bid-Rent Theory)
Location value (rent) decays exponentially from commercial central nodes:
  V = V_base * Access^0.6 * GreenAccess^0.3 * (1 - Pollution^0.6) * e^(-0.04 * d)

### C. Agent Utility Optimization (ABM Layer)
- Residential Developer Utility:
  U_R = (0.4 * Access + 0.3 * Green - 0.2 * Pollution - 0.1 * V_land) * densityModifier
- Commercial Developer Utility:
  U_C = 0.4 * LocalPop + 0.4 * Access + 0.2 * V_land
- Industrial Developer Utility:
  U_I = 0.5 * (1 - V_land) + 0.4 * Access - 0.3 * LocalPop

### D. Macro-Feedback Stocks (Forrester Dynamics)
- Housing vs jobs balance RCI demand:
  R-Demand = clamp(R-Demand + (Jobs - Population) * 0.05 - (TaxRate - 15) * 0.8 - P_congestion - P_tax, 0, 100)
  *Note: P_congestion represents the Global Density penalty (6.0 * D_urban) and P_tax represents high tax penalties when TaxRate > 20.*

### E. Dual-Source Spatial Visual Processing
RealCity3000 cross-validates deterministic OSM cadastral vectors (Source 1) with visual satellite spectrum raster anomalies (Source 2, parsed via AI Vision). OSM vectors define strict infrastructure bounds, while satellite image analysis populates unmapped semantic voids (such as vacant plots becoming rust-belt brownfields or forests).

### F. High-Performance CAD Visualization & Parametric Facades
- GPU Instanced Mesh: Reuses static THREE.InstancedMesh buffers (building solids and outlines) at 60fps. Vacant cells scale to 0.0001 and sit underground.
- Parametric Facade: Subdivides base boxes and prunes quad face coordinates representing window openings, generating custom skyscraper column-and-slab frames.
- Parameter Manifestation: UI sliders change visual attributes (Environmental Regulations drive fog smog/color; Tax Rate drives emissive lighting cyan/blue intensity; Green Protection scales cone trees; Density Cap caps building heights).

## 3. Code Reference Tree
- src/main.js: Coordinates core views, handles timeline loops, and fuses vector + vision data.
- src/state/store.js: Holds grid arrays and KPIs.
- src/simulation/SimulationEngine.js: Runs updates sequentially.
- src/simulation/CellularAutomata.js: Executes SLEUTH Monte Carlo steps.
- src/simulation/AttractivenessModel.js: Recomputes local values.
- src/simulation/DevelopmentAgents.js: Places cells dynamically using agent utility.
- src/simulation/SystemsDynamics.js: Adjusts global RCI demand.
- src/viz/ThreeJSRenderer.js: Optimized 3D visualization with parametric geometries, environment parameter links, and ground WASD FPS camera.
- src/viz/Canvas2DRenderer.js: True 2D CAD blueprint visualizer with building footprints and road lane markings.
`;

    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    this.triggerDownload(url, 'realcity3000_transparency_revision_report.md');
  }

  downloadSimulationReport() {
    const state = store.getState();
    const metrics = state.metrics;
    const history = state.metricsHistory;
    const params = state.params;
    
    // Count landuse cells
    let r = 0, c = 0, i = 0, vacant = 0, forest = 0, water = 0, road = 0;
    if (state.grid) {
      const h = state.grid.length;
      const w = state.grid[0].length;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const type = state.grid[y][x].type;
          if (type.startsWith('RESIDENTIAL')) r++;
          else if (type === 'COMMERCIAL') c++;
          else if (type === 'INDUSTRIAL') i++;
          else if (type === 'FOREST') forest++;
          else if (type === 'WATER') water++;
          else if (type === 'ROAD') road++;
          else vacant++;
        }
      }
    }

    const midLat = state.bbox ? ((state.bbox.south + state.bbox.north) / 2).toFixed(5) : '0.000';
    const midLng = state.bbox ? ((state.bbox.west + state.bbox.east) / 2).toFixed(5) : '0.000';

    const maxPop = state.gridWidth * state.gridHeight * 10;
    const finalPopPct = ((metrics.population / maxPop) * 100).toFixed(2);
    const finalValPct = metrics.averageLandValue.toFixed(1);

    let reportContent = `======================================================================
REALCITY3000 // SIMULATION RUN REPORT
======================================================================
Academic Team: Union Nikola Tesla University Academic Staff Team
Report Generated: ${new Date().toLocaleString()}

----------------------------------------------------------------------
1. SIMULATION METADATA & LOCATION
----------------------------------------------------------------------
Starting Year: 2017
Final Simulated Year: ${state.simulationYear}
Duration: ${state.simulationYear - 2017} years
Location Center: Latitude ${midLat}, Longitude ${midLng}
Bounding Box:
  - North: ${state.bbox ? state.bbox.north.toFixed(5) : '0.000'}
  - South: ${state.bbox ? state.bbox.south.toFixed(5) : '0.000'}
  - East: ${state.bbox ? state.bbox.east.toFixed(5) : '0.000'}
  - West: ${state.bbox ? state.bbox.west.toFixed(5) : '0.000'}
Grid Size: ${state.gridWidth} x ${state.gridHeight} (${state.gridWidth * state.gridHeight} cells)

----------------------------------------------------------------------
2. ACTIVE CONTROL PARAMETERS
----------------------------------------------------------------------
Scenario Preset: ${state.currentPreset.toUpperCase()}
Parameters:
  - Diffusion (Sprawl): ${params.diffusion}
  - Breed (New Centers): ${params.breed}
  - Spread (Organic): ${params.spread}
  - Road Gravity: ${params.roadGravity}
  - Green Protection: ${params.greenProtection}
  - Tax Rate: ${params.taxRate}%
  - Environmental Regulations: ${params.environmentalReg}
  - Density Cap: ${params.densityCap} stories

----------------------------------------------------------------------
3. SIMULATED END STATE RESULTS (YEAR ${state.simulationYear})
----------------------------------------------------------------------
Total Population (as Capacity %): ${finalPopPct}%
Urban Density: ${metrics.urbanDensityPct}%
Average Land Value: ${finalValPct}%
Average Pollution Index: ${metrics.pollutionIndex.toFixed(3)}
RCI Demand:
  - Residential Demand: ${metrics.rciDemand.r}
  - Commercial Demand: ${metrics.rciDemand.c}
  - Industrial Demand: ${metrics.rciDemand.i}

Land-Use Distribution:
  - Residential Cells: ${r}
  - Commercial Cells: ${c}
  - Industrial Cells: ${i}
  - Open Roads Cells: ${road}
  - Water Cells: ${water}
  - Forest/Green Cells: ${forest}
  - Vacant Cells: ${vacant}

----------------------------------------------------------------------
4. HISTORICAL TIMELINE PROGRESS LOG
----------------------------------------------------------------------
Year | Population % | Density % | Avg Land Value % | Pollution Index
----------------------------------------------------------------------
`;

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

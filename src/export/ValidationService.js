import store from '../state/store.js';
import AttractivenessModel from '../simulation/AttractivenessModel.js';
import CellularAutomata from '../simulation/CellularAutomata.js';
import DevelopmentAgents from '../simulation/DevelopmentAgents.js';

export class ValidationService {
  constructor() {
    this.attractivenessModel = new AttractivenessModel();
    this.cellularAutomata = new CellularAutomata();
    this.developmentAgents = new DevelopmentAgents();
  }

  // Seeding 2017 baseline, simulating to 2026, and scoring against originalGrid
  runValidationSimulation(grid, params) {
    const height = grid.length;
    const width = grid[0].length;

    // Deep clone grid
    const localGrid = grid.map(row => row.map(cell => ({ ...cell })));

    // Clear all developed cells (seed 2017 baseline)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = localGrid[y][x];
        const isRoadOrWater = cell.type === 'ROAD' || cell.type === 'WATER';
        if (!isRoadOrWater) {
          cell.type = 'VACANT';
          cell.originalType = 'VACANT';
          cell.density = 0;
          cell.population = 0;
          cell.buildingId = null;
          cell.buildingUse = null;
        }
      }
    }

    const localRCI = { r: 50, c: 50, i: 50 };
    let totalSpontaneous = 0;
    let totalEdge = 0;

    // Simulate 9 ticks (representing 2017 -> 2026)
    for (let tick = 0; tick < 9; tick++) {
      // 1. Attractiveness fields
      this.attractivenessModel.updateAttractiveness(localGrid, params);

      // 2. ABM developer agents
      this.developmentAgents.runAgents(localGrid, params, localRCI);

      // 3. Cellular Automata (track spontaneous vs organic growth)
      const beforeTypes = localGrid.map(row => row.map(c => c.type));
      this.cellularAutomata.runCA(localGrid, params, localRCI);

      // Inspect new growth to classify GDI
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (beforeTypes[y][x] === 'VACANT' && localGrid[y][x].type !== 'VACANT') {
            let urbanNeighbors = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dy === 0 && dx === 0) continue;
                const ny = y + dy;
                const nx = x + dx;
                if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                  const t = beforeTypes[ny][nx];
                  if (t !== 'VACANT' && t !== 'ROAD' && t !== 'WATER') {
                    urbanNeighbors++;
                  }
                }
              }
            }
            if (urbanNeighbors >= 1) {
              totalEdge++;
            } else {
              totalSpontaneous++;
            }
          }
        }
      }

      // 4. Local systems dynamics updates to RCI demand
      let totalR = 0, totalC = 0, totalI = 0, totalPop = 0, vacant = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const c = localGrid[y][x];
          if (c.type.startsWith('RESIDENTIAL')) { totalR++; totalPop += c.population; }
          else if (c.type === 'COMMERCIAL') totalC++;
          else if (c.type === 'INDUSTRIAL') totalI++;
          else if (c.type === 'VACANT') vacant++;
        }
      }
      
      const density = ((height * width - vacant) / (height * width)) * 100;
      const jobCapacity = (totalC * 5) + (totalI * 8);
      const housingGap = jobCapacity - totalPop;

      const rDelta = (housingGap * 0.015) - (params.taxRate - 15) * 0.4 + params.populationGrowth * 1.2 + params.economicGrowth * 0.6;
      const cDelta = (totalPop * 0.015 - totalC) * 0.3 + params.economicGrowth * 1.2;
      const iDelta = (totalC * 0.6 - totalI) * 0.3 - (params.environmentalReg - 30) * 0.4 + params.economicGrowth * 0.8;

      localRCI.r = Math.min(Math.max(localRCI.r + rDelta, 0), 100);
      localRCI.c = Math.min(Math.max(localRCI.c + cDelta, 0), 100);
      localRCI.i = Math.min(Math.max(localRCI.i + iDelta, 0), 100);
    }

    return { localGrid, totalSpontaneous, totalEdge };
  }

  calculateMetrics(simGrid, originalGrid) {
    const height = simGrid.length;
    const width = simGrid[0].length;

    let tp = 0;
    let fp = 0;
    let fn = 0;

    const fpCells = [];
    const actualCells = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const simCell = simGrid[y][x];
        const origCell = originalGrid[y][x];

        const simDev = simCell.type.startsWith('RESIDENTIAL') || simCell.type === 'COMMERCIAL' || simCell.type === 'INDUSTRIAL';
        const origDev = origCell.type.startsWith('RESIDENTIAL') || origCell.type === 'COMMERCIAL' || origCell.type === 'INDUSTRIAL';

        if (simDev && origDev) {
          tp++;
          actualCells.push({ x, y });
        } else if (simDev && !origDev) {
          fp++;
          fpCells.push({ x, y });
        } else if (!simDev && origDev) {
          fn++;
          actualCells.push({ x, y });
        }
      }
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0.0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0.0;
    const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0.0;

    // Spatial Distance Error: Mean Euclidean distance of False Positives to nearest actual cell
    let totalDist = 0;
    if (fpCells.length > 0 && actualCells.length > 0) {
      fpCells.forEach(fp => {
        let minDist = 999;
        for (let i = 0; i < actualCells.length; i++) {
          const act = actualCells[i];
          const d = Math.sqrt((fp.x - act.x) ** 2 + (fp.y - act.y) ** 2);
          if (d < minDist) minDist = d;
        }
        totalDist += minDist;
      });
    }
    const meanSpatialError = fpCells.length > 0 ? (totalDist / fpCells.length) * 10 : 0.0; // 10m per cell resolution

    return { precision, recall, f1, meanSpatialError };
  }

  // Shannon Entropy: measures sprawl dispersion over 8x8 matrix
  calculateShannonEntropy(grid) {
    const height = grid.length;
    const width = grid[0].length;

    const zones = Array(64).fill(0);
    let totalDeveloped = 0;

    const rowStep = height / 8;
    const colStep = width / 8;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[y][x];
        const isDev = cell.type.startsWith('RESIDENTIAL') || cell.type === 'COMMERCIAL' || cell.type === 'INDUSTRIAL';
        if (isDev) {
          const zoneRow = Math.min(Math.floor(y / rowStep), 7);
          const zoneCol = Math.min(Math.floor(x / colStep), 7);
          const zoneIdx = zoneRow * 8 + zoneCol;
          zones[zoneIdx]++;
          totalDeveloped++;
        }
      }
    }

    if (totalDeveloped === 0) return 0.0;

    let entropy = 0.0;
    for (let k = 0; k < 64; k++) {
      const p_k = zones[k] / totalDeveloped;
      if (p_k > 0) {
        entropy -= p_k * Math.log(p_k);
      }
    }

    return entropy / Math.log(64); // normalized [0, 1]
  }

  // Sparse Moran's I: autocorrelation of land values over adjacent neighbors
  calculateSparseMoransI(grid) {
    const height = grid.length;
    const width = grid[0].length;

    let totalValue = 0;
    let n = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        totalValue += grid[y][x].landValue;
        n++;
      }
    }
    const meanValue = totalValue / n;

    let numerator = 0.0;
    let denominator = 0.0;
    let s0 = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dev = grid[y][x].landValue - meanValue;
        denominator += dev * dev;
      }
    }

    // Neighbors sum (Sparse adjacency check: 8 Moore neighbors)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const valI = grid[y][x].landValue - meanValue;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dy === 0 && dx === 0) continue;
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              const valJ = grid[ny][nx].landValue - meanValue;
              numerator += valI * valJ;
              s0++;
            }
          }
        }
      }
    }

    if (denominator === 0 || s0 === 0) return 0.0;
    return (n / s0) * (numerator / denominator);
  }

  // Simulated Annealing parameter optimizer
  runSimulatedAnnealing(grid, originalGrid, onProgress, onComplete) {
    const state = store.getState();
    const currentParams = { ...state.params };

    // Initial state
    let currentP = {
      diffusion: currentParams.diffusion,
      spread: currentParams.spread,
      roadGravity: currentParams.roadGravity
    };

    const bounds = {
      diffusion: [5, 60],
      spread: [5, 80],
      roadGravity: [10, 80]
    };

    const evaluateCost = (p) => {
      const testParams = { ...currentParams, ...p };
      const { localGrid } = this.runValidationSimulation(grid, testParams);
      const metrics = this.calculateMetrics(localGrid, originalGrid);
      return 1.0 - metrics.f1; // Cost = 1 - F1
    };

    let currentCost = evaluateCost(currentP);
    let bestP = { ...currentP };
    let bestCost = currentCost;

    let T = 0.5; // Starting temperature
    const alpha = 0.85; // cooling factor
    const maxIterations = 30;
    let k = 0;

    const runNextBatch = () => {
      if (k >= maxIterations) {
        onComplete(bestP, 1.0 - bestCost);
        return;
      }

      // Run 2 iterations per batch to keep main thread responsive
      for (let i = 0; i < 2 && k < maxIterations; i++, k++) {
        // Perturb parameters slightly
        const perturb = (val, min, max) => {
          const step = (Math.random() - 0.5) * 10.0; // [-5, +5] perturbation
          return Math.min(Math.max(Math.round(val + step), min), max);
        };

        const candidateP = {
          diffusion: perturb(currentP.diffusion, bounds.diffusion[0], bounds.diffusion[1]),
          spread: perturb(currentP.spread, bounds.spread[0], bounds.spread[1]),
          roadGravity: perturb(currentP.roadGravity, bounds.roadGravity[0], bounds.roadGravity[1])
        };

        const candidateCost = evaluateCost(candidateP);
        const costDiff = candidateCost - currentCost;

        // Accept new state if better, or with Boltzmann probability
        if (costDiff < 0 || Math.random() < Math.exp(-costDiff / T)) {
          currentP = { ...candidateP };
          currentCost = candidateCost;

          if (candidateCost < bestCost) {
            bestP = { ...candidateP };
            bestCost = candidateCost;
          }
        }

        // Cool temperature
        T *= alpha;
      }

      const progress = (k / maxIterations) * 100;
      onProgress(progress, bestP, 1.0 - bestCost);

      setTimeout(runNextBatch, 50); // Pause for 50ms to yield to layout thread
    };

    runNextBatch();
  }
}
export default ValidationService;

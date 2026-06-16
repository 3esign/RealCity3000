import store from '../state/store.js';

export class DevelopmentAgents {
  constructor() {}

  runAgents(grid, params, rciDemand) {
    const height = grid.length;
    const width = grid[0].length;
    
    // Calculate Global Carrying Capacity Factor (Pearl-Verhulst logistic growth)
    let vacantCount = 0;
    let cellCount = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        cellCount++;
        const type = grid[y][x].type;
        if (type === 'VACANT' || type === 'FOREST' || type === 'BROWNFIELD') {
          vacantCount++;
        }
      }
    }
    const urbanDensity = cellCount > 0 ? (cellCount - vacantCount) / cellCount : 0;
    const globalCapFactor = Math.max(0.01, 1.0 - urbanDensity);
    
    // 1. Gather all candidate cells (vacant, forest, brownfield, or existing low-density buildings)
    const candidates = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[y][x];
        const isVacant = cell.type === 'VACANT' || cell.type === 'FOREST' || cell.type === 'BROWNFIELD';
        const isLowDensity = (cell.type.startsWith('RESIDENTIAL') || cell.type === 'COMMERCIAL' || cell.type === 'INDUSTRIAL') && cell.density <= 3;
        
        if (isVacant || isLowDensity) {
          candidates.push(cell);
        }
      }
    }

    if (candidates.length === 0) return;

    // Set to track cells developed during this tick to prevent double-development
    const modifiedCells = new Set();

    // Helper to calculate developed density in 5x5 window
    const getLocalDensity = (cx, cy) => {
      let developed = 0;
      let total = 0;
      const radius = 2;
      for (let y = Math.max(0, cy - radius); y < Math.min(height, cy + radius + 1); y++) {
        for (let x = Math.max(0, cx - radius); x < Math.min(width, cx + radius + 1); x++) {
          total++;
          const cell = grid[y][x];
          const isDev = cell.type.startsWith('RESIDENTIAL') || 
                        cell.type === 'COMMERCIAL' || 
                        cell.type === 'INDUSTRIAL' || 
                        cell.type === 'INSTITUTIONAL';
          if (isDev) {
            developed++;
          }
        }
      }
      return total > 0 ? developed / total : 0;
    };

    const getDensityModifier = (density) => {
      if (density >= 0.6) {
        return 0.05 + (1.0 - (density - 0.6) / 0.4) * 0.15; // scales from 0.2 down to 0.05
      }
      return 1.0 + (1.0 - density / 0.6) * 1.5; // scales from 2.5 down to 1.0
    };

    // Helper to calculate population density in a small local radius
    const getLocalPop = (cx, cy) => {
      let popSum = 0;
      const radius = 3;
      for (let y = Math.max(0, cy - radius); y < Math.min(height, cy + radius + 1); y++) {
        for (let x = Math.max(0, cx - radius); x < Math.min(width, cx + radius + 1); x++) {
          popSum += grid[y][x].population || 0;
        }
      }
      return popSum;
    };

    // 2. Residential Developer Agent Decisions
    let resBudget = Math.floor((rciDemand.r / 40) * globalCapFactor); 
    if (resBudget <= 0 && Math.random() < 0.15 * globalCapFactor) {
      resBudget = 1; // baseline renewal chance
    }
    if (resBudget > 0) {
      // Score candidates
      const scoredRes = candidates.map(cell => {
        const lvNorm = cell.landValue / 100.0;
        // Residential utility modulated by compaction resistance
        const utility = ((0.4 * cell.accessibility) 
                      + (0.3 * cell.greenAccess) 
                      - (0.2 * cell.pollution) 
                      - (0.1 * lvNorm))
                      * getDensityModifier(getLocalDensity(cell.x, cell.y));
        return { cell, utility };
      }).sort((a, b) => b.utility - a.utility);

      // Deploy builds
      let deployed = 0;
      for (let i = 0; i < scoredRes.length && deployed < resBudget; i++) {
        const cell = scoredRes[i].cell;
        const lv = cell.landValue;

        modifiedCells.add(cell);
        deployed++;

        const isAlreadyRes = cell.type.startsWith('RESIDENTIAL');

        if (isAlreadyRes) {
          // Upgrade density of existing residential building
          cell.density = Math.min(cell.density + 2, params.densityCap);
          if (cell.density >= 5) {
            cell.type = 'RESIDENTIAL_HIGH';
          }
          cell.population = cell.density * 5;
        } else {
          // Rezone or build fresh
          if (lv > 45 && params.densityCap > 5) {
            cell.type = 'RESIDENTIAL_HIGH';
            cell.density = Math.min(6, params.densityCap);
            cell.population = cell.density * 5;
          } else {
            cell.type = 'RESIDENTIAL_LOW';
            cell.density = 2;
            cell.population = 6;
          }
          cell.buildingId = null;
          cell.buildingUse = null;
        }
      }
    }

    // 3. Commercial Developer Agent Decisions
    let comBudget = Math.floor((rciDemand.c / 50) * globalCapFactor); 
    if (comBudget <= 0 && Math.random() < 0.12 * globalCapFactor) {
      comBudget = 1; // baseline renewal chance
    }
    if (comBudget > 0) {
      const activeCandidates = candidates.filter(c => !modifiedCells.has(c));
      const scoredCom = activeCandidates.map(cell => {
        const lvNorm = cell.landValue / 100.0;
        const localPop = getLocalPop(cell.x, cell.y);
        const popNorm = Math.min(localPop / 200.0, 1.0);
        
        const utility = ((0.4 * popNorm) 
                      + (0.4 * cell.accessibility) 
                      + (0.2 * lvNorm))
                      * getDensityModifier(getLocalDensity(cell.x, cell.y));
        return { cell, utility };
      }).sort((a, b) => b.utility - a.utility);

      let deployed = 0;
      for (let i = 0; i < scoredCom.length && deployed < comBudget; i++) {
        const cell = scoredCom[i].cell;
        
        modifiedCells.add(cell);
        deployed++;

        if (cell.type === 'COMMERCIAL') {
          // Upgrade existing commercial building
          cell.density = Math.min(cell.density + 2, params.densityCap);
        } else {
          // Rezone or build fresh
          cell.type = 'COMMERCIAL';
          cell.density = 3;
          cell.population = 0; // Jobs
          cell.buildingId = null;
          cell.buildingUse = null;
        }
      }
    }

    // 4. Industrial Developer Agent Decisions
    let indBudget = Math.floor((rciDemand.i / 50) * globalCapFactor); 
    if (indBudget <= 0 && Math.random() < 0.12 * globalCapFactor) {
      indBudget = 1; // baseline renewal chance
    }
    if (indBudget > 0) {
      const activeCandidates = candidates.filter(c => !modifiedCells.has(c));
      const scoredInd = activeCandidates.map(cell => {
        const lvNorm = cell.landValue / 100.0;
        const localPop = getLocalPop(cell.x, cell.y);
        const popNorm = Math.min(localPop / 200.0, 1.0);
        
        const utility = ((0.5 * (1.0 - lvNorm)) 
                      + (0.4 * cell.accessibility) 
                      - (0.3 * popNorm))
                      * getDensityModifier(getLocalDensity(cell.x, cell.y));
        return { cell, utility };
      }).sort((a, b) => b.utility - a.utility);

      let deployed = 0;
      for (let i = 0; i < scoredInd.length && deployed < indBudget; i++) {
        const cell = scoredInd[i].cell;
        
        modifiedCells.add(cell);
        deployed++;

        if (cell.type === 'INDUSTRIAL') {
          // Upgrade existing industrial building
          cell.density = Math.min(cell.density + 1, params.densityCap);
        } else {
          // Rezone or build fresh
          cell.type = 'INDUSTRIAL';
          cell.density = 2;
          cell.population = 0;
          cell.buildingId = null;
          cell.buildingUse = null;
        }
      }
    }
  }
}
export default DevelopmentAgents;

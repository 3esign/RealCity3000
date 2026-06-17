import store from '../state/store.js';

export class CellularAutomata {
  constructor() {}

  getLocalDensity(grid, cx, cy) {
    const height = grid.length;
    const width = grid[0].length;
    let developed = 0;
    let total = 0;

    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          total++;
          const cell = grid[ny][nx];
          const isDev = cell.type.startsWith('RESIDENTIAL') || 
                        cell.type === 'COMMERCIAL' || 
                        cell.type === 'INDUSTRIAL' || 
                        cell.type === 'INSTITUTIONAL';
          if (isDev) {
            developed++;
          }
        }
      }
    }
    return total > 0 ? developed / total : 0;
  }

  runCA(grid, params, rciDemand) {
    const height = grid.length;
    const width = grid[0].length;
    const newlyUrbanized = [];

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

    // Calculate RCI Demand Factor (growth stops if total demand <= 0, baseline at 0.15)
    const totalDemand = rciDemand.r + rciDemand.c + rciDemand.i;
    const demandFactor = Math.max(0.15, totalDemand / 300.0);

    // Helper: Determine land use class based on local RCI demand
    const assignZoneClass = () => {
      const { r, c, i } = rciDemand;
      const sum = r + c + i;
      if (sum === 0) return 'RESIDENTIAL_LOW';
      
      const rand = Math.random() * sum;
      if (rand < r) {
        return Math.random() > 0.4 ? 'RESIDENTIAL_LOW' : 'RESIDENTIAL_HIGH';
      } else if (rand < r + c) {
        return 'COMMERCIAL';
      } else {
        return 'INDUSTRIAL';
      }
    };

    const isBuildable = (cell) => {
      return cell.type === 'VACANT' || cell.type === 'FOREST' || cell.type === 'BROWNFIELD';
    };

    const urbanize = (cell) => {
      const type = assignZoneClass();
      cell.type = type;
      cell.density = type === 'RESIDENTIAL_HIGH' ? 6 : 2;
      cell.population = type === 'RESIDENTIAL_HIGH' ? 30 : 6;
      cell.age = 0;
      newlyUrbanized.push(cell);
    };

    const getDensityModifier = (density) => {
      if (density >= 0.6) {
        return 0.05 + (1.0 - (density - 0.6) / 0.4) * 0.15; // scales from 0.2 down to 0.05
      }
      return 1.0 + (1.0 - density / 0.6) * 1.5; // scales from 2.5 down to 1.0
    };

    // --- Rule 1: Spontaneous Growth ---
    const diffusionChance = (params.diffusion / 10000.0) * globalCapFactor * demandFactor; // scaled down x4 to avoid flash growth
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[y][x];
        if (isBuildable(cell)) {
          const density = this.getLocalDensity(grid, x, y);
          const mod = getDensityModifier(density);
          // Slope penalty
          const slopePenalty = 1.0 - (Math.abs(cell.elevation) / 10.0); // elevation gradient
          if (Math.random() < diffusionChance * Math.max(slopePenalty, 0.1) * mod) {
            urbanize(cell);
          }
        }
      }
    }

    // --- Rule 2: New Spreading Center ---
    const breedChance = (params.breed / 600.0) * globalCapFactor * demandFactor;
    newlyUrbanized.forEach(cell => {
      if (Math.random() < breedChance) {
        // Find 1-2 random neighbors to urbanize
        const dirs = [
          {dx:-1, dy:0}, {dx:1, dy:0}, {dx:0, dy:-1}, {dx:0, dy:1}
        ];
        let builds = 0;
        for (let i = 0; i < 4 && builds < 2; i++) {
          const dir = dirs[Math.floor(Math.random() * dirs.length)];
          const nx = cell.x + dir.dx;
          const ny = cell.y + dir.dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const neighbor = grid[ny][nx];
            if (isBuildable(neighbor)) {
              const density = this.getLocalDensity(grid, nx, ny);
              const mod = getDensityModifier(density);
              if (Math.random() < mod) {
                urbanize(neighbor);
                builds++;
              }
            }
          }
        }
      }
    });

    // --- Rule 3: Edge (Organic) Growth ---
    // Make copy of types to avoid concurrent modification issues in the loops
    const typeCopy = grid.map(row => row.map(c => c.type));
    const spreadChance = (params.spread / 800.0) * globalCapFactor * demandFactor;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[y][x];
        if (isBuildable(cell)) {
          // Count urban neighbors
          let urbanCount = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx;
              const ny = y + dy;
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const type = typeCopy[ny][nx];
                if (type.startsWith('RESIDENTIAL') || type === 'COMMERCIAL' || type === 'INDUSTRIAL') {
                  urbanCount++;
                }
              }
            }
          }

          if (urbanCount >= 2) {
            const density = this.getLocalDensity(grid, x, y);
            const mod = getDensityModifier(density);
            if (Math.random() < spreadChance * mod) {
              urbanize(cell);
            }
          }
        }
      }
    }

    // --- Rule 4: Road-Influenced Growth ---
    const roadGravityChance = (params.roadGravity / 800.0) * globalCapFactor * demandFactor;
    if (newlyUrbanized.length > 0 && Math.random() < roadGravityChance) {
      // Pick a random newly urbanized cell
      const cell = newlyUrbanized[Math.floor(Math.random() * newlyUrbanized.length)];
      
      // Search for nearest road within roadGravity search distance
      const searchDist = Math.max(2, Math.floor(params.roadGravity / 10));
      let foundRoad = null;

      for (let dy = -searchDist; dy <= searchDist && !foundRoad; dy++) {
        for (let dx = -searchDist; dx <= searchDist && !foundRoad; dx++) {
          const nx = cell.x + dx;
          const ny = cell.y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            if (grid[ny][nx].type === 'ROAD') {
              foundRoad = grid[ny][nx];
            }
          }
        }
      }

      if (foundRoad) {
        // Urbanize some neighbors along the road buffer
        const dirs = [
          {dx:-1, dy:-1}, {dx:0, dy:-1}, {dx:1, dy:-1},
          {dx:-1, dy:0},                  {dx:1, dy:0},
          {dx:-1, dy:1},  {dx:0, dy:1},   {dx:1, dy:1}
        ];
        
        let roadBuilds = 0;
        for (let i = 0; i < 4 && roadBuilds < 2; i++) {
          const dir = dirs[Math.floor(Math.random() * dirs.length)];
          const rx = foundRoad.x + dir.dx;
          const ry = foundRoad.y + dir.dy;
          if (rx >= 0 && rx < width && ry >= 0 && ry < height) {
            const c = grid[ry][rx];
            if (isBuildable(c)) {
              const density = this.getLocalDensity(grid, rx, ry);
              const mod = getDensityModifier(density);
              if (Math.random() < mod) {
                urbanize(c);
                roadBuilds++;
              }
            }
          }
        }
      }
    }

    // --- Rule 5: Existing Building Evolution (Change, Grow, Decay) ---
    const densityCap = params.densityCap;
    const taxRate = params.taxRate;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[y][x];
        const isRes = cell.type.startsWith('RESIDENTIAL');
        const isCom = cell.type === 'COMMERCIAL';
        const isInd = cell.type === 'INDUSTRIAL';
        
        if (isRes || isCom || isInd) {
          cell.age = (cell.age || 0) + 1;

          // A. Decay & Abandonment (due to high taxes or high pollution)
          const localPollution = cell.pollution || 0;
          const infantMortality = (cell.age < 15) ? 0.05 : 0; // High failure early on
          const ageResilience = (cell.age > 50) ? 0.03 : 0; // Established buildings survive better

          if (taxRate > 20 || (isRes && localPollution > 0.40) || (isCom && localPollution > 0.55) || infantMortality > 0) {
            const decayProb = Math.max(0, 0.02 + (taxRate - 20) * 0.004 + (isRes ? localPollution * 0.08 : 0) + infantMortality - ageResilience);
            if (Math.random() < decayProb) {
              cell.density = Math.max(0, cell.density - 1);
              if (cell.density === 0) {
                // Abandoned! Revert to Vacant or Brownfield
                cell.type = isInd || isCom ? 'BROWNFIELD' : 'VACANT';
                cell.population = 0;
                cell.buildingId = null;
                cell.buildingUse = null;
                cell.age = 0;
              } else {
                // Lower population
                cell.population = Math.max(0, cell.population - 4);
              }
              continue; // skipped growth if decayed
            }
          }

          // B. Densification & Growth (due to positive demand and high land value attractiveness)
          if (cell.density < densityCap) {
            let demand = 0;
            if (isRes) demand = rciDemand.r;
            else if (isCom) demand = rciDemand.c;
            else if (isInd) demand = rciDemand.i;

            if (demand > 15 && cell.landValue > 30) {
              const growProb = 0.02 + (demand / 100.0) * 0.04 + (cell.landValue / 100.0) * 0.02;
              if (Math.random() < growProb) {
                cell.density = Math.min(cell.density + 1, densityCap);
                if (isRes) {
                  if (cell.density >= 5) {
                    cell.type = 'RESIDENTIAL_HIGH';
                  }
                  cell.population = cell.density * 5;
                } else if (isCom) {
                  cell.population = 0; // Commercial has jobs, not population stock
                } else if (isInd) {
                  cell.population = 0;
                }
              }
            }
          }
        }
      }
    }
  }
}
export default CellularAutomata;

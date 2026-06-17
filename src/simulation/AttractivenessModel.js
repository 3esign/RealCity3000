export class AttractivenessModel {
  constructor() {}

  updateAttractiveness(grid, params) {
    const height = grid.length;
    const width = grid[0].length;

    // 1. Gather special cells
    const industries = [];
    const commercialCenters = [];
    const greenSpaces = [];
    const roadCells = [];

    let commercialSumX = 0;
    let commercialSumY = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[y][x];
        if (cell.type === 'INDUSTRIAL') {
          industries.push({ x, y });
        } else if (cell.type === 'COMMERCIAL') {
          commercialCenters.push({ x, y });
          commercialSumX += x;
          commercialSumY += y;
        } else if (cell.type === 'GREEN_SPACE' || cell.type === 'FOREST') {
          greenSpaces.push({ x, y });
        } else if (cell.type === 'ROAD') {
          roadCells.push({ x, y });
        }
      }
    }

    // Determine city center coordinates
    let centerX = Math.floor(width / 2);
    let centerY = Math.floor(height / 2);
    if (commercialCenters.length > 0) {
      centerX = Math.floor(commercialSumX / commercialCenters.length);
      centerY = Math.floor(commercialSumY / commercialCenters.length);
    }

    // 2. Update each cell attractiveness fields
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[y][x];

        // Skip water and roads for standard value modeling
        if (cell.type === 'WATER') {
          cell.landValue = 0.0;
          cell.pollution = 0.0;
          cell.accessibility = 0.0;
          continue;
        }

        // Accessibility (distance to roads)
        let minRoadDist = 999;
        // Limit search to a local radius for high speed
        const roadSearchRadius = 8;
        for (let ry = Math.max(0, y - roadSearchRadius); ry < Math.min(height, y + roadSearchRadius + 1); ry++) {
          for (let rx = Math.max(0, x - roadSearchRadius); rx < Math.min(width, x + roadSearchRadius + 1); rx++) {
            if (grid[ry][rx].type === 'ROAD') {
              const d = Math.sqrt((x - rx)**2 + (y - ry)**2);
              if (d < minRoadDist) minRoadDist = d;
            }
          }
        }
        cell.accessibility = minRoadDist === 999 ? 0.0 : Math.max(0, 1.0 - (minRoadDist / 10.0));

        // Pollution (Industrial inverse-square falloff with temporal momentum and green dissipation)
        let localPollution = 0.0;
        industries.forEach(ind => {
          const d = Math.sqrt((x - ind.x)**2 + (y - ind.y)**2);
          if (d < 1.0) {
            localPollution += 0.8;
          } else if (d < 15.0) {
            localPollution += 0.8 / (d * d);
          }
        });
        
        // Calculate green access first to use in dissipation
        let greenAccess = 0.0;
        let minGreenDist = 999;
        const greenSearchRadius = 12;
        for (let gy = Math.max(0, y - greenSearchRadius); gy < Math.min(height, y + greenSearchRadius + 1); gy++) {
          for (let gx = Math.max(0, x - greenSearchRadius); gx < Math.min(width, x + greenSearchRadius + 1); gx++) {
            if (grid[gy][gx].type === 'GREEN_SPACE' || grid[gy][gx].type === 'FOREST') {
              const d = Math.sqrt((x - gx)**2 + (y - gy)**2);
              if (d < minGreenDist) minGreenDist = d;
            }
          }
        }
        cell.greenAccess = minGreenDist === 999 ? 0.0 : Math.max(0, 1.0 - (minGreenDist / 12.0));

        const prevPollution = cell.pollution || 0.0;
        const blendedPollution = prevPollution * 0.4 + localPollution * 0.6;
        cell.pollution = Math.max(0.0, Math.min(1.0, blendedPollution * 0.95 - (cell.greenAccess * 0.1) - 0.01));


        // Alonso's Bid-Rent Theory (decay from nearest commercial center)
        let minComDist = 999;
        for (let i = 0; i < commercialCenters.length; i++) {
          const com = commercialCenters[i];
          const d = Math.sqrt((x - com.x)**2 + (y - com.y)**2);
          if (d < minComDist) minComDist = d;
        }
        const centerDist = minComDist === 999 ? Math.sqrt((x - centerX)**2 + (y - centerY)**2) : minComDist;
        const rentDecay = Math.exp(-0.015 * centerDist); // gentler decay constant

        // Land Value calculation formula
        // V = V_base * Access^0.6 * Green^0.3 * (1 - Pollution^0.4)
        const baseValue = 20.0;
        const accessMultiplier = 0.2 + (cell.accessibility * 0.8);
        const greenMultiplier = 0.8 + (cell.greenAccess * 0.5);
        const pollutionPenalty = 1.0 - (cell.pollution * 0.6);
        
        // Tax rate penalty
        const taxPenalty = 1.0 - (params.taxRate / 100.0);

        let value = baseValue * accessMultiplier * greenMultiplier * pollutionPenalty * rentDecay * taxPenalty;
        cell.landValue = Math.min(Math.max(value, 2.0), 100.0);
      }
    }
  }
}
export default AttractivenessModel;

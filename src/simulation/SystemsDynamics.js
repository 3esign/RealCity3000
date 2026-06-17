import store from '../state/store.js';

export class SystemsDynamics {
  constructor() {}

  stepDynamics(grid, params) {
    let totalR = 0;
    let totalC = 0;
    let totalI = 0;
    let totalForest = 0;
    let totalWater = 0;
    let totalRoad = 0;
    let totalVacant = 0;
    let totalGreen = 0;
    let totalBrownfield = 0;
    let totalAgri = 0;
    let totalInst = 0;

    let totalPopulation = 0;
    let totalPollution = 0.0;
    let totalLandValue = 0.0;
    let totalAccessibility = 0.0;
    let cellCount = 0;

    const height = grid.length;
    const width = grid[0].length;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[y][x];
        cellCount++;

        totalPollution += cell.pollution;
        totalLandValue += cell.landValue;
        totalAccessibility += cell.accessibility;

        switch (cell.type) {
          case 'RESIDENTIAL_LOW':
          case 'RESIDENTIAL_HIGH':
            totalR++;
            totalPopulation += cell.population;
            break;
          case 'COMMERCIAL':
            totalC++;
            break;
          case 'INDUSTRIAL':
            totalI++;
            break;
          case 'FOREST':
            totalForest++;
            break;
          case 'WATER':
            totalWater++;
            break;
          case 'ROAD':
            totalRoad++;
            break;
          case 'GREEN_SPACE':
            totalGreen++;
            break;
          case 'BROWNFIELD':
            totalBrownfield++;
            break;
          case 'AGRICULTURAL':
            totalAgri++;
            break;
          case 'INSTITUTIONAL':
            totalInst++;
            break;
          default:
            totalVacant++;
            break;
        }
      }
    }

    // Macro calculations
    const averagePollution = totalPollution / cellCount;
    const averageLandValue = totalLandValue / cellCount;
    const averageAccessibility = totalAccessibility / cellCount;
    const urbanDensityPct = ((cellCount - totalVacant - totalForest - totalWater) / cellCount) * 100.0;

    // RCI demand updates
    const currentRCI = { ...store.getState().metrics.rciDemand };
    
    // Housing vs Jobs comparison
    const jobCapacity = (totalC * 5) + (totalI * 8) + (totalInst * 4);
    const housingGap = jobCapacity - totalPopulation;
    
    // Residential demand: grows if jobs outnumber housing capacity, decreases with taxes
    let rDelta = (housingGap * 0.015) - (params.taxRate - 15) * 0.4 + params.populationGrowth * 1.2 + params.economicGrowth * 0.6;
    
    // Commercial demand: grows with population size and economic growth parameters
    let cDelta = (totalPopulation * 0.015 - totalC) * 0.3 + params.economicGrowth * 1.2;
    
    // Industrial demand: grows with raw economic demand, penalized by environmental regulations
    let iDelta = (totalC * 0.6 - totalI) * 0.3 - (params.environmentalReg - 30) * 0.4 + params.economicGrowth * 0.8;

    // Smart Control: Cyclical economic waves (sine/cosine waves over time to keep city dynamic)
    const cycleTime = store.getState().simulationYear;
    const cycleR = Math.sin(cycleTime * 0.15) * 6.0;
    const cycleC = Math.sin(cycleTime * 0.10) * 5.0;
    const cycleI = Math.cos(cycleTime * 0.08) * 5.0;
    
    rDelta += cycleR;
    cDelta += cycleC;
    iDelta += cycleI;

    // Smart Control: Congestion and capacity pressure (reduces demand as city fills)
    const congestionPenalty = (urbanDensityPct / 100.0) * 6.0;
    rDelta -= congestionPenalty;
    cDelta -= congestionPenalty;
    iDelta -= congestionPenalty;

    // Smart Control: Tax penalties when above 20%
    if (params.taxRate > 20) {
      const taxPenalty = (params.taxRate - 20) * 1.5;
      rDelta -= taxPenalty;
      cDelta -= taxPenalty;
      iDelta -= taxPenalty;
    }

    // Smart Control: Environmental regulation penalties when above 40%
    if (params.environmentalReg > 40) {
      const regPenalty = (params.environmentalReg - 40) * 0.8;
      iDelta -= regPenalty * 2.0; // hurts heavy industry the most
      cDelta -= regPenalty * 0.5;
    }

    currentRCI.r = Math.min(Math.max(currentRCI.r + rDelta, 0), 100);
    currentRCI.c = Math.min(Math.max(currentRCI.c + cDelta, 0), 100);
    currentRCI.i = Math.min(Math.max(currentRCI.i + iDelta, 0), 100);

    return {
      population: totalPopulation,
      urbanDensityPct: parseFloat(urbanDensityPct.toFixed(1)),
      averageLandValue: parseFloat(averageLandValue.toFixed(2)),
      pollutionIndex: parseFloat(averagePollution.toFixed(3)),
      rciDemand: {
        r: Math.round(currentRCI.r),
        c: Math.round(currentRCI.c),
        i: Math.round(currentRCI.i)
      },
      counts: {
        r: totalR,
        c: totalC,
        i: totalI,
        vacant: totalVacant,
        forest: totalForest,
        water: totalWater,
        road: totalRoad,
        green: totalGreen,
        brownfield: totalBrownfield,
        agricultural: totalAgri,
        institutional: totalInst
      }
    };
  }
}
export default SystemsDynamics;

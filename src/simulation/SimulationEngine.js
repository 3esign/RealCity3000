import store from '../state/store.js';
import { eventBus } from '../utils/eventBus.js';
import AttractivenessModel from './AttractivenessModel.js';
import CellularAutomata from './CellularAutomata.js';
import DevelopmentAgents from './DevelopmentAgents.js';
import SystemsDynamics from './SystemsDynamics.js';

export class SimulationEngine {
  constructor() {
    this.attractivenessModel = new AttractivenessModel();
    this.cellularAutomata = new CellularAutomata();
    this.developmentAgents = new DevelopmentAgents();
    this.systemsDynamics = new SystemsDynamics();
  }

  // Runs a single step of the simulation (1 year)
  runStep() {
    const state = store.getState();
    if (!state.grid) return;

    // Create deep copy of grid to avoid direct mutation side effects
    const gridCopy = state.grid.map(row => row.map(cell => ({ ...cell })));
    const params = { ...state.params };
    const rciDemand = { ...state.metrics.rciDemand };
    const preset = state.currentPreset;

    // 1. Apply Radical Scenario Modifiers first
    this.applyRadicalScenarioRules(gridCopy, preset, state.simulationYear, params);

    // 2. Compute Attractiveness Fields (Accessibility, Land Value, Pollution)
    this.attractivenessModel.updateAttractiveness(gridCopy, params);

    // 3. Deploy Developer Agents (ABM decisions based on utility scores)
    this.developmentAgents.runAgents(gridCopy, params, rciDemand);

    // 4. Run Cellular Automata Rules (SLEUTH growth rule sweeps)
    this.cellularAutomata.runCA(gridCopy, params, rciDemand);

    // 5. Evaluate Macro Systems Dynamics (Stock-flow aggregates & demand adjustments)
    const dynamicsResult = this.systemsDynamics.stepDynamics(gridCopy, params);

    // 6. Update central store state
    const nextYear = state.simulationYear + 1;
    const nextHistory = [...state.metricsHistory, {
      year: nextYear,
      population: dynamicsResult.population,
      urbanDensityPct: dynamicsResult.urbanDensityPct,
      averageLandValue: dynamicsResult.averageLandValue,
      pollutionIndex: dynamicsResult.pollutionIndex
    }];

    store.updateState({
      grid: gridCopy,
      simulationYear: nextYear,
      metrics: {
        population: dynamicsResult.population,
        urbanDensityPct: dynamicsResult.urbanDensityPct,
        averageLandValue: dynamicsResult.averageLandValue,
        pollutionIndex: dynamicsResult.pollutionIndex,
        rciDemand: dynamicsResult.rciDemand
      },
      metricsHistory: nextHistory
    });

    eventBus.emit('sim-step-completed', {
      year: nextYear,
      metrics: store.getState().metrics
    });
  }

  applyRadicalScenarioRules(grid, preset, year, params) {
    const height = grid.length;
    const width = grid[0].length;

    // Scenario 1: Climate Deluge / Rising Water
    if (preset === 'deluge') {
      // Water level rises by 1 row at bottom every 15 turns
      const floodRow = height - 1 - Math.floor(year / 15);
      if (floodRow >= 0) {
        for (let x = 0; x < width; x++) {
          grid[floodRow][x].type = 'WATER';
          grid[floodRow][x].originalType = 'WATER';
          grid[floodRow][x].population = 0;
          grid[floodRow][x].density = 0;
        }
      }
    }

    // Scenario 2: Solarpunk Reclamation
    if (preset === 'solarpunk') {
      // Developed cells decay if local pollution is high
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const cell = grid[y][x];
          if (cell.type.startsWith('RESIDENTIAL') || cell.type === 'COMMERCIAL' || cell.type === 'INDUSTRIAL') {
            if (cell.pollution > 0.4 || cell.roadAccess < 0.2) {
              if (Math.random() < 0.15) {
                cell.type = 'GREEN_SPACE';
                cell.population = 0;
                cell.density = 0;
              }
            }
          }
        }
      }
    }

    // Scenario 3: Cyberpunk Mega-Grid
    if (preset === 'cyberpunk') {
      // Decay forest cells into vacant, increase industrial pollution footprint
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const cell = grid[y][x];
          if (cell.type === 'FOREST' || cell.type === 'GREEN_SPACE') {
            if (Math.random() < 0.1) {
              cell.type = 'VACANT';
            }
          }
          if (cell.type === 'INDUSTRIAL') {
            cell.pollution = Math.min(cell.pollution + 0.1, 1.0);
          }
        }
      }
    }

    // Scenario 4: Subterranean Arcology Silos
    if (preset === 'arcology') {
      // 95% of grid is excluded. Only allow growth in designated coordinates.
      // We flag cells outside specific zones as strictly unbuildable (revert them if CA urbanized them)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const cell = grid[y][x];
          // Designated Arcology Centers (placed in a sparse grid)
          const isArcologyNode = (x % 12 === 6) && (y % 12 === 6);
          if (!isArcologyNode && cell.type !== 'ROAD' && cell.type !== 'WATER') {
            // Revert all developments to natural vacant/forest state
            if (cell.type.startsWith('RESIDENTIAL') || cell.type === 'COMMERCIAL' || cell.type === 'INDUSTRIAL') {
              cell.type = cell.originalType === 'ROAD' || cell.originalType === 'WATER' ? 'VACANT' : cell.originalType;
              cell.population = 0;
              cell.density = 0;
            }
          } else if (isArcologyNode) {
            // Arcology nodes get extremely high density scaling
            if (cell.type.startsWith('RESIDENTIAL')) {
              cell.type = 'RESIDENTIAL_HIGH';
              cell.density = params.densityCap;
              cell.population = params.densityCap * 25; // Massive concentration
            }
          }
        }
      }
    }

    // Scenario 5: Space Dome Colony
    if (preset === 'domeworld') {
      // Closed dome restriction. Growth outside radius is excluded.
      const centerX = Math.floor(width / 2);
      const centerY = Math.floor(height / 2);
      const domeRadius = Math.min(width, height) * 0.45;
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const cell = grid[y][x];
          const dist = Math.sqrt((x - centerX)**2 + (y - centerY)**2);
          if (dist > domeRadius && cell.type !== 'WATER') {
            // Exclude everything, revert to lifeless VACANT (simulates vacuum outside dome)
            if (cell.type !== 'VACANT') {
              cell.type = 'VACANT';
              cell.population = 0;
              cell.density = 0;
            }
          }
        }
      }
    }
  }
}
export default SimulationEngine;

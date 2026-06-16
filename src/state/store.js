// Central Application Store for RealCity3000

class Store {
  constructor() {
    this.state = {
      view: 'map', // 'map' or 'sandbox'
      gridWidth: 50,
      gridHeight: 50,
      bbox: null, // { south, west, north, east }
      aspectRatio: 1.0,
      
      // Data Extracted
      osmRawData: null,
      buildings: [], // Parsed building outline polygons
      roads: [],     // Parsed road polyline links
      water: [],     // Parsed water polygons/lines
      
      // Grid Matrices
      grid: null, // 2D array of Cell Objects
      originalGrid: null, // Initial grid seed snapshot
      
      // Simulation variables
      simulationYear: 2017,
      isPlaying: false,
      speed: 3, // 1 to 10 scale
      currentPreset: 'natural',
      
      // Core Parameters
      params: {
        diffusion: 25,
        breed: 15,
        spread: 30,
        roadGravity: 50,
        greenProtection: 40,
        taxRate: 15, // percent
        environmentalReg: 30,
        densityCap: 10,
        economicGrowth: 3.0,
        populationGrowth: 2.0,
        infrastructureBudget: 50,
        transitInvestment: 20
      },
      
      // AI Mayor Configuration
      aiMayorEnabled: false,
      aiKeys: {
        universal: '',
        vision: '',
        mayor: '',
        history: ''
      },
      aiUseUniversal: true,
      aiProvider: 'openai',
      aiMayorThoughts: 'Waiting to begin governance.',
      
      // Interactive layers
      renderingMode: '2d', // '2d', '3d', 'fps'
      forceFieldLayer: 'none', // 'none', 'accessibility', 'value', 'pollution', 'pressure'
      
      // Metrics tracking
      metrics: {
        population: 0,
        urbanDensityPct: 0.0,
        averageLandValue: 0.0,
        pollutionIndex: 0.0,
        rciDemand: { r: 50, c: 50, i: 50 }
      },
      metricsHistory: [],
      
      // Navigation state
      fpsControlsActive: false
    };
    
    this.listeners = [];
  }

  getState() {
    return this.state;
  }

  updateState(updates) {
    this.state = { ...this.state, ...updates };
    this.listeners.forEach(fn => fn(this.state));
  }

  subscribe(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(f => f !== fn);
    };
  }
}

export const store = new Store();
export default store;

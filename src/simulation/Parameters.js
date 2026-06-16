// Preset Scenario Configs & Default Parameters for RealCity3000

export const DEFAULT_PARAMS = {
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
};

export const PRESET_SCENARIOS = {
  natural: {
    name: 'Natural Growth (Balanced)',
    params: { ...DEFAULT_PARAMS }
  },
  boom: {
    name: 'Economic Boom (Hyper-Growth)',
    params: {
      diffusion: 50,
      breed: 40,
      spread: 60,
      roadGravity: 70,
      greenProtection: 10,
      taxRate: 5,
      environmentalReg: 10,
      densityCap: 18,
      economicGrowth: 8.0,
      populationGrowth: 6.0,
      infrastructureBudget: 80,
      transitInvestment: 10
    }
  },
  eco: {
    name: 'Sustainable Eco-City',
    params: {
      diffusion: 10,
      breed: 5,
      spread: 20,
      roadGravity: 30,
      greenProtection: 90,
      taxRate: 20,
      environmentalReg: 85,
      densityCap: 8,
      economicGrowth: 2.0,
      populationGrowth: 1.5,
      infrastructureBudget: 60,
      transitInvestment: 85
    }
  },
  sprawl: {
    name: 'Leapfrog Sprawl',
    params: {
      diffusion: 75,
      breed: 20,
      spread: 15,
      roadGravity: 80,
      greenProtection: 15,
      taxRate: 8,
      environmentalReg: 20,
      densityCap: 4,
      economicGrowth: 4.0,
      populationGrowth: 3.5,
      infrastructureBudget: 30,
      transitInvestment: 5
    }
  },
  deluge: {
    name: 'Climate Deluge (Rising Water)',
    params: {
      diffusion: 15,
      breed: 10,
      spread: 35,
      roadGravity: 40,
      greenProtection: 60,
      taxRate: 25,
      environmentalReg: 70,
      densityCap: 12,
      economicGrowth: -1.0,
      populationGrowth: -0.5,
      infrastructureBudget: 90,
      transitInvestment: 50
    }
  },
  solarpunk: {
    name: 'Solarpunk Reclamation',
    params: {
      diffusion: 5,
      breed: 5,
      spread: 45,
      roadGravity: 20,
      greenProtection: 100,
      taxRate: 0,
      environmentalReg: 100,
      densityCap: 6,
      economicGrowth: 1.0,
      populationGrowth: 0.5,
      infrastructureBudget: 70,
      transitInvestment: 90
    }
  },
  cyberpunk: {
    name: 'Cyberpunk Mega-Grid',
    params: {
      diffusion: 90,
      breed: 80,
      spread: 75,
      roadGravity: 95,
      greenProtection: 0,
      taxRate: 45, // Heavy taxation to fund authoritarian policing
      environmentalReg: 0,
      densityCap: 20,
      economicGrowth: 10.0,
      populationGrowth: 8.0,
      infrastructureBudget: 20,
      transitInvestment: 5
    }
  },
  arcology: {
    name: 'Subterranean Arcologies',
    params: {
      diffusion: 2,
      breed: 1,
      spread: 5,
      roadGravity: 10,
      greenProtection: 95,
      taxRate: 35,
      environmentalReg: 90,
      densityCap: 20,
      economicGrowth: 1.5,
      populationGrowth: 1.0,
      infrastructureBudget: 95,
      transitInvestment: 80
    }
  },
  degrowth: {
    name: 'Managed De-Growth',
    params: {
      diffusion: 0,
      breed: 0,
      spread: 5,
      roadGravity: 10,
      greenProtection: 80,
      taxRate: 10,
      environmentalReg: 95,
      densityCap: 4,
      economicGrowth: -3.0,
      populationGrowth: -2.0,
      infrastructureBudget: 40,
      transitInvestment: 50
    }
  },
  domeworld: {
    name: 'Space Dome Colony',
    params: {
      diffusion: 10,
      breed: 30,
      spread: 50,
      roadGravity: 60,
      greenProtection: 80,
      taxRate: 25,
      environmentalReg: 90,
      densityCap: 15,
      economicGrowth: 4.0,
      populationGrowth: 3.0,
      infrastructureBudget: 100,
      transitInvestment: 70
    }
  }
};

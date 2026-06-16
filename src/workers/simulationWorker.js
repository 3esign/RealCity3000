// Simulation Web Worker for off-thread heavy CA/ABM calculations

self.onmessage = function(e) {
  const { type, data } = e.data;
  
  if (type === 'runStep') {
    const { grid, params, rciDemand, preset, year } = data;
    
    // We can execute raw steps in worker here if imported.
    // For Vite Vanilla, to keep setup frictionless and bulletproof, 
    // we let the main thread run the lightweight steps by default, 
    // but expose this worker for long-running batch iterations.
    
    const result = {
      grid: grid,
      year: year + 1,
      metrics: {}
    };

    self.postMessage({ type: 'stepCompleted', data: result });
  }
};

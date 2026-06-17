import store from '../state/store.js';
import AIProviderAdapter from './AIProviderAdapter.js';
import { eventBus } from '../utils/eventBus.js';

export class AIMayorService {
  constructor() {
    this.adapter = new AIProviderAdapter();
    this.isRequestPending = false;
    this.userInstructions = [];
  }

  addUserInstruction(text) {
    this.userInstructions.push(text);
  }

  async runMayorTurn() {
    if (this.isRequestPending) return;

    const state = store.getState();
    const metrics = state.metrics;
    
    let instructionsContext = "";
    if (this.userInstructions.length > 0) {
      instructionsContext = `\n\nTHE HUMAN MAYOR HAS GIVEN YOU THE FOLLOWING INSTRUCTIONS TO PRIORITIZE:\n- ${this.userInstructions.join('\n- ')}\n\nAcknowledge these instructions and base your parameter adjustments on them.`;
    }

    const systemPrompt = `You are the AI Mayor of RealCity3000, a scientific urban simulation.
You can adjust parameters relative to their current values to guide city development.
Current parameters are:
${JSON.stringify(state.params, null, 2)}${instructionsContext}

Respond with a JSON object containing reasoning and actions (max 3 actions).
Actions can adjust: "diffusion", "breed", "spread", "roadGravity", "greenProtection", "taxRate", "environmentalReg", "densityCap".
Format:
{
  "reasoning": "Reason here...",
  "actions": [
    { "type": "adjust_parameter", "params": { "name": "taxRate", "delta": -3 } }
  ]
}`;

    const userPrompt = `Current simulation status:
- Year: ${state.simulationYear}
- Population: ${metrics.population}
- Density: ${metrics.urbanDensityPct}%
- Avg Land Value: $${metrics.averageLandValue}
- Pollution Index: ${metrics.pollutionIndex}
- Demand (R,C,I): Res ${metrics.rciDemand.r}, Com ${metrics.rciDemand.c}, Ind ${metrics.rciDemand.i}`;

    // Clear instructions after sending
    this.userInstructions = [];

    this.isRequestPending = true;
    this.pulseCount = (this.pulseCount || 0) + 1;
    eventBus.emit('ai-thinking-started');

    const startTime = performance.now();
    try {
      const responseText = await this.adapter.sendRequest(systemPrompt, userPrompt, { feature: 'mayor' });
      const latency = Math.round(performance.now() - startTime);
      const decision = JSON.parse(responseText);
      
      eventBus.emit('ai-thinking-completed', { latency, pulse: this.pulseCount });
      
      if (decision && decision.actions) {
        this.applyDecisions(decision);
      }
      
      if (decision && decision.reasoning) {
        window.dispatchEvent(new CustomEvent('ai-mayor-response', { detail: { message: decision.reasoning } }));
      }
    } catch (err) {
      console.error('AI Mayor processing failed', err);
      eventBus.emit('ai-thinking-failed', { error: err.message });
      store.updateState({
        aiMayorThoughts: `Error processing AI Mayor decision: ${err.message}`
      });
    } finally {
      this.isRequestPending = false;
    }
  }

  applyDecisions(decision) {
    const state = store.getState();
    const currentParams = { ...state.params };
    let thoughts = decision.reasoning || "Parameters adjusted.";

    // Apply and clamp actions (anti-hacking constraints)
    const maxBudget = 5;
    let appliedCount = 0;

    decision.actions.forEach(action => {
      if (appliedCount >= maxBudget) return;

      if (action.type === 'adjust_parameter') {
        const name = action.params.name;
        let delta = parseInt(action.params.delta) || 0;
        
        if (currentParams[name] !== undefined) {
          // Clamp delta to max ±10 per turn
          delta = Math.min(Math.max(delta, -10), 10);
          
          // Apply change
          let newVal = currentParams[name] + delta;

          // Clamp parameter to its allowed bounds
          if (name === 'taxRate') newVal = Math.min(Math.max(newVal, 0), 50);
          else if (name === 'densityCap') newVal = Math.min(Math.max(newVal, 1), 20);
          else newVal = Math.min(Math.max(newVal, 0), 100);

          currentParams[name] = newVal;
          appliedCount++;
        }
      }
    });

    // Update store
    store.updateState({
      params: currentParams,
      aiMayorThoughts: thoughts
    });

    eventBus.emit('ai-parameters-updated', {
      thoughts: thoughts,
      params: currentParams
    });
  }
}
export default AIMayorService;

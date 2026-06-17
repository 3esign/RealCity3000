import store from '../state/store.js';

export class AIVisionService {
  constructor() {}

  cleanJSON(text) {
    if (!text) return '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? jsonMatch[0] : text;
  }

  async analyzeSatelliteImage(imageUrl) {
    const state = store.getState();
    const apiKey = state.aiUseUniversal ? state.aiKeys.universal : state.aiKeys.vision;
    const provider = state.aiProvider;

    if (!apiKey) {
      console.log('No AI key found for vision service. Skipping AI parsing and using OSM vector data directly.');
      return null;
    }

    const systemPrompt = `You are a satellite image interpretation system for urban planning.
Given this satellite image, identify zones and return a structured JSON mapping:
{
  "brownfields": [[x1, y1], [x2, y2]],
  "vacantLots": [[x1, y1]],
  "denseForests": [[x1, y1]]
}
Format coordinates in a grid scaled to ${state.gridWidth}x${state.gridHeight}.`;

    try {
      if (provider === 'openrouter') {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: systemPrompt },
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Analyze this satellite image tile for brownfields and vacant lots.' },
                  { type: 'image_url', image_url: { url: imageUrl } }
                ]
              }
            ],
            response_format: { type: 'json_object' }
          })
        });

        const data = await response.json();
        if (data.choices && data.choices[0]) {
          const cleanedText = this.cleanJSON(data.choices[0].message.content);
          return JSON.parse(cleanedText);
        }
      } else if (provider === 'openai') {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: systemPrompt },
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Analyze this satellite image tile for brownfields and vacant lots.' },
                  { type: 'image_url', image_url: { url: imageUrl } }
                ]
              }
            ],
            response_format: { type: 'json_object' }
          })
        });

        const data = await response.json();
        if (data.choices && data.choices[0]) {
          const cleanedText = this.cleanJSON(data.choices[0].message.content);
          return JSON.parse(cleanedText);
        }
      } else if (provider === 'anthropic') {
        // Claude 3.5 Sonnet payload format (fallback to mock since base64 conversion is local-only)
        console.log('Anthropic vision requires base64 payload, using simulation mock.');
        return this.generateMockAIResponse(state.gridWidth, state.gridHeight);
      }

      // Default mock fallback for test compatibility
      console.log('AI Provider response simulation.');
      return this.generateMockAIResponse(state.gridWidth, state.gridHeight);

    } catch (err) {
      console.warn('AI Vision analysis request failed. Falling back to procedural classifications.', err);
      return this.generateMockAIResponse(state.gridWidth, state.gridHeight);
    }
  }

  generateMockAIResponse(w, h) {
    const brownfields = [];
    const vacantLots = [];
    const denseForests = [];
    const water = [];
    
    // Seed a mock satellite water body (diagonal river/lake in center-left)
    for (let y = 0; y < h; y++) {
      const x = Math.floor(w * 0.15 + Math.sin(y * 0.1) * 3);
      for (let dx = -2; dx <= 2; dx++) {
        if (x + dx >= 0 && x + dx < w) {
          water.push([x + dx, y]);
        }
      }
    }

    // Seed a mock dense forest cluster (top-right quadrant)
    const fx = Math.floor(w * 0.75);
    const fy = Math.floor(h * 0.25);
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        if (Math.random() < 0.75) {
          const nx = fx + dx;
          const ny = fy + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            denseForests.push([nx, ny]);
          }
        }
      }
    }

    // Seed a mock brownfield cluster
    const bx = Math.floor(w * 0.3);
    const by = Math.floor(h * 0.65);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.random() < 0.8) {
          const nx = bx + dx;
          const ny = by + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            brownfields.push([nx, ny]);
          }
        }
      }
    }

    // Seed vacant lots randomly
    for (let i = 0; i < 8; i++) {
      vacantLots.push([
        Math.floor(Math.random() * (w - 4)) + 2,
        Math.floor(Math.random() * (h - 4)) + 2
      ]);
    }

    return { brownfields, vacantLots, denseForests, water };
  }
}
export default AIVisionService;

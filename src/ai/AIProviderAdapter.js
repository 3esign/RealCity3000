import store from '../state/store.js';

export class AIProviderAdapter {
  constructor() {}

  cleanJSON(text) {
    if (!text) return '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? jsonMatch[0] : text;
  }

  async sendRequest(systemPrompt, userPrompt) {
    const state = store.getState();
    const apiKey = state.aiUseUniversal ? state.aiKeys.universal : state.aiKeys.mayor;
    const provider = state.aiProvider;

    if (provider === 'local' || !apiKey) {
      // Local mathematical engine fallback (mock policy payload)
      return this.generateMockMayorPayload();
    }

    try {
      if (provider === 'openrouter') {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'deepseek/deepseek-chat',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ]
          })
        });
        const data = await response.json();
        if (data.choices && data.choices[0]) {
          return this.cleanJSON(data.choices[0].message.content);
        }
      } else if (provider === 'openai') {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            response_format: { type: 'json_object' }
          })
        });
        const data = await response.json();
        if (data.choices && data.choices[0]) {
          return this.cleanJSON(data.choices[0].message.content);
        }
      } else if (provider === 'anthropic') {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 1024,
            messages: [
              {
                role: 'user',
                content: systemPrompt + '\n\n' + userPrompt
              }
            ]
          })
        });
        const data = await response.json();
        if (data.content && data.content[0]) {
          return this.cleanJSON(data.content[0].text);
        }
      } else if (provider === 'gemini') {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }]
          })
        });
        const data = await response.json();
        if (data.candidates && data.candidates[0].content.parts[0]) {
          return this.cleanJSON(data.candidates[0].content.parts[0].text);
        }
      } else if (provider === 'groq') {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'llama3-8b-8192',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ]
          })
        });
        const data = await response.json();
        if (data.choices && data.choices[0]) {
          return this.cleanJSON(data.choices[0].message.content);
        }
      } else if (provider === 'deepseek') {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ]
          })
        });
        const data = await response.json();
        if (data.choices && data.choices[0]) {
          return this.cleanJSON(data.choices[0].message.content);
        }
      }

      return this.generateMockMayorPayload();
    } catch (err) {
      console.error('AI Request failed', err);
      return this.generateMockMayorPayload();
    }
  }

  generateMockMayorPayload() {
    const decisions = [
      {
        reasoning: "Zoning residential density increases to accommodate worker shortages.",
        actions: [
          { type: "adjust_parameter", params: { name: "diffusion", delta: 5 } },
          { type: "adjust_parameter", params: { name: "densityCap", delta: 2 } }
        ]
      },
      {
        reasoning: "Increasing environmental regulations to combat growing industrial pollution indexes.",
        actions: [
          { type: "adjust_parameter", params: { name: "environmentalReg", delta: 10 } },
          { type: "adjust_parameter", params: { name: "greenProtection", delta: 5 } }
        ]
      },
      {
        reasoning: "Lowering tax rates to stimulate commercial and industrial development demand.",
        actions: [
          { type: "adjust_parameter", params: { name: "taxRate", delta: -3 } }
        ]
      }
    ];

    return JSON.stringify(decisions[Math.floor(Math.random() * decisions.length)]);
  }
}
export default AIProviderAdapter;

import store from '../state/store.js';

export class AIVisionService {
  constructor() {}

  cleanJSON(text) {
    if (!text) return '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? jsonMatch[0] : text;
  }

  async imageToBase64(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error fetching image from ESRI: ${res.status}`);
      const blob = await res.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result.split(',')[1];
          resolve({
            mimeType: blob.type || 'image/png',
            data: base64data
          });
        };
        reader.onerror = () => reject(new Error('FileReader failed to read image blob'));
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      throw new Error(`Failed to convert satellite image to Base64 for local Vision API: ${err.message}`);
    }
  }

  async analyzeSatelliteImage(imageUrl, logToLoader = null) {
    const state = store.getState();
    const apiKey = state.aiUseUniversal ? state.aiKeys.universal : state.aiKeys.vision;
    const provider = state.aiProvider;

    const log = (msg, type = 'info') => {
      console.log(msg);
      if (logToLoader) logToLoader(msg, type);
    };

    if (provider === 'local') {
      log('Local Mathematical Engine selected. Generating simulation mock for satellite vision...', 'info');
      return this.generateMockAIResponse(state.gridWidth, state.gridHeight);
    }

    if (!apiKey) {
      log(`No API key provided for the selected AI provider "${provider}". Skipping API inference.`, 'error');
      throw new Error(`API key is missing for provider "${provider}"`);
    }

    const systemPrompt = `You are a satellite image interpretation system for urban planning.
Given this satellite image, identify zones and return a structured JSON mapping.
For coordinates, you can use EITHER coordinate pairs [x, y] OR bounding boxes [minX, minY, maxX, maxY].
For example, "water": [[5, 5], [10, 10, 15, 15]] means cell (5,5) and a rectangle from (10,10) to (15,15).
Map features to this JSON format:
{
  "water": [],
  "roads": [],
  "residential": [],
  "commercial": [],
  "industrial": [],
  "denseForests": [],
  "brownfields": [],
  "vacantLots": []
}
Format coordinates in a grid scaled to ${state.gridWidth}x${state.gridHeight}. Keep classifications logical and realistic based on the visual features.`;

    try {
      if (provider === 'openrouter') {
        log('Sending request to OpenRouter API (model: google/gemini-2.5-flash)...', 'info');
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

        if (!response.ok) {
          const errText = await response.text();
          log(`OpenRouter API responded with HTTP error ${response.status}: ${errText.substring(0, 200)}`, 'error');
          throw new Error(`OpenRouter HTTP ${response.status}: ${errText.substring(0, 100)}`);
        }

        const data = await response.json();
        if (data.error) {
          log(`OpenRouter API returned error: ${data.error.message}`, 'error');
          throw new Error(`OpenRouter API error: ${data.error.message}`);
        }

        if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
          const cleanedText = this.cleanJSON(data.choices[0].message.content);
          try {
            const parsed = JSON.parse(cleanedText);
            log('OpenRouter Satellite analysis response parsed successfully.', 'success');
            return parsed;
          } catch (jsonErr) {
            log(`Failed to parse JSON response from OpenRouter: ${jsonErr.message}. Raw output: ${cleanedText.substring(0, 200)}`, 'error');
            throw new Error(`JSON parsing error: ${jsonErr.message}`);
          }
        } else {
          log('OpenRouter response did not contain expected choices structure.', 'error');
          throw new Error('Empty or invalid choices array in OpenRouter response');
        }
      } else if (provider === 'openai') {
        log('Sending request to OpenAI API (model: gpt-4o-mini)...', 'info');
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

        if (!response.ok) {
          const errText = await response.text();
          log(`OpenAI API responded with HTTP error ${response.status}: ${errText.substring(0, 200)}`, 'error');
          throw new Error(`OpenAI HTTP ${response.status}: ${errText.substring(0, 100)}`);
        }

        const data = await response.json();
        if (data.error) {
          log(`OpenAI API returned error: ${data.error.message}`, 'error');
          throw new Error(`OpenAI API error: ${data.error.message}`);
        }

        if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
          const cleanedText = this.cleanJSON(data.choices[0].message.content);
          try {
            const parsed = JSON.parse(cleanedText);
            log('OpenAI Satellite analysis response parsed successfully.', 'success');
            return parsed;
          } catch (jsonErr) {
            log(`Failed to parse JSON response from OpenAI: ${jsonErr.message}. Raw output: ${cleanedText.substring(0, 200)}`, 'error');
            throw new Error(`JSON parsing error: ${jsonErr.message}`);
          }
        } else {
          log('OpenAI response did not contain expected choices structure.', 'error');
          throw new Error('Empty or invalid choices array in OpenAI response');
        }
      } else if (provider === 'gemini') {
        log('Direct Google Gemini API selected. Fetching image tile to convert to base64...', 'info');
        const base64Img = await this.imageToBase64(imageUrl);
        
        log('Sending request to Google Gemini API (model: gemini-2.5-flash)...', 'info');
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: systemPrompt + '\n\nAnalyze this satellite image tile for brownfields and vacant lots.' },
                  {
                    inlineData: {
                      mimeType: base64Img.mimeType,
                      data: base64Img.data
                    }
                  }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: 'application/json'
            }
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          log(`Gemini API responded with HTTP error ${response.status}: ${errText.substring(0, 200)}`, 'error');
          throw new Error(`Gemini HTTP ${response.status}: ${errText.substring(0, 100)}`);
        }

        const data = await response.json();
        if (data.error) {
          log(`Gemini API returned error: ${data.error.message}`, 'error');
          throw new Error(`Gemini API error: ${data.error.message}`);
        }

        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
          const cleanedText = this.cleanJSON(data.candidates[0].content.parts[0].text);
          try {
            const parsed = JSON.parse(cleanedText);
            log('Gemini Satellite analysis response parsed successfully.', 'success');
            return parsed;
          } catch (jsonErr) {
            log(`Failed to parse JSON response from Gemini: ${jsonErr.message}. Raw output: ${cleanedText.substring(0, 200)}`, 'error');
            throw new Error(`JSON parsing error: ${jsonErr.message}`);
          }
        } else {
          log('Gemini response did not contain expected content structure.', 'error');
          throw new Error('Empty or invalid candidates content in Gemini response');
        }
      } else if (provider === 'groq') {
        log('Sending request to Groq API (model: llama-3.2-11b-vision-preview)...', 'info');
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'llama-3.2-11b-vision-preview',
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

        if (!response.ok) {
          const errText = await response.text();
          log(`Groq API responded with HTTP error ${response.status}: ${errText.substring(0, 200)}`, 'error');
          throw new Error(`Groq HTTP ${response.status}: ${errText.substring(0, 100)}`);
        }

        const data = await response.json();
        if (data.error) {
          log(`Groq API returned error: ${data.error.message}`, 'error');
          throw new Error(`Groq API error: ${data.error.message}`);
        }

        if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
          const cleanedText = this.cleanJSON(data.choices[0].message.content);
          try {
            const parsed = JSON.parse(cleanedText);
            log('Groq Satellite analysis response parsed successfully.', 'success');
            return parsed;
          } catch (jsonErr) {
            log(`Failed to parse JSON response from Groq: ${jsonErr.message}. Raw output: ${cleanedText.substring(0, 200)}`, 'error');
            throw new Error(`JSON parsing error: ${jsonErr.message}`);
          }
        } else {
          log('Groq response did not contain expected choices structure.', 'error');
          throw new Error('Empty or invalid choices array in Groq response');
        }
      } else if (provider === 'anthropic') {
        log('Direct Anthropic API selected. Fetching image tile to convert to base64...', 'info');
        const base64Img = await this.imageToBase64(imageUrl);
        
        log('Sending request to Anthropic API (model: claude-3-5-sonnet-latest)...', 'info');
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'dangerouslyAllowBrowser': 'true'
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-latest',
            max_tokens: 2000,
            system: systemPrompt,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: base64Img.mimeType,
                      data: base64Img.data
                    }
                  },
                  {
                    type: 'text',
                    text: 'Analyze this satellite image tile for brownfields and vacant lots. Return JSON only.'
                  }
                ]
              }
            ]
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          log(`Anthropic API responded with HTTP error ${response.status}: ${errText.substring(0, 200)}`, 'error');
          throw new Error(`Anthropic HTTP ${response.status}: ${errText.substring(0, 100)}`);
        }

        const data = await response.json();
        if (data.error) {
          log(`Anthropic API returned error: ${data.error.message}`, 'error');
          throw new Error(`Anthropic API error: ${data.error.message}`);
        }

        if (data.content && data.content[0] && data.content[0].text) {
          const cleanedText = this.cleanJSON(data.content[0].text);
          try {
            const parsed = JSON.parse(cleanedText);
            log('Anthropic Satellite analysis response parsed successfully.', 'success');
            return parsed;
          } catch (jsonErr) {
            log(`Failed to parse JSON response from Anthropic: ${jsonErr.message}. Raw output: ${cleanedText.substring(0, 200)}`, 'error');
            throw new Error(`JSON parsing error: ${jsonErr.message}`);
          }
        } else {
          log('Anthropic response did not contain expected content text.', 'error');
          throw new Error('Empty or invalid content text in Anthropic response');
        }
      } else {
        log(`Provider "${provider}" does not support multimodal image analysis natively on client-side. Please use OpenRouter, OpenAI, Gemini, or Groq.`, 'error');
        throw new Error(`Provider "${provider}" is not supported for vision analysis.`);
      }
    } catch (err) {
      log(`AI Vision analysis failed: ${err.message}`, 'error');
      throw err;
    }
  }

  generateMockAIResponse(w, h) {
    const brownfields = [];
    const vacantLots = [];
    const denseForests = [];
    const water = [];
    const roads = [];
    const residential = [];
    const commercial = [];
    const industrial = [];
    
    // Seed water body (river in center-left)
    for (let y = 0; y < h; y++) {
      const x = Math.floor(w * 0.15 + Math.sin(y * 0.1) * 3);
      for (let dx = -2; dx <= 2; dx++) {
        if (x + dx >= 0 && x + dx < w) {
          water.push([x + dx, y]);
        }
      }
    }

    // Seed major roads (horizontal & vertical)
    const midY = Math.floor(h / 2);
    const midX = Math.floor(w / 2);
    for (let x = 0; x < w; x++) {
      roads.push([x, midY]);
    }
    for (let y = 0; y < h; y++) {
      roads.push([midX, y]);
    }

    // Seed residential blocks
    const rMinX = Math.floor(w * 0.55);
    const rMaxX = Math.floor(w * 0.9);
    const rMinY = Math.floor(h * 0.55);
    const rMaxY = Math.floor(h * 0.9);
    residential.push([rMinX, rMinY, rMaxX, rMaxY]);

    // Seed commercial around central crossroads
    commercial.push([midX - 3, midY - 3, midX + 3, midY + 3]);

    // Seed industrial near brownfield
    const iMinX = Math.floor(w * 0.35);
    const iMaxX = Math.floor(w * 0.48);
    const iMinY = Math.floor(h * 0.1);
    const iMaxY = Math.floor(h * 0.35);
    industrial.push([iMinX, iMinY, iMaxX, iMaxY]);

    // Seed dense forests
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

    // Seed brownfields
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

    // Seed vacant lots
    for (let i = 0; i < 8; i++) {
      vacantLots.push([
        Math.floor(Math.random() * (w - 4)) + 2,
        Math.floor(Math.random() * (h - 4)) + 2
      ]);
    }

    return { brownfields, vacantLots, denseForests, water, roads, residential, commercial, industrial };
  }
}
export default AIVisionService;

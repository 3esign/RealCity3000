import store from '../state/store.js';
import { resolveFeatureConfig } from '../ai/providerCapabilities.js';

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
    const config = resolveFeatureConfig(state, 'vision');
    const { apiKey, provider, supported } = config;

    const log = (msg, type = 'info') => {
      console.log(msg);
      if (logToLoader) logToLoader(msg, type);
    };

    if (provider === 'local') {
      log('Local Mathematical Engine selected. Generating simulation mock for satellite vision...', 'info');
      return this.generateMockAIResponse(state.gridWidth, state.gridHeight);
    }

    if (!supported) {
      log(`Provider "${provider}" does not support satellite vision. Falling back to local terrain heuristics.`, 'warn');
      return this.generateMockAIResponse(state.gridWidth, state.gridHeight);
    }

    if (!apiKey) {
      log(`No API key provided for the selected AI provider "${provider}". Falling back to local terrain heuristics.`, 'warn');
      return this.generateMockAIResponse(state.gridWidth, state.gridHeight);
    }

    const systemPrompt = `You are a satellite image interpretation system for urban planning.
Given this satellite image, identify major features, roads, and land-use zones and return a structured JSON mapping.

CRITICAL INSTRUCTIONS FOR COORDINATES:
1. All coordinates must be returned on a normalized 100x100 grid where:
   - [0, 0] is the TOP-LEFT corner of the image.
   - [100, 100] is the BOTTOM-RIGHT corner of the image.
2. ZONES (water, residential, commercial, industrial, denseForests, brownfields):
   - Use bounding boxes [minX, minY, maxX, maxY] to define entire contiguous regions (e.g. [10, 20, 45, 60] defines a rectangle).
   - Return multiple bounding boxes to cover all occurrences. For example, if there are three separate residential neighborhoods, return three separate [minX, minY, maxX, maxY] arrays in the "residential" list.
   - Do NOT use individual [x, y] points for large zones.
3. ROADS:
   - Define roads as straight-line segments [startX, startY, endX, endY].
   - For example, a road from the top-middle to the bottom-middle of the image would be [50, 0, 50, 100].
   - Trace all major streets, highways, and connections as line segments.
4. VACANT LOTS:
   - Use single coordinate pairs [x, y] to pinpoint individual vacant lots.

Map features to this JSON format:
{
  "reasoning": "A concise, step-by-step description of your visual interpretation process. Detail what features, colors, textures, and shapes you see in the satellite imagery (e.g. green vegetated sections, dark blue water bands, gray/orange tiled roofs of residential blocks, grid structures of streets) and how you map them logically to the grid coordinates.",
  "water": [], // List of bounding boxes [minX, minY, maxX, maxY] or points [x, y] representing lakes, rivers, pools
  "roads": [], // List of line segments [startX, startY, endX, endY] representing streets and highways
  "residential": [], // List of bounding boxes [minX, minY, maxX, maxY] representing housing blocks
  "commercial": [], // List of bounding boxes [minX, minY, maxX, maxY] representing retail/office blocks
  "industrial": [], // List of bounding boxes [minX, minY, maxX, maxY] representing factories/warehouses
  "denseForests": [], // List of bounding boxes [minX, minY, maxX, maxY] representing parks or thick woods
  "brownfields": [], // List of bounding boxes [minX, minY, maxX, maxY] representing abandoned industrial/empty dirt areas
  "vacantLots": [] // List of individual points [x, y] representing empty urban plots
}

Ensure you classify the entire visible area logically and realistically based on the visual layout of the image. Be generous with coverage—residential, commercial, industrial, forests, water, and roads should cover a substantial portion of the image.`;

    let elapsedTimer;
    try {
      log(`Converting satellite image to Base64...`, 'info');
      const imgRes = await fetch(imageUrl);
      const blob = await imgRes.blob();
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });

      let elapsed = 0;
      elapsedTimer = setInterval(() => {
        elapsed += 2;
        log(`Waiting for ${provider} AI Vision response... (${elapsed}s elapsed)`, 'info');
      }, 2000);

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
                  { type: 'image_url', image_url: { url: dataUrl } }
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
                  { type: 'image_url', image_url: { url: dataUrl } }
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
        log('Direct Google Gemini API selected. Using converted base64 data...', 'info');
        
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
                      mimeType: "image/jpeg",
                      data: dataUrl.split(',')[1]
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
                  { type: 'image_url', image_url: { url: dataUrl } }
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
                      media_type: 'image/jpeg',
                      data: dataUrl.split(',')[1]
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
        log(`Provider "${provider}" does not support multimodal image analysis natively on client-side. Falling back to local terrain heuristics.`, 'warn');
        return this.generateMockAIResponse(state.gridWidth, state.gridHeight);
      }
    } catch (err) {
      log(`AI Vision API request failed: ${err.message}. Please check your API key, network, or try another provider.`, 'error');
      log('Falling back to local procedural terrain heuristics.', 'warn');
      return this.generateMockAIResponse(state.gridWidth, state.gridHeight);
    } finally {
      if (elapsedTimer) clearInterval(elapsedTimer);
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
    
    // Seed water body (river in center-left) in 100x100 space
    for (let y = 0; y < 100; y++) {
      const x = Math.floor(15 + Math.sin(y * 0.1) * 3);
      for (let dx = -2; dx <= 2; dx++) {
        water.push([x + dx, y]);
      }
    }

    // Seed major roads (horizontal & vertical lines in 100x100 space)
    roads.push([0, 50, 100, 50]);
    roads.push([50, 0, 50, 100]);

    // Seed residential blocks (bounding boxes [minX, minY, maxX, maxY])
    residential.push([55, 55, 90, 90]);

    // Seed commercial around central crossroads
    commercial.push([47, 47, 53, 53]);

    // Seed industrial near brownfield
    industrial.push([35, 10, 48, 35]);

    // Seed dense forests
    denseForests.push([70, 20, 80, 30]);

    // Seed brownfields
    brownfields.push([28, 63, 32, 67]);

    // Seed vacant lots (points)
    vacantLots.push([45, 20]);
    vacantLots.push([20, 45]);
    vacantLots.push([80, 80]);
    vacantLots.push([15, 85]);

    return {
      reasoning: "Local mock generator: Seeded river running center-left, main crossroads extending from center [50, 50], residential cluster in bottom-right [55..90], industrial node top-left, and dense forest patch top-right.",
      brownfields,
      vacantLots,
      denseForests,
      water,
      roads,
      residential,
      commercial,
      industrial
    };
  }
}
export default AIVisionService;

import store from '../state/store.js';
import AIProviderAdapter from './AIProviderAdapter.js';

export class HistoricalResearchService {
  constructor() {
    this.adapter = new AIProviderAdapter();
  }

  async fetchHistoricalContext(bbox) {
    const centerLat = ((bbox.south + bbox.north) / 2).toFixed(4);
    const centerLng = ((bbox.west + bbox.east) / 2).toFixed(4);

    const systemPrompt = `You are a geographic historian. Research the area surrounding LAT: ${centerLat}, LNG: ${centerLng}.
Provide a brief timeline (3 key milestones) and a short summary of former land uses (industrial legacies, agricultural roots, or natural habitats). Keep it structured and concise.`;

    const userPrompt = `Research coordinates: LAT ${centerLat}, LNG ${centerLng}. Bounding box: South ${bbox.south.toFixed(4)}, West ${bbox.west.toFixed(4)}, North ${bbox.north.toFixed(4)}, East ${bbox.east.toFixed(4)}.`;

    try {
      const resultText = await this.adapter.sendRequest(systemPrompt, userPrompt);
      return resultText;
    } catch (err) {
      console.warn('Historical context fetch failed, using default timeline.', err);
      return this.generateFallbackHistory(centerLat, centerLng);
    }
  }

  generateFallbackHistory(lat, lng) {
    return `### Historical Timeline (LAT: ${lat}, LNG: ${lng})
* **1850s - Agricultural Settlement**: Primarily farmland and natural wooded buffers.
* **1910s - Industrial Revolution**: Expansion of railway connections and emergence of manufacturing clusters.
* **1970s - Post-Industrial Decline**: De-industrialization leading to the emergence of brownfield sites.
* **Present - Urban Renewal**: Adaptive reuse of vacant land and infrastructure expansion.`;
  }
}
export default HistoricalResearchService;

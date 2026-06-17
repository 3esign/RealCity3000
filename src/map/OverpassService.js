import store from '../state/store.js';

export class OverpassService {
  constructor() {
    this.endpoint = 'https://overpass-api.de/api/interpreter';
  }

  async fetchMapData(bbox, logFn = null) {
    const log = (msg, type = 'info') => {
      console.log(`[OverpassService] ${msg}`);
      if (logFn) logFn(msg, type);
    };

    const { south, west, north, east } = bbox;
    log(`BBox bounds: S:${south.toFixed(4)}, W:${west.toFixed(4)}, N:${north.toFixed(4)}, E:${east.toFixed(4)}`);
    
    // Construct Overpass QL query
    // [out:json] sets json output, out geom returns coordinate arrays in ways directly
    const query = `[out:json][timeout:30];
(
  way["building"](${south},${west},${north},${east});
  way["highway"](${south},${west},${north},${east});
  way["natural"="water"](${south},${west},${north},${east});
  way["waterway"](${south},${west},${north},${east});
  way["landuse"](${south},${west},${north},${east});
);
out geom;`;

    const body = `data=${encodeURIComponent(query)}`;
    
    const endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://lz4.overpass-api.de/api/interpreter',
      'https://z.overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.nchc.org.tw/api/interpreter'
    ];

    // Shuffle endpoint order so we don't always hammer the same first server
    const shuffled = [...endpoints].sort(() => Math.random() - 0.5);
    log(`Shuffled Overpass endpoints: ${shuffled.map(url => url.split('/')[2]).join(', ')}`);

    let lastError = null;
    for (let i = 0; i < shuffled.length; i++) {
      const url = shuffled[i];
      const host = url.split('/')[2];
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout per endpoint
      
      try {
        log(`Querying mirror ${i + 1}/${shuffled.length}: ${host} (8s timeout)...`);
        const response = await fetch(url, {
          method: 'POST',
          body: query,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.status === 429 || response.status === 504) {
          log(`Mirror ${host} returned status ${response.status} (Rate Limited/Timeout). Trying next mirror...`, 'warn');
          lastError = new Error(`Overpass API ${url} responded with HTTP ${response.status}`);
          // Small breathing gap before next endpoint
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        
        if (!response.ok) {
          log(`Mirror ${host} returned error code ${response.status}. Trying next mirror...`, 'warn');
          lastError = new Error(`Overpass API ${url} responded with HTTP ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        if (data && data.remark && data.remark.includes('runtime error')) {
          log(`Mirror ${host} succeeded but returned runtime error in remark: "${data.remark}". Trying next...`, 'warn');
          lastError = new Error(`Overpass API ${url} runtime error: ${data.remark}`);
          continue;
        }
        
        if (data && (data.elements || data.remark)) {
          log(`Success! Fetched ${data.elements?.length || 0} spatial features from ${host}`, 'success');
          return data;
        }
      } catch (err) {
        clearTimeout(timeoutId);
        const reason = err.name === 'AbortError' ? 'Timeout (30s exceeded)' : err.message;
        log(`Mirror ${host} failed: ${reason}`, 'error');
        lastError = err;
        // Breathing gap before next attempt
        if (i < shuffled.length - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }
    
    throw lastError || new Error('All Overpass API endpoints failed. Please try again in a moment.');
  }

  // Parses elements into clean geometries for RealCity3000
  parseGeometries(osmData) {
    const buildings = [];
    const roads = [];
    const water = [];
    
    if (!osmData || !osmData.elements) {
      return { buildings, roads, water };
    }

    osmData.elements.forEach(element => {
      const tags = element.tags || {};
      
      // We parse paths/geometries from 'geometry' array returned by 'out geom'
      if (!element.geometry || element.geometry.length === 0) return;
      
      const coords = element.geometry.map(pt => ({ lat: pt.lat, lng: pt.lon }));
      
      if (tags.building) {
        buildings.push({
          id: element.id,
          coords: coords,
          type: tags.building,
          levels: parseInt(tags['building:levels']) || 1,
          height: parseFloat(tags.height) || null,
          use: tags['building:use'] || 'residential'
        });
      } else if (tags.highway) {
        roads.push({
          id: element.id,
          coords: coords,
          type: tags.highway,
          lanes: parseInt(tags.lanes) || 1,
          name: tags.name || 'Unnamed Road'
        });
      } else if (tags.natural === 'water' || tags.waterway || tags.landuse === 'basin' || tags.landuse === 'reservoir') {
        water.push({
          id: element.id,
          coords: coords,
          type: tags.natural || tags.waterway || tags.landuse
        });
      }
    });

    return { buildings, roads, water };
  }

  generateProceduralElements(bbox) {
    const { south, west, north, east } = bbox;
    const buildings = [];
    const roads = [];
    const water = [];

    // Define coordinate bounds
    const latStep = (north - south) / 6;
    const lngStep = (east - west) / 6;

    // Generate procedural grid of streets and avenues
    for (let i = 1; i < 6; i++) {
      const rLat = south + i * latStep;
      roads.push({
        id: `procedural_road_h_${i}`,
        coords: [
          { lat: rLat, lng: west },
          { lat: rLat, lng: east }
        ],
        type: 'primary',
        lanes: 2,
        name: `Street ${i}`
      });

      const rLng = west + i * lngStep;
      roads.push({
        id: `procedural_road_v_${i}`,
        coords: [
          { lat: south, lng: rLng },
          { lat: north, lng: rLng }
        ],
        type: 'primary',
        lanes: 2,
        name: `Avenue ${i}`
      });
    }

    // Populate block geometries with mock buildings
    let bId = 0;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const bLat = south + r * latStep + latStep / 2;
        const bLng = west + c * lngStep + lngStep / 2;
        const offset = 0.0006;
        
        buildings.push({
          id: `procedural_b_${bId++}`,
          coords: [
            { lat: bLat - offset, lng: bLng - offset },
            { lat: bLat - offset, lng: bLng + offset },
            { lat: bLat + offset, lng: bLng + offset },
            { lat: bLat + offset, lng: bLng - offset }
          ],
          type: 'yes',
          levels: Math.floor(Math.random() * 6) + 1,
          height: null,
          use: 'residential'
        });
      }
    }

    // Add central water body / canal
    const centerLat = (south + north) / 2;
    const centerLng = (east + west) / 2;
    const wSize = 0.001;
    water.push({
      id: 'procedural_water',
      coords: [
        { lat: centerLat - wSize, lng: centerLng - wSize },
        { lat: centerLat - wSize, lng: centerLng + wSize },
        { lat: centerLat + wSize, lng: centerLng + wSize },
        { lat: centerLat + wSize, lng: centerLng - wSize }
      ],
      type: 'water'
    });

    return { buildings, roads, water };
  }
}
export default OverpassService;

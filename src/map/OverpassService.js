import store from '../state/store.js';

export class OverpassService {
  constructor() {
    this.endpoint = 'https://overpass-api.de/api/interpreter';
  }

  async fetchMapData(bbox) {
    const { south, west, north, east } = bbox;
    
    // Construct Overpass QL query
    // [out:json] sets json output, out geom returns coordinate arrays in ways directly
    const query = `[out:json][timeout:30];
(
  way["building"](${south},${west},${north},${east});
  relation["building"](${south},${west},${north},${east});
  
  way["highway"](${south},${west},${north},${east});
  
  way["natural"="water"](${south},${west},${north},${east});
  relation["natural"="water"](${south},${west},${north},${east});
  way["waterway"](${south},${west},${north},${east});
  
  way["landuse"](${south},${west},${north},${east});
  relation["landuse"](${south},${west},${north},${east});
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

    let lastError = null;
    for (const url of endpoints) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 second timeout per endpoint
      
      try {
        console.log(`Attempting to fetch OSM data from: ${url}`);
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          },
          body: body,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          console.warn(`Endpoint ${url} responded with status: ${response.status}`);
          lastError = new Error(`Overpass API ${url} responded with HTTP ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        if (data && (data.elements || data.remark)) {
          console.log(`Successfully fetched OSM data from: ${url}`);
          return data;
        }
      } catch (err) {
        clearTimeout(timeoutId);
        console.warn(`Failed fetching from endpoint ${url}:`, err);
        lastError = err;
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

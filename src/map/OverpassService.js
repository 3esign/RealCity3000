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
    
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: body
      });
      
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Overpass API rate limited. Please try again in a moment.');
        }
        throw new Error(`Overpass API responded with HTTP ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (err) {
      console.error('Failed fetching data from Overpass API', err);
      throw err;
    }
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
}
export default OverpassService;

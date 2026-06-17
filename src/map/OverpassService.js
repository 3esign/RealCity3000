export class OverpassService {
  constructor() {
    this.endpoint = 'https://overpass-api.de/api/interpreter';
  }

  // Estimates BBox area in square kilometers
  estimateBBoxArea(bbox) {
    const { south, west, north, east } = bbox;
    const latDist = (north - south) * 111.32;
    const avgLatRad = ((south + north) / 2) * Math.PI / 180;
    const lngDist = (east - west) * 111.32 * Math.cos(avgLatRad);
    return Math.abs(latDist * lngDist);
  }

  async executeSequentially(query, log) {
    const includeProxy = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.PROD : true;

    // Use only the 2 most reliable mirrors for frontend fallback
    const mirrors = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.private.coffee/api/interpreter'
    ];

    const targets = [];
    if (includeProxy) {
      targets.push({ url: '/api/overpass', kind: 'proxy' });
    }
    mirrors.forEach(url => {
      targets.push({ url, kind: 'mirror' });
    });

    if (!includeProxy) {
      log('Development mode detected. Local proxy disabled; direct mirrors will be used sequentially.', 'warn');
    }

    let lastError = null;

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const host = target.kind === 'proxy' ? 'Local Proxy' : target.url.split('/')[2];
      const controller = new AbortController();
      // Proxy handles 2 mirrors (max 9s). Give proxy 9.5s timeout. Mirrors get 5s.
      const timeoutMs = target.kind === 'proxy' ? 9500 : 5000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        let response;
        if (target.kind === 'proxy') {
          log(`Querying Backup Proxy: ${host} via POST (9.5s timeout)...`);
          response = await fetch(target.url, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({ query }),
            signal: controller.signal
          });
        } else {
          log(`Querying mirror ${i}/${mirrors.length}: ${host} via GET (5s timeout)...`);
          const getUrl = `${target.url}?data=${encodeURIComponent(query)}`;
          response = await fetch(getUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/json'
            },
            signal: controller.signal
          });
        }

        clearTimeout(timeoutId);

        if (!response.ok) {
          const status = response.status;
          let details = '';
          if (target.kind === 'proxy') {
            try {
              const errJson = await response.json();
              details = errJson.details || errJson.error || '';
            } catch (e) {}
          }
          const errorMsg = details ? `${host} returned HTTP ${status} (Details: ${details})` : `${host} returned HTTP ${status}`;
          throw new Error(errorMsg);
        }

        const data = await response.json();
        if (!data || (!data.elements && !data.remark)) {
          throw new Error(`${host} returned an invalid Overpass payload`);
        }

        if (data.remark && typeof data.remark === 'string' && data.remark.includes('runtime error')) {
          throw new Error(`Mirror runtime error: ${data.remark}`);
        }

        log(`Success! Fetched ${data.elements?.length || 0} features from ${host}`, 'success');
        return data;
      } catch (err) {
        clearTimeout(timeoutId);
        const reason = err.name === 'AbortError' ? 'Timeout exceeded' : err.message;
        log(`Proxy/Mirror ${host} failed: ${reason}`, 'warn');
        lastError = err;
        // Brief cooldown before next mirror to prevent rate limiting
        if (i < targets.length - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    throw lastError || new Error('All Overpass mirrors and Backup Proxy endpoints failed.');
  }

  async fetchMapData(bbox, logFn = null) {
    const log = (msg, type = 'info') => {
      console.log(`[OverpassService] ${msg}`);
      if (logFn) logFn(msg, type);
    };

    const area = this.estimateBBoxArea(bbox);
    log(`BBox Area: ${area.toFixed(2)} km²`);
    if (area > 4.0) {
      throw new Error(`Requested extraction area is too large (${area.toFixed(2)} km²). Maximum allowed size is 4.0 km². Please draw a smaller bounding box.`);
    }

    const { south, west, north, east } = bbox;
    log(`BBox bounds: S:${south.toFixed(4)}, W:${west.toFixed(4)}, N:${north.toFixed(4)}, E:${east.toFixed(4)}`);
    
    // Stable Cache Key (Round to 4 decimal places ~11 meters resolution)
    const sC = parseFloat(south.toFixed(4));
    const wC = parseFloat(west.toFixed(4));
    const nC = parseFloat(north.toFixed(4));
    const eC = parseFloat(east.toFixed(4));
    const cacheKey = `osm_cache_v2_${sC}_${wC}_${nC}_${eC}`;
    
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        log('Using cached OSM spatial data from previous successful extraction.', 'success');
        return JSON.parse(cached);
      }
    } catch (e) {
      console.warn('Failed to read from localStorage:', e);
    }

    const queryCombined = `[out:json][timeout:30];
(
  way["building"](${south},${west},${north},${east});
  way["highway"](${south},${west},${north},${east});
  way["natural"="water"](${south},${west},${north},${east});
  way["waterway"](${south},${west},${north},${east});
  way["landuse"](${south},${west},${north},${east});
);
out geom;`;

    let data;
    try {
      log('Attempting full OSM combined feature extraction...', 'info');
      data = await this.executeSequentially(queryCombined, log);
    } catch (combinedErr) {
      log(`Combined query failed: ${combinedErr.message}. Attempting automated query simplification fallback...`, 'warn');
      
      const queryRoads = `[out:json][timeout:15];
(
  way["highway"](${south},${west},${north},${east});
);
out geom;`;

      const queryBuildings = `[out:json][timeout:20];
(
  way["building"](${south},${west},${north},${east});
  way["natural"="water"](${south},${west},${north},${east});
  way["waterway"](${south},${west},${north},${east});
  way["landuse"](${south},${west},${north},${east});
);
out geom;`;

      log('Executing simplified Query 1/2: Roads...', 'info');
      let roadsData = null;
      try {
        roadsData = await this.executeSequentially(queryRoads, log);
      } catch (err) {
        log(`Roads fetch failed: ${err.message}`, 'error');
      }

      // Add delay to prevent rate limit 429/406 on the second query
      log('Delaying 1000ms to prevent rate limiting before next query...', 'info');
      await new Promise(r => setTimeout(r, 1000));

      log('Executing simplified Query 2/2: Buildings & Water...', 'info');
      let buildingsData = null;
      try {
        buildingsData = await this.executeSequentially(queryBuildings, log);
      } catch (err) {
        log(`Buildings & Water fetch failed: ${err.message}`, 'error');
      }

      if (!roadsData && !buildingsData) {
        throw new Error('All simplified queries also failed. Overpass API is completely unavailable.');
      }

      const mergedElements = [];
      if (roadsData?.elements) mergedElements.push(...roadsData.elements);
      if (buildingsData?.elements) mergedElements.push(...buildingsData.elements);

      data = {
        elements: mergedElements,
        remark: (roadsData?.remark || '') + ' ' + (buildingsData?.remark || '')
      };
      log(`Simplified recovery completed! Combined total of ${mergedElements.length} elements fetched.`, 'success');
    }

    try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch (e) {}
    return data;
  }

  inferBuildingUse(tags = {}) {
    const building = String(tags.building || '').toLowerCase();
    const useTag = String(tags['building:use'] || tags.use || '').toLowerCase();
    const amenity = String(tags.amenity || '').toLowerCase();
    const shop = String(tags.shop || '').toLowerCase();
    const office = String(tags.office || '').toLowerCase();
    const landuse = String(tags.landuse || '').toLowerCase();

    const isIndustrial = [
      'industrial',
      'factory',
      'warehouse',
      'manufacture',
      'manufacturing',
      'depot'
    ].includes(building) || ['industrial', 'factory', 'warehouse', 'manufacturing'].includes(useTag) || landuse === 'industrial';

    if (isIndustrial) return 'industrial';

    const isCommercial = [
      'commercial',
      'retail',
      'office',
      'shop'
    ].includes(building) || Boolean(shop) || Boolean(office) || ['commercial', 'retail', 'office', 'shop'].includes(useTag);

    if (isCommercial) return 'commercial';

    const isInstitutional = [
      'school',
      'hospital',
      'university',
      'college',
      'government',
      'public',
      'civic',
      'community',
      'church',
      'clinic',
      'library'
    ].includes(building) || [
      'school',
      'hospital',
      'university',
      'college',
      'government',
      'public',
      'civic',
      'community',
      'church',
      'clinic',
      'library'
    ].includes(amenity);

    if (isInstitutional) return 'institutional';

    const isResidential = [
      'house',
      'apartments',
      'detached',
      'semidetached_house',
      'terrace',
      'residential',
      'dormitory',
      'bungalow',
      'hut',
      'residential_building'
    ].includes(building) || [
      'residential',
      'house',
      'apartments',
      'dormitory'
    ].includes(useTag);

    if (isResidential) return 'residential';

    return 'residential';
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
          use: this.inferBuildingUse(tags)
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
          type: tags.natural || tags.waterway || tags.landuse,
          isWaterway: !!tags.waterway
        });
      }
    });

    return { buildings, roads, water };
  }

  generateProceduralElements(bbox) {
    const styles = ['grid', 'radial', 'organic', 'sprawl'];
    const chosenStyle = styles[Math.floor(Math.random() * styles.length)];
    console.log(`[OverpassService] Generating procedural elements with style: ${chosenStyle}`);
    
    if (chosenStyle === 'grid') {
      return this.generateProceduralGrid(bbox);
    } else if (chosenStyle === 'radial') {
      return this.generateProceduralRadial(bbox);
    } else if (chosenStyle === 'organic') {
      return this.generateProceduralOrganic(bbox);
    } else {
      return this.generateProceduralSprawl(bbox);
    }
  }

  generateProceduralGrid(bbox) {
    const { south, west, north, east } = bbox;
    const buildings = [];
    const roads = [];
    const water = [];

    const numBlocksX = Math.floor(Math.random() * 3) + 4; // 4 to 6
    const numBlocksY = Math.floor(Math.random() * 3) + 4; // 4 to 6
    const latStep = (north - south) / (numBlocksY + 1);
    const lngStep = (east - west) / (numBlocksX + 1);

    // Draw grid roads
    for (let i = 1; i <= numBlocksY; i++) {
      const rLat = south + i * latStep;
      roads.push({
        id: `procedural_road_h_${i}`,
        coords: [{ lat: rLat, lng: west }, { lat: rLat, lng: east }],
        type: 'primary',
        lanes: 2,
        name: `Street ${i}`
      });
    }
    for (let i = 1; i <= numBlocksX; i++) {
      const rLng = west + i * lngStep;
      roads.push({
        id: `procedural_road_v_${i}`,
        coords: [{ lat: south, lng: rLng }, { lat: north, lng: rLng }],
        type: 'primary',
        lanes: 2,
        name: `Avenue ${i}`
      });
    }

    // River
    const riverY = south + (Math.random() * 0.4 + 0.3) * (north - south);
    water.push({
      id: 'procedural_river',
      coords: [
        { lat: riverY - 0.0004, lng: west },
        { lat: riverY + 0.0004, lng: west },
        { lat: riverY + 0.0004, lng: east },
        { lat: riverY - 0.0004, lng: east }
      ],
      type: 'water'
    });

    // Populate buildings in blocks (skip where they intersect the river)
    let bId = 0;
    for (let r = 0; r <= numBlocksY; r++) {
      for (let c = 0; c <= numBlocksX; c++) {
        const bLat = south + r * latStep + latStep / 2;
        const bLng = west + c * lngStep + lngStep / 2;
        
        // Skip building if it's near/in the river
        if (Math.abs(bLat - riverY) < 0.0008) continue;

        const offset = Math.min(latStep, lngStep) * 0.25;
        
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
          use: Math.random() < 0.2 ? 'commercial' : 'residential'
        });
      }
    }

    return { buildings, roads, water };
  }

  generateProceduralRadial(bbox) {
    const { south, west, north, east } = bbox;
    const buildings = [];
    const roads = [];
    const water = [];

    const centerLat = (south + north) / 2;
    const centerLng = (east + west) / 2;
    const maxRadius = Math.min(north - south, east - west) / 2;

    // Central circular lake or park
    const wSize = maxRadius * 0.2;
    water.push({
      id: 'procedural_central_lake',
      coords: Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        return {
          lat: centerLat + Math.sin(angle) * wSize,
          lng: centerLng + Math.cos(angle) * wSize
        };
      }),
      type: 'water'
    });

    // Circular ring roads
    const numRings = 3;
    for (let r = 1; r <= numRings; r++) {
      const radius = wSize + (maxRadius - wSize) * (r / numRings);
      const ringCoords = Array.from({ length: 16 }, (_, i) => {
        const angle = (i / 16) * Math.PI * 2;
        return {
          lat: centerLat + Math.sin(angle) * radius,
          lng: centerLng + Math.cos(angle) * radius
        };
      });
      // Close the ring loop
      ringCoords.push(ringCoords[0]);
      roads.push({
        id: `procedural_ring_${r}`,
        coords: ringCoords,
        type: 'secondary',
        lanes: 2,
        name: `Ring Road ${r}`
      });
    }

    // Radial spokes roads
    const numSpokes = 8;
    for (let s = 0; s < numSpokes; s++) {
      const angle = (s / numSpokes) * Math.PI * 2;
      roads.push({
        id: `procedural_spoke_${s}`,
        coords: [
          { lat: centerLat + Math.sin(angle) * wSize, lng: centerLng + Math.cos(angle) * wSize },
          { lat: centerLat + Math.sin(angle) * maxRadius, lng: centerLng + Math.cos(angle) * maxRadius }
        ],
        type: 'primary',
        lanes: 2,
        name: `Radial Spoke ${s + 1}`
      });
    }

    // Buildings between rings and spokes
    let bId = 0;
    for (let r = 1; r <= numRings; r++) {
      const radius = wSize + (maxRadius - wSize) * ((r - 0.5) / numRings);
      for (let s = 0; s < numSpokes; s++) {
        // Find midpoint angle between spokes
        const angle = ((s + 0.5) / numSpokes) * Math.PI * 2;
        const bLat = centerLat + Math.sin(angle) * radius;
        const bLng = centerLng + Math.cos(angle) * radius;

        const offset = maxRadius * 0.05;
        buildings.push({
          id: `procedural_b_${bId++}`,
          coords: [
            { lat: bLat - offset, lng: bLng - offset },
            { lat: bLat - offset, lng: bLng + offset },
            { lat: bLat + offset, lng: bLng + offset },
            { lat: bLat + offset, lng: bLng - offset }
          ],
          type: 'yes',
          levels: Math.floor(Math.random() * 8) + 1,
          height: null,
          use: r === 1 ? 'commercial' : 'residential'
        });
      }
    }

    return { buildings, roads, water };
  }

  generateProceduralOrganic(bbox) {
    const { south, west, north, east } = bbox;
    const buildings = [];
    const roads = [];
    const water = [];

    // Curve water/river
    const riverCoords = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const lat = south + t * (north - south);
      const lngOffset = Math.sin(t * Math.PI * 2) * (east - west) * 0.15;
      const lng = (west + east) / 2 + lngOffset;
      riverCoords.push({ lat, lng });
    }
    // Double back for width
    const waterCoords = [
      ...riverCoords.map(c => ({ lat: c.lat, lng: c.lng - 0.0004 })),
      ...[...riverCoords].reverse().map(c => ({ lat: c.lat, lng: c.lng + 0.0004 }))
    ];
    water.push({
      id: 'procedural_organic_river',
      coords: waterCoords,
      type: 'water'
    });

    // Curvy main road crossing the river
    const mainRoadCoords = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const lng = west + t * (east - west);
      const latOffset = Math.cos(t * Math.PI * 1.5) * (north - south) * 0.2;
      const lat = (south + north) / 2 + latOffset;
      mainRoadCoords.push({ lat, lng });
    }
    roads.push({
      id: 'procedural_organic_main',
      coords: mainRoadCoords,
      type: 'primary',
      lanes: 4,
      name: 'Scenic Parkway'
    });

    // Scattered organic residential streets branching off
    let rId = 0;
    let bId = 0;
    for (let i = 1; i < mainRoadCoords.length - 1; i++) {
      const pt = mainRoadCoords[i];
      // Branch north
      const branchN = [
        pt,
        { lat: pt.lat + (north - pt.lat) * 0.5, lng: pt.lng + (Math.random() - 0.5) * (east - west) * 0.2 },
        { lat: north - 0.0005, lng: pt.lng + (Math.random() - 0.5) * (east - west) * 0.3 }
      ];
      roads.push({
        id: `procedural_organic_branch_n_${rId++}`,
        coords: branchN,
        type: 'residential',
        lanes: 2,
        name: `Winding Way ${rId}`
      });

      // Place buildings along the branch
      branchN.forEach((wpt, index) => {
        if (index === 0) return;
        const bLat = wpt.lat;
        const bLng = wpt.lng + 0.0006;
        buildings.push({
          id: `procedural_b_${bId++}`,
          coords: [
            { lat: bLat - 0.0003, lng: bLng - 0.0003 },
            { lat: bLat - 0.0003, lng: bLng + 0.0003 },
            { lat: bLat + 0.0003, lng: bLng + 0.0003 },
            { lat: bLat + 0.0003, lng: bLng - 0.0003 }
          ],
          type: 'yes',
          levels: Math.floor(Math.random() * 3) + 1,
          height: null,
          use: 'residential'
        });
      });
    }

    return { buildings, roads, water };
  }

  generateProceduralSprawl(bbox) {
    const { south, west, north, east } = bbox;
    const buildings = [];
    const roads = [];
    const water = [];

    // Central highway line
    roads.push({
      id: 'procedural_highway',
      coords: [
        { lat: south, lng: west + (east - west) * 0.3 },
        { lat: north, lng: east - (east - west) * 0.3 }
      ],
      type: 'motorway',
      lanes: 6,
      name: 'Interstate 3000'
    });

    // 3 Cluster Nodes
    const centers = [
      { lat: south + (north - south) * 0.25, lng: west + (east - west) * 0.25, type: 'industrial' },
      { lat: south + (north - south) * 0.75, lng: east - (east - west) * 0.25, type: 'commercial' },
      { lat: (south + north) / 2, lng: (west + east) / 2, type: 'residential' }
    ];

    // Local loop roads for each node center
    let bId = 0;
    centers.forEach((node, nIdx) => {
      const ringCoords = Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        return {
          lat: node.lat + Math.sin(angle) * 0.001,
          lng: node.lng + Math.cos(angle) * 0.001
        };
      });
      ringCoords.push(ringCoords[0]);
      roads.push({
        id: `procedural_node_ring_${nIdx}`,
        coords: ringCoords,
        type: 'residential',
        lanes: 2,
        name: `Sector loop ${nIdx}`
      });

      // Feeder road to main highway
      roads.push({
        id: `procedural_node_feeder_${nIdx}`,
        coords: [
          node,
          { lat: node.lat, lng: (west + east) / 2 }
        ],
        type: 'primary',
        lanes: 4,
        name: `Arterial ${nIdx}`
      });

      // Buildings clustered around this node
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const bLat = node.lat + Math.sin(angle) * 0.0006;
        const bLng = node.lng + Math.cos(angle) * 0.0006;
        buildings.push({
          id: `procedural_b_${bId++}`,
          coords: [
            { lat: bLat - 0.00025, lng: bLng - 0.00025 },
            { lat: bLat - 0.00025, lng: bLng + 0.00025 },
            { lat: bLat + 0.00025, lng: bLng + 0.00025 },
            { lat: bLat + 0.00025, lng: bLng - 0.00025 }
          ],
          type: 'yes',
          levels: node.type === 'commercial' ? Math.floor(Math.random() * 12) + 4 : Math.floor(Math.random() * 3) + 1,
          height: null,
          use: node.type
        });
      }
    });

    return { buildings, roads, water };
  }
}
export default OverpassService;

import store from '../state/store.js';

export class GridGenerator {
  constructor() {}

  generateGrid(bbox, parsedData, width, height, satelliteData) {
    const { south, west, north, east } = bbox;
    
    // Initialize grid base cells from satellite spectrum classification
    const grid = Array(height).fill(null).map((_, r) => {
      return Array(width).fill(null).map((_, c) => {
        return {
          x: c,
          y: r,
          type: 'VACANT',
          density: 0,
          elevation: Math.sin(c * 0.1) * Math.cos(r * 0.1) * 2.0, // slight terrain
          roadAccess: 0.0,
          waterAccess: 0.0,
          landValue: 10.0,
          population: 0,
          pollution: 0.0,
          accessibility: 0.0,
          connections: { N: 0, S: 0, E: 0, W: 0, NE: 0, NW: 0, SE: 0, SW: 0 },
          // Building outline data mapped back for 3D extrusion logic
          buildingId: null,
          buildingUse: null,
          originalType: 'VACANT',
          age: 100
        };
      });
    });

    // Helper to extract coordinates, supporting both [x, y] and [minX, minY, maxX, maxY]
    // Scales normalized percentage coordinates [0, 100] to the grid size
    const getSatelliteCoords = (arr, isRoad = false) => {
      if (!arr || !Array.isArray(arr)) return [];
      const coords = [];
      
      const scaleX = (val) => Math.min(Math.max(Math.round((val / 100) * (width - 1)), 0), width - 1);
      const scaleY = (val) => Math.min(Math.max(Math.round((val / 100) * (height - 1)), 0), height - 1);

      arr.forEach(item => {
        if (!Array.isArray(item)) return;
        if (item.length === 2) {
          coords.push({ x: scaleX(item[0]), y: scaleY(item[1]) });
        } else if (item.length === 4) {
          const [x0, y0, x1, y1] = item;
          if (isRoad) {
            // Draw a line for roads
            const startX = scaleX(x0);
            const startY = scaleY(y0);
            const endX = scaleX(x1);
            const endY = scaleY(y1);
            
            // Bresenham's line algorithm
            const dx = Math.abs(endX - startX);
            const dy = Math.abs(endY - startY);
            const sx = (startX < endX) ? 1 : -1;
            const sy = (startY < endY) ? 1 : -1;
            let err = dx - dy;
            let cx = startX;
            let cy = startY;
            
            while (true) {
              coords.push({ x: cx, y: cy });
              if (cx === endX && cy === endY) break;
              const e2 = 2 * err;
              if (e2 > -dy) { err -= dy; cx += sx; }
              if (e2 < dx) { err += dx; cy += sy; }
            }
          } else {
            // Draw a bounding box for zones
            const startX = scaleX(Math.min(x0, x1));
            const endX = scaleX(Math.max(x0, x1));
            const startY = scaleY(Math.min(y0, y1));
            const endY = scaleY(Math.max(y0, y1));
            for (let y = startY; y <= endY; y++) {
              for (let x = startX; x <= endX; x++) {
                coords.push({ x, y });
              }
            }
          }
        }
      });
      return coords;
    };

    // Seed base cells based on satellite detection
    if (satelliteData) {
      const waterCoords = getSatelliteCoords(satelliteData.water);
      waterCoords.forEach(({ x, y }) => {
        if (grid[y] && grid[y][x]) {
          grid[y][x].type = 'WATER';
          grid[y][x].originalType = 'WATER';
          grid[y][x].elevation = -0.5; // depressed water level
        }
      });

      const forestCoords = getSatelliteCoords(satelliteData.denseForests || satelliteData.forests);
      forestCoords.forEach(({ x, y }) => {
        if (grid[y] && grid[y][x] && grid[y][x].type === 'VACANT') {
          grid[y][x].type = 'FOREST';
          grid[y][x].originalType = 'FOREST';
        }
      });

      const brownfieldCoords = getSatelliteCoords(satelliteData.brownfields);
      brownfieldCoords.forEach(({ x, y }) => {
        if (grid[y] && grid[y][x] && grid[y][x].type === 'VACANT') {
          grid[y][x].type = 'BROWNFIELD';
          grid[y][x].originalType = 'BROWNFIELD';
          grid[y][x].landValue = 5.0; // Depressed land value
        }
      });

      const vacantCoords = getSatelliteCoords(satelliteData.vacantLots);
      vacantCoords.forEach(({ x, y }) => {
        if (grid[y] && grid[y][x] && grid[y][x].type === 'VACANT') {
          grid[y][x].landValue = 8.0; // Slightly lower land value
        }
      });

      const roadCoords = getSatelliteCoords(satelliteData.roads, true);
      roadCoords.forEach(({ x, y }) => {
        if (grid[y] && grid[y][x] && grid[y][x].type !== 'WATER') {
          grid[y][x].type = 'ROAD';
          grid[y][x].originalType = 'ROAD';
          grid[y][x].roadAccess = 1.0;
        }
      });

      const resCoords = getSatelliteCoords(satelliteData.residential);
      resCoords.forEach(({ x, y }) => {
        if (grid[y] && grid[y][x] && grid[y][x].type === 'VACANT') {
          grid[y][x].type = 'RESIDENTIAL_LOW';
          grid[y][x].originalType = 'RESIDENTIAL_LOW';
          grid[y][x].density = 2;
          grid[y][x].population = 4;
        }
      });

      const comCoords = getSatelliteCoords(satelliteData.commercial);
      comCoords.forEach(({ x, y }) => {
        if (grid[y] && grid[y][x] && grid[y][x].type === 'VACANT') {
          grid[y][x].type = 'COMMERCIAL';
          grid[y][x].originalType = 'COMMERCIAL';
          grid[y][x].density = 2;
        }
      });

      const indCoords = getSatelliteCoords(satelliteData.industrial);
      indCoords.forEach(({ x, y }) => {
        if (grid[y] && grid[y][x] && grid[y][x].type === 'VACANT') {
          grid[y][x].type = 'INDUSTRIAL';
          grid[y][x].originalType = 'INDUSTRIAL';
          grid[y][x].density = 2;
        }
      });
    }

    // Projection helpers
    const projectLng = (lng) => {
      const val = ((lng - west) / (east - west)) * (width - 1);
      return Math.min(Math.max(Math.round(val), 0), width - 1);
    };
    
    const projectLat = (lat) => {
      const val = ((north - lat) / (north - south)) * (height - 1);
      return Math.min(Math.max(Math.round(val), 0), height - 1);
    };

    const pointInPolygon = (pt, poly) => {
      let isInside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        const intersect = ((yi > pt.y) !== (yj > pt.y))
            && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
        if (intersect) isInside = !isInside;
      }
      return isInside;
    };

    // Rasterize helpers
    const drawLine = (x0, y0, x1, y1, callback) => {
      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      const sx = (x0 < x1) ? 1 : -1;
      const sy = (y0 < y1) ? 1 : -1;
      let err = dx - dy;
      
      while (true) {
        callback(x0, y0);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
      }
    };

    // 1. Rasterize Water
    parsedData.water.forEach(w => {
      const isClosed = w.coords.length > 2 &&
                       w.coords[0].lat === w.coords[w.coords.length - 1].lat &&
                       w.coords[0].lng === w.coords[w.coords.length - 1].lng;
      const isLine = w.isWaterway || !isClosed;

      if (isLine) {
        const typeStr = String(w.type).toLowerCase();
        let bufferRadius = 1;
        if (typeStr === 'river') bufferRadius = 2;
        if (['stream', 'ditch', 'drain'].includes(typeStr)) bufferRadius = 0;

        for (let i = 0; i < w.coords.length - 1; i++) {
          const pt0 = w.coords[i];
          const pt1 = w.coords[i+1];
          const x0 = projectLng(pt0.lng);
          const y0 = projectLat(pt0.lat);
          const x1 = projectLng(pt1.lng);
          const y1 = projectLat(pt1.lat);

          drawLine(x0, y0, x1, y1, (x, y) => {
            for (let dy = -bufferRadius; dy <= bufferRadius; dy++) {
              for (let dx = -bufferRadius; dx <= bufferRadius; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                  if (dx*dx + dy*dy <= bufferRadius*bufferRadius + 0.5) {
                    grid[ny][nx].type = 'WATER';
                    grid[ny][nx].originalType = 'WATER';
                    grid[ny][nx].elevation = -0.5;
                  }
                }
              }
            }
          });
        }
      } else {
        const poly = w.coords.map(c => ({ x: projectLng(c.lng), y: projectLat(c.lat) }));
        const minX = Math.min(...poly.map(p => p.x));
        const maxX = Math.max(...poly.map(p => p.x));
        const minY = Math.min(...poly.map(p => p.y));
        const maxY = Math.max(...poly.map(p => p.y));
        
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            if (pointInPolygon({ x, y }, poly)) {
              grid[y][x].type = 'WATER';
              grid[y][x].originalType = 'WATER';
              grid[y][x].elevation = -0.5;
            }
          }
        }
      }
    });

    // 2. Rasterize Roads (Bresenham's Line Algorithm)
    parsedData.roads.forEach(road => {
      const typeStr = String(road.type).toLowerCase();
      let bufferRadius = 0;
      if (['motorway', 'trunk', 'primary', 'secondary'].includes(typeStr)) {
        bufferRadius = 1;
      }

      for (let i = 0; i < road.coords.length - 1; i++) {
        const pt0 = road.coords[i];
        const pt1 = road.coords[i+1];
        const x0 = projectLng(pt0.lng);
        const y0 = projectLat(pt0.lat);
        const x1 = projectLng(pt1.lng);
        const y1 = projectLat(pt1.lat);
        
        drawLine(x0, y0, x1, y1, (x, y) => {
          for (let dy = -bufferRadius; dy <= bufferRadius; dy++) {
            for (let dx = -bufferRadius; dx <= bufferRadius; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                if (dx*dx + dy*dy <= bufferRadius*bufferRadius + 0.5) {
                  if (grid[ny][nx].type !== 'WATER') {
                    grid[ny][nx].type = 'ROAD';
                    grid[ny][nx].originalType = 'ROAD';
                    grid[ny][nx].roadAccess = 1.0;
                  }
                }
              }
            }
          }
          
          // Connect to previous step to form path matrix
          const prevPt = i > 0 ? road.coords[i-1] : null;
          if (prevPt) {
            const px = projectLng(prevPt.lng);
            const py = projectLat(prevPt.lat);
            const dx = x - px;
            const dy = y - py;
            if (dy < 0) grid[y][x].connections.N = 1;
            if (dy > 0) grid[y][x].connections.S = 1;
            if (dx > 0) grid[y][x].connections.E = 1;
            if (dx < 0) grid[y][x].connections.W = 1;
          }
        });
      }
    });

    // 3. Rasterize Buildings
    parsedData.buildings.forEach(b => {
      const poly = b.coords.map(c => ({ x: projectLng(c.lng), y: projectLat(c.lat) }));
      const minX = Math.min(...poly.map(p => p.x));
      const maxX = Math.max(...poly.map(p => p.x));
      const minY = Math.min(...poly.map(p => p.y));
      const maxY = Math.max(...poly.map(p => p.y));

      // Decide zoning type
      let type = 'RESIDENTIAL_LOW';
      const normalizedUse = String(b.use || '').toLowerCase();
      if (b.levels > 4 || b.height > 15) {
        type = 'RESIDENTIAL_HIGH';
      }
      if (normalizedUse === 'commercial' || normalizedUse === 'retail' || b.type === 'commercial' || b.type === 'retail') {
        type = 'COMMERCIAL';
      } else if (normalizedUse === 'industrial') {
        type = 'INDUSTRIAL';
      } else if (normalizedUse === 'institutional') {
        type = 'INSTITUTIONAL';
      } else if (normalizedUse === 'residential') {
        type = b.levels > 4 || b.height > 15 ? 'RESIDENTIAL_HIGH' : 'RESIDENTIAL_LOW';
      }

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (pointInPolygon({ x, y }, poly)) {
            // Keep roads and water intact
            if (grid[y][x].type !== 'ROAD' && grid[y][x].type !== 'WATER') {
              grid[y][x].type = type;
              grid[y][x].originalType = type;
              if (type === 'COMMERCIAL' || type === 'INDUSTRIAL' || type === 'INSTITUTIONAL') {
                grid[y][x].density = Math.max(1, Math.min(b.levels || 1, 4));
                grid[y][x].population = 0;
              } else {
                grid[y][x].density = b.levels * 2;
                grid[y][x].population = b.levels * 4;
              }
              grid[y][x].buildingId = b.id;
              grid[y][x].buildingUse = b.use;
            }
          }
        }
      }
    });

    // 4. Fill in basic cell variables
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[y][x];
        
        // Randomly place forest patches for nice visuals (satellite is primary source)
        if (cell.type === 'VACANT' && Math.random() < 0.02) {
          cell.type = 'FOREST';
          cell.originalType = 'FOREST';
        }
        
        // Calculate basic distance to road access
        let minDist = 999;
        for (let ry = Math.max(0, y - 3); ry < Math.min(height, y + 4); ry++) {
          for (let rx = Math.max(0, x - 3); rx < Math.min(width, x + 4); rx++) {
            if (grid[ry][rx].type === 'ROAD') {
              const d = Math.sqrt((x - rx)**2 + (y - ry)**2);
              if (d < minDist) minDist = d;
            }
          }
        }
        cell.roadAccess = minDist === 999 ? 0.0 : Math.max(0, 1.0 - (minDist / 4.0));
      }
    }

    return grid;
  }
}
export default GridGenerator;

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
          originalType: 'VACANT'
        };
      });
    });

    // Seed base cells based on satellite detection
    if (satelliteData) {
      if (satelliteData.water) {
        satelliteData.water.forEach(([cx, cy]) => {
          if (grid[cy] && grid[cy][cx]) {
            grid[cy][cx].type = 'WATER';
            grid[cy][cx].originalType = 'WATER';
            grid[cy][cx].elevation = -0.5; // depressed water level
          }
        });
      }
      if (satelliteData.denseForests) {
        satelliteData.denseForests.forEach(([cx, cy]) => {
          if (grid[cy] && grid[cy][cx] && grid[cy][cx].type === 'VACANT') {
            grid[cy][cx].type = 'FOREST';
            grid[cy][cx].originalType = 'FOREST';
          }
        });
      }
      if (satelliteData.brownfields) {
        satelliteData.brownfields.forEach(([cx, cy]) => {
          if (grid[cy] && grid[cy][cx] && grid[cy][cx].type === 'VACANT') {
            grid[cy][cx].type = 'BROWNFIELD';
            grid[cy][cx].originalType = 'BROWNFIELD';
            grid[cy][cx].landValue = 5.0; // Depressed land value
          }
        });
      }
      if (satelliteData.vacantLots) {
        satelliteData.vacantLots.forEach(([cx, cy]) => {
          if (grid[cy] && grid[cy][cx] && grid[cy][cx].type === 'VACANT') {
            grid[cy][cx].landValue = 8.0; // Slightly lower land value
          }
        });
      }
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

    // 1. Rasterize Water
    parsedData.water.forEach(w => {
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
          }
        }
      }
    });

    // 2. Rasterize Roads (Bresenham's Line Algorithm)
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

    parsedData.roads.forEach(road => {
      for (let i = 0; i < road.coords.length - 1; i++) {
        const pt0 = road.coords[i];
        const pt1 = road.coords[i+1];
        const x0 = projectLng(pt0.lng);
        const y0 = projectLat(pt0.lat);
        const x1 = projectLng(pt1.lng);
        const y1 = projectLat(pt1.lat);
        
        drawLine(x0, y0, x1, y1, (x, y) => {
          grid[y][x].type = 'ROAD';
          grid[y][x].originalType = 'ROAD';
          grid[y][x].roadAccess = 1.0;
          
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
      if (b.levels > 4 || b.height > 15) {
        type = 'RESIDENTIAL_HIGH';
      }
      if (b.use === 'commercial' || b.use === 'retail' || b.type === 'commercial' || b.type === 'retail') {
        type = 'COMMERCIAL';
      }

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (pointInPolygon({ x, y }, poly)) {
            // Keep roads and water intact
            if (grid[y][x].type !== 'ROAD' && grid[y][x].type !== 'WATER') {
              grid[y][x].type = type;
              grid[y][x].originalType = type;
              grid[y][x].density = b.levels * 2;
              grid[y][x].population = b.levels * 4;
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

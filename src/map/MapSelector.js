import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import store from '../state/store.js';
import { eventBus } from '../utils/eventBus.js';

export class MapSelector {
  constructor() {
    this.map = null;
    this.drawnItems = null;
    this.currentRectangle = null;
    this.drawModeActive = false;
    
    this.initMap();
    this.setupListeners();
    this.runPerformanceCheck();
  }

  initMap() {
    // Novi Pazar coordinates default
    const defaultCenter = [43.1367, 20.5122];
    const defaultZoom = 14;

    this.map = L.map('map-selection-viewport', {
      zoomControl: true,
      attributionControl: true
    }).setView(defaultCenter, defaultZoom);

    // ESRI satellite tile layer
    const satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      }
    ).addTo(this.map);

    this.drawnItems = new L.FeatureGroup().addTo(this.map);

    // Solve Leaflet container width/height shifts on DOM compilation
    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize();
        this.map.setView(defaultCenter, defaultZoom);
      }
    }, 250);
  }

  setupListeners() {
    let isDrawing = false;
    let startLatLng = null;
    let rect = null;

    const drawBtn = document.getElementById('draw-bbox-btn');

    drawBtn.addEventListener('click', () => {
      this.drawModeActive = !this.drawModeActive;
      if (this.drawModeActive) {
        drawBtn.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Drag on Map to Draw Box';
        drawBtn.classList.add('btn-primary');
        this.map.getContainer().style.cursor = 'crosshair';
        this.map.dragging.disable();
      } else {
        drawBtn.innerHTML = '<i class="fa-solid fa-square-plus"></i> Draw Bounding Box';
        drawBtn.classList.remove('btn-primary');
        this.map.getContainer().style.cursor = '';
        this.map.dragging.enable();
      }
    });

    this.map.on('mousedown', (e) => {
      if (!this.drawModeActive) return;
      isDrawing = true;
      startLatLng = e.latlng;

      if (rect) {
        this.drawnItems.removeLayer(rect);
      }

      rect = L.rectangle([startLatLng, startLatLng], {
        color: '#00f0ff',
        weight: 2,
        fillOpacity: 0.15,
        dashArray: '4, 4'
      }).addTo(this.drawnItems);
    });

    this.map.on('mousemove', (e) => {
      if (!isDrawing) return;
      const currentLatLng = e.latlng;
      rect.setBounds(L.latLngBounds(startLatLng, currentLatLng));
    });

    this.map.on('mouseup', () => {
      if (!isDrawing) return;
      isDrawing = false;
      this.currentRectangle = rect;
      
      this.drawModeActive = false;
      drawBtn.innerHTML = '<i class="fa-solid fa-square-plus"></i> Draw Bounding Box';
      drawBtn.classList.remove('btn-primary');
      this.map.getContainer().style.cursor = '';
      this.map.dragging.enable();

      this.validateSelection(rect.getBounds());
    });

    // Search bar Nominatim geocoding
    const searchInput = document.getElementById('map-search-input');
    const searchBtn = document.getElementById('map-search-btn');

    const triggerSearch = async () => {
      const query = searchInput.value.trim();
      if (!query) return;
      
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          this.map.setView([lat, lon], 14);
        } else {
          alert('Location not found. Try a different city name.');
        }
      } catch (err) {
        console.error('Nominatim request failed', err);
      }
    };

    searchBtn.addEventListener('click', triggerSearch);
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') triggerSearch();
    });

    // Resolution slider
    const resSlider = document.getElementById('grid-res-slider');
    const resDisplay = document.getElementById('grid-res-display');

    resSlider.addEventListener('input', () => {
      const val = parseInt(resSlider.value);
      resDisplay.textContent = `${val} × ${val}`;
      store.updateState({ gridWidth: val, gridHeight: val });
      if (this.currentRectangle) {
        this.validateSelection(this.currentRectangle.getBounds());
      }
    });
  }

  validateSelection(bounds) {
    const south = bounds.getSouth();
    const west = bounds.getWest();
    const north = bounds.getNorth();
    const east = bounds.getEast();
    
    // Bounding Box Area Formula in km²
    const meanLat = (south + north) / 2 * (Math.PI / 180);
    const latDistance = (north - south) * 111.32;
    const lngDistance = (east - west) * 111.32 * Math.cos(meanLat);
    const areaSqKm = latDistance * lngDistance;
    
    const maxArea = 2.0; // Enforce 2.0 km² limit
    const extractBtn = document.getElementById('extract-data-btn');
    
    const aspect = lngDistance / latDistance;
    
    store.updateState({
      bbox: { south, west, north, east },
      aspectRatio: aspect
    });

    this.runOptimizationFormula(areaSqKm);

    if (areaSqKm > maxArea) {
      extractBtn.classList.add('disabled');
      alert(`Selection exceeds maximum area of ${maxArea} km². Current selection: ${areaSqKm.toFixed(2)} km². Please redraw a smaller bounding box.`);
    } else {
      extractBtn.classList.remove('disabled');
    }
  }

  runPerformanceCheck() {
    // Quick loop test to benchmark CPU speed (defines P_perf)
    const t0 = performance.now();
    let x = 0;
    for (let i = 0; i < 5000000; i++) {
      x += Math.sin(i);
    }
    const t1 = performance.now();
    const latency = t1 - t0;
    
    // Map latency to performance profile [0.5, 2.0]
    // Standard fast computers finish in <10ms -> P_perf ~ 1.5 - 2.0
    // Laptops/Mobile finish in >30ms -> P_perf ~ 0.5 - 0.8
    let perf = 1.0;
    if (latency < 10) {
      perf = 2.0;
    } else if (latency < 25) {
      perf = 1.2;
    } else if (latency < 60) {
      perf = 0.8;
    } else {
      perf = 0.5;
    }
    
    this.perfProfile = perf;
    console.log(`RealCity3000 Benchmark: profile factor = ${perf.toFixed(2)}`);
  }

  runOptimizationFormula(areaSqKm) {
    const perfFactor = this.perfProfile || 1.0;
    const is3dActive = store.getState().renderingMode === '3d' ? 1.0 : 0.0;
    
    const C = 75.0; // scale baseline constant
    const omega = 0.35; // 3D render penalty
    
    // D = clamp( (C * P_perf) / (sqrt(A) * (1 + omega * M_render)), D_min, D_max )
    const rawD = (C * perfFactor) / (Math.sqrt(areaSqKm) * (1.0 + omega * is3dActive));
    const optimizedResolution = Math.min(Math.max(Math.round(rawD), 20), 150);
    
    // UI Visual status updates
    const indicator = document.getElementById('perf-indicator');
    const indicatorDot = indicator.querySelector('.dot');
    const indicatorLabel = indicator.querySelector('.label');
    
    let state = 'Optimal';
    let cssClass = 'green';
    
    if (optimizedResolution < 40) {
      state = 'Critical (Heavy)';
      cssClass = 'red';
    } else if (optimizedResolution < 75) {
      state = 'Balanced (Medium)';
      cssClass = 'amber';
    }
    
    indicatorDot.className = `dot ${cssClass}`;
    indicatorLabel.textContent = `Performance Status: ${state}`;
    
    // Auto-update slider value to match optimized value if selection first drawn
    const resSlider = document.getElementById('grid-res-slider');
    const resDisplay = document.getElementById('grid-res-display');
    
    resSlider.value = optimizedResolution;
    resDisplay.textContent = `${optimizedResolution} × ${optimizedResolution}`;
    
    store.updateState({
      gridWidth: optimizedResolution,
      gridHeight: optimizedResolution
    });
  }
}
export default MapSelector;

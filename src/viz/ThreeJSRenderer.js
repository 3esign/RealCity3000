import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import store from '../state/store.js';

export class ThreeJSRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    
    // Meshes
    this.gridMesh = null;       // Base cells (InstancedMesh)
    this.buildingsMesh = null;  // Instanced buildings solid
    this.buildingsEdgeMesh = null; // Instanced buildings wireframe outlines
    this.humanMesh = null;      // Pedestrians (InstancedMesh)
    this.vehicleMesh = null;    // Cars (InstancedMesh)
    this.treesMesh = null;      // Vegetation (InstancedMesh)
    this.humanBaseHeights = []; // Track human ground heights for bounce animations
    const initialMode = store.getState().renderingMode;
    this.renderingLoopActive = (initialMode === '3d' || initialMode === 'fps');

    // Weather particle system
    this.weatherSystem = null;
    this.weatherGeometry = null;

    // FPS Controls State
    this.fpsCameraActive = false;
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.jumpPressed = false;
    
    this.playerHeight = 0.8;        // Agent ground eye-height
    this.playerVelocityY = 0;
    this.isJumping = false;
    this.gravity = 9.8 * 2.5;       // Gravity multiplier for snappy arcade fall
    this.jumpVelocity = 8.0;        // Jump force
    this.playerRadius = 0.35;       // Slider collision thickness radius
    this.lastTime = performance.now();

    this.pitch = 0;
    this.yaw = -Math.PI / 2;
    this.mouseSensitivity = 0.0025;
    
    // Colors matching 2D Palette
    this.colors = {
      VACANT: new THREE.Color(0x2a2d35),
      RESIDENTIAL_LOW: new THREE.Color(0xd4a574),
      RESIDENTIAL_HIGH: new THREE.Color(0xe87040),
      COMMERCIAL: new THREE.Color(0x00d4ff),
      INDUSTRIAL: new THREE.Color(0x8b5cf6),
      GREEN_SPACE: new THREE.Color(0x22c55e),
      FOREST: new THREE.Color(0x059669),
      WATER: new THREE.Color(0x0ea5e9),
      ROAD: new THREE.Color(0x94a3b8),
      BROWNFIELD: new THREE.Color(0xb45309),
      AGRICULTURAL: new THREE.Color(0xeab308),
      INSTITUTIONAL: new THREE.Color(0xf43f5e)
    };

    this.initThree();
    this.setupEvents();
    this.animate();
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x101424);
    this.scene.fog = new THREE.FogExp2(0x101424, 0.008);

    // Advanced Renderer configuration
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      logarithmicDepthBuffer: true, // Prevents z-fighting on overlaps
      powerPreference: "high-performance"
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Camera
    this.camera = new THREE.PerspectiveCamera(50, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
    this.camera.position.set(50, 60, 80);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // don't go below ground

    // Lighting: Optmistic sky-blue ambient + warm gold sunlight + soft blue fill light
    const ambientLight = new THREE.AmbientLight(0xd0e8ff, 0.55);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfffaed, 1.6);
    dirLight.position.set(60, 100, 40);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 300;
    const d = 80;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    // Soft secondary fill light from opposite angle to brighten shadows
    const fillLight = new THREE.DirectionalLight(0x00aaff, 0.6);
    fillLight.position.set(-60, 50, -40);
    this.scene.add(fillLight);

    // Procedural skybox shader
    this.createSkybox();
    
    // Create initial weather setup
    this.createWeatherSystem();
  }

  createSkybox() {
    const skyGeo = new THREE.SphereGeometry(500, 32, 15);
    // Custom gradient sky shader matching CAD aesthetics
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x0f172a) },
        bottomColor: { value: new THREE.Color(0x3b82f6) },
        offset: { value: 33 },
        exponent: { value: 0.6 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide
    });

    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);
  }

  createWeatherSystem() {
    const particleCount = 2000;
    this.weatherGeometry = new THREE.BufferGeometry();
    const positions = [];
    const velocities = [];

    for (let i = 0; i < particleCount; i++) {
      positions.push(
        (Math.random() - 0.5) * 200, // x
        Math.random() * 100,         // y
        (Math.random() - 0.5) * 200  // z
      );
      velocities.push(-0.1 - Math.random() * 0.2); // y fall rate
    }

    this.weatherGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.weatherGeometry.userData = { velocities };

    // Canvas procedural light texture for particles
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const cctx = canvas.getContext('2d');
    const grad = cctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    cctx.fillStyle = grad;
    cctx.fillRect(0, 0, 16, 16);
    const texture = new THREE.CanvasTexture(canvas);

    const material = new THREE.PointsMaterial({
      color: 0x00f0ff,
      size: 0.8,
      transparent: true,
      blending: THREE.AdditiveBlending,
      map: texture,
      depthWrite: false
    });

    this.weatherSystem = new THREE.Points(this.weatherGeometry, material);
    this.scene.add(this.weatherSystem);
  }

  initInstancedMeshes(w, h) {
    this.disposeMeshes();

    this.gridWidth = w;
    this.gridHeight = h;
    const totalCells = w * h;

    // 1. Grid Mesh (Base floor tiles)
    const tileGeo = new THREE.BoxGeometry(0.95, 0.1, 0.95);
    const tileMat = new THREE.MeshStandardMaterial({
      roughness: 0.6,
      metalness: 0.1
    });
    this.gridMesh = new THREE.InstancedMesh(tileGeo, tileMat, totalCells);
    this.gridMesh.receiveShadow = true;
    this.gridMesh.castShadow = true;
    this.scene.add(this.gridMesh);

    // 2. Buildings Solid Mesh (Cubic abstraction - reverted for performance)
    const buildingGeo = new THREE.BoxGeometry(0.85, 1.0, 0.85);
    buildingGeo.translate(0, 0.5, 0); // pivot at bottom of box
    const buildingMat = new THREE.MeshStandardMaterial({
      roughness: 0.4,
      metalness: 0.5,
      emissive: 0x001a33,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });
    this.buildingsMesh = new THREE.InstancedMesh(buildingGeo, buildingMat, totalCells);
    this.buildingsMesh.castShadow = true;
    this.buildingsMesh.receiveShadow = true;
    this.scene.add(this.buildingsMesh);

    // 3. Buildings Edge Mesh (CAD Wireframe outlines)
    const buildingEdgeMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.4
    });
    this.buildingsEdgeMesh = new THREE.InstancedMesh(buildingGeo, buildingEdgeMat, totalCells);
    this.scene.add(this.buildingsEdgeMesh);

    // 4. Trees Mesh
    const foliageGeo = new THREE.ConeGeometry(0.35, 1.2, 5);
    foliageGeo.translate(0, 0.6, 0); // pivot at bottom
    const treeMat = new THREE.MeshStandardMaterial({
      color: 0x15803d,
      roughness: 0.9
    });
    this.treesMesh = new THREE.InstancedMesh(foliageGeo, treeMat, totalCells);
    this.treesMesh.castShadow = true;
    this.treesMesh.receiveShadow = true;
    this.scene.add(this.treesMesh);

    // 5. Humans Mesh (Pedestrians)
    const humanGeo = new THREE.CapsuleGeometry(0.12, 0.4, 4, 8);
    humanGeo.translate(0, 0.2, 0); // pivot at bottom
    const humanMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      roughness: 0.5,
      metalness: 0.1
    });
    this.maxHumans = Math.min(totalCells * 2, 1000);
    this.humanMesh = new THREE.InstancedMesh(humanGeo, humanMat, this.maxHumans);
    this.humanMesh.castShadow = true;
    this.scene.add(this.humanMesh);

    // 6. Vehicles Mesh (Cars)
    const carGeo = new THREE.CapsuleGeometry(0.18, 0.6, 4, 8);
    carGeo.rotateZ(Math.PI / 2); // Orient horizontal
    carGeo.translate(0, 0.15, 0); // pivot at bottom
    const carMat = new THREE.MeshStandardMaterial({
      color: 0xff0077,
      roughness: 0.3,
      metalness: 0.8
    });
    this.maxCars = Math.min(totalCells, 400);
    this.vehicleMesh = new THREE.InstancedMesh(carGeo, carMat, this.maxCars);
    this.vehicleMesh.castShadow = true;
    this.scene.add(this.vehicleMesh);
  }

  disposeMeshes() {
    const meshes = [
      this.gridMesh,
      this.buildingsMesh,
      this.buildingsEdgeMesh,
      this.treesMesh,
      this.humanMesh,
      this.vehicleMesh
    ];
    meshes.forEach(mesh => {
      if (mesh) {
        this.scene.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose());
          else mesh.material.dispose();
        }
      }
    });
    this.gridMesh = null;
    this.buildingsMesh = null;
    this.buildingsEdgeMesh = null;
    this.treesMesh = null;
    this.humanMesh = null;
    this.vehicleMesh = null;
  }

  resize() {
    if (!this.container || !this.camera || !this.renderer) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  rebuildScene() {
    const state = store.getState();
    const grid = state.grid;
    if (!grid) return;

    const w = state.gridWidth;
    const h = state.gridHeight;

    if (!this.gridMesh || this.gridWidth !== w || this.gridHeight !== h) {
      this.initInstancedMeshes(w, h);
    }

    const offsetX = -w / 2;
    const offsetZ = -h / 2;

    const dummy = new THREE.Object3D();
    
    const developedCells = [];
    const roadCells = [];

    let index = 0;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const cell = grid[r][c];
        const cellX = c + offsetX;
        const cellZ = r + offsetZ;
        const elevationY = cell.elevation * 0.2;

        // 1. Update Grid Base Tile
        dummy.position.set(cellX, elevationY, cellZ);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        this.gridMesh.setMatrixAt(index, dummy.matrix);
        
        const gridColor = this.colors[cell.type] || this.colors.VACANT;
        this.gridMesh.setColorAt(index, gridColor);

        // 2. Update Building Solid & Edge outlines
        const isDeveloped = cell.type.startsWith('RESIDENTIAL') || cell.type === 'COMMERCIAL' || cell.type === 'INDUSTRIAL' || cell.type === 'INSTITUTIONAL';
        
        if (isDeveloped && cell.density > 0) {
          developedCells.push({ x: c, y: r, elevation: cell.elevation });
          
          const height = Math.max(cell.density * 1.2, 0.2);
          dummy.position.set(cellX, elevationY, cellZ);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1.0, height, 1.0);
          dummy.updateMatrix();
          
          this.buildingsMesh.setMatrixAt(index, dummy.matrix);
          this.buildingsEdgeMesh.setMatrixAt(index, dummy.matrix);

          const baseColor = this.colors[cell.type] || this.colors.VACANT;
          const color = baseColor.clone();
          if (cell.landValue) {
            const factor = 0.6 + (cell.landValue / 100.0) * 0.6;
            color.multiplyScalar(Math.min(factor, 1.5));
          }
          this.buildingsMesh.setColorAt(index, color);
          this.buildingsEdgeMesh.setColorAt(index, new THREE.Color(0x00f0ff));
        } else {
          dummy.position.set(cellX, elevationY - 10, cellZ); // move underground
          dummy.scale.set(0.0001, 0.0001, 0.0001);
          dummy.updateMatrix();
          this.buildingsMesh.setMatrixAt(index, dummy.matrix);
          this.buildingsEdgeMesh.setMatrixAt(index, dummy.matrix);
          
          this.buildingsMesh.setColorAt(index, new THREE.Color(0x000000));
          this.buildingsEdgeMesh.setColorAt(index, new THREE.Color(0x000000));
        }

        // 3. Forest/Trees
        const isForest = cell.type === 'FOREST' || cell.type === 'GREEN_SPACE';
        if (isForest) {
          const randX = (Math.sin(index * 453.2) * 0.25);
          const randZ = (Math.cos(index * 982.1) * 0.25);
          // Scale trees dynamically using greenProtection parameter
          const scale = (0.4 + (Math.abs(Math.sin(index)) * 0.6)) * (0.6 + (state.params.greenProtection / 100.0) * 0.8);
          
          dummy.position.set(cellX + randX, elevationY, cellZ + randZ);
          dummy.rotation.set(0, index * 0.5, 0);
          dummy.scale.set(scale, scale, scale);
          dummy.updateMatrix();
          this.treesMesh.setMatrixAt(index, dummy.matrix);
          
          const treeColor = cell.type === 'FOREST' ? this.colors.FOREST : this.colors.GREEN_SPACE;
          this.treesMesh.setColorAt(index, treeColor);
        } else {
          dummy.scale.set(0.0001, 0.0001, 0.0001);
          dummy.updateMatrix();
          this.treesMesh.setMatrixAt(index, dummy.matrix);
          this.treesMesh.setColorAt(index, new THREE.Color(0x000000));
        }

        if (cell.type === 'ROAD') {
          roadCells.push({ x: c, y: r, elevation: cell.elevation });
        }

        index++;
      }
    }

    this.gridMesh.instanceMatrix.needsUpdate = true;
    if (this.gridMesh.instanceColor) this.gridMesh.instanceColor.needsUpdate = true;

    this.buildingsMesh.instanceMatrix.needsUpdate = true;
    if (this.buildingsMesh.instanceColor) this.buildingsMesh.instanceColor.needsUpdate = true;

    this.buildingsEdgeMesh.instanceMatrix.needsUpdate = true;
    if (this.buildingsEdgeMesh.instanceColor) this.buildingsEdgeMesh.instanceColor.needsUpdate = true;

    this.treesMesh.instanceMatrix.needsUpdate = true;
    if (this.treesMesh.instanceColor) this.treesMesh.instanceColor.needsUpdate = true;

    this.updateAgents(developedCells, roadCells, offsetX, offsetZ);
  }

  updateAgents(developedCells, roadCells, offsetX, offsetZ) {
    const dummy = new THREE.Object3D();
    this.humanBaseHeights = []; // Clear and rebuild human base heights

    // 1. Update Pedestrians (Humans)
    if (developedCells.length > 0 && this.humanMesh) {
      const numHumans = Math.min(developedCells.length * 2, this.maxHumans);
      this.humanMesh.count = numHumans;

      for (let i = 0; i < numHumans; i++) {
        const cellIdx = Math.floor((Math.sin(i * 12.3) * 0.5 + 0.5) * developedCells.length);
        const cell = developedCells[cellIdx];
        
        const randX = (Math.sin(i * 54.3 + performance.now() * 0.0005) * 0.35);
        const randZ = (Math.cos(i * 87.2 + performance.now() * 0.0005) * 0.35);
        const baseHeight = cell.elevation * 0.2 + 0.15;
        this.humanBaseHeights.push(baseHeight);
        
        dummy.position.set(
          cell.x + offsetX + randX,
          baseHeight,
          cell.y + offsetZ + randZ
        );
        dummy.rotation.set(0, i * 0.7, 0);
        dummy.scale.set(1.0, 1.0, 1.0);
        dummy.updateMatrix();
        
        this.humanMesh.setMatrixAt(i, dummy.matrix);
      }
      this.humanMesh.instanceMatrix.needsUpdate = true;
    } else if (this.humanMesh) {
      this.humanMesh.count = 0;
    }

    // 2. Update Vehicles (capped at 15% road density to prevent congestion)
    if (roadCells.length > 0 && this.vehicleMesh) {
      const numCars = Math.min(Math.floor(roadCells.length * 0.15), this.maxCars);
      this.vehicleMesh.count = numCars;

      for (let i = 0; i < numCars; i++) {
        const cellIdx = Math.floor((Math.sin(i * 43.1) * 0.5 + 0.5) * roadCells.length);
        const cell = roadCells[cellIdx];

        const speedFactor = performance.now() * 0.001 * (1 + (i % 3));
        const offsetDist = (speedFactor) % 1.0 - 0.5;
        
        let dx = 0;
        let dz = 0;
        
        const conn = cell.connections || {};
        if (conn.E || conn.W) {
          dx = offsetDist;
          dummy.rotation.set(0, 0, 0);
        } else {
          dz = offsetDist;
          dummy.rotation.set(0, Math.PI / 2, 0);
        }

        dummy.position.set(
          cell.x + offsetX + dx,
          cell.elevation * 0.2 + 0.1,
          cell.y + offsetZ + dz
        );
        dummy.scale.set(1.0, 1.0, 1.0);
        dummy.updateMatrix();

        this.vehicleMesh.setMatrixAt(i, dummy.matrix);
      }
      this.vehicleMesh.instanceMatrix.needsUpdate = true;
    } else if (this.vehicleMesh) {
      this.vehicleMesh.count = 0;
    }
  }

  setupEvents() {
    window.addEventListener('resize', () => {
      this.resize();
    });

    // Handle keypresses for ground view
    const onKeyDown = (e) => {
      if (!this.fpsCameraActive) return;
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.moveForward = true; break;
        case 'KeyS': case 'ArrowDown': this.moveBackward = true; break;
        case 'KeyA': case 'ArrowLeft': this.moveLeft = true; break;
        case 'KeyD': case 'ArrowRight': this.moveRight = true; break;
        case 'Space': this.jumpPressed = true; break;
      }
    };

    const onKeyUp = (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.moveForward = false; break;
        case 'KeyS': case 'ArrowDown': this.moveBackward = false; break;
        case 'KeyA': case 'ArrowLeft': this.moveLeft = false; break;
        case 'KeyD': case 'ArrowRight': this.moveRight = false; break;
        case 'Space': this.jumpPressed = false; break;
        case 'Escape':
          if (this.fpsCameraActive) this.exitFPSMode();
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Mouse drag rotation for FPS camera
    let isMouseDown = false;
    this.renderer.domElement.addEventListener('mousedown', () => {
      isMouseDown = true;
    });

    window.addEventListener('mouseup', () => {
      isMouseDown = false;
    });

    this.renderer.domElement.addEventListener('mousemove', (e) => {
      if (!this.fpsCameraActive || !isMouseDown) return;
      
      this.yaw += e.movementX * this.mouseSensitivity;
      this.pitch -= e.movementY * this.mouseSensitivity;
      
      // Clamp pitch to look vertical up/down
      this.pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this.pitch));
    });
  }

  isObstacle(c, r) {
    const state = store.getState();
    const grid = state.grid;
    if (!grid) return true;

    const w = state.gridWidth;
    const h = state.gridHeight;

    if (c < 0 || c >= w || r < 0 || r >= h) return true;

    const cell = grid[r][c];
    if (!cell) return true;

    // Developed cells with structures act as solid wall blocks
    const isDeveloped = cell.type.startsWith('RESIDENTIAL') || 
                        cell.type === 'COMMERCIAL' || 
                        cell.type === 'INDUSTRIAL' || 
                        cell.type === 'INSTITUTIONAL';
    if (isDeveloped && cell.density > 0) return true;

    // Water is impassable
    if (cell.type === 'WATER') return true;

    return false;
  }

  getElevationAt(c, r) {
    const state = store.getState();
    const grid = state.grid;
    if (!grid) return 0;

    const w = state.gridWidth;
    const h = state.gridHeight;

    if (c < 0 || c >= w || r < 0 || r >= h) return 0;

    const cell = grid[r][c];
    return cell ? cell.elevation * 0.2 + 0.05 : 0;
  }

  enterFPSMode() {
    this.fpsCameraActive = true;
    this.controls.enabled = false;
    
    const w = this.gridWidth || 50;
    const h = this.gridHeight || 50;
    const offsetX = -w / 2;
    const offsetZ = -h / 2;

    // Find safe start point starting from grid center in an outward spiral
    let startC = Math.floor(w / 2);
    let startR = Math.floor(h / 2);
    let safeC = startC;
    let safeR = startR;
    let found = false;

    const maxRadius = Math.max(w, h);
    outerLoop:
    for (let radius = 0; radius < maxRadius; radius++) {
      for (let dc = -radius; dc <= radius; dc++) {
        for (let dr = -radius; dr <= radius; dr++) {
          if (Math.abs(dc) === radius || Math.abs(dr) === radius) {
            const c = startC + dc;
            const r = startR + dr;
            if (c >= 0 && c < w && r >= 0 && r < h) {
              if (!this.isObstacle(c, r)) {
                safeC = c;
                safeR = r;
                found = true;
                break outerLoop;
              }
            }
          }
        }
      }
    }

    const posX = safeC + offsetX;
    const posZ = safeR + offsetZ;
    const groundY = this.getElevationAt(safeC, safeR);
    
    // Set position and orientation
    this.camera.position.set(posX, groundY + this.playerHeight, posZ);
    this.pitch = 0;
    this.yaw = -Math.PI / 2;
    
    // Reset velocities
    this.playerVelocityY = 0;
    this.isJumping = false;
    this.jumpPressed = false;
    this.lastTime = performance.now();

    document.getElementById('fps-instructions').classList.remove('hidden');
    store.updateState({ fpsControlsActive: true });
  }

  exitFPSMode() {
    this.fpsCameraActive = false;
    this.controls.enabled = true;
    
    // Restore cameras
    this.camera.position.set(50, 60, 80);
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    document.getElementById('fps-instructions').classList.add('hidden');
    store.updateState({ fpsControlsActive: false });
    
    // Toggle active classes on view buttons
    document.querySelectorAll('.view-mode-btn').forEach(btn => {
      btn.classList.remove('active');
      if (btn.getAttribute('data-view') === '3d') {
        btn.classList.add('active');
      }
    });
  }

  updateFPSNavigation() {
    if (!this.fpsCameraActive) return;

    // Framerate-independent time delta
    const time = performance.now();
    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    const speed = 4.0;
    
    // Compute direction vectors projected onto the horizontal X/Z plane
    const forwardVec = new THREE.Vector3(
      Math.cos(this.yaw),
      0,
      Math.sin(this.yaw)
    ).normalize();

    const rightVec = new THREE.Vector3(
      -Math.sin(this.yaw),
      0,
      Math.cos(this.yaw)
    ).normalize();

    let moveDir = new THREE.Vector3();
    if (this.moveForward) moveDir.add(forwardVec);
    if (this.moveBackward) moveDir.addScaledVector(forwardVec, -1);
    if (this.moveLeft) moveDir.addScaledVector(rightVec, -1);
    if (this.moveRight) moveDir.add(rightVec);
    moveDir.normalize();

    const velocityX = moveDir.x * speed;
    const velocityZ = moveDir.z * speed;

    let newX = this.camera.position.x + velocityX * dt;
    let newZ = this.camera.position.z + velocityZ * dt;

    const w = this.gridWidth || 50;
    const h = this.gridHeight || 50;
    const offsetX = -w / 2;
    const offsetZ = -h / 2;

    // Sliding collision resolution against surrounding grid cells (AABB vs Circle)
    const playerRadius = this.playerRadius;
    const checkRadius = 2;

    for (let iter = 0; iter < 2; iter++) {
      const currentC = Math.floor(newX - offsetX + 0.5);
      const currentR = Math.floor(newZ - offsetZ + 0.5);

      for (let dc = -checkRadius; dc <= checkRadius; dc++) {
        for (let dr = -checkRadius; dr <= checkRadius; dr++) {
          const c = currentC + dc;
          const r = currentR + dr;

          if (this.isObstacle(c, r)) {
            const cellCenterX = c + offsetX;
            const cellCenterZ = r + offsetZ;
            const minX = cellCenterX - 0.5;
            const maxX = cellCenterX + 0.5;
            const minZ = cellCenterZ - 0.5;
            const maxZ = cellCenterZ + 0.5;

            const closestX = Math.max(minX, Math.min(newX, maxX));
            const closestZ = Math.max(minZ, Math.min(newZ, maxZ));

            const dx = newX - closestX;
            const dz = newZ - closestZ;
            const distSq = dx * dx + dz * dz;

            if (distSq < playerRadius * playerRadius) {
              const dist = Math.sqrt(distSq);
              if (dist > 0.001) {
                const overlap = playerRadius - dist;
                newX += (dx / dist) * overlap;
                newZ += (dz / dist) * overlap;
              } else {
                const pX = newX - cellCenterX;
                const pZ = newZ - cellCenterZ;
                if (Math.abs(pX) > Math.abs(pZ)) {
                  newX += Math.sign(pX) * 0.05;
                } else {
                  newZ += Math.sign(pZ) * 0.05;
                }
              }
            }
          }
        }
      }
    }

    // Apply resolved position
    this.camera.position.x = newX;
    this.camera.position.z = newZ;

    // Bilinear ground height query for smooth elevation changes
    const playerC = this.camera.position.x - offsetX;
    const playerR = this.camera.position.z - offsetZ;

    const c0 = Math.floor(playerC);
    const c1 = Math.min(w - 1, c0 + 1);
    const r0 = Math.floor(playerR);
    const r1 = Math.min(h - 1, r0 + 1);

    const tx = playerC - c0;
    const tz = playerR - r0;

    const h00 = this.getElevationAt(c0, r0);
    const h10 = this.getElevationAt(c1, r0);
    const h01 = this.getElevationAt(c0, r1);
    const h11 = this.getElevationAt(c1, r1);

    const h0 = h00 * (1 - tx) + h10 * tx;
    const h1 = h01 * (1 - tx) + h11 * tx;
    const groundY = h0 * (1 - tz) + h1 * tz;

    const eyeY = groundY + this.playerHeight;

    // Gravity & Jump Physics
    if (!this.isJumping) {
      this.camera.position.y = eyeY;
      this.playerVelocityY = 0;
      if (this.jumpPressed) {
        this.playerVelocityY = this.jumpVelocity;
        this.isJumping = true;
      }
    } else {
      this.playerVelocityY -= this.gravity * dt;
      this.camera.position.y += this.playerVelocityY * dt;

      // Detect landing
      if (this.camera.position.y <= eyeY) {
        this.camera.position.y = eyeY;
        this.playerVelocityY = 0;
        this.isJumping = false;
      }
    }

    // Update look direction
    const lookTarget = new THREE.Vector3(
      this.camera.position.x + Math.cos(this.pitch) * Math.cos(this.yaw),
      this.camera.position.y + Math.sin(this.pitch),
      this.camera.position.z + Math.cos(this.pitch) * Math.sin(this.yaw)
    );
    this.camera.lookAt(lookTarget);
  }

  updateWeatherAnimation() {
    if (!this.weatherSystem) return;
    const positions = this.weatherGeometry.attributes.position.array;
    const velocities = this.weatherGeometry.userData.velocities;
    
    for (let i = 0; i < velocities.length; i++) {
      const idxY = i * 3 + 1;
      positions[idxY] += velocities[i];
      
      // Reset particle at top when it touches ground
      if (positions[idxY] < 0) {
        positions[idxY] = 80 + Math.random() * 20;
      }
    }
    this.weatherGeometry.attributes.position.needsUpdate = true;
  }

  updateProceduralAgentBouncing() {
    const time = performance.now() * 0.005;
    const dummy = new THREE.Object3D();

    // Animate Bouncing Pedestrians (Sin heaving)
    if (this.humanMesh && this.humanMesh.count > 0) {
      const count = this.humanMesh.count;
      for (let i = 0; i < count; i++) {
        const matrix = new THREE.Matrix4();
        this.humanMesh.getMatrixAt(i, matrix);
        
        const position = new THREE.Vector3();
        const rotation = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        matrix.decompose(position, rotation, scale);
        
        // Bounce offset relative to base height
        const baseHeight = (this.humanBaseHeights && this.humanBaseHeights[i]) !== undefined ? this.humanBaseHeights[i] : 0.15;
        position.y = baseHeight + (Math.sin(time + i) * 0.08);
        
        dummy.position.copy(position);
        dummy.quaternion.copy(rotation);
        dummy.scale.copy(scale);
        dummy.updateMatrix();
        this.humanMesh.setMatrixAt(i, dummy.matrix);
      }
      this.humanMesh.instanceMatrix.needsUpdate = true;
    }
  }

  // Removed heavy parametric facade geometry for rendering speed optimization

  updateLiveParameters() {
    const state = store.getState();
    if (!state || !state.params) return;
    const params = state.params;

    // 1. Environmental Regulations -> Fog/Smog and Skybox colors
    const envReg = params.environmentalReg; // [0, 100]
    
    // Clean navy-slate vs dirty brown smog
    const fogColor = new THREE.Color().lerpColors(
      new THREE.Color(0x282015), // low reg: brown smog
      new THREE.Color(0x101424), // high reg: clean slate-navy
      envReg / 100.0
    );
    
    const fogDensity = 0.025 - (envReg / 100.0) * 0.017;
    
    this.scene.fog.color.copy(fogColor);
    this.scene.fog.density = fogDensity;
    this.scene.background.copy(fogColor);
    this.renderer.setClearColor(fogColor);

    // Update skybox gradient shader
    this.scene.traverse(child => {
      if (child.geometry && child.geometry.type === 'SphereGeometry' && child.material && child.material.uniforms) {
        const topCol = new THREE.Color().lerpColors(
          new THREE.Color(0x1a1515), // dark red-grey smog sky
          new THREE.Color(0x0f172a), // deep slate blue sky
          envReg / 100.0
        );
        const bottomCol = new THREE.Color().lerpColors(
          new THREE.Color(0xb2592b), // dirty orange horizon
          new THREE.Color(0x3b82f6), // bright blue horizon
          envReg / 100.0
        );
        
        child.material.uniforms.topColor.value.copy(topCol);
        child.material.uniforms.bottomColor.value.copy(bottomCol);
      }
    });

    // 2. Tax Rate -> Building emissive window brightness
    const taxRate = params.taxRate; // [0, 50]
    if (this.buildingsMesh && this.buildingsMesh.material) {
      // Low tax: bright active cyan window glow; High tax: dim/vacant blue window glow
      const glowFactor = Math.max(0.01, (50 - taxRate) / 50.0);
      const emissiveR = glowFactor * 0.05;
      const emissiveG = glowFactor * 0.35;
      const emissiveB = glowFactor * 0.6;
      this.buildingsMesh.material.emissive.setRGB(emissiveR, emissiveG, emissiveB);
    }

    // 3. Green Protection -> Tree color
    const greenProt = params.greenProtection; // [0, 100]
    if (this.treesMesh && this.treesMesh.material) {
      const treeColor = new THREE.Color().lerpColors(
        new THREE.Color(0x854d0e), // dry brown
        new THREE.Color(0x15803d), // lush green
        greenProt / 100.0
      );
      this.treesMesh.material.color.copy(treeColor);
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    if (!this.renderingLoopActive) return;

    if (this.fpsCameraActive) {
      this.updateFPSNavigation();
    } else {
      this.controls.update();
    }

    // Live parameter rendering updates (60fps response)
    this.updateLiveParameters();

    // Tick animations
    this.updateWeatherAnimation();
    this.updateProceduralAgentBouncing();

    this.renderer.render(this.scene, this.camera);
  }
}
export default ThreeJSRenderer;

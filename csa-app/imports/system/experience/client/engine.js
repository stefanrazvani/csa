const QUALITY = Object.freeze({
  low: { pixelRatio: 1, particleFactor: 0.34, targetFps: 30 },
  balanced: { pixelRatio: 1.35, particleFactor: 0.68, targetFps: 45 },
  high: { pixelRatio: 1.8, particleFactor: 1, targetFps: 60 },
});

function bounded(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function vector3(THREE, value, fallback = [0, 0, 0]) {
  const source = Array.isArray(value) ? value : fallback;
  return new THREE.Vector3(
    bounded(source[0], fallback[0], -60, 60),
    bounded(source[1], fallback[1], -60, 60),
    bounded(source[2], fallback[2], -60, 60),
  );
}

function disposeTree(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root?.traverse?.((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const entries = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of entries) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value);
      }
    }
  });
  textures.forEach((texture) => texture.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true })
      || canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true });
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch (error) {
    return false;
  }
}

function makeGeometry(THREE, definition = {}) {
  const type = definition.type || 'octahedron';
  const segments = Math.round(bounded(definition.segments, 24, 4, 96));
  switch (type) {
    case 'box':
      return new THREE.BoxGeometry(
        bounded(definition.width, 1, 0.04, 20),
        bounded(definition.height, 1, 0.04, 20),
        bounded(definition.depth, 1, 0.04, 20),
      );
    case 'cone':
      return new THREE.ConeGeometry(
        bounded(definition.radius, 0.72, 0.04, 8),
        bounded(definition.height, 1.5, 0.04, 20),
        segments,
      );
    case 'cylinder':
      return new THREE.CylinderGeometry(
        bounded(definition.radiusTop, definition.radius || 0.72, 0.02, 8),
        bounded(definition.radiusBottom, definition.radius || 0.82, 0.02, 8),
        bounded(definition.height, 1, 0.04, 20),
        segments,
      );
    case 'dodecahedron':
      return new THREE.DodecahedronGeometry(
        bounded(definition.size, 0.75, 0.04, 8),
        Math.round(bounded(definition.detail, 0, 0, 2)),
      );
    case 'icosahedron':
      return new THREE.IcosahedronGeometry(
        bounded(definition.size, 0.75, 0.04, 8),
        Math.round(bounded(definition.detail, 0, 0, 2)),
      );
    case 'lathe': {
      // Profil de strung: perechi [rază, înălțime] rotite în jurul axei Y.
      const source = Array.isArray(definition.profile) && definition.profile.length >= 2
        ? definition.profile
        : [[0.4, 0], [0.5, 0.5]];
      const points = source.slice(0, 24).map((pair) => new THREE.Vector2(
        bounded(pair?.[0], 0.3, 0.01, 8),
        bounded(pair?.[1], 0, -8, 8),
      ));
      return new THREE.LatheGeometry(points, segments);
    }
    case 'leaf': {
      // Frunză de acant: siluetă lobată extrudată, cu vârful în sus și
      // aplecare opțională spre exterior (tilt) coaptă în geometrie.
      const width = bounded(definition.width, 0.12, 0.02, 4);
      const height = bounded(definition.height, 0.22, 0.04, 6);
      const depth = bounded(definition.depth, 0.02, 0.01, 1);
      const tilt = bounded(definition.tilt, 0, -1, 1);
      const half = width / 2;
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.bezierCurveTo(half * 0.9, height * 0.05, half, height * 0.3, half * 0.55, height * 0.42);
      shape.bezierCurveTo(half * 1.05, height * 0.45, half * 0.95, height * 0.68, half * 0.4, height * 0.72);
      shape.bezierCurveTo(half * 0.55, height * 0.8, half * 0.3, height * 0.95, 0, height);
      shape.bezierCurveTo(-half * 0.3, height * 0.95, -half * 0.55, height * 0.8, -half * 0.4, height * 0.72);
      shape.bezierCurveTo(-half * 0.95, height * 0.68, -half * 1.05, height * 0.45, -half * 0.55, height * 0.42);
      shape.bezierCurveTo(-half, height * 0.3, -half * 0.9, height * 0.05, 0, 0);
      const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
      geometry.translate(0, 0, -depth / 2);
      if (tilt) geometry.rotateX(tilt);
      return geometry;
    }
    case 'spiral': {
      // Volută: tub de-a lungul unei spirale arhimedice, în planul XY.
      const turns = bounded(definition.turns, 1.75, 0.5, 6);
      const startRadius = bounded(definition.radius, 0.055, 0.01, 8);
      const endRadius = bounded(definition.innerRadius, startRadius * 0.2, 0.002, 8);
      const tube = bounded(definition.tube, 0.015, 0.004, 2);
      const points = [];
      const steps = 64;
      for (let index = 0; index <= steps; index += 1) {
        const t = index / steps;
        const angle = t * turns * Math.PI * 2;
        const radius = startRadius + (endRadius - startRadius) * t;
        points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      return new THREE.TubeGeometry(curve, 72, tube, 8, false);
    }
    case 'sphere':
      return new THREE.SphereGeometry(bounded(definition.size, 0.75, 0.04, 8), segments, Math.max(6, Math.floor(segments / 2)));
    case 'star': {
      // Stea plată extrudată (Delta cu 3 vârfuri, steaua flamboyantă cu 5).
      // Primul vârf este orientat în sus; fața extrudată privește spre +Z.
      const points = Math.round(bounded(definition.points, 5, 3, 12));
      const outer = bounded(definition.radius, 0.8, 0.05, 8);
      const inner = bounded(definition.innerRadius, outer * 0.42, 0.02, 8);
      const depth = bounded(definition.depth, 0.12, 0.02, 4);
      const shape = new THREE.Shape();
      for (let index = 0; index < points * 2; index += 1) {
        const radius = index % 2 === 0 ? outer : inner;
        const angle = (index / (points * 2)) * Math.PI * 2 + Math.PI / 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (index === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      shape.closePath();
      const star = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
      star.translate(0, 0, -depth / 2);
      return star;
    }
    case 'torus':
      return new THREE.TorusGeometry(
        bounded(definition.radius, 0.72, 0.04, 8),
        bounded(definition.tube, 0.16, 0.01, 2),
        Math.max(6, Math.floor(segments / 2)),
        segments,
      );
    case 'torusKnot':
      return new THREE.TorusKnotGeometry(
        bounded(definition.radius, 0.72, 0.04, 8),
        bounded(definition.tube, 0.16, 0.01, 2),
        segments,
        Math.max(6, Math.floor(segments / 4)),
      );
    case 'octahedron':
    default:
      return new THREE.OctahedronGeometry(bounded(definition.size, 0.75, 0.04, 8), Math.round(bounded(definition.detail, 0, 0, 2)));
  }
}

// Texturi procedurale echirectangulare pentru Sfera Terestră (Boaz) și Sfera
// Celestă (Jachin). Deterministe (fără Math.random), desenate pe canvas.
function globeTexture(THREE, kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const seeded = (index) => {
    const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  if (kind === 'terrestrial') {
    context.fillStyle = '#1d4d76';
    context.fillRect(0, 0, width, height);
    // Mase continentale stilizate (Americi, Europa, Africa, Asia, Australia).
    const landmasses = [
      [0.13, 0.30, 0.05, 0.09, 0.5], [0.16, 0.44, 0.028, 0.05, 0.2], [0.19, 0.62, 0.036, 0.11, -0.15],
      [0.36, 0.15, 0.03, 0.04, 0], [0.475, 0.28, 0.036, 0.05, 0.3], [0.505, 0.48, 0.052, 0.12, 0.05],
      [0.60, 0.27, 0.10, 0.08, 0.1], [0.68, 0.43, 0.04, 0.055, 0.4], [0.785, 0.65, 0.042, 0.045, 0.15],
    ];
    for (const [x, y, radiusX, radiusY, tilt] of landmasses) {
      context.fillStyle = '#54793f';
      context.beginPath();
      context.ellipse(x * width, y * height, radiusX * width, radiusY * height, tilt, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#6e8a4a';
      context.beginPath();
      context.ellipse((x - 0.008) * width, (y - 0.02) * height, radiusX * width * 0.6, radiusY * height * 0.55, tilt, 0, Math.PI * 2);
      context.fill();
    }
    // Calote polare.
    context.fillStyle = 'rgba(234, 240, 244, 0.9)';
    context.fillRect(0, 0, width, height * 0.05);
    context.fillRect(0, height * 0.95, width, height * 0.05);
    // Caroiaj auriu de glob cartografic.
    context.strokeStyle = 'rgba(216, 186, 118, 0.4)';
    context.lineWidth = 1;
    for (let index = 1; index < 8; index += 1) {
      context.beginPath();
      context.moveTo((width * index) / 8, 0);
      context.lineTo((width * index) / 8, height);
      context.stroke();
    }
    for (let index = 1; index < 4; index += 1) {
      context.beginPath();
      context.moveTo(0, (height * index) / 4);
      context.lineTo(width, (height * index) / 4);
      context.stroke();
    }
  } else {
    context.fillStyle = '#0b1d3f';
    context.fillRect(0, 0, width, height);
    // Câmp de stele determinist.
    context.fillStyle = '#e9eefb';
    for (let index = 0; index < 170; index += 1) {
      const x = seeded(index) * width;
      const y = seeded(index + 500) * height;
      const radius = 0.4 + seeded(index + 900) * 1.2;
      context.globalAlpha = 0.45 + seeded(index + 300) * 0.55;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    // Constelații: linii care leagă stele mai strălucitoare.
    context.strokeStyle = 'rgba(190, 206, 240, 0.55)';
    context.lineWidth = 1;
    for (let group = 0; group < 6; group += 1) {
      let x = (0.08 + seeded(group * 17 + 3) * 0.84) * width;
      let y = (0.15 + seeded(group * 29 + 7) * 0.7) * height;
      context.beginPath();
      context.moveTo(x, y);
      for (let segment = 0; segment < 4; segment += 1) {
        context.fillStyle = '#f4f6fd';
        context.beginPath();
        context.arc(x, y, 1.7, 0, Math.PI * 2);
        context.fill();
        x += (seeded(group * 31 + segment * 13 + 1) - 0.5) * 0.12 * width;
        y += (seeded(group * 37 + segment * 11 + 5) - 0.5) * 0.2 * height;
        context.lineTo(x, y);
      }
      context.stroke();
    }
    // Banda eclipticii, aurie, ondulată.
    context.strokeStyle = 'rgba(216, 186, 118, 0.45)';
    context.lineWidth = 1.4;
    context.beginPath();
    for (let x = 0; x <= width; x += 4) {
      const y = height / 2 + Math.sin((x / width) * Math.PI * 2) * height * 0.18;
      if (x === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeMaterial(THREE, definition = {}, fallback = '#6f7c82') {
  const opacity = bounded(definition.opacity, 1, 0.08, 1);
  const material = new THREE.MeshStandardMaterial({
    color: definition.color || fallback,
    emissive: definition.emissive || '#000000',
    emissiveIntensity: bounded(definition.emissiveIntensity, 0, 0, 4),
    roughness: bounded(definition.roughness, 0.78, 0, 1),
    metalness: bounded(definition.metalness, 0.05, 0, 1),
    transparent: opacity < 1,
    opacity,
  });
  if (definition.map === 'terrestrial' || definition.map === 'celestial') {
    const texture = globeTexture(THREE, definition.map);
    material.map = texture;
    // Textura este folosită și ca emissiveMap: sferele rămân lizibile în
    // lumina scăzută a templului, fără o sursă de lumină dedicată.
    material.emissiveMap = texture;
  }
  material.userData.baseEmissiveIntensity = material.emissiveIntensity;
  return material;
}

class ExperienceRenderer {
  constructor(THREE, mount, manifest, options = {}) {
    this.THREE = THREE;
    this.mount = mount;
    this.manifest = manifest;
    this.onActivate = options.onActivate || (() => {});
    this.onReady = options.onReady || (() => {});
    this.reducedMotion = options.reducedMotion === true;
    this.mobile = options.mobile === true;
    this.quality = QUALITY[options.quality] ? options.quality : 'balanced';
    this.phase = 'gate';
    this.disposed = false;
    this.visible = document.visibilityState !== 'hidden';
    this.interactiveMeshes = [];
    this.interactiveGroups = new Map();
    this.pointer = new THREE.Vector2(20, 20);
    this.pointerDrift = new THREE.Vector2(0, 0);
    this.pointerDown = null;
    // Privirea liberă: tragerea cu mouse-ul sau cu degetul rotește camera.
    this.orbitYaw = 0;
    this.orbitPitch = 0;
    this.orbitTargetYaw = 0;
    this.orbitTargetPitch = 0;
    this.lookDirection = new THREE.Vector3();
    this.lookRight = new THREE.Vector3();
    this.lookUp = new THREE.Vector3(0, 1, 0);
    this.raycaster = new THREE.Raycaster();
    this.lastFrame = 0;
    this.elapsed = 0;
    this.opening = null;
    this.selectedId = '';

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 140);
    this.renderer = new THREE.WebGLRenderer({ antialias: this.quality !== 'low', alpha: false, powerPreference: this.quality === 'low' ? 'low-power' : 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = false;
    this.renderer.domElement.className = 'csa-xp-canvas';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.renderer.domElement.style.touchAction = 'none';
    this.mount.replaceChildren(this.renderer.domElement);

    this.stage = new THREE.Group();
    this.scene.add(this.stage);
    this.clockTarget = new THREE.Vector3(0, 1.6, -2);
    this.baseCamera = new THREE.Vector3(0, 3, 12);
    this.keyLight = null;
    this.motes = null;

    this.boundPointerDown = (event) => this.handlePointerDown(event);
    this.boundPointerMove = (event) => this.handlePointerMove(event);
    this.boundPointerUp = (event) => this.handlePointerUp(event);
    this.boundPointerLeave = () => this.clearHover();
    this.boundVisibility = () => this.handleVisibility();
    this.boundFrame = (time) => this.frame(time);
    this.renderer.domElement.addEventListener('pointerdown', this.boundPointerDown, { passive: true });
    this.renderer.domElement.addEventListener('pointermove', this.boundPointerMove, { passive: true });
    this.renderer.domElement.addEventListener('pointerup', this.boundPointerUp, { passive: true });
    this.renderer.domElement.addEventListener('pointercancel', this.boundPointerLeave, { passive: true });
    this.renderer.domElement.addEventListener('pointerleave', this.boundPointerLeave, { passive: true });
    document.addEventListener('visibilitychange', this.boundVisibility);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.mount);

    this.setQuality(this.quality);
    this.buildGate();
    this.resize();
    this.animationFrame = requestAnimationFrame(this.boundFrame);
    this.onReady();
  }

  setQuality(name) {
    if (!QUALITY[name] || this.disposed) return;
    this.quality = name;
    const tier = QUALITY[name];
    const deviceRatio = window.devicePixelRatio || 1;
    const mobileCap = this.mobile ? 1.25 : tier.pixelRatio;
    this.renderer.setPixelRatio(Math.min(deviceRatio, tier.pixelRatio, mobileCap));
    if (this.motes?.geometry) {
      const available = this.motes.geometry.getAttribute('position')?.count || 0;
      const particleFactor = this.mobile ? Math.min(0.5, tier.particleFactor) : tier.particleFactor;
      this.motes.geometry.setDrawRange(0, Math.max(0, Math.floor(available * particleFactor)));
    }
    this.resize();
  }

  resize() {
    if (this.disposed) return;
    const width = Math.max(1, this.mount.clientWidth || 1);
    const height = Math.max(1, this.mount.clientHeight || 1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = width < 560 ? 50 : 42;
    this.camera.updateProjectionMatrix();
  }

  clearStage() {
    disposeTree(this.stage);
    this.scene.remove(this.stage);
    this.stage = new this.THREE.Group();
    this.scene.add(this.stage);
    this.interactiveMeshes = [];
    this.interactiveGroups.clear();
    this.motes = null;
    this.keyLight = null;
  }

  configureEnvironment(environment, gate = false) {
    const THREE = this.THREE;
    const background = gate ? '#02060a' : environment.background;
    const fog = gate ? '#071019' : environment.fog;
    this.scene.background = new THREE.Color(background);
    this.scene.fog = new THREE.Fog(fog, gate ? 7 : environment.fogNear, gate ? 31 : environment.fogFar);

    const ambient = new THREE.HemisphereLight(
      gate ? '#70899a' : environment.ambient,
      gate ? '#070b0f' : '#05080c',
      gate ? 0.42 : environment.ambientIntensity,
    );
    this.stage.add(ambient);
    this.keyLight = new THREE.DirectionalLight(gate ? '#f0d38b' : environment.keyLight, gate ? 2.6 : environment.keyIntensity);
    this.keyLight.position.copy(vector3(THREE, gate ? [-3, 7, 5] : environment.keyPosition));
    this.stage.add(this.keyLight);

    this.baseCamera.copy(vector3(THREE, gate ? [0, 3.1, 12] : environment.camera));
    this.camera.position.copy(this.baseCamera);
    this.clockTarget.copy(vector3(THREE, gate ? [0, 2.05, -1.3] : environment.target));
    this.camera.lookAt(this.clockTarget);
  }

  buildGate() {
    const THREE = this.THREE;
    this.phase = 'gate';
    this.clearStage();
    this.configureEnvironment(this.manifest.environment, true);

    const stone = new THREE.MeshStandardMaterial({ color: '#253038', roughness: 0.93, metalness: 0.02 });
    const gold = new THREE.MeshStandardMaterial({ color: '#bca35f', roughness: 0.36, metalness: 0.72, emissive: '#4b3912', emissiveIntensity: 0.34 });
    const doorMaterial = new THREE.MeshStandardMaterial({ color: '#17252c', roughness: 0.72, metalness: 0.18, emissive: '#061015', emissiveIntensity: 0.1 });
    const postGeometry = new THREE.BoxGeometry(0.82, 6.5, 0.92);
    for (const x of [-4.55, 4.55]) {
      const post = new THREE.Mesh(postGeometry.clone(), stone.clone());
      post.position.set(x, 3.25, -1.7);
      this.stage.add(post);
      const capital = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.42, 1.25), stone.clone());
      capital.position.set(x, 6.25, -1.7);
      this.stage.add(capital);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(9.9, 0.72, 1.1), stone);
    lintel.position.set(0, 6.5, -1.7);
    this.stage.add(lintel);
    const pediment = new THREE.Mesh(new THREE.ConeGeometry(3.3, 1.65, 3), stone.clone());
    pediment.position.set(0, 7.55, -1.72);
    pediment.rotation.z = Math.PI;
    this.stage.add(pediment);

    this.leftHinge = new THREE.Group();
    this.rightHinge = new THREE.Group();
    this.leftHinge.position.set(-4.05, 3.15, -1.35);
    this.rightHinge.position.set(4.05, 3.15, -1.35);
    const doorGeometry = new THREE.BoxGeometry(4.04, 5.7, 0.45);
    const leftDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    const rightDoor = new THREE.Mesh(doorGeometry.clone(), doorMaterial.clone());
    leftDoor.position.x = 2.02;
    rightDoor.position.x = -2.02;
    this.leftHinge.add(leftDoor);
    this.rightHinge.add(rightDoor);
    this.stage.add(this.leftHinge, this.rightHinge);

    for (const door of [leftDoor, rightDoor]) {
      door.userData.interaction = { type: 'gate', id: 'gate' };
      this.interactiveMeshes.push(door);
      const inset = new THREE.Mesh(new THREE.BoxGeometry(2.95, 4.55, 0.08), gold.clone());
      inset.position.z = 0.25;
      door.add(inset);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(2.7, 4.3, 0.1), doorMaterial.clone());
      panel.position.z = 0.32;
      door.add(panel);
    }

    this.knocker = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.085, 10, 32), gold);
    this.knocker.position.set(0, 2.8, -0.72);
    this.knocker.userData.interaction = { type: 'gate', id: 'gate-knocker' };
    this.interactiveMeshes.push(this.knocker);
    this.stage.add(this.knocker);
    this.knockLight = new THREE.PointLight('#efcc70', 0, 7, 2);
    this.knockLight.position.set(0, 2.8, 0.2);
    this.stage.add(this.knockLight);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: '#070d11', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    this.stage.add(ground);
    const guide = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 10), new THREE.MeshBasicMaterial({ color: '#7f6d3a', transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
    guide.rotation.x = -Math.PI / 2;
    guide.position.set(0, 0.015, 3.2);
    this.stage.add(guide);
    this.addMotes({ count: 55, color: '#d5c080', spread: [17, 10, 22] });
  }

  addMotes(definition) {
    const THREE = this.THREE;
    const count = Math.round(bounded(definition.count, 48, 0, 240));
    if (!count) return;
    const spread = Array.isArray(definition.spread) ? definition.spread : [16, 9, 20];
    const positions = new Float32Array(count * 3);
    const seed = (index) => {
      const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
      return value - Math.floor(value);
    };
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = (seed(index * 3) - 0.5) * spread[0];
      positions[index * 3 + 1] = seed(index * 3 + 1) * spread[1] + 0.4;
      positions[index * 3 + 2] = (seed(index * 3 + 2) - 0.5) * spread[2] - 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: definition.color, size: this.mobile ? 0.035 : 0.048, transparent: true, opacity: 0.62, depthWrite: false });
    this.motes = new THREE.Points(geometry, material);
    this.stage.add(this.motes);
    this.setQuality(this.quality);
  }

  createFloor(definition) {
    const THREE = this.THREE;
    const floorGroup = new THREE.Group();
    if (definition.type === 'lodge') {
      // Pardoseala templului: piatră întunecată cu pavajul mozaicat central
      // și bordura dantelată, conform planșei lucrărilor.
      const base = new THREE.Mesh(
        new THREE.PlaneGeometry(definition.width, definition.depth),
        new THREE.MeshStandardMaterial({ color: definition.color, roughness: 0.96, metalness: 0.02 }),
      );
      base.rotation.x = -Math.PI / 2;
      floorGroup.add(base);
      const carpet = definition.carpet;
      const tileWidth = carpet.width / carpet.tilesX;
      const tileDepth = carpet.depth / carpet.tilesZ;
      const tileGeometry = new THREE.PlaneGeometry(tileWidth, tileDepth);
      const tileMaterials = carpet.colors.map((entry) => new THREE.MeshStandardMaterial({ color: entry, roughness: 0.88, metalness: 0.02 }));
      for (let x = 0; x < carpet.tilesX; x += 1) {
        for (let z = 0; z < carpet.tilesZ; z += 1) {
          const tile = new THREE.Mesh(tileGeometry, tileMaterials[(x + z) % 2]);
          tile.rotation.x = -Math.PI / 2;
          tile.position.set(
            (x + 0.5) * tileWidth - carpet.width / 2,
            0.015,
            carpet.z + (z + 0.5) * tileDepth - carpet.depth / 2,
          );
          floorGroup.add(tile);
        }
      }
      const borderMaterial = new THREE.MeshStandardMaterial({
        color: carpet.border, roughness: 0.5, metalness: 0.4,
        emissive: carpet.border, emissiveIntensity: 0.08,
      });
      const borderWidth = carpet.width + 0.34;
      const borderDepth = carpet.depth + 0.34;
      const strips = [
        [0, carpet.z - borderDepth / 2, borderWidth, 0.17],
        [0, carpet.z + borderDepth / 2, borderWidth, 0.17],
        [-borderWidth / 2, carpet.z, 0.17, borderDepth],
        [borderWidth / 2, carpet.z, 0.17, borderDepth],
      ];
      for (const [stripX, stripZ, stripWidth, stripDepth] of strips) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(stripWidth, 0.02, stripDepth), borderMaterial);
        strip.position.set(stripX, 0.02, stripZ);
        floorGroup.add(strip);
      }
      this.stage.add(floorGroup);
      return;
    }
    if (definition.type === 'checker') {
      const tileWidth = definition.width / definition.tilesX;
      const tileDepth = definition.depth / definition.tilesZ;
      const geometry = new THREE.PlaneGeometry(tileWidth, tileDepth);
      const materials = definition.colors.map((entry) => new THREE.MeshStandardMaterial({ color: entry, roughness: 0.93, metalness: 0.01 }));
      for (let x = 0; x < definition.tilesX; x += 1) {
        for (let z = 0; z < definition.tilesZ; z += 1) {
          const tile = new THREE.Mesh(geometry, materials[(x + z) % 2]);
          tile.rotation.x = -Math.PI / 2;
          tile.position.set((x + 0.5) * tileWidth - definition.width / 2, 0, (z + 0.5) * tileDepth - definition.depth / 2 - 1.5);
          floorGroup.add(tile);
        }
      }
    } else {
      const geometry = definition.type === 'disc' || definition.type === 'polygon'
        ? new THREE.CircleGeometry(definition.radius, definition.type === 'polygon' ? definition.sides : 64)
        : new THREE.PlaneGeometry(definition.width, definition.depth);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: definition.color, roughness: 0.95, metalness: 0.02, side: THREE.DoubleSide }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.z = definition.type === 'plane' ? -1.5 : -2.8;
      floorGroup.add(mesh);
      if (definition.grid) {
        const size = definition.type === 'plane' ? Math.max(definition.width, definition.depth) : definition.radius * 2;
        const grid = new THREE.GridHelper(size, this.quality === 'low' ? 10 : 20, definition.grid, definition.grid);
        grid.position.set(0, 0.012, mesh.position.z);
        grid.material.transparent = true;
        grid.material.opacity = 0.25;
        floorGroup.add(grid);
      }
    }
    this.stage.add(floorGroup);
  }

  createArchitecture(item) {
    const THREE = this.THREE;
    const mesh = new THREE.Mesh(makeGeometry(THREE, item.geometry), makeMaterial(THREE, item.material));
    mesh.position.copy(vector3(THREE, item.position));
    mesh.rotation.set(...item.rotation);
    mesh.scale.set(...item.scale);
    this.stage.add(mesh);
  }

  createInteractive(item, index) {
    // Reperele cu prezentare 'list' rămân numai în navigatorul semantic.
    if (item.presentation === 'list') return;
    const THREE = this.THREE;
    const group = new THREE.Group();
    group.position.copy(vector3(THREE, item.position));
    group.userData.baseY = group.position.y;
    group.userData.floatOffset = index * 0.71;
    const material = makeMaterial(THREE, {
      color: item.color,
      emissive: item.color,
      emissiveIntensity: 0.18,
      roughness: item.kind === 'office' ? 0.42 : 0.58,
      metalness: item.kind === 'office' ? 0.48 : 0.22,
    }, item.color);
    const mesh = new THREE.Mesh(makeGeometry(THREE, item.geometry), material);
    mesh.userData.interaction = { type: 'item', item };
    group.add(mesh);
    this.interactiveMeshes.push(mesh);

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(Math.max(0.6, item.geometry.radius || item.geometry.size || 0.75) * 1.38, 0.025, 8, this.quality === 'low' ? 24 : 48),
      new THREE.MeshBasicMaterial({ color: item.haloColor, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -Math.max(0.52, (item.geometry.height || item.geometry.size || 0.8) * 0.72);
    group.add(halo);
    group.userData.mesh = mesh;
    group.userData.halo = halo;
    this.interactiveGroups.set(item.id, group);
    this.stage.add(group);
  }

  showAtrium({ immediate = false } = {}) {
    if (this.disposed) return;
    if (immediate || this.reducedMotion) {
      this.buildAtrium();
      return;
    }
    return this.enterAtrium();
  }

  enterAtrium({ immediate = false } = {}) {
    if (this.disposed || this.phase === 'atrium') return Promise.resolve();
    if (immediate || this.reducedMotion) {
      this.buildAtrium();
      return Promise.resolve();
    }
    if (this.opening?.promise) return this.opening.promise;
    this.phase = 'opening';
    let resolveTransition;
    const promise = new Promise((resolve) => { resolveTransition = resolve; });
    this.opening = { startedAt: performance.now(), duration: 1450, resolve: resolveTransition, promise };
    return promise;
  }

  buildAtrium() {
    const THREE = this.THREE;
    const environment = this.manifest.environment;
    const pending = this.opening;
    this.opening = null;
    this.phase = 'atrium';
    this.orbitYaw = 0;
    this.orbitPitch = 0;
    this.orbitTargetYaw = 0;
    this.orbitTargetPitch = 0;
    this.clearStage();
    this.configureEnvironment(environment, false);
    this.createFloor(environment.floor);
    this.manifest.architecture.forEach((item) => this.createArchitecture(item));
    this.manifest.interactives.forEach((item, index) => this.createInteractive(item, index));
    this.addMotes(environment.motes);

    const fill = new THREE.DirectionalLight('#4c82a4', 0.72);
    fill.position.set(-8, 4, 7);
    this.stage.add(fill);
    const eastGlow = new THREE.PointLight(environment.keyLight, this.quality === 'low' ? 1.1 : 1.75, 18, 2);
    eastGlow.position.set(0, 5.5, -7);
    this.stage.add(eastGlow);
    pending?.resolve?.();
  }

  registerKnock(count) {
    if (this.disposed || this.phase !== 'gate') return;
    this.knockPulseUntil = performance.now() + 420;
    if (this.knocker) {
      this.knocker.userData.pulseStart = performance.now();
      this.knocker.userData.knockCount = count;
    }
  }

  selectInteraction(id) {
    this.selectedId = id || '';
    for (const [itemId, group] of this.interactiveGroups.entries()) {
      const selected = itemId === this.selectedId;
      const material = group.userData.mesh?.material;
      if (material) material.emissiveIntensity = selected ? 0.82 : material.userData.baseEmissiveIntensity;
      if (group.userData.halo?.material) group.userData.halo.material.opacity = selected ? 0.8 : 0.28;
      group.scale.setScalar(selected ? 1.09 : 1);
    }
  }

  pointerCoordinates(event) {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1,
      y: -((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 2 + 1,
    };
  }

  pick(event) {
    const point = this.pointerCoordinates(event);
    this.pointer.set(point.x, point.y);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(this.interactiveMeshes, false)[0]?.object?.userData?.interaction || null;
  }

  handlePointerDown(event) {
    this.pointerDown = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      startYaw: this.orbitTargetYaw,
      startPitch: this.orbitTargetPitch,
    };
  }

  handlePointerMove(event) {
    const point = this.pointerCoordinates(event);
    this.pointerDrift.set(point.x, point.y);
    const drag = this.pointerDown;
    if (drag && drag.pointerId === event.pointerId && this.phase === 'atrium') {
      const deltaX = event.clientX - drag.x;
      const deltaY = event.clientY - drag.y;
      this.orbitTargetYaw = Math.max(-1.35, Math.min(1.35, drag.startYaw + deltaX * 0.0042));
      this.orbitTargetPitch = Math.max(-0.32, Math.min(0.44, drag.startPitch + deltaY * 0.0028));
      return;
    }
    if (this.mobile || event.pointerType === 'touch') return;
    const interaction = this.pick(event);
    this.renderer.domElement.classList.toggle('is-interactive', Boolean(interaction));
  }

  handlePointerUp(event) {
    const start = this.pointerDown;
    this.pointerDown = null;
    if (!start || start.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 9) return;
    const interaction = this.pick(event);
    if (interaction) this.onActivate(interaction);
  }

  clearHover() {
    this.pointerDown = null;
    this.renderer?.domElement?.classList.remove('is-interactive');
  }

  handleVisibility() {
    this.visible = document.visibilityState !== 'hidden';
    if (this.visible && !this.animationFrame && !this.disposed) {
      this.lastFrame = performance.now();
      this.animationFrame = requestAnimationFrame(this.boundFrame);
    }
  }

  updateOpening(time) {
    if (!this.opening) return;
    const linear = Math.min(1, (time - this.opening.startedAt) / this.opening.duration);
    const eased = 1 - ((1 - linear) ** 3);
    if (this.leftHinge) this.leftHinge.rotation.y = -eased * 1.42;
    if (this.rightHinge) this.rightHinge.rotation.y = eased * 1.42;
    this.camera.position.z = 12 - eased * 7.2;
    this.camera.position.y = 3.1 + eased * 0.55;
    this.camera.lookAt(this.clockTarget);
    if (linear >= 1) this.buildAtrium();
  }

  updateGate(time) {
    if (this.knockLight) {
      const remaining = Math.max(0, (this.knockPulseUntil || 0) - time);
      this.knockLight.intensity = remaining ? 4.8 * (remaining / 420) : 0;
    }
    if (this.knocker?.userData?.pulseStart) {
      const progress = Math.min(1, (time - this.knocker.userData.pulseStart) / 420);
      const scale = 1 + Math.sin(progress * Math.PI) * 0.24;
      this.knocker.scale.setScalar(scale);
      if (progress >= 1) this.knocker.userData.pulseStart = 0;
    }
  }

  applyOrbitLook() {
    this.orbitYaw += (this.orbitTargetYaw - this.orbitYaw) * 0.16;
    this.orbitPitch += (this.orbitTargetPitch - this.orbitPitch) * 0.16;
    this.lookDirection.subVectors(this.clockTarget, this.camera.position);
    this.lookDirection.applyAxisAngle(this.lookUp, this.orbitYaw);
    this.lookRight.crossVectors(this.lookDirection, this.lookUp).normalize();
    this.lookDirection.applyAxisAngle(this.lookRight, this.orbitPitch);
    this.lookDirection.add(this.camera.position);
    this.camera.lookAt(this.lookDirection);
  }

  updateAtrium(time, delta) {
    if (!this.reducedMotion) {
      for (const group of this.interactiveGroups.values()) {
        const selectedBoost = group === this.interactiveGroups.get(this.selectedId) ? 0.035 : 0;
        group.position.y = group.userData.baseY + Math.sin(time * 0.0007 + group.userData.floatOffset) * (0.055 + selectedBoost);
        group.rotation.y += delta * 0.08;
      }
      if (this.motes) this.motes.rotation.y += delta * 0.008;
      const driftScale = this.mobile ? 0.08 : 0.22;
      this.camera.position.x += ((this.baseCamera.x + this.pointerDrift.x * driftScale) - this.camera.position.x) * 0.035;
      this.camera.position.y += ((this.baseCamera.y + this.pointerDrift.y * driftScale * 0.45) - this.camera.position.y) * 0.035;
    }
    // Privirea trasă cu mouse-ul sau cu degetul rămâne activă și cu
    // prefers-reduced-motion: este o mișcare inițiată explicit de utilizator.
    this.applyOrbitLook();
  }

  frame(time) {
    this.animationFrame = null;
    if (this.disposed || !this.visible) return;
    const tier = QUALITY[this.quality];
    const targetFps = this.mobile ? 30 : tier.targetFps;
    const interval = 1000 / targetFps;
    if (time - this.lastFrame >= interval) {
      const delta = Math.min(0.1, (time - (this.lastFrame || time)) / 1000);
      this.lastFrame = time;
      this.elapsed += delta;
      if (this.phase === 'gate') this.updateGate(time);
      if (this.phase === 'opening') this.updateOpening(time);
      if (this.phase === 'atrium') this.updateAtrium(time, delta);
      this.renderer.render(this.scene, this.camera);
    }
    this.animationFrame = requestAnimationFrame(this.boundFrame);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    this.resizeObserver?.disconnect();
    document.removeEventListener('visibilitychange', this.boundVisibility);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.boundPointerDown);
    canvas.removeEventListener('pointermove', this.boundPointerMove);
    canvas.removeEventListener('pointerup', this.boundPointerUp);
    canvas.removeEventListener('pointercancel', this.boundPointerLeave);
    canvas.removeEventListener('pointerleave', this.boundPointerLeave);
    const pending = this.opening;
    this.opening = null;
    pending?.resolve?.();
    disposeTree(this.scene);
    this.renderer.renderLists?.dispose?.();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    canvas.remove();
    this.scene.clear();
    this.interactiveMeshes = [];
    this.interactiveGroups.clear();
  }
}

export async function createExperienceRenderer(mount, manifest, options = {}) {
  if (!mount || !webglAvailable()) throw new Error('webgl-unavailable');
  const THREE = await import('three');
  return new ExperienceRenderer(THREE, mount, manifest, options);
}

export { webglAvailable };

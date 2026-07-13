const GEOMETRY_TYPES = new Set([
  'box',
  'cone',
  'cylinder',
  'dodecahedron',
  'icosahedron',
  'octahedron',
  'sphere',
  'star',
  'torus',
  'torusKnot',
]);

const FLOOR_TYPES = new Set(['plane', 'checker', 'disc', 'polygon', 'lodge']);

function text(value, fallback = '', maximum = 320) {
  if (typeof value !== 'string') return fallback;
  const result = value.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  return result ? result.slice(0, maximum) : fallback;
}

function identifier(value, fallback) {
  return text(value, fallback, 80).toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-');
}

function number(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function vector(value, fallback, minimum = -40, maximum = 40) {
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  return [
    number(value[0], fallback[0], minimum, maximum),
    number(value[1], fallback[1], minimum, maximum),
    number(value[2], fallback[2], minimum, maximum),
  ];
}

function color(value, fallback) {
  const normalized = text(value, '', 16);
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : fallback;
}

function route(value, fallback = '/') {
  const normalized = text(value, '', 180);
  if (!/^\/[a-z0-9/_-]*$/i.test(normalized) || normalized.startsWith('//')) return fallback;
  return normalized;
}

function geometry(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const type = GEOMETRY_TYPES.has(source.type) ? source.type : 'octahedron';
  return {
    type,
    size: number(source.size, 0.75, 0.08, 8),
    width: number(source.width, 1, 0.08, 20),
    height: number(source.height, 1, 0.08, 20),
    depth: number(source.depth, 1, 0.08, 20),
    radius: number(source.radius, 0.72, 0.05, 8),
    radiusTop: number(source.radiusTop, 0.72, 0.02, 8),
    radiusBottom: number(source.radiusBottom, 0.82, 0.02, 8),
    tube: number(source.tube, 0.16, 0.015, 2),
    segments: Math.round(number(source.segments, 24, 4, 96)),
    detail: Math.round(number(source.detail, 0, 0, 2)),
    points: Math.round(number(source.points, 5, 3, 12)),
    innerRadius: number(source.innerRadius, 0.32, 0.02, 8),
  };
}

function material(value = {}, fallback = '#6f7c82') {
  const source = value && typeof value === 'object' ? value : {};
  return {
    color: color(source.color, fallback),
    emissive: color(source.emissive, '#000000'),
    emissiveIntensity: number(source.emissiveIntensity, 0, 0, 4),
    roughness: number(source.roughness, 0.78, 0, 1),
    metalness: number(source.metalness, 0.05, 0, 1),
    opacity: number(source.opacity, 1, 0.08, 1),
  };
}

function architectureItem(value, index) {
  if (!value || typeof value !== 'object') return null;
  return {
    id: identifier(value.id, `architecture-${index}`),
    geometry: geometry(value.geometry),
    position: vector(value.position, [0, 0, -5]),
    rotation: vector(value.rotation, [0, 0, 0], -Math.PI * 2, Math.PI * 2),
    scale: vector(value.scale, [1, 1, 1], 0.02, 40),
    material: material(value.material),
  };
}

function education(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    objective: text(source.objective, 'Descoperire ghidată', 140),
    prompt: text(source.prompt, 'Ce observi și cum poți verifica această observație?', 420),
    steps: Array.isArray(source.steps)
      ? source.steps.slice(0, 6).map((step) => text(step, '', 220)).filter(Boolean)
      : [],
  };
}

function interactiveItem(value, index) {
  if (!value || typeof value !== 'object') return null;
  const label = text(value.label || value.title, '', 120);
  if (!label) return null;
  return {
    id: identifier(value.id || value.key, `interactive-${index}`),
    kind: identifier(value.kind, 'symbol'),
    label,
    description: text(value.description, 'Reper interactiv disponibil în contextul tău.', 520),
    position: vector(value.position, [0, 0.8, -2]),
    geometry: geometry(value.geometry),
    route: route(value.route || value.path),
    actionLabel: text(value.actionLabel, 'Descoperă', 80),
    color: color(value.color, '#d8bd72'),
    haloColor: color(value.haloColor, '#f7e3a6'),
    education: education(value.education || value.learning),
    sourceRef: text(value.sourceRef, '', 140),
    presentation: value.presentation === 'list' ? 'list' : 'scene',
  };
}

function carpet(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    width: number(source.width, 3.9, 1, 12),
    depth: number(source.depth, 5.8, 1, 16),
    tilesX: Math.round(number(source.tilesX, 6, 2, 16)),
    tilesZ: Math.round(number(source.tilesZ, 9, 2, 24)),
    z: number(source.z, -2, -12, 12),
    colors: Array.isArray(source.colors)
      ? [color(source.colors[0], '#e6dcc3'), color(source.colors[1], '#10181f')]
      : ['#e6dcc3', '#10181f'],
    border: color(source.border, '#c2a05a'),
  };
}

function floor(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const type = FLOOR_TYPES.has(source.type) ? source.type : 'plane';
  return {
    type,
    width: number(source.width, 18, 4, 40),
    depth: number(source.depth, 22, 4, 50),
    radius: number(source.radius, 11, 2, 25),
    sides: Math.round(number(source.sides, 8, 3, 32)),
    tilesX: Math.round(number(source.tilesX, 6, 2, 16)),
    tilesZ: Math.round(number(source.tilesZ, 9, 2, 24)),
    color: color(source.color, '#111b22'),
    grid: color(source.grid, '#32434d'),
    colors: Array.isArray(source.colors)
      ? [color(source.colors[0], '#ddd4be'), color(source.colors[1], '#17222a')]
      : ['#ddd4be', '#17222a'],
    carpet: carpet(source.carpet),
  };
}

function environment(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const motes = source.motes && typeof source.motes === 'object' ? source.motes : {};
  return {
    background: color(source.background, '#02070c'),
    fog: color(source.fog, '#07131b'),
    fogNear: number(source.fogNear, 8, 0.5, 50),
    fogFar: number(source.fogFar, 38, 5, 100),
    ambient: color(source.ambient, '#71899a'),
    ambientIntensity: number(source.ambientIntensity, 0.45, 0, 4),
    keyLight: color(source.keyLight, '#efd99a'),
    keyIntensity: number(source.keyIntensity, 2.4, 0, 8),
    keyPosition: vector(source.keyPosition, [0, 8, 3]),
    camera: vector(source.camera, [0, 3.2, 12], -50, 50),
    target: vector(source.target, [0, 1.2, -2], -50, 50),
    floor: floor(source.floor),
    motes: {
      count: Math.round(number(motes.count, 48, 0, 240)),
      color: color(motes.color, '#d9c78c'),
      spread: vector(motes.spread, [16, 9, 20], 1, 60),
    },
  };
}

function gate(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    eyebrow: text(source.eyebrow, 'Spațiu privat', 80),
    title: text(source.title, 'Pragul edificiului', 120),
    instruction: text(source.instruction, 'Atinge poarta de trei ori sau folosește butonul de acces.', 260),
    firstKnock: text(source.firstKnock, 'Prima bătaie.', 180),
    secondKnock: text(source.secondKnock, 'A doua bătaie.', 180),
    thirdKnock: text(source.thirdKnock, 'Pragul se deschide.', 180),
    enterLabel: text(source.enterLabel, 'Intră', 60),
    skipLabel: text(source.skipLabel, 'Intră fără animație', 80),
  };
}

export function normalizeExperienceManifest(value) {
  const source = value && typeof value === 'object' ? value : {};
  const access = source.access && typeof source.access === 'object' ? source.access : {};
  const tenant = source.tenant && typeof source.tenant === 'object' ? source.tenant : {};
  const grade = Math.round(number(access.grade, 0, 0, 3));
  const interactives = Array.isArray(source.interactives)
    ? source.interactives.slice(0, 36).map(interactiveItem).filter(Boolean)
    : [];
  return {
    version: text(source.version, 'experience-v1', 80),
    catalogVersion: text(source.catalogVersion, '', 80),
    tenant: {
      id: identifier(tenant.id, 'tenant'),
      name: text(tenant.name, 'Loja activă', 140),
    },
    access: {
      grade,
      gradeLabel: text(access.gradeLabel, grade ? `Grad ${grade}` : 'Grad neconfigurat', 100),
      viewGrade: Math.round(number(access.viewGrade, grade, 0, 3)),
      viewGradeLabel: text(access.viewGradeLabel, '', 100),
      maxGrade: Math.round(number(access.maxGrade, grade, 0, 3)),
      platformAdmin: access.platformAdmin === true,
      offices: Array.isArray(access.offices)
        ? access.offices.slice(0, 16).map((office, index) => ({
          code: identifier(office?.code, `office-${index}`),
          label: text(office?.label || office?.name, '', 100),
        })).filter((office) => office.label)
        : [],
    },
    title: text(source.title, 'Edificiul viu', 140),
    subtitle: text(source.subtitle, 'Explorează numai reperele disponibile contextului tău.', 340),
    motif: identifier(source.motif, 'threshold'),
    gate: gate(source.gate),
    environment: environment(source.environment),
    architecture: Array.isArray(source.architecture)
      ? source.architecture.slice(0, 224).map(architectureItem).filter(Boolean)
      : [],
    interactives,
    learningPath: Array.isArray(source.learningPath)
      ? source.learningPath.slice(0, 8).map((item, index) => ({
        id: identifier(item?.id, `path-${index}`),
        label: text(item?.label || item?.title, '', 120),
        description: text(item?.description, '', 260),
      })).filter((item) => item.label)
      : [],
  };
}

export function safeExperienceFallback() {
  return normalizeExperienceManifest({
    version: 'fallback-v1',
    tenant: { id: 'fallback', name: 'Spațiul privat' },
    access: { grade: 0, gradeLabel: 'Context indisponibil', offices: [] },
    title: 'Harta autorizată nu este disponibilă',
    subtitle: 'Poți reveni în siguranță la tabloul de bord.',
    environment: {},
    architecture: [],
    interactives: [{
      id: 'dashboard', label: 'Tablou de bord', description: 'Revino la informațiile deja disponibile.',
      route: '/dashboard', position: [0, 0.8, -2], geometry: { type: 'octahedron' },
      education: { objective: 'Orientare', prompt: 'Reîncearcă după verificarea conexiunii.', steps: [] },
    }],
  });
}

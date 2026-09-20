import { ZODIAC_SIGNS } from '../zodiac.js';

// Scenele templului sunt construite după „Planșa nr. 1" din documentele-sursă:
// Orientul supraînălțat la -Z, Occidentul cu intrarea la +Z, Miazănoaptea la -X
// și Miazăzi la +X. Fiecare grad primește aceeași sală, cu diferențele planșei
// proprii (planșa de trasat, steaua flamboyantă la gradul 2, atmosfera).
const GRADE_NAMES = Object.freeze({
  0: 'Grad neconfigurat',
  1: 'Ucenic',
  2: 'Calfă',
  3: 'Maestru',
});

const ROUTES = Object.freeze({
  dashboard: '/dashboard',
  library: '/biblioteca',
  concepts: '/concepte',
  register: '/dosare-frati',
  visitors: '/vizitatori',
  treasury: '/metale',
  hospitality: '/ospitalier',
  convocations: '/convocatoare',
});

const COLORS = Object.freeze({
  wallStone: '#0e1c29',
  wallOrient: '#13273a',
  vestibule: '#1b2f40',
  daisStone: '#232b36',
  stepMid: '#2b3440',
  stepLow: '#333d4a',
  woodDark: '#3a2c1f',
  wood: '#4c3a26',
  woodShade: '#33271b',
  crimson: '#5d2027',
  drape: '#57222b',
  gold: '#c9a45c',
  ivory: '#d9cfae',
  flame: '#ffd57a',
});

function primitive(id, type, position, scale, color, options = {}) {
  return {
    id,
    geometry: { type, ...(options.geometry || {}) },
    position,
    scale,
    rotation: options.rotation || [0, 0, 0],
    material: {
      color,
      roughness: options.roughness ?? 0.78,
      metalness: options.metalness ?? 0.05,
      opacity: options.opacity ?? 1,
      emissive: options.emissive || '#000000',
      emissiveIntensity: options.emissiveIntensity ?? 0,
      // Textură procedurală generată de client: 'terrestrial' sau 'celestial'.
      map: options.map || '',
    },
  };
}

function learning(objective, prompt, steps) {
  return { objective, prompt, steps };
}

function interactive(id, kind, label, description, position, geometry, route, education, options = {}) {
  return {
    id,
    kind,
    label,
    description,
    position,
    geometry,
    route,
    actionLabel: options.actionLabel || 'Descoperă',
    color: options.color || '#d8bd72',
    haloColor: options.haloColor || '#f7e3a6',
    education,
    sourceRef: options.sourceRef || '',
    // 'list' = reperul apare numai în navigatorul semantic, fără corp 3D.
    presentation: options.presentation === 'list' ? 'list' : 'scene',
  };
}

const BASE_GATE = Object.freeze({
  title: 'Pragul edificiului',
  eyebrow: 'Spațiu privat',
  instruction: 'Atinge poarta de trei ori sau folosește butonul de acces.',
  firstKnock: 'Prima bătaie aprinde reperul.',
  secondKnock: 'A doua bătaie trasează legătura.',
  thirdKnock: 'A treia bătaie deschide pragul.',
  enterLabel: 'Intră',
  skipLabel: 'Intră fără animație',
});

// Pardoseala „lodge": piatră întunecată cu pavajul mozaicat central și bordura
// dantelată aurie. Conform ritualului, laturile pavajului sunt în raportul
// „Secțiunii de aur", cu pătrate în raportul termenilor succesivi ai șirului
// lui Fibonacci: 5 × 8. Pavajul este un covor mic, în centrul Templului,
// cu spațiu liber între el și Altar.
const LODGE_FLOOR = Object.freeze({
  type: 'lodge',
  width: 18,
  depth: 23.2,
  color: '#131c26',
  carpet: {
    width: 1.08,
    depth: 1.728,
    tilesX: 5,
    tilesZ: 8,
    z: 1.4,
    colors: ['#e6dcc3', '#10181f'],
    border: '#c2a05a',
  },
});

function wallsAndEntrance() {
  return [
    primitive('east-wall', 'box', [0, 3.6, -11.4], [18, 7.2, 0.5], COLORS.wallOrient),
    primitive('north-wall', 'box', [-9.05, 3.6, 0], [0.5, 7.2, 23.4], COLORS.wallStone),
    primitive('south-wall', 'box', [9.05, 3.6, 0], [0.5, 7.2, 23.4], COLORS.wallStone),
    primitive('west-wall-north', 'box', [-5.9, 3.6, 11.4], [6.8, 7.2, 0.5], COLORS.wallStone),
    primitive('west-wall-south', 'box', [5.9, 3.6, 11.4], [6.8, 7.2, 0.5], COLORS.wallStone),
    primitive('west-lintel', 'box', [0, 5.5, 11.4], [5, 3.4, 0.5], COLORS.wallStone),
    primitive('west-door', 'box', [0, 1.9, 11.32], [4.7, 3.8, 0.22], '#050b12'),
    // Vestibulul în unghi al intrării, așa cum apare desenat la Occident.
    primitive('west-vestibule-north', 'box', [-1.35, 1.9, 10.3], [0.2, 3.8, 2.9], COLORS.vestibule, { rotation: [0, 0.55, 0] }),
    primitive('west-vestibule-south', 'box', [1.35, 1.9, 10.3], [0.2, 3.8, 2.9], COLORS.vestibule, { rotation: [0, -0.55, 0] }),
    primitive('cornice-east', 'box', [0, 7, -11.1], [18, 0.22, 0.3], COLORS.gold, { metalness: 0.55, roughness: 0.4, emissive: '#4d3a12', emissiveIntensity: 0.25 }),
  ];
}

function orientPlatform() {
  return [
    primitive('orient-dais', 'box', [0, 0.36, -9.4], [18, 0.72, 3.8], COLORS.daisStone),
    // Treptele spre Orient sunt laterale; axul central rămâne liber pentru
    // Altarul Jurămintelor, lipit de estrada pupitrului Maestrului Venerabil.
    primitive('orient-step-north-mid', 'box', [-3.6, 0.24, -7.1], [2.2, 0.48, 0.85], COLORS.stepMid),
    primitive('orient-step-north-low', 'box', [-3.6, 0.12, -6.4], [2.2, 0.24, 0.7], COLORS.stepLow),
    primitive('orient-step-south-mid', 'box', [3.6, 0.24, -7.1], [2.2, 0.48, 0.85], COLORS.stepMid),
    primitive('orient-step-south-low', 'box', [3.6, 0.12, -6.4], [2.2, 0.24, 0.7], COLORS.stepLow),
    // Balustrada nu traversează scările laterale: rămâne numai în afara lor.
    primitive('orient-balustrade-north', 'box', [-6.8, 0.86, -7.45], [3.4, 0.34, 0.12], '#25313f'),
    primitive('orient-balustrade-south', 'box', [6.8, 0.86, -7.45], [3.4, 0.34, 0.12], '#25313f'),
    primitive('orient-rail-north', 'box', [-6.8, 1.08, -7.45], [3.5, 0.08, 0.16], COLORS.gold, { metalness: 0.5, roughness: 0.42 }),
    primitive('orient-rail-south', 'box', [6.8, 1.08, -7.45], [3.5, 0.08, 0.16], COLORS.gold, { metalness: 0.5, roughness: 0.42 }),
  ];
}

// Mobilier orientat cu fața spre +Z înainte de rotație; baseY este pardoseala.
// Piesele separate lasă vizibil spațiul de sub șezut și dintre montanți.
function seating(id, x, baseY, z, yaw = 0, { width = 0.72, backHeight = 1.18, arms = false } = {}) {
  const items = [];
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const part = (suffix, px, py, pz, size, color = COLORS.wood, options = {}) => {
    items.push(primitive(suffix ? `${id}-${suffix}` : id, 'box',
      [x + px * cos + pz * sin, baseY + py, z - px * sin + pz * cos], size, color,
      { rotation: [0, yaw, 0], roughness: 0.66, ...options }));
  };
  part('', 0, 0.49, 0, [width, 0.12, 0.65]);
  part('cushion', 0, 0.565, 0.015, [width - 0.1, 0.06, 0.54], COLORS.crimson);
  const supportCount = width > 2 ? Math.ceil(width / 1.6) + 1 : 2;
  const supports = Array.from({ length: supportCount }, (_, index) => -width / 2 + 0.07 + index * (width - 0.14) / (supportCount - 1));
  supports.forEach((px, index) => {
    part(`leg-front-${index}`, px, 0.225, 0.24, [0.085, 0.45, 0.085]);
    part(`back-post-${index}`, px, backHeight / 2, -0.27, [0.085, backHeight, 0.085]);
  });
  part('back', 0, 0.79 + (backHeight - 1.18) / 2, -0.27, [width - 0.16, backHeight - 0.72, 0.075], COLORS.crimson);
  part('crest', 0, backHeight - 0.035, -0.27, [width + 0.02, 0.1, 0.12]);
  part('stretcher', 0, 0.22, -0.27, [width - 0.1, 0.07, 0.07]);
  if (arms) for (const sign of [-1, 1]) {
    part(`arm-${sign < 0 ? 'left' : 'right'}`, sign * (width / 2 - 0.025), 0.83, 0, [0.1, 0.085, 0.66]);
    part(`arm-support-${sign < 0 ? 'left' : 'right'}`, sign * (width / 2 - 0.025), 0.67, 0.24, [0.065, 0.3, 0.065]);
  }
  return items;
}

function allSeeingEye() {
  const items = [];
  // Raze fine în spatele triunghiului în relief; fețele privesc spre sală (+Z).
  for (let index = 0; index < 24; index += 1) {
    const angle = index * Math.PI / 12;
    const length = index % 2 ? 0.18 : 0.3;
    const radius = 1.3 + length / 2;
    items.push(primitive(`delta-ray-${index}`, 'box',
      [Math.cos(angle) * radius, 5.6 + Math.sin(angle) * radius, -11.03], [length, 0.025, 0.035], COLORS.gold,
      { rotation: [0, 0, angle], emissive: '#94702d', emissiveIntensity: 0.35, metalness: 0.55 }));
  }
  items.push(
    primitive('delta-plaque', 'star', [0, 5.6, -10.99], [1, 1, 1], COLORS.gold,
      { geometry: { points: 3, radius: 1.2, innerRadius: 0.6, depth: 0.08 }, metalness: 0.55, roughness: 0.4, emissive: '#705018', emissiveIntensity: 0.25 }),
    primitive('delta-inset', 'star', [0, 5.6, -10.94], [1, 1, 1], '#162c38',
      { geometry: { points: 3, radius: 1.08, innerRadius: 0.54, depth: 0.035 }, roughness: 0.8 }),
    primitive('delta-eye-outline', 'almond', [0, 5.53, -10.88], [1, 1, 1], COLORS.gold,
      { geometry: { width: 1.27, height: 0.55, depth: 0.04 }, metalness: 0.45, roughness: 0.4 }),
    primitive('delta-eye', 'almond', [0, 5.53, -10.85], [1, 1, 1], '#ece5cf',
      { geometry: { width: 1.13, height: 0.43, depth: 0.035 }, roughness: 0.55, emissive: '#c6bda2', emissiveIntensity: 0.18 }),
    primitive('delta-iris-rim', 'sphere', [0, 5.53, -10.82], [1, 1, 0.15], '#142e35', { geometry: { size: 0.21, segments: 32 } }),
    primitive('delta-iris', 'sphere', [0, 5.53, -10.785], [1, 1, 0.15], '#548a88', { geometry: { size: 0.18, segments: 32 }, roughness: 0.4 }),
    primitive('delta-pupil', 'sphere', [0, 5.53, -10.75], [1, 1, 0.15], '#071219', { geometry: { size: 0.09, segments: 32 }, roughness: 0.3 }),
    primitive('delta-eye-glint', 'sphere', [-0.046, 5.592, -10.73], [0.3, 0.3, 0.08], '#fff9e7', { geometry: { size: 0.08, segments: 16 }, emissive: '#fff9e7', emissiveIntensity: 0.45 }),
  );
  return items;
}

function venerableStation() {
  return [
    ...seating('vm-throne-seat', 0, 0.72, -10.15, 0, { width: 1.3, backHeight: 2.6, arms: true }),
    primitive('vm-canopy', 'box', [0, 3.95, -10.35], [2.6, 0.16, 1.6], '#341721'),
    primitive('vm-canopy-post-north', 'cylinder', [-1.2, 2.35, -9.7], [1, 1, 1], COLORS.gold, { geometry: { radiusTop: 0.06, radiusBottom: 0.075, height: 3.3, segments: 12 }, metalness: 0.5, roughness: 0.42 }),
    primitive('vm-canopy-post-south', 'cylinder', [1.2, 2.35, -9.7], [1, 1, 1], COLORS.gold, { geometry: { radiusTop: 0.06, radiusBottom: 0.075, height: 3.3, segments: 12 }, metalness: 0.5, roughness: 0.42 }),
    primitive('vm-table-body', 'box', [0, 0.93, -8.8], [2.4, 0.42, 0.9], COLORS.drape, { roughness: 0.68 }),
    primitive('vm-table-top', 'box', [0, 1.19, -8.8], [2.6, 0.14, 1.05], COLORS.woodDark),
    // Recuzita mesei din planșă: spada flamboyantă și ciocanul; sfeșnicul este compus separat.
    primitive('vm-sword', 'box', [-0.62, 1.3, -8.72], [0.85, 0.04, 0.09], '#cad3dc', { metalness: 0.85, roughness: 0.25, rotation: [0, 0.4, 0] }),
    primitive('vm-gavel', 'box', [-0.15, 1.3, -8.95], [0.34, 0.07, 0.07], COLORS.wood, { rotation: [0, -0.5, 0] }),
  ];
}

function orientSun() {
  const x = 4.9;
  const y = 5.5;
  const z = -10.94;
  const gold = { metalness: 0.45, roughness: 0.42, emissive: '#be7925', emissiveIntensity: 0.35 };
  const items = [];
  // Coroană solară în relief: raze drepte alternate cu raze ondulate.
  for (let index = 0; index < 24; index += 1) {
    const angle = index * Math.PI / 12;
    const curved = index % 2 === 1;
    const radius = curved ? 0.54 : 0.73;
    items.push(primitive(`sun-ray-${index}`, curved ? 'leaf' : 'cone',
      [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, z - 0.015], curved ? [1, 1, 1] : [1, 1, 0.2], curved ? '#d4a247' : '#e4b653',
      { geometry: curved ? { width: 0.12, height: 0.34, depth: 0.025 } : { radius: 0.075, height: 0.42, segments: 4 }, rotation: [0, 0, angle - Math.PI / 2], ...gold }));
  }
  items.push(
    primitive('sun-disc', 'sphere', [x, y, z], [1, 1, 0.2], '#e8bb60', { geometry: { size: 0.54, segments: 48 }, ...gold }),
    primitive('sun-rim', 'torus', [x, y, z + 0.03], [1, 1, 1], '#f2d38a', { geometry: { radius: 0.515, tube: 0.022, segments: 64 }, ...gold }),
    primitive('sun-inner-rim', 'torus', [x, y, z + 0.105], [1, 1, 0.55], '#b98735', { geometry: { radius: 0.435, tube: 0.012, segments: 64 }, ...gold }),
    primitive('sun-heart', 'sphere', [x, y, z + 0.08], [1, 1, 0.12], '#f6d793', { geometry: { size: 0.415, segments: 48 }, emissive: '#d4a04c', emissiveIntensity: 0.45, roughness: 0.55, metalness: 0.2 }),
  );
  return items;
}

function orientLuminaries(grade) {
  const items = [
    ...allSeeingEye(),
    // Luna la Miazănoapte: sfera palidă cu umbra care lasă vizibilă secera.
    primitive('moon-disc', 'sphere', [-4.9, 5.5, -10.95], [1, 1, 1], '#e6ecf4', { geometry: { size: 0.55, segments: 28 }, emissive: '#c3d2e2', emissiveIntensity: 1.05 }),
    primitive('moon-shadow', 'sphere', [-4.62, 5.56, -10.7], [1, 1, 1], '#0d1a26', { geometry: { size: 0.5, segments: 28 }, roughness: 1 }),
    ...orientSun(),
  ];
  if (grade === 2) {
    // Steaua Calfei, independentă pe suport, în fața altarului, conform cerinței Lojei.
    items.push(primitive('flaming-star', 'star', [0, 1.85, -5.65], [1, 1, 1], '#ffd061', { geometry: { points: 5, radius: 0.65, innerRadius: 0.28, depth: 0.12 }, emissive: '#ffbe3d', emissiveIntensity: 2.1, metalness: 0.2, roughness: 0.3 }));
    items.push(primitive('flaming-star-heart', 'sphere', [0, 1.85, -5.53], [1, 1, 1], '#fff3cf', { geometry: { size: 0.16, segments: 20 }, emissive: '#ffe9b0', emissiveIntensity: 2.6 }));
    items.push(primitive('flaming-star-base', 'cylinder', [0, 0.05, -5.65], [1, 1, 1], '#3a3325', { geometry: { radiusTop: 0.23, radiusBottom: 0.28, height: 0.1, segments: 24 }, metalness: 0.5 }));
    items.push(primitive('flaming-star-support', 'cylinder', [0, 0.975, -5.65], [1, 1, 1], COLORS.gold, { geometry: { radiusTop: 0.025, radiusBottom: 0.03, height: 1.75, segments: 12 }, metalness: 0.6 }));
  }
  return items;
}

function orientSeating() {
  return [
    ...seating('orient-bench-north', -3.5, 0.72, -10.4, 0, { width: 2.6 }),
    ...seating('orient-bench-south', 3.7, 0.72, -10.4, 0, { width: 3.4 }),
    ...seating('orient-seat-adjunct', -1.75, 0.72, -9.55),
    // Pe estradă: Secretarul (Miazănoapte) și Oratorul (Miazăzi), cu blatul
    // simplu, orizontal, ca la Supraveghetori, și scaunele spre Orient.
    primitive('secretary-desk', 'box', [-6.5, 1.14, -9.55], [1.5, 0.84, 1], COLORS.wood),
    primitive('secretary-desk-top', 'box', [-6.5, 1.605, -9.55], [1.65, 0.09, 1.15], COLORS.woodDark),
    ...seating('secretary-chair', -6.5, 0.72, -10.35),
    primitive('orator-desk', 'box', [6.5, 1.14, -9.55], [1.5, 0.84, 1], COLORS.wood),
    primitive('orator-desk-top', 'box', [6.5, 1.605, -9.55], [1.65, 0.09, 1.15], COLORS.woodDark),
    ...seating('orator-chair', 6.5, 0.72, -10.35),
  ];
}

function altarOfLights() {
  return [
    primitive('altar-plinth', 'box', [0, 0.09, -6.95], [1, 0.18, 1], '#20282f'),
    primitive('altar-shaft', 'cylinder', [0, 0.62, -6.95], [1, 1, 1], '#c7bb9d', { geometry: { radiusTop: 0.36, radiusBottom: 0.46, height: 0.9, segments: 20 } }),
    primitive('altar-top', 'box', [0, 1.11, -6.95], [0.95, 0.08, 0.8], '#d6cbab'),
    // Volumul Legii Sacre deschis, cu echerul și compasul suprapuse.
    primitive('vsl-page-north', 'box', [-0.2, 1.2, -6.95], [0.4, 0.05, 0.6], '#efe6cd', { rotation: [0, 0, 0.18] }),
    primitive('vsl-page-south', 'box', [0.2, 1.2, -6.95], [0.4, 0.05, 0.6], '#efe6cd', { rotation: [0, 0, -0.18] }),
    primitive('vsl-square', 'box', [0.02, 1.27, -6.87], [0.42, 0.02, 0.05], COLORS.gold, { rotation: [0, 0.7, 0], emissive: '#6b5116', emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.35 }),
    primitive('vsl-compass', 'box', [-0.02, 1.29, -6.95], [0.42, 0.02, 0.05], COLORS.gold, { rotation: [0, -0.7, 0], emissive: '#6b5116', emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.35 }),
  ];
}

function tracingBoard(grade) {
  // Tabloul Lojii: o planșă mică pe pavaj, cu desenul stilizat al gradului
  // pictat ca textură procedurală (nu forme 3D), conform planșelor.
  const kinds = { 1: 'board-apprentice', 2: 'board-fellowcraft', 3: 'board-master' };
  return [
    primitive('tracing-board', 'box', [0, 0.1, 1.4], [0.72, 0.035, 1.15], '#e8dcc0', {
      map: kinds[grade] || kinds[1],
      emissive: '#9a8f74',
      emissiveIntensity: 0.4,
      roughness: 0.75,
    }),
  ];
}

// Cei Trei Mari Stâlpi, strânși la colțurile pavajului, conform ritualului:
// Ionic (Înțelepciunea) la S-E, Doric (Forța) la N-V, Corintic (Frumusețea)
// la S-V, fiecare purtând câte o lumânare. Fiecare stâlp respectă trăsăturile
// ordinului său arhitectural.
function doricPillar(id, x, z) {
  // Doric: fără bază proprie, fus masiv cu conicitate accentuată și fațete
  // care sugerează canelurile, echin evazat și abacă pătrată.
  return [
    primitive(`${id}-base`, 'box', [x, 0.09, z], [0.44, 0.18, 0.44], '#242e38'),
    primitive(`${id}-shaft`, 'cylinder', [x, 0.85, z], [1, 1, 1], COLORS.ivory, { geometry: { radiusTop: 0.115, radiusBottom: 0.16, height: 1.34, segments: 12 }, roughness: 0.85 }),
    primitive(`${id}-echinus`, 'cylinder', [x, 1.57, z], [1, 1, 1], COLORS.ivory, { geometry: { radiusTop: 0.175, radiusBottom: 0.115, height: 0.1, segments: 16 } }),
    primitive(`${id}-abacus`, 'box', [x, 1.665, z], [0.36, 0.09, 0.36], '#cfc4a4'),
  ];
}

function ionicPillar(id, x, z) {
  const stone = COLORS.ivory;
  const shade = '#b4a685';
  const items = [
    primitive(`${id}-base`, 'box', [x, 0.065, z], [0.4, 0.13, 0.4], '#242e38'),
    // Bază profilată cu două toruri și scotie, sub fusul canelat.
    primitive(`${id}-base-moulding`, 'lathe', [x, 0.13, z], [1, 1, 1], stone,
      { geometry: { profile: [[0.14, 0], [0.16, 0.025], [0.15, 0.05], [0.12, 0.065], [0.105, 0.085], [0.12, 0.1], [0.137, 0.12], [0.13, 0.14], [0.115, 0.155]], segments: 48 }, roughness: 0.72 }),
    primitive(`${id}-shaft`, 'flutedColumn', [x, 0.86, z], [1, 1, 1], stone,
      { geometry: { radiusTop: 0.092, radiusBottom: 0.115, height: 1.16, flutes: 16, segments: 96 }, roughness: 0.75 }),
    primitive(`${id}-neck`, 'lathe', [x, 1.43, z], [1, 1, 1], stone,
      { geometry: { profile: [[0.092, 0], [0.108, 0.012], [0.11, 0.025], [0.095, 0.04], [0.095, 0.065], [0.12, 0.085]], segments: 40 } }),
    primitive(`${id}-echinus`, 'lathe', [x, 1.5, z], [1, 1, 1], stone,
      { geometry: { profile: [[0.095, 0], [0.11, 0.015], [0.145, 0.035], [0.155, 0.055], [0.155, 0.065]], segments: 40 } }),
    primitive(`${id}-volute-cushion`, 'box', [x, 1.6, z], [0.33, 0.09, 0.23], stone),
    primitive(`${id}-abacus`, 'box', [x, 1.685, z], [0.48, 0.05, 0.32], stone),
    primitive(`${id}-abacus-lip`, 'box', [x, 1.65, z], [0.44, 0.025, 0.29], shade),
  ];
  // Volute spiralate în oglindă pe ambele fețe; sulurile sunt legate în adâncime.
  for (const [side, sign] of [['left', -1], ['right', 1]]) {
    items.push(primitive(`${id}-scroll-roll-${side}`, 'cylinder', [x + sign * 0.17, 1.59, z], [1, 1, 1], stone,
      { geometry: { radiusTop: 0.09, radiusBottom: 0.09, height: 0.25, segments: 32 }, rotation: [Math.PI / 2, 0, 0] }));
    for (const [face, direction] of [['front', 1], ['back', -1]]) {
      items.push(primitive(`${id}-scroll-field-${side}-${face}`, 'sphere', [x + sign * 0.17, 1.59, z + direction * 0.13], [1, 1, 0.12], shade, { geometry: { size: 0.084, segments: 32 } }));
      items.push(primitive(`${id}-volute-${side}-${face}`, 'spiral', [x + sign * 0.17, 1.59, z + direction * 0.15], [1, 1, 1], stone,
        { geometry: { radius: 0.08, innerRadius: 0.009, tube: 0.009, turns: 1.65 }, rotation: [0, sign < 0 ? Math.PI : 0, 0], roughness: 0.65 }));
    }
  }
  for (const [side, direction] of [['front', 1], ['back', -1]]) {
    items.push(primitive(`${id}-capital-band-${side}`, 'box', [x, 1.635, z + direction * 0.15], [0.32, 0.022, 0.02], stone));
    items.push(primitive(`${id}-neck-beads-${side}`, 'box', [x, 1.485, z + direction * 0.108], [0.18, 0.02, 0.018], shade));
  }
  for (const [side, sign] of [['left', -1], ['right', 1]]) {
    items.push(primitive(`${id}-bolster-collar-${side}`, 'torus', [x + sign * 0.17, 1.59, z], [1, 1, 1], shade,
      { geometry: { radius: 0.087, tube: 0.01, segments: 32 } }));
  }
  // Ove sculptate, vizibile sub perna capitelului.
  for (let index = -2; index <= 2; index += 1) {
    items.push(primitive(`${id}-egg-${index + 2}`, 'sphere', [x + index * 0.05, 1.535, z + 0.14], [0.22, 0.34, 0.15], stone, { geometry: { size: 0.08, segments: 16 } }));
  }
  return items;
}

function corinthianPillar(id, x, z) {
  // Corintic, după modelul clasic: fus zvelt canelat, kalathos (clopot)
  // îmbrăcat în două rânduri de frunze de acant răsfrânte în afară, volute
  // (caulicoli) la colțuri sub abacă și abacă evazată, totul în piatră.
  const stone = COLORS.ivory;
  const stoneShade = '#c0b494';
  const items = [
    primitive(`${id}-base`, 'box', [x, 0.08, z], [0.4, 0.16, 0.4], '#242e38'),
    primitive(`${id}-base-torus`, 'torus', [x, 0.2, z], [1, 1, 1], stone, { geometry: { radius: 0.11, tube: 0.03, segments: 20 }, rotation: [Math.PI / 2, 0, 0] }),
    primitive(`${id}-shaft`, 'flutedColumn', [x, 0.82, z], [1, 1, 1], stone, { geometry: { radiusTop: 0.08, radiusBottom: 0.1, height: 1.12, flutes: 20, segments: 96 } }),
    primitive(`${id}-base-upper`, 'lathe', [x, 0.22, z], [1, 1, 1], stone, { geometry: { profile: [[0.12, 0], [0.13, 0.014], [0.115, 0.03], [0.1, 0.045]], segments: 32 } }),
    // Kalathos: clopotul cu evazare concavă, strunjit dintr-un profil.
    primitive(`${id}-bell`, 'lathe', [x, 1.38, z], [1, 1, 1], stone, { geometry: { profile: [[0.085, 0], [0.088, 0.09], [0.096, 0.17], [0.112, 0.24], [0.138, 0.3], [0.16, 0.34]], segments: 22 } }),
  ];
  // Rândul inferior: opt frunze de acant lobate, ușor răsfrânte în afară.
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    items.push(primitive(`${id}-leaf-low-${index + 1}`, 'leaf',
      [x + Math.cos(angle) * 0.095, 1.4, z + Math.sin(angle) * 0.095], [1, 1, 1], stoneShade,
      { geometry: { width: 0.1, height: 0.22, depth: 0.016, tilt: 0.3 }, rotation: [0, Math.PI / 2 - angle, 0], roughness: 0.85 }));
  }
  // Rândul superior: opt frunze mai înalte, pe diagonale, mai răsfrânte.
  for (let index = 0; index < 8; index += 1) {
    const angle = Math.PI / 8 + (index / 8) * Math.PI * 2;
    items.push(primitive(`${id}-leaf-up-${index + 1}`, 'leaf',
      [x + Math.cos(angle) * 0.105, 1.42, z + Math.sin(angle) * 0.105], [1, 1, 1], stoneShade,
      { geometry: { width: 0.11, height: 0.28, depth: 0.016, tilt: 0.45 }, rotation: [0, Math.PI / 2 - angle, 0], roughness: 0.85 }));
  }
  for (let index = 0; index < 8; index += 1) {
    const angle = Math.PI / 8 + index * Math.PI / 4;
    items.push(primitive(`${id}-leaf-vein-${index}`, 'leaf',
      [x + Math.cos(angle) * 0.12, 1.43, z + Math.sin(angle) * 0.12], [1, 1, 1], stone,
      { geometry: { width: 0.025, height: 0.24, depth: 0.012, tilt: 0.45 }, rotation: [0, Math.PI / 2 - angle, 0], roughness: 0.85 }));
  }
  // Volutele de colț (caulicoli): suluri spiralate sub colțurile abacei.
  for (let index = 0; index < 4; index += 1) {
    const angle = Math.PI / 4 + (index / 4) * Math.PI * 2;
    items.push(primitive(`${id}-volute-${index + 1}`, 'spiral',
      [x + Math.cos(angle) * 0.15, 1.66, z + Math.sin(angle) * 0.15], [1, 1, 1], stone,
      { geometry: { radius: 0.05, innerRadius: 0.012, tube: 0.014, turns: 1.9 }, rotation: [0, Math.PI / 2 - angle, 0] }));
  }
  // Abaca evazată: două muluri subțiri suprapuse, cu rozetă florală.
  items.push(primitive(`${id}-abacus`, 'box', [x, 1.75, z], [0.36, 0.04, 0.36], '#cfc4a4'));
  items.push(primitive(`${id}-abacus-crown`, 'box', [x, 1.78, z], [0.39, 0.025, 0.39], stone));
  items.push(primitive(`${id}-fleuron`, 'cylinder', [x, 1.72, z + 0.175], [1, 1, 1], stoneShade, { geometry: { radiusTop: 0.045, radiusBottom: 0.045, height: 0.035, segments: 14 }, rotation: [Math.PI / 2, 0, 0], roughness: 0.8 }));
  for (let petal = 0; petal < 5; petal += 1) {
    const angle = petal * Math.PI * 2 / 5;
    items.push(primitive(`${id}-flower-petal-${petal}`, 'sphere', [x + Math.cos(angle) * 0.025, 1.72 + Math.sin(angle) * 0.025, z + 0.2], [0.24, 0.24, 0.1], stone, { geometry: { size: 0.08, segments: 16 } }));
  }
  return items;
}

// Lumânare comună tuturor sfeșnicelor: ceară, margine topită, fitil și
// flacără strunjită în picătură cu miez luminos, fără conul geometric vechi.
function candle(prefix, x, y, z, height = 0.2, radius = 0.04, suffix = '') {
  const flameHeight = 0.16;
  const flameProfile = Array.from({ length: 20 }, (_, index) => {
    const t = index / 19;
    return [Math.max(0.01, 0.3 * Math.pow(Math.sin(Math.PI * t), 0.8) * (1 - 0.55 * t)), t];
  });
  return [
    primitive(`${prefix}-candle${suffix}`, 'lathe', [x, y, z], [radius, height, radius], '#e9ddbb',
      { geometry: { profile: [[0.93, 0], [1, 0.04], [1, 0.9], [0.96, 0.99], [0.7, 1], [0.48, 0.93], [0.01, 0.92]], segments: 32 }, roughness: 0.65, metalness: 0 }),
    primitive(`${prefix}-wax-drop${suffix}`, 'sphere', [x + radius * 0.85, y + height * 0.82, z + radius * 0.3], [0.13, 0.45, 0.13], '#f2e6ca', { geometry: { size: 0.08, segments: 16 }, metalness: 0 }),
    primitive(`${prefix}-wick${suffix}`, 'cylinder', [x, y + height + 0.016, z], [0.17, 1, 0.17], '#34241b', { geometry: { radiusTop: 0.02, radiusBottom: 0.02, height: 0.05, segments: 10 }, roughness: 1, metalness: 0 }),
    primitive(`${prefix}-flame${suffix}`, 'lathe', [x, y + height + 0.018, z], [0.12, flameHeight, 0.12], '#ffac43',
      { geometry: { profile: flameProfile, segments: 32 }, emissive: '#ff8e26', emissiveIntensity: 1.5, roughness: 0.6, metalness: 0 }),
    primitive(`${prefix}-flame-core${suffix}`, 'lathe', [x, y + height + 0.025, z + 0.013], [0.052, flameHeight * 0.63, 0.052], '#fff0bd',
      { geometry: { profile: flameProfile, segments: 24 }, emissive: '#ffeac0', emissiveIntensity: 2, roughness: 0.6, metalness: 0 }),
  ];
}

function zodiacBand() {
  return ZODIAC_SIGNS.flatMap(sign => {
    const north = sign.side === 'north';
    const x = north ? -8.6 : 8.6;
    const z = north ? -8 + sign.index * 3.2 : 8 - sign.index * 3.2;
    const yaw = north ? Math.PI / 2 : -Math.PI / 2;
    return [
      primitive(`zodiac-support-${sign.id}`, 'cylinder', [x, 2.78, z], [1, 1, 1], '#263a48', { geometry: { radiusTop: 0.16, radiusBottom: 0.2, height: 5.2, segments: 20 }, roughness: 0.8 }),
      primitive(`zodiac-base-${sign.id}`, 'box', [x, 0.13, z], [0.48, 0.26, 0.48], '#334753'),
      primitive(`zodiac-capital-${sign.id}`, 'box', [x, 5.46, z], [0.48, 0.16, 0.48], '#ac9464'),
      primitive(`zodiac-${sign.id}`, 'plane', [north ? -8.37 : 8.37, 6.02, z], [1, 1, 1], '#ffffff',
        { geometry: { width: 1, height: 1 }, rotation: [0, yaw, 0], map: `zodiac-${sign.id}`, emissive: '#d8c69e', emissiveIntensity: 0.65, roughness: 0.9, metalness: 0 }),
    ];
  });
}

function threePillars() {
  // Strânși la colțurile covorului mozaicat, în jurul acestuia.
  const spots = [
    ['pillar-wisdom-se', 0.95, 0.2, ionicPillar],
    ['pillar-strength-nw', -0.95, 2.75, doricPillar],
    ['pillar-beauty-sw', 0.95, 2.75, corinthianPillar],
  ];
  return spots.flatMap(([id, x, z, builder]) => ([
    ...builder(id, x, z),
    ...candle(id, x, builder === corinthianPillar ? 1.79 : 1.71, z, 0.22),
  ]));
}

// Coloanele Boaz (Miazănoapte) și Jachin (Miazăzi) de la Occident. Conform
// ritualurilor, în gradul de Ucenic capitelurile poartă câte trei rodii
// întredeschise; de la gradul de Calfă, pe Boaz stă Sfera Terestră, iar pe
// Jachin Sfera Celestă.
function portalColumns(grade) {
  const columns = [
    ['column-b', -2.8, 'terrestrial'],
    ['column-j', 2.8, 'celestial'],
  ];
  return columns.flatMap(([id, x, sphere]) => {
    const items = [
      primitive(`${id}-base`, 'box', [x, 0.32, 8.3], [1.2, 0.64, 1.2], '#28313c'),
      primitive(`${id}-shaft`, 'cylinder', [x, 2.55, 8.3], [1, 1, 1], '#b28f52', { geometry: { radiusTop: 0.38, radiusBottom: 0.46, height: 3.8, segments: 24 }, metalness: 0.35, roughness: 0.45 }),
      primitive(`${id}-capital`, 'box', [x, 4.6, 8.3], [1.1, 0.3, 1.1], '#c8a55e', { metalness: 0.4, roughness: 0.42 }),
      primitive(`${id}-plaque`, 'box', [x, 1.5, 8.88], [0.36, 0.44, 0.06], COLORS.gold, { emissive: '#8a6a24', emissiveIntensity: 0.6, metalness: 0.55, roughness: 0.35 }),
    ];
    if (grade === 1) {
      const spots = [[-0.24, 0.14], [0.24, 0.14], [0, -0.24]];
      spots.forEach(([dx, dz], index) => {
        items.push(primitive(`${id}-pomegranate-${index + 1}`, 'sphere', [x + dx, 4.92, 8.3 + dz], [1, 1, 1], '#a64a35', { geometry: { size: 0.14, segments: 16 }, roughness: 0.6, emissive: '#3c150d', emissiveIntensity: 0.3 }));
        items.push(primitive(`${id}-pomegranate-${index + 1}-crown`, 'cone', [x + dx, 5.1, 8.3 + dz], [1, 1, 1], '#7c3323', { geometry: { radius: 0.05, height: 0.08, segments: 8 }, roughness: 0.7 }));
      });
    } else {
      items.push(primitive(`${id}-globe`, 'sphere', [x, 5.18, 8.3], [1, 1, 1], '#ffffff', {
        geometry: { size: 0.42, segments: 32 },
        map: sphere,
        emissive: '#b8c2d4',
        emissiveIntensity: 0.72,
        roughness: 0.55,
        rotation: [0, sphere === 'celestial' ? 2.2 : 0.6, 0],
      }));
      items.push(primitive(`${id}-globe-stand`, 'cylinder', [x, 4.8, 8.3], [1, 1, 1], COLORS.gold, { geometry: { radiusTop: 0.1, radiusBottom: 0.16, height: 0.14, segments: 14 }, metalness: 0.5, roughness: 0.4 }));
    }
    return items;
  });
}

function wardenStations() {
  return [
    // Primul Supraveghetor, la Occident, spre colțul de Miazănoapte al
    // intrării (stânga cum intri), cu fața spre Orient.
    primitive('warden1-desk', 'box', [-5.4, 0.62, 6.7], [1.7, 0.95, 1], COLORS.wood),
    primitive('warden1-top', 'box', [-5.4, 1.14, 6.7], [1.85, 0.09, 1.15], COLORS.woodDark),
    ...seating('warden1-chair', -5.4, 0, 7.8, Math.PI, { width: 0.8, backHeight: 1.45, arms: true }),
    // Al Doilea Supraveghetor, la Miazăzi.
    primitive('warden2-desk', 'box', [6.4, 0.62, 0.6], [1, 0.95, 1.7], COLORS.wood),
    primitive('warden2-top', 'box', [6.4, 1.14, 0.6], [1.15, 0.09, 1.85], COLORS.woodDark),
    ...seating('warden2-chair', 7.5, 0, 0.6, -Math.PI / 2, { width: 0.8, backHeight: 1.45, arms: true }),
    // Maestrul de Ceremonii, în stânga Coloanei Boaz (spre Miazănoapte,
    // cum intri): scaun și sceptrul de ceremonii.
    ...seating('mc-seat', -3.9, 0, 6.6, Math.PI),
    primitive('mc-sceptre-shaft', 'cylinder', [-3.5, 0.8, 6.45], [1, 1, 1], COLORS.wood, { geometry: { radiusTop: 0.022, radiusBottom: 0.028, height: 1.5, segments: 10 }, rotation: [0, 0, 0.1], roughness: 0.6 }),
    primitive('mc-sceptre-head', 'sphere', [-3.575, 1.57, 6.45], [1, 1, 1], COLORS.gold, { geometry: { size: 0.08, segments: 14 }, metalness: 0.55, roughness: 0.35, emissive: '#4d3a12', emissiveIntensity: 0.3 }),
    // Acoperitorul, în dreapta Coloanei Jachin (spre Miazăzi, cum intri),
    // cu fața spre Orient și spada verticală alături.
    ...seating('tyler-seat', 3.9, 0, 6.6, Math.PI),
    primitive('tyler-sword-blade', 'box', [4.35, 0.95, 6.45], [0.05, 1.2, 0.1], '#cad3dc', { metalness: 0.85, roughness: 0.25 }),
    primitive('tyler-sword-guard', 'box', [4.35, 1.58, 6.45], [0.26, 0.05, 0.06], COLORS.gold, { metalness: 0.55, roughness: 0.35 }),
    primitive('tyler-sword-grip', 'cylinder', [4.35, 1.72, 6.45], [1, 1, 1], COLORS.woodDark, { geometry: { radiusTop: 0.03, radiusBottom: 0.03, height: 0.22, segments: 10 } }),
  ];
}


// Sfeșnicele ritualice: trei lumânări la Maestrul Venerabil, două la
// Primul Supraveghetor, una la al Doilea Supraveghetor.
function candelabrum(prefix, x, y, z, candleCount, yaw = 0) {
  const items = [];
  // Alamă/aur — aceeași finisare ca restul pieselor de cult.
  const brass = { roughness: 0.36, metalness: 0.55 };

  // Cote verticale locale, măsurate de la fața mesei (y local = 0).
  const spread = candleCount === 3 ? 0.16 : candleCount === 2 ? 0.12 : 0;
  const stemTop = candleCount === 3 ? 0.2 : candleCount === 2 ? 0.19 : 0.17;
  const barY = candleCount === 3 ? 0.185 : 0.165;
  const candleY0 = candleCount === 3 ? 0.198 : candleCount === 2 ? 0.176 : 0.16;
  const candleH = candleCount === 3 ? 0.17 : candleCount === 2 ? 0.155 : 0.13;

  // Profil de strung: plintă, tor, gât, fus balustru, nod, tijă.
  const profile = [
    [0.094, 0], [0.097, 0.01], [0.08, 0.02], [0.056, 0.028],
    [0.066, 0.038], [0.048, 0.052], [0.03, 0.066], [0.025, 0.08],
    [0.037, 0.09], [0.025, 0.102],
    [0.029, stemTop - 0.06], [0.021, stemTop - 0.028], [0.026, stemTop],
  ];
  if (candleCount === 3) {
    // Cupa centrală (bobeșa) care primește lumânarea din mijloc.
    profile.push([0.056, stemTop + 0.014], [0.058, stemTop + 0.022],
      [0.045, stemTop + 0.024], [0.044, stemTop + 0.047]);
  } else if (candleCount === 2) {
    // Vârf mic (finial) ridicat peste braț.
    profile.push([0.034, stemTop + 0.015], [0.02, stemTop + 0.028],
      [0.012, stemTop + 0.038]);
  }
  items.push(primitive(`${prefix}-base`, 'lathe', [x, y, z], [1, 1, 1], COLORS.gold,
    { geometry: { profile, segments: 24 }, ...brass }));

  if (candleCount > 1) {
    // Brațul orizontal pe axa X plus galeria inelară care poartă talerele.
    items.push(primitive(`${prefix}-arm`, 'cylinder', [x, y + barY, z], [1, 1, 1], COLORS.gold,
      { geometry: { radiusTop: 0.022, radiusBottom: 0.022, height: spread * 2 + 0.02, segments: 14 },
        rotation: [0, 0, Math.PI / 2], ...brass }));
    items.push(primitive(`${prefix}-gallery`, 'torus', [x, y + barY + 0.005, z], [1, 1, 1], COLORS.gold,
      { geometry: { radius: spread, tube: 0.013, segments: 22 },
        rotation: [Math.PI / 2, 0, 0], ...brass }));
  } else {
    // Astragal pe fus și taler de ceară evazat, cu manșon pentru lumânare.
    items.push(primitive(`${prefix}-astragal`, 'torus', [x, y + 0.104, z], [1, 1, 1], COLORS.gold,
      { geometry: { radius: 0.034, tube: 0.01, segments: 18 },
        rotation: [Math.PI / 2, 0, 0], ...brass }));
    items.push(primitive(`${prefix}-drip-pan`, 'lathe', [x, y + 0.15, z], [1, 1, 1], COLORS.gold,
      { geometry: { profile: [[0.024, 0], [0.056, 0.014], [0.059, 0.022],
        [0.046, 0.024], [0.045, 0.05]], segments: 22 }, ...brass }));
  }

  // Lumânările de fildeș și flăcările, așezate pe braț / în cupă.
  for (let index = 0; index < candleCount; index += 1) {
    const offset = candleCount === 1 ? 0
      : (candleCount === 2 ? (index * 2 - 1) * spread : (index - 1) * spread);
    items.push(...candle(prefix, x + offset, y + candleY0, z, candleH, 0.04, `-${index}`));
  }

  if (!yaw) return items;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return items.map((item) => {
    const dx = item.position[0] - x;
    const dz = item.position[2] - z;
    return {
      ...item,
      position: [x + dx * cos + dz * sin, item.position[1], z - dx * sin + dz * cos],
      // Torurile orizontale sunt simetrice în jurul axei Y. Celelalte
      // piese au X=0, deci Euler XYZ compune corect yaw cu rotația brațului.
      rotation: item.geometry.type === 'torus' ? item.rotation : [0, yaw, item.rotation[2]],
    };
  });
}

function officerTables() {
  // Sub estradă: Ospitalierul (Miazănoapte) și Trezorierul (Miazăzi), cu
  // fața unul spre celălalt peste sală — blat orizontal pe corpul pupitrului,
  // scaunele spre ziduri. Lângă Ospitalier, spre intrare, stă spada
  // Expertului, la primul scaun al Coloanei de Miazănoapte.
  return [
    primitive('hospitalier-table', 'box', [-6.7, 0.55, -5.75], [1, 0.82, 1.6], COLORS.wood),
    primitive('hospitalier-desk-top', 'box', [-6.7, 1.005, -5.75], [1.15, 0.09, 1.75], COLORS.woodDark),
    ...seating('hospitalier-chair', -7.55, 0, -5.75, Math.PI / 2),
    primitive('treasurer-table', 'box', [6.7, 0.55, -5.75], [1, 0.82, 1.6], COLORS.wood),
    primitive('treasurer-desk-top', 'box', [6.7, 1.005, -5.75], [1.15, 0.09, 1.75], COLORS.woodDark),
    ...seating('treasurer-chair', 7.55, 0, -5.75, -Math.PI / 2),
    primitive('expert-sword-blade', 'box', [-6.15, 0.95, -4.45], [0.05, 1.2, 0.1], '#cad3dc', { metalness: 0.85, roughness: 0.25 }),
    primitive('expert-sword-guard', 'box', [-6.15, 1.58, -4.45], [0.26, 0.05, 0.06], COLORS.gold, { metalness: 0.55, roughness: 0.35 }),
    primitive('expert-sword-grip', 'cylinder', [-6.15, 1.72, -4.45], [1, 1, 1], COLORS.woodDark, { geometry: { radiusTop: 0.03, radiusBottom: 0.03, height: 0.22, segments: 10 } }),
  ];
}

// Bolta cerească: tavan albastru-adânc cu stele fixe, sub care plutesc motele.
function starryVault() {
  const stars = [
    [-6.2, -8.5], [-3.1, -4.2], [0.5, -7.9], [3.8, -3.4], [6.4, -8.8],
    [-5.4, 0.8], [2.2, 1.9], [6.8, 4.4], [-2.6, 6.2], [0.9, 8.6],
  ];
  return [
    primitive('vault-ceiling', 'box', [0, 7.45, 0], [18, 0.3, 23.4], '#050b1c', { emissive: '#0a1a38', emissiveIntensity: 0.32, roughness: 0.9 }),
    ...stars.map(([x, z], index) => primitive(`vault-star-${index + 1}`, 'sphere', [x, 7.18, z], [1, 1, 1], '#eef2fb', { geometry: { size: 0.08, segments: 10 }, emissive: '#dfe7f7', emissiveIntensity: 2.2 })),
  ];
}

// Funia cu noduri în partea de sus a pereților, cu ciucurii coborâți la
// Occident. Conform ritualului, are trei „noduri de dragoste" (lacs d'amour,
// în formă de opt), câte unul pe laturile de Miazănoapte, Orient și Miazăzi.
function knottedRope() {
  const rope = '#b38f57';
  const ropeGeometry = (height) => ({ geometry: { radiusTop: 0.045, radiusBottom: 0.045, height, segments: 10 }, roughness: 0.6 });
  // Nod în formă de opt: două bucle suprapuse de-a lungul funiei.
  const knotEight = (id, position, alongZ) => {
    const rotation = alongZ ? [0, Math.PI / 2, 0] : [0, 0, 0];
    const offset = 0.082;
    const delta = alongZ ? [0, 0, offset] : [offset, 0, 0];
    return [
      primitive(`${id}-a`, 'torus', [position[0] - delta[0], position[1], position[2] - delta[2]], [1, 1, 1], rope, { geometry: { radius: 0.095, tube: 0.034, segments: 22 }, rotation, roughness: 0.6 }),
      primitive(`${id}-b`, 'torus', [position[0] + delta[0], position[1], position[2] + delta[2]], [1, 1, 1], rope, { geometry: { radius: 0.095, tube: 0.034, segments: 22 }, rotation, roughness: 0.6 }),
    ];
  };
  const items = [
    primitive('rope-east', 'cylinder', [0, 6.6, -11.02], [1, 1, 1], rope, { ...ropeGeometry(17.6), rotation: [0, 0, Math.PI / 2] }),
    // Funia rămâne în fața zidurilor laterale (fața interioară este la ±8,8).
    primitive('rope-north', 'cylinder', [-8.68, 6.6, 0], [1, 1, 1], rope, { ...ropeGeometry(22.6), rotation: [Math.PI / 2, 0, 0] }),
    primitive('rope-south', 'cylinder', [8.68, 6.6, 0], [1, 1, 1], rope, { ...ropeGeometry(22.6), rotation: [Math.PI / 2, 0, 0] }),
    primitive('rope-west-north', 'cylinder', [-5.9, 6.6, 11.02], [1, 1, 1], rope, { ...ropeGeometry(6.6), rotation: [0, 0, Math.PI / 2] }),
    primitive('rope-west-south', 'cylinder', [5.9, 6.6, 11.02], [1, 1, 1], rope, { ...ropeGeometry(6.6), rotation: [0, 0, Math.PI / 2] }),
    ...[-5.5, 0, 5.5].flatMap((x, index) => knotEight(`rope-knot-east-${index + 1}`, [x, 6.6, -11.02], false)),
    ...[-6.5, -2, 2.5, 7].flatMap((z, index) => knotEight(`rope-knot-north-${index + 1}`, [-8.68, 6.6, z], true)),
    ...[-6.5, -2, 2.5, 7].flatMap((z, index) => knotEight(`rope-knot-south-${index + 1}`, [8.68, 6.6, z], true)),
  ];
  for (const [id, x] of [['north', -2.6], ['south', 2.6]]) {
    items.push(primitive(`rope-tassel-${id}`, 'cylinder', [x, 6.05, 11.02], [1, 1, 1], rope, { geometry: { radiusTop: 0.03, radiusBottom: 0.06, height: 1.2, segments: 8 }, roughness: 0.6 }));
    items.push(primitive(`rope-tassel-${id}-end`, 'cone', [x, 5.28, 11.02], [1, 1, 1], COLORS.gold, { geometry: { radius: 0.11, height: 0.34, segments: 10 }, rotation: [Math.PI, 0, 0], metalness: 0.4, roughness: 0.45 }));
  }
  return items;
}

// Firul cu plumb atârnă din boltă deasupra centrului Pavajului Mozaicat,
// simbolizând Axis Mundi, conform ritualului.
function plumbLine() {
  return [
    primitive('plumb-mount', 'cylinder', [0, 7.26, 1.4], [1, 1, 1], '#3c4653', { geometry: { radiusTop: 0.09, radiusBottom: 0.07, height: 0.12, segments: 12 } }),
    primitive('plumb-cord', 'cylinder', [0, 4.85, 1.4], [0.2, 1, 0.2], '#d9d2c0', { geometry: { radiusTop: 0.02, radiusBottom: 0.02, height: 4.7, segments: 8 } }),
    primitive('plumb-bob', 'cone', [0, 2.36, 1.4], [1, 1, 1], COLORS.gold, { geometry: { radius: 0.1, height: 0.3, segments: 14 }, rotation: [Math.PI, 0, 0], metalness: 0.55, roughness: 0.35 }),
  ];
}

function brotherSeats() {
  const north = [-4.6, -3.3, -2, -0.7, 0.6, 1.9, 3.2, 4.5];
  // Rândurile din Miazăzi lasă locul pupitrului celui de-al Doilea Supraveghetor.
  const south = [-4.6, -3.3, -2, 2.2, 3.5, 4.8];
  return [
    ...north.flatMap((z, index) => seating(`seat-north-front-${index + 1}`, -6.55, 0, z, Math.PI / 2)),
    ...south.flatMap((z, index) => seating(`seat-south-front-${index + 1}`, 6.55, 0, z, -Math.PI / 2)),
    ...seating('bench-north-wall', -7.85, 0, -0.05, Math.PI / 2, { width: 10 }),
    // Două bănci lasă liber accesul la scaunul celui de-al Doilea Supraveghetor.
    ...seating('bench-south-wall-east', 7.85, 0, -3.3, -Math.PI / 2, { width: 3.4 }),
    ...seating('bench-south-wall-west', 7.85, 0, 3.5, -Math.PI / 2, { width: 3.4 }),
  ];
}

function lodgeArchitecture(grade) {
  return [
    ...wallsAndEntrance(),
    ...starryVault(),
    ...zodiacBand(),
    ...knottedRope(),
    ...orientPlatform(),
    ...venerableStation(),
    ...orientLuminaries(grade),
    ...orientSeating(),
    ...altarOfLights(),
    ...tracingBoard(grade),
    ...threePillars(),
    ...plumbLine(),
    ...portalColumns(grade),
    ...wardenStations(),
    ...officerTables(),
    ...candelabrum('vm-candelabrum', 1.02, 1.26, -8.5, 3),
    ...candelabrum('warden1-candelabrum', -5.85, 1.19, 6.5, 2, Math.PI / 4),
    ...candelabrum('warden2-candelabrum', 6.55, 1.19, 1.05, 1),
    // Spațiul din fața pupitrelor Ospitalierului și Trezorierului
    // rămâne liber în toate cele trei grade.
    ...brotherSeats(),
  ];
}

const SCENES = Object.freeze({
  0: {
    title: 'Edificiul așteaptă configurarea',
    subtitle: 'Accesul educativ se activează după stabilirea gradului în registrul Loji.',
    motif: 'threshold',
    environment: {
      background: '#02070c', fog: '#06131d', fogNear: 8, fogFar: 34,
      ambient: '#7591a4', ambientIntensity: 0.42,
      keyLight: '#efd99a', keyIntensity: 2.1, keyPosition: [0, 7, 4],
      camera: [0, 3.1, 12], target: [0, 1.4, -1],
      floor: { type: 'plane', width: 18, depth: 22, color: '#101a20', grid: '#263946' },
      motes: { count: 28, color: '#c7d0d3', spread: [16, 9, 19] },
    },
    architecture: [
      primitive('wall-back', 'box', [0, 3, -7], [12, 6, 0.4], '#101a20'),
      primitive('column-left', 'cylinder', [-3.8, 2.7, -4.8], [0.65, 5.4, 0.65], '#26333a', { geometry: { radiusTop: 0.75, radiusBottom: 0.9, segments: 12 } }),
      primitive('column-right', 'cylinder', [3.8, 2.7, -4.8], [0.65, 5.4, 0.65], '#26333a', { geometry: { radiusTop: 0.75, radiusBottom: 0.9, segments: 12 } }),
    ],
    interactives: [
      interactive('return-dashboard', 'dashboard', 'Tablou de bord', 'Revino la informațiile deja disponibile.', [0, 0.75, -2], { type: 'octahedron', size: 0.72 }, ROUTES.dashboard,
        learning('Orientare', 'Ce informație trebuie configurată pentru a începe parcursul?', ['Verifică Loja activă.', 'Solicită stabilirea gradului în registru.'])),
    ],
  },
  1: {
    title: 'Loja Ucenicilor',
    subtitle: 'Templul gradului întâi, așezat după planșa lucrărilor: Orientul, pavajul mozaicat, cele trei lumini și pietrele lucrării.',
    motif: 'lodge-apprentice',
    environment: {
      background: '#020a13', fog: '#061420', fogNear: 11, fogFar: 42,
      ambient: '#5b7c93', ambientIntensity: 0.4,
      keyLight: '#f0d79b', keyIntensity: 2.5, keyPosition: [-1.5, 7.5, -7.5],
      camera: [0, 3.1, 6.6], target: [0, 1.5, -5.2],
      floor: { ...LODGE_FLOOR },
      motes: { count: 90, color: '#cfdae8', spread: [16, 6, 21] },
    },
    architecture: lodgeArchitecture(1),
    interactives: [
      interactive('rough-stone', 'symbol', 'Piatra lucrării', 'Un reper pentru observație, disciplină și transformare personală.', [-4.7, 1, -5.7], { type: 'dodecahedron', size: 0.76, detail: 0 }, ROUTES.library,
        learning('Observă înainte să interpretezi', 'Ce asperitate interioară alegi să lucrezi fără grabă?', ['Rotește privirea în jurul obiectului.', 'Notează o observație concretă.', 'Formulează o întrebare, nu o concluzie.']), { sourceRef: 'Catalog intern · gradul 1' }),
      interactive('vertical-reper', 'tool', 'Reperul verticalității', 'Explorează relația dintre intenție, faptă și consecvență.', [4.7, 1.15, -5.7], { type: 'cone', radius: 0.62, height: 1.85, segments: 4 }, ROUTES.library,
        learning('Aliniere', 'Unde există astăzi distanță între ceea ce afirmi și ceea ce faci?', ['Privește axa obiectului.', 'Alege o situație reală.', 'Scrie o acțiune mică și verificabilă.']), { sourceRef: 'Catalog intern · gradul 1', presentation: 'list' }),
      interactive('first-library', 'library', 'Camera studiului introductiv', 'Textele și planșele autorizate gradului activ.', [-4.9, 1, 1.6], { type: 'box', width: 1.65, height: 1.2, depth: 0.42 }, ROUTES.library,
        learning('Studiu activ', 'Ce idee merită comparată cu propria experiență?', ['Citește un fragment scurt.', 'Selectează o propoziție.', 'Pornește o notă sau o dezbatere.']), { actionLabel: 'Deschide studiul', presentation: 'list' }),
      interactive('convocations-one', 'assembly', 'Cercul lucrării', 'Convocatoarele și informațiile permise nivelului tău de acces.', [4.9, 0.85, 3.4], { type: 'torus', radius: 0.68, tube: 0.16, segments: 32 }, ROUTES.convocations,
        learning('Participare', 'Cum te pregătești pentru următoarea lucrare comună?', ['Consultă convocatorul.', 'Confirmă participarea.', 'Pregătește întrebarea pe care o aduci.']), { actionLabel: 'Vezi convocatoarele', presentation: 'list' }),
    ],
  },
  2: {
    title: 'Loja Calfelor',
    subtitle: 'Aceeași sală a lucrărilor, cu steaua flamboyantă aprinsă la Orient, după planșa gradului al doilea.',
    motif: 'lodge-fellowcraft',
    environment: {
      background: '#03101b', fog: '#07202f', fogNear: 11, fogFar: 44,
      ambient: '#6b8ca1', ambientIntensity: 0.48,
      keyLight: '#f5cd72', keyIntensity: 2.9, keyPosition: [2, 8, -8],
      camera: [0, 3.1, 6.6], target: [0, 1.5, -5.2],
      floor: { ...LODGE_FLOOR },
      motes: { count: 120, color: '#ffd98f', spread: [17, 6.2, 22] },
    },
    architecture: lodgeArchitecture(2),
    interactives: [
      interactive('geometry-table', 'tool', 'Masa proporțiilor', 'Un spațiu pentru relații, măsură și verificarea ipotezelor.', [-4.9, 1, -1.6], { type: 'icosahedron', size: 0.86, detail: 1 }, ROUTES.library,
        learning('Construiește o legătură', 'Ce relație dintre două idei poți susține printr-un text?', ['Alege două concepte.', 'Caută pasajele care le susțin.', 'Formulează relația și justificarea.']), { sourceRef: 'Catalog intern · gradul 2' }),
      interactive('concept-vault', 'concept', 'Bolta ideilor', 'Navighează legăturile validate dintre texte și concepte.', [4.9, 1.3, -3.2], { type: 'torusKnot', radius: 0.72, tube: 0.18, segments: 72 }, ROUTES.concepts,
        learning('Relaționare', 'O idee se dezvoltă, contrastează sau exemplifică o alta?', ['Explorează graful.', 'Deschide pasajele ancorate.', 'Propune o relație cu justificare.']), { actionLabel: 'Deschide graful', sourceRef: 'Catalog intern · gradul 2', presentation: 'list' }),
      interactive('study-workshop', 'library', 'Atelierul de studiu', 'Capitole, adnotări și conversații disponibile gradului tău.', [-4.9, 1, 2.4], { type: 'octahedron', size: 0.9 }, ROUTES.library,
        learning('De la lectură la lucrare', 'Cum se schimbă înțelegerea când o idee este discutată?', ['Selectează o ancoră textuală.', 'Scrie interpretarea ta.', 'Invită o perspectivă argumentată.']), { actionLabel: 'Continuă studiul', presentation: 'list' }),
      interactive('convocations-two', 'assembly', 'Cercul participării', 'Pregătire, prezență și contribuție la lucrarea comună.', [4.9, 0.85, 3.6], { type: 'torus', radius: 0.74, tube: 0.17, segments: 40 }, ROUTES.convocations,
        learning('Contribuție', 'Ce poți aduce concret următoarei întâlniri?', ['Consultă temele.', 'Alege o contribuție realistă.', 'Confirmă disponibilitatea.']), { actionLabel: 'Vezi convocatoarele', presentation: 'list' }),
    ],
  },
  3: {
    title: 'Camera de Mijloc',
    subtitle: 'Sala lucrărilor văzută în întregime, cu bolta înstelată și lumina Orientului, după planșa gradului al treilea.',
    motif: 'middle-chamber',
    environment: {
      background: '#01060f', fog: '#0a1526', fogNear: 12, fogFar: 46,
      ambient: '#71809f', ambientIntensity: 0.46,
      keyLight: '#f2d089', keyIntensity: 3.15, keyPosition: [0, 8.5, -9],
      camera: [0, 3.1, 6.6], target: [0, 1.5, -5.2],
      floor: { ...LODGE_FLOOR },
      motes: { count: 160, color: '#dde5f4', spread: [18, 6.4, 23] },
    },
    architecture: lodgeArchitecture(3),
    interactives: [
      interactive('living-plan', 'symbol', 'Planșa vie', 'Sinteze, conexiuni și întrebări care traversează întregul parcurs autorizat.', [-2.8, 1.15, 3.6], { type: 'icosahedron', size: 1.08, detail: 1 }, ROUTES.concepts,
        learning('Sinteză', 'Ce legătură poate transforma cunoașterea într-o lucrare utilă?', ['Privește mai multe surse.', 'Separă faptele de interpretări.', 'Propune un proiect verificabil.']), { actionLabel: 'Explorează legăturile', sourceRef: 'Catalog intern · gradul 3' }),
      interactive('mentor-circle', 'mentor', 'Cercul mentoratului', 'Spațiul pentru orientare, întrebări și continuitatea studiului.', [-4.9, 0.9, -0.4], { type: 'torus', radius: 0.9, tube: 0.2, segments: 48 }, ROUTES.library,
        learning('Însoțire', 'Ce întrebare îl ajută pe celălalt să descopere singur?', ['Ascultă înainte să explici.', 'Întreabă fără să conduci răspunsul.', 'Leagă reflecția de o sursă accesibilă.']), { actionLabel: 'Deschide studiul', presentation: 'list' }),
      interactive('project-seed', 'project', 'Masa proiectelor', 'Transformă o idee argumentată într-o inițiativă de grup.', [4.9, 0.95, -1.2], { type: 'dodecahedron', size: 0.88 }, ROUTES.library,
        learning('De la sens la faptă', 'Care este cel mai mic rezultat util pe care grupul îl poate produce?', ['Definește beneficiarul.', 'Stabilește rezultatul și responsabilitățile.', 'Revizuiește progresul fără competiție.']), { sourceRef: 'Catalog intern · gradul 3', presentation: 'list' }),
      interactive('convocations-three', 'assembly', 'Cercul lucrării comune', 'Convocatoare, articole și participare conform accesului activ.', [2.6, 0.85, 4.6], { type: 'torus', radius: 0.82, tube: 0.18, segments: 48 }, ROUTES.convocations,
        learning('Pregătire', 'Cum sprijini claritatea și rostul următoarei lucrări?', ['Consultă ordinea de zi.', 'Pregătește o sinteză scurtă.', 'Confirmă responsabilitatea asumată.']), { actionLabel: 'Vezi convocatoarele', presentation: 'list' }),
    ],
  },
});

const OFFICE_INTERACTIVES = Object.freeze({
  secretary: interactive('office-secretariat', 'office', 'Scriptoriumul Secretarului', 'Registru matricol, dosare, convocatoare, prezențe și documente oficiale.', [-6.7, 1.75, -5.7], { type: 'box', width: 1.25, height: 1.55, depth: 0.5 }, ROUTES.register,
    learning('Memorie exactă', 'Ce înregistrare trebuie verificată înainte să devină stare canonică?', ['Consultă documentul-sursă.', 'Validează cronologia.', 'Înregistrează decizia în audit.']), { actionLabel: 'Deschide Secretariatul', presentation: 'list' }),
  venerable: interactive('office-governance', 'office', 'Masa conducerii', 'Context anual, aprobări și supravegherea lucrării administrative.', [0, 2.1, -8.1], { type: 'cylinder', radius: 1, height: 0.35, segments: 8 }, ROUTES.register,
    learning('Supraveghere', 'Ce decizie are nevoie de context, responsabil și urmă de audit?', ['Verifică temeiul.', 'Separă aprobarea de execuție.', 'Urmărește rezultatul.']), { actionLabel: 'Deschide registrul', presentation: 'list' }),
  treasurer: interactive('office-treasury', 'office', 'Camera Măsurii', 'Bugete, cotizații, mișcări și documente justificative.', [6.5, 2.05, -9.5], { type: 'cylinder', radius: 0.82, height: 0.42, segments: 32 }, ROUTES.treasury,
    learning('Trasabilitate', 'Poate fi reconstituită fiecare mișcare din documente și aprobări?', ['Verifică perioada și categoria.', 'Atașează justificarea.', 'Folosește reversarea, nu ștergerea.']), { actionLabel: 'Deschide Metalele', presentation: 'list' }),
  hospitalier: interactive('office-hospitality', 'office', 'Vatra fraternă', 'Evenimente și cazuri de sprijin cu acces strict.', [-6.5, 2.05, -9.5], { type: 'sphere', size: 0.83 }, ROUTES.hospitality,
    learning('Discreție activă', 'Care este ajutorul potrivit, oferit cu minimum de expunere?', ['Clarifică nevoia.', 'Limitează accesul la informație.', 'Urmărește sprijinul cu respect.']), { actionLabel: 'Deschide Ospitalierul', presentation: 'list' }),
  librarian: interactive('office-library', 'office', 'Arhiva studiului', 'Cărți, structură textuală, concepte și moderarea dezbaterilor.', [-5.6, 1.05, 3.9], { type: 'octahedron', size: 0.83 }, ROUTES.library,
    learning('Sursă și sens', 'Este fiecare afirmație legată de o sursă și de nivelul corect de acces?', ['Verifică drepturile.', 'Validează structura.', 'Publică numai versiunea revizuită.']), { actionLabel: 'Deschide Biblioteca', presentation: 'list' }),
  mentor: interactive('office-mentor', 'office', 'Pragul mentorului', 'Îndrumarea parcursului educativ fără automatizarea gradelor.', [-5.6, 1.05, 5.6], { type: 'torusKnot', radius: 0.62, tube: 0.14, segments: 56 }, ROUTES.library,
    learning('Îndrumare', 'Cum poți susține progresul fără să înlocuiești descoperirea personală?', ['Propune o întrebare.', 'Indică o sursă accesibilă.', 'Oferă feedback concret.']), { actionLabel: 'Deschide studiul', presentation: 'list' }),
});

export function gradeName(grade) {
  return GRADE_NAMES[Number(grade)] || GRADE_NAMES[0];
}

export function getScenePreset(grade, officeCodes = []) {
  const selectedGrade = [1, 2, 3].includes(Number(grade)) ? Number(grade) : 0;
  const base = SCENES[selectedGrade];
  const officeItems = [...new Set(officeCodes)]
    .map((code) => OFFICE_INTERACTIVES[code])
    .filter(Boolean);
  return {
    ...base,
    gate: { ...BASE_GATE },
    environment: { ...base.environment },
    architecture: base.architecture.map((item) => ({ ...item })),
    interactives: [...base.interactives.map((item) => ({ ...item })), ...officeItems.map((item) => ({ ...item }))],
  };
}

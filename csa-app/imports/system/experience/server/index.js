import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';
import { Meteor } from 'meteor/meteor';
import { Roles } from 'meteor/roles';
import {
  CraftMemberships,
  DegreeEvents,
  Entitati,
  LodgeMemberships,
  OfficeDefinitions,
  OfficeDelegations,
  OfficeTerms,
} from '/imports/api/collections.js';
import { hasActiveOffice, requireCompositeAccess } from '/imports/lib/access/server.js';
import { CATALOG_VERSION, getImplementationCatalog } from '/imports/system/temple/catalog/index.js';
import { TempleExperienceSignals } from '../signals.js';
import { getScenePreset, gradeName } from './scenes.js';

const EXPERIENCE_VERSION = '2026.07.13-2';

// Repere care rămân în navigatorul semantic, dar nu primesc corp 3D în scenă:
// nu au o reprezentare fizică fidelă planșei și încărcau vizual templul.
// Funcțiile au deja pupitrele lor în arhitectură; markerele lor plutitoare
// sunt toate doar în listă.
const LIST_ONLY_SYMBOL_IDS = new Set([
  'g1-great-lights',
  'g1-plumb-axis',
  'g2-great-lights',
  'g3-acacia',
  'g3-circle-center',
  'g3-great-lights',
  'g3-master-board',
  'g3-memory-veil',
  'g3-travel-lines',
]);

function normalizeOfficeCode(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 64);
}

function safeRoute(value, fallback = '/biblioteca') {
  const route = String(value || '').trim();
  return /^\/[a-z0-9/_-]*$/i.test(route) && !route.startsWith('//') ? route : fallback;
}

function normalizedPosition(position, index = 0) {
  const source = position && typeof position === 'object' ? position : {};
  const x = Math.max(-1, Math.min(1, Number(source.x) || 0));
  const y = Math.max(0, Math.min(2.2, Number(source.y) || 0));
  const z = Math.max(-1, Math.min(1, Number(source.z) || 0));
  const offset = ((index % 4) - 1.5) * 0.38;
  return [x * 7.1 + offset, 0.72 + y * 2.35, -3.1 - z * 5.7 + ((index % 3) - 1) * 0.32];
}

function symbolGeometry(symbol, index) {
  const interaction = String(symbol?.interaction?.type || '');
  if (/stone|construct|pattern/.test(interaction)) return { type: index % 2 ? 'box' : 'dodecahedron', size: 0.68, width: 1.1, height: 0.52, depth: 1.1 };
  if (/balance|axis|orientation/.test(interaction)) return { type: 'cone', radius: 0.52, height: 1.45, segments: 4 };
  if (/orbit|constellation|light/.test(interaction)) return { type: index % 2 ? 'sphere' : 'icosahedron', size: 0.67, detail: 1 };
  if (/circle|season|perspective/.test(interaction)) return { type: 'torus', radius: 0.7, tube: 0.14, segments: 40 };
  if (/timeline|veil/.test(interaction)) return { type: 'box', width: 1.35, height: 1.05, depth: 0.2 };
  if (/path|map/.test(interaction)) return { type: 'torusKnot', radius: 0.58, tube: 0.13, segments: 56 };
  return { type: ['octahedron', 'icosahedron', 'dodecahedron'][index % 3], size: 0.7, detail: 0 };
}

function readableCapability(value) {
  return String(value || '').replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase()).slice(0, 140);
}

function catalogSymbolItems(catalog, scene) {
  const zones = new Map((catalog?.scene?.zones || []).map((zone) => [zone.id, zone.position]));
  const palette = catalog?.scene?.atmosphere?.palette || [];
  return (catalog?.symbols || []).slice(0, 18).map((symbol, index) => ({
    id: `catalog-${String(symbol.id || index).replace(/[^a-z0-9_-]/gi, '-')}`,
    kind: 'symbol',
    label: String(symbol.label || 'Reper simbolic').slice(0, 120),
    description: String(symbol.objective || 'Explorează acest reper în contextul educativ al gradului activ.').slice(0, 520),
    position: normalizedPosition(zones.get(symbol.zoneId), index),
    geometry: symbolGeometry(symbol, index),
    route: '/biblioteca',
    actionLabel: 'Continuă reflecția',
    color: /^#[0-9a-f]{6}$/i.test(palette[(index + 2) % palette.length]) ? palette[(index + 2) % palette.length] : '#d8bd72',
    haloColor: '#f5e3aa',
    presentation: LIST_ONLY_SYMBOL_IDS.has(String(symbol.id)) ? 'list' : 'scene',
    education: {
      objective: 'Descoperire ghidată',
      prompt: String(symbol.prompt || 'Ce observi și cum poți transforma observația într-o întrebare utilă?').slice(0, 420),
      steps: ['Observă forma și poziția în spațiu.', 'Leagă observația de o experiență concretă.', 'Păstrează o întrebare pentru studiu sau dezbatere.'],
    },
    sourceRef: `Catalog intern · versiune editorială ${String(catalog?.editorialRelease || 'activă').slice(0, 80)}`,
  }));
}

function catalogOfficerItems(catalog) {
  return (catalog?.officers || []).slice(0, 16).map((officer, index) => ({
    id: `catalog-office-${normalizeOfficeCode(officer.code) || index}`,
    kind: 'office',
    label: String(officer.interaction?.label || officer.label || 'Funcție activă').slice(0, 120),
    description: String(officer.responsibility || 'Instrumente disponibile titularului funcției active.').slice(0, 520),
    position: normalizedPosition(officer.position, index),
    geometry: { type: index % 3 === 0 ? 'cylinder' : index % 3 === 1 ? 'octahedron' : 'torus', radius: 0.62, height: 0.72, tube: 0.14, segments: 32, size: 0.68 },
    route: safeRoute(officer.interaction?.route, '/'),
    actionLabel: String(officer.interaction?.label || 'Deschide instrumentele').slice(0, 80),
    color: '#d7bd78',
    haloColor: '#9ed9e8',
    presentation: 'list',
    education: {
      objective: String(officer.label || 'Responsabilitate anuală').slice(0, 140),
      prompt: 'Cum poate fi exercitată această responsabilitate clar, discret și cu urmă de audit?',
      steps: (officer.interaction?.capabilities || []).slice(0, 4).map(readableCapability),
    },
    sourceRef: 'Poziție și responsabilitate din catalogul intern autorizat',
  }));
}

function learningStages(catalog) {
  const path = catalog?.learningPath;
  if (!path || !Array.isArray(path.stages)) return [];
  return path.stages.slice(0, 8).map((stage, index) => ({
    id: String(stage.id || `stage-${index}`).slice(0, 80),
    label: String(stage.label || `Etapa ${index + 1}`).slice(0, 120),
    description: String(stage.activity || '').slice(0, 260),
  }));
}

function mergeCatalog(preset, catalog) {
  if (!catalog?.scene) return { ...preset, catalogVersion: CATALOG_VERSION, learningPath: [] };
  const catalogSymbols = catalogSymbolItems(catalog, preset);
  const catalogOfficers = catalogOfficerItems(catalog);
  const navigationItems = preset.interactives.filter((item) => (
    ['assembly', 'concept', 'dashboard', 'library', 'mentor', 'project'].includes(item.kind)
  ));
  return {
    ...preset,
    title: String(catalog.scene.title || preset.title).slice(0, 140),
    subtitle: String(catalog.scene.subtitle || preset.subtitle).slice(0, 340),
    motif: String(catalog.scene.id || preset.motif).slice(0, 80),
    catalogVersion: catalog.version || CATALOG_VERSION,
    interactives: [...navigationItems, ...catalogSymbols, ...catalogOfficers],
    learningPath: learningStages(catalog),
    sourceCatalogCount: Array.isArray(catalog.sourceRefs) ? catalog.sourceRefs.length : 0,
  };
}

async function authorizedOffices(access) {
  const definitions = await OfficeDefinitions.find(
    { eId: access.eId, status: 'active' },
    { fields: { code: 1, name: 1, minGrade: 1 }, sort: { order: 1, name: 1 } },
  ).fetchAsync();
  if (access.superAdmin) return definitions;
  const decisions = await Promise.all(definitions.map(async (definition) => ({
    definition,
    allowed: access.grade >= Number(definition.minGrade || 3)
      && await hasActiveOffice(access.userId, access.eId, [definition.code]),
  })));
  return decisions.filter((entry) => entry.allowed).map((entry) => entry.definition);
}

export async function buildExperienceManifest(context, options = null) {
  const access = await requireCompositeAccess(context, {
    auditAction: 'temple.experience.read',
    auditEntityType: 'temple',
    auditEntityId: 'experience',
  });
  // Gradul de vizualizare este limitat strict la gradul efectiv: Calfa poate
  // deschide scena Ucenicului, Maestrul pe toate; administratorul platformei
  // le poate inspecta pe toate. Nimeni nu vede o scenă peste gradul propriu.
  const maxGrade = access.superAdmin ? 3 : Math.max(0, Math.min(3, Number(access.grade) || 0));
  const requestedGrade = Math.round(Number(options && typeof options === 'object' ? options.viewGrade : NaN));
  const viewGrade = [1, 2, 3].includes(requestedGrade) && requestedGrade <= maxGrade
    ? requestedGrade
    : Math.min(access.grade, maxGrade) || access.grade;
  // Markerele funcțiilor apar numai în scena gradului propriu, pentru ca
  // vizualizarea unui grad inferior să rămână fidelă planșei acelui grad.
  const offices = viewGrade === maxGrade ? await authorizedOffices(access) : [];
  const officeCodes = offices.map((office) => normalizeOfficeCode(office.code)).filter(Boolean);
  const catalog = getImplementationCatalog({
    grade: viewGrade,
    officeCodes,
    superAdmin: access.superAdmin,
    enabledOptionalSymbolIds: [],
  });
  const preset = getScenePreset(viewGrade, officeCodes);
  const scene = mergeCatalog(preset, catalog);
  const tenant = await Entitati.findOneAsync(access.eId, { fields: { nume: 1, name: 1 } });
  return {
    version: `${EXPERIENCE_VERSION}:${scene.catalogVersion || CATALOG_VERSION}:g${viewGrade}`,
    catalogVersion: scene.catalogVersion || CATALOG_VERSION,
    tenant: { id: access.eId, name: tenant?.nume || tenant?.name || 'Loja activă' },
    access: {
      grade: access.grade,
      gradeLabel: gradeName(access.grade),
      viewGrade,
      viewGradeLabel: gradeName(viewGrade),
      maxGrade,
      platformAdmin: access.superAdmin,
      offices: offices.map((office) => ({ code: normalizeOfficeCode(office.code), label: office.name || office.code })),
    },
    title: scene.title,
    subtitle: scene.subtitle,
    motif: scene.motif,
    gate: scene.gate,
    environment: scene.environment,
    architecture: scene.architecture,
    interactives: scene.interactives,
    learningPath: scene.learningPath,
  };
}

Meteor.methods({
  async 'temple.experienceManifest'(options = null) {
    return buildExperienceManifest(this, options && typeof options === 'object' ? { viewGrade: options.viewGrade } : null);
  },
});

Meteor.publish('temple.experienceAccessSignal', async function experienceAccessSignalPublication() {
  if (!this.userId) {
    this.ready();
    return undefined;
  }

  const publication = this;
  const signalId = this.userId;
  let revision = Date.now();
  let stopped = false;
  let debounceTimer = null;
  let boundaryTimer = null;
  let roleFallbackTimer = null;
  const handles = [];
  publication.onStop(() => {
    stopped = true;
    Meteor.clearTimeout(debounceTimer);
    Meteor.clearTimeout(boundaryTimer);
    Meteor.clearInterval(roleFallbackTimer);
    handles.forEach((handle) => handle?.stop?.());
  });
  const signal = () => {
    if (stopped) return;
    Meteor.clearTimeout(debounceTimer);
    debounceTimer = Meteor.setTimeout(() => {
      if (stopped) return;
      revision = Math.max(Date.now(), revision + 1);
      publication.changed(TempleExperienceSignals._name, signalId, { revision });
    }, 25);
  };
  const actorId = this.userId;
  const user = await Meteor.users.findOneAsync(actorId, { fields: { entitati: 1 } });
  const tenantIds = Object.keys(user?.entitati || {})
    .filter((eId) => eId !== 'all' && /^[A-Za-z0-9_-]+$/.test(eId))
    .slice(0, 64);
  const tenantSelector = tenantIds.length ? { $in: tenantIds } : { $in: ['__none__'] };

  const scheduleBoundary = async () => {
    Meteor.clearTimeout(boundaryTimer);
    boundaryTimer = null;
    if (stopped || !tenantIds.length) return;
    const [terms, delegations, degreeEvents] = await Promise.all([
      OfficeTerms.find(
        { eId: tenantSelector, userId: actorId, status: 'active' },
        { fields: { startAt: 1, startsAt: 1, endAt: 1, endsAt: 1 } },
      ).fetchAsync(),
      OfficeDelegations.find(
        { eId: tenantSelector, delegateUserId: actorId, status: 'active' },
        { fields: { officeTermId: 1, startAt: 1, startsAt: 1, endAt: 1, endsAt: 1 } },
      ).fetchAsync(),
      DegreeEvents.find(
        { eId: tenantSelector, userId: actorId, status: { $ne: 'revoked' } },
        { fields: { effectiveAt: 1 } },
      ).fetchAsync(),
    ]);
    const parentIds = delegations.map((row) => row.officeTermId).filter(Boolean);
    const parentTerms = parentIds.length
      ? await OfficeTerms.find(
        { _id: { $in: parentIds }, eId: tenantSelector, status: 'active' },
        { fields: { startAt: 1, startsAt: 1, endAt: 1, endsAt: 1 } },
      ).fetchAsync()
      : [];
    if (stopped) return;
    const now = Date.now();
    const dates = [...terms, ...delegations, ...parentTerms, ...degreeEvents]
      .flatMap((row) => [row.startAt, row.startsAt, row.endAt, row.endsAt, row.effectiveAt])
      .map((value) => value instanceof Date ? value.getTime() : new Date(value || 0).getTime())
      .filter((value) => Number.isFinite(value) && value > now + 10);
    if (!dates.length) return;
    const delay = Math.min(Math.min(...dates) - now + 25, 24 * 60 * 60 * 1000);
    boundaryTimer = Meteor.setTimeout(() => {
      signal();
      void scheduleBoundary();
    }, Math.max(25, delay));
  };

  const authorizationChanged = () => {
    signal();
    void scheduleBoundary();
  };
  const observe = async (cursor) => {
    let priming = true;
    const changed = () => {
      if (!priming) authorizationChanged();
    };
    const handle = await Promise.resolve(cursor.observeChanges({ added: changed, changed, removed: changed }));
    priming = false;
    if (stopped) handle?.stop?.();
    else handles.push(handle);
  };

  publication.added(TempleExperienceSignals._name, signalId, { revision });
  await observe(Meteor.users.find({ _id: actorId }, { fields: { entitati: 1, setari: 1 } }));
  await observe(LodgeMemberships.find({ eId: tenantSelector, userId: actorId }, { fields: { status: 1, currentGrade: 1, grade: 1 } }));
  await observe(CraftMemberships.find({ eId: tenantSelector, userId: actorId }, { fields: { status: 1, grade: 1 } }));
  await observe(DegreeEvents.find({ eId: tenantSelector, userId: actorId }, { fields: { status: 1, grade: 1, effectiveAt: 1 } }));
  // Toate mandatele tenanturilor actorului sunt urmărite: o delegare devine
  // invalidă imediat când mandatul părinte este revocat sau expiră.
  await observe(OfficeTerms.find({ eId: tenantSelector }, { fields: { userId: 1, officeCode: 1, status: 1, startAt: 1, startsAt: 1, endAt: 1, endsAt: 1 } }));
  await observe(OfficeDelegations.find({ eId: tenantSelector, delegateUserId: actorId }, { fields: { officeTermId: 1, officeCode: 1, status: 1, startAt: 1, startsAt: 1, endAt: 1, endsAt: 1, actions: 1 } }));
  await observe(OfficeDefinitions.find({ eId: tenantSelector }, { fields: { code: 1, status: 1, minGrade: 1, permissions: 1 } }));
  await observe(Entitati.find({ _id: tenantSelector }, { fields: { status: 1 } }));
  if (Meteor.roleAssignment) {
    await observe(Meteor.roleAssignment.find(
      { $or: [{ 'user._id': actorId }, { userId: actorId }] },
      { fields: { role: 1, scope: 1 } },
    ));
  } else {
    // Pachetele roles vechi pot să nu expună colecția reactivă. În acel caz
    // comparăm periodic rolurile și emitem semnal numai când se schimbă.
    const scopes = [...tenantIds, 'default-grup', null];
    let roleFingerprint = JSON.stringify(await Promise.all(
      scopes.map((scope) => Roles.getRolesForUserAsync(actorId, { scope })),
    ));
    roleFallbackTimer = Meteor.setInterval(async () => {
      if (stopped) return;
      try {
        const next = JSON.stringify(await Promise.all(
          scopes.map((scope) => Roles.getRolesForUserAsync(actorId, { scope })),
        ));
        if (next !== roleFingerprint) {
          roleFingerprint = next;
          authorizationChanged();
        }
      } catch (error) {
        // O eroare tranzitorie de polling nu publică drepturi și va fi
        // reevaluată la următorul interval sau la următorul eveniment DDP.
      }
    }, 2000);
  }
  await scheduleBoundary();
  if (stopped) return undefined;
  publication.ready();
  return undefined;
});

DDPRateLimiter.addRule({
  type: 'method',
  name: 'temple.experienceManifest',
  userId(userId) { return typeof userId === 'string' && userId.length > 0; },
}, 60, 60 * 1000);
DDPRateLimiter.addRule({
  type: 'method',
  name: 'temple.experienceManifest',
  connectionId(connectionId) { return typeof connectionId === 'string' && connectionId.length > 0; },
}, 90, 60 * 1000);

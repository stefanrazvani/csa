// IMPORTANT: server-only contract. Import this module from server code only.
// It deliberately contains no passwords, signs, grips, oath text, long ritual
// excerpts, personal data or row-level data from the supplied registry.

import { SOURCE_HIERARCHY, SOURCE_REFS } from './sources.js';
import { GRADE_SCENES } from './scenes.js';
import { SYMBOL_CATALOG } from './symbols.js';
import { LEARNING_PATHS } from './learning.js';
import { OFFICE_ALIASES, OFFICER_CATALOG } from './officers.js';
import { EDITORIAL_RELEASE } from './editorial.js';

export const CATALOG_VERSION = '2026.07.13-3';
export { SOURCE_HIERARCHY };

const SOURCE_RANK = new Map(SOURCE_HIERARCHY.map((item) => [item.key, item.rank]));

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeGrade(value, superAdmin) {
  if (superAdmin) return 3;
  const parsed = Number.parseInt(value, 10);
  return [1, 2, 3].includes(parsed) ? parsed : 0;
}

function normalizeOfficeCodes(values) {
  if (!Array.isArray(values)) return new Set();
  return new Set(values.slice(0, 64).map((value) => {
    const raw = typeof value === 'string' ? value : value?.code;
    const normalized = String(raw || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    return OFFICE_ALIASES[normalized] || normalized;
  }).filter(Boolean));
}

function normalizeIds(values, limit = 128) {
  if (!Array.isArray(values)) return new Set();
  return new Set(values.slice(0, limit).map((value) => String(value || '').trim()).filter(Boolean));
}

function collectSourceIds(...items) {
  const ids = new Set();
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object') return;
    if (Array.isArray(value.sourceRefIds)) value.sourceRefIds.forEach((id) => ids.add(id));
    Object.values(value).forEach(visit);
  };
  items.forEach(visit);
  return ids;
}

function publicSourceRef(source) {
  return {
    id: source.id,
    document: source.document,
    kind: source.kind,
    authorityTier: source.authorityTier,
    locator: clone(source.locator),
    use: source.use,
    review: clone(source.review),
  };
}

/**
 * Returns only the effective degree scene and explicitly authorized offices.
 * The full implementation catalog is never returned in a single payload.
 */
export function getImplementationCatalog({
  grade,
  officeCodes = [],
  superAdmin = false,
  enabledOptionalSymbolIds = [],
} = {}) {
  const isSuperAdmin = superAdmin === true;
  const effectiveGrade = normalizeGrade(grade, isSuperAdmin);
  const scene = effectiveGrade ? clone(GRADE_SCENES[effectiveGrade]) : null;
  const allowedOfficeCodes = normalizeOfficeCodes(officeCodes);

  const symbolIds = new Set(scene?.symbolIds || []);
  const editoriallyApproved = new Set(EDITORIAL_RELEASE.approvedSymbolIds);
  const approvedOptional = new Set(EDITORIAL_RELEASE.approvedOptionalSymbolIds);
  const enabledOptional = normalizeIds(enabledOptionalSymbolIds);
  const symbols = effectiveGrade
    ? SYMBOL_CATALOG.filter((symbol) => (
      symbol.grade === effectiveGrade
      && symbolIds.has(symbol.id)
      && editoriallyApproved.has(symbol.id)
      && (!symbol.optional || (approvedOptional.has(symbol.id) && enabledOptional.has(symbol.id)))
    )).map(clone)
    : [];

  const officers = effectiveGrade === 3
    ? OFFICER_CATALOG.filter((officer) => (
      effectiveGrade >= officer.minGrade && (isSuperAdmin || allowedOfficeCodes.has(officer.code))
    )).map(clone)
    : [];

  const learningPath = effectiveGrade ? clone(LEARNING_PATHS[effectiveGrade]) : null;
  const usedSourceIds = collectSourceIds(scene, symbols, officers, learningPath);
  const sourceRefs = SOURCE_REFS
    .filter((source) => usedSourceIds.has(source.id))
    .sort((left, right) => (SOURCE_RANK.get(left.authorityTier) || 99) - (SOURCE_RANK.get(right.authorityTier) || 99))
    .map(publicSourceRef);

  return {
    version: CATALOG_VERSION,
    editorialRelease: EDITORIAL_RELEASE.id,
    grade: effectiveGrade,
    scene,
    symbols,
    officers,
    learningPath,
    sourceRefs,
  };
}

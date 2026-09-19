// Pure helpers: never copy credentials or private document contents into history.
const VISIBLE = new Set(['nume', 'name', 'title', 'status', 'sys_status', 'grade', 'currentGrade', 'level', 'accessLevel', 'minGrade', 'nr', 'order', 'nrArticol', 'numeLoja', 'nrLoja', 'orientul', 'templu', 'dataTinuta', 'dataConfirmare', 'dataAccess', 'data_access', 'tinuta', 'agapa', 'meniu', 'attended', 'amount', 'currency', 'direction', 'category', 'type', 'officeCode', 'startAt', 'endAt', 'effectiveAt', 'joinedAt', 'expiresAt']);
const OMIT = /password|secret|token|authorization|cookie|services|privatepath|storagekey|objectkey/i;
const INTERNAL = new Set(['_id', 'updatedAt', 'createdAt', 'updatedBy', 'createdBy']);
function comparable(value) { return JSON.stringify(value); }
function shown(key, value) {
  if (value === undefined) return '(lipsește)';
  if (!VISIBLE.has(key)) return '[valoare protejată]';
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value.slice(0, 1000) : typeof value === 'object' && value !== null ? '[date structurate]' : value;
}
export function describeChanges(before = {}, after = {}) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(key => !OMIT.test(key) && !INTERNAL.has(key) && comparable(before[key]) !== comparable(after[key]))
    .slice(0, 80).map(field => ({ field, before: shown(field, before[field]), after: shown(field, after[field]) }));
}

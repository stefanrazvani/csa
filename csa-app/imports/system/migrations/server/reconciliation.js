import { createHash } from 'node:crypto';

// Only business fields can be reconciled. IDs, roles, credentials, tokens and new-module data stay local.
export const RECONCILABLE_FIELDS = {
  convocatoare: ['nr', 'nume', 'numeLoja', 'nrLoja', 'orientul', 'templu', 'adresaTemplu', 'status', 'dataTinuta', 'dataConfirmare', 'dataAccess', 'data_access', 'numarTinuta', 'observatii', 'sys_status'],
  documente_text: ['documentId', 'nr', 'nrArticol', 'order', 'continut', 'level', 'tip', 'sys_status'],
  prezenta: ['nr', 'nume', 'tinutaNr', 'templu', 'numeLoja', 'dataTinuta', 'dataConfirmare', 'orientul', 'nrLoja', 'status', 'sys_status'],
  prezenta_confirmari: ['nr', 'nume', 'tinutaNr', 'dataTinuta', 'dataConfirmare', 'confirmareTinuta', 'confirmareAgapa', 'confirmareMeniuVegetarian', 'confirmareMeniuStandard', 'motivAbsenta', 'motivAbsentaAgapa', 'confirmareFinala', 'status', 'sys_status'],
  documente: ['moduleAlias', 'objectId', 'filename', 'mimeType', 'sys_status'],
  users: ['setari.nume', 'setari.prenume', 'setari.oras', 'setari.judet'],
};

export function getField(row, path) {
  return path.split('.').reduce((value, key) => value?.[key], row);
}

function stable(value) {
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value === undefined ? { $undefined: true } : value;
}

export function fingerprint(row) {
  return createHash('sha256').update(JSON.stringify(stable(row))).digest('hex');
}

export function fieldDifferences(collection, source, target) {
  return (RECONCILABLE_FIELDS[collection] || []).filter((field) => fingerprint(getField(source, field)) !== fingerprint(getField(target, field))).map((field) => ({ field, source: getField(source, field), target: getField(target, field), sourceMissing: getField(source, field) === undefined }));
}

export function reconciliationUpdate(collection, source, fields) {
  if (!fields.length || fields.some((field) => !(RECONCILABLE_FIELDS[collection] || []).includes(field))) throw new Error('Câmpuri de reconciliere invalide.');
  const update = { $set: {}, $unset: {} };
  for (const field of fields) {
    const value = getField(source, field);
    if (value === undefined) update.$unset[field] = 1;
    else update.$set[field] = value;
  }
  if (!Object.keys(update.$set).length) delete update.$set;
  if (!Object.keys(update.$unset).length) delete update.$unset;
  return update;
}

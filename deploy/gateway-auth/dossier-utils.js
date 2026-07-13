import { safeOriginalName } from './document-utils.js';

export const DOSSIER_DOCUMENT_FIELDS = new Set([
  'title',
  'category',
  'documentNumber',
  'issuer',
  'issuedAt',
  'expiresAt',
  'visibility',
  'note',
]);

const DOCUMENT_CATEGORIES = new Set([
  'request',
  'certificate',
  'diploma',
  'decision',
  'identity_evidence',
  'transfer',
  'leave',
  'correspondence',
  'other',
]);
const VISIBILITIES = new Set(['secretariat', 'member']);

function text(value, max) {
  return String(value ?? '')
    .replace(/\0/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

function optionalDate(value, label) {
  const input = text(value, 64);
  if (!input) return null;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} este invalidă.`);
  return date;
}

export function normalizeDossierDocumentFields(fields = {}) {
  const title = text(fields.title, 240);
  if (!title) throw new Error('Titlul documentului este obligatoriu.');
  const category = text(fields.category, 40).toLowerCase() || 'other';
  if (!DOCUMENT_CATEGORIES.has(category)) throw new Error('Categoria documentului este invalidă.');
  const visibility = text(fields.visibility, 20).toLowerCase() || 'secretariat';
  if (!VISIBILITIES.has(visibility)) throw new Error('Vizibilitatea documentului este invalidă.');
  const issuedAt = optionalDate(fields.issuedAt, 'Data emiterii');
  const expiresAt = optionalDate(fields.expiresAt, 'Data expirării');
  if (issuedAt && expiresAt && expiresAt < issuedAt) {
    throw new Error('Data expirării nu poate preceda data emiterii.');
  }
  return {
    title,
    category,
    documentNumber: text(fields.documentNumber, 120),
    issuer: text(fields.issuer, 240),
    issuedAt,
    expiresAt,
    visibility,
    note: text(fields.note, 2000),
  };
}

export function dossierObjectPrefix(eId, userId) {
  const tenant = String(eId || '').trim();
  const member = String(userId || '').trim();
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(tenant) || !/^[A-Za-z0-9_-]{1,120}$/.test(member)) {
    throw new Error('Identificator de dosar invalid.');
  }
  return `${tenant}/dossiers/${member}/`;
}

export function validDossierObjectReference(objectRef, { eId, userId, bucket }) {
  if (!objectRef || typeof objectRef !== 'object' || Array.isArray(objectRef)) return false;
  if (objectRef.provider !== 'minio' || objectRef.bucket !== bucket) return false;
  const key = String(objectRef.key || '');
  if (!key.startsWith(dossierObjectPrefix(eId, userId)) || key.includes('..') || /[\\\0\r\n]/.test(key)) return false;
  const size = Number(objectRef.size);
  return Number.isSafeInteger(size) && size > 0;
}

export function isActiveWindow(row, now = new Date()) {
  if (!row || row.status !== 'active') return false;
  const at = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(at.getTime())) return false;
  const start = row.startAt || row.startsAt;
  const end = row.endAt || row.endsAt;
  return (!start || new Date(start) <= at) && (!end || new Date(end) >= at);
}

export function attachmentContentDisposition(originalName) {
  const safe = safeOriginalName(originalName || 'document');
  const fallback = safe.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(safe).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

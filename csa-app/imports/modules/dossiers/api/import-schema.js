const MAX_TEXT = 2000;

export const IMPORT_ROW_FIELDS = Object.freeze([
  'sourceRow', 'externalRowNo', 'userId', 'email', 'matriculationNo',
  'familyName', 'givenName', 'birthName', 'birthDate', 'birthPlace',
  'citizenship', 'maritalStatus', 'phone', 'country', 'county', 'city', 'postalCode',
  'street', 'addressLine2', 'occupation', 'employer',
  'associationMemberNo', 'associationStatus', 'membershipStatus', 'joinedAt',
  'grade1At', 'grade1Lodge', 'grade2At', 'grade2Lodge', 'grade3At',
  'grade3Lodge', 'transferAt', 'transferLodge', 'leaveStartedAt',
  'leaveEndedAt', 'demitAt', 'reinstatedAt', 'removedAt', 'deceasedAt',
  'sponsor1', 'sponsor2', 'offices', 'notes',
]);

const DATE_FIELDS = new Set([
  'birthDate', 'joinedAt', 'grade1At', 'grade2At', 'grade3At', 'transferAt',
  'leaveStartedAt', 'leaveEndedAt', 'demitAt', 'reinstatedAt', 'removedAt',
  'deceasedAt',
]);

const STATUS_VALUES = new Set(['active', 'inactive', 'suspended', 'left', 'deceased', '']);
const ASSOCIATION_STATUS_VALUES = new Set(['member', 'non_member', 'pending', 'former', 'unknown', '']);

function scalar(value, max = MAX_TEXT) {
  if (value === undefined || value === null) return '';
  if (!['string', 'number', 'boolean'].includes(typeof value)) return '';
  return String(value).replace(/\0/g, '').replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

function normalizeDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const text = scalar(value, 40);
  if (!text) return '';
  const ro = text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  const iso = ro
    ? `${ro[3]}-${String(ro[2]).padStart(2, '0')}-${String(ro[1]).padStart(2, '0')}`
    : text;
  const date = new Date(`${iso.length === 10 ? `${iso}T12:00:00.000Z` : iso}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeImportRow(input, index = 0) {
  const row = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = [];
  const unknownFields = Object.keys(row).filter((key) => !IMPORT_ROW_FIELDS.includes(key));
  if (unknownFields.length) errors.push(`Câmpuri necunoscute: ${unknownFields.slice(0, 10).join(', ')}`);

  const normalized = {};
  for (const field of IMPORT_ROW_FIELDS) {
    const max = field === 'notes' ? 5000 : field === 'offices' ? 1000 : 500;
    normalized[field] = scalar(row[field], max);
  }
  normalized.sourceRow = Number.parseInt(normalized.sourceRow || String(index + 1), 10);
  if (!Number.isSafeInteger(normalized.sourceRow) || normalized.sourceRow < 1) {
    errors.push('sourceRow trebuie să fie un număr pozitiv.');
    normalized.sourceRow = index + 1;
  }

  for (const field of DATE_FIELDS) {
    const original = row[field] instanceof Date ? row[field] : normalized[field];
    if (!original) continue;
    const parsed = normalizeDate(original);
    if (!parsed) errors.push(`${field} nu este o dată validă.`);
    else normalized[field] = parsed;
  }

  normalized.email = normalized.email.toLowerCase();
  if (normalized.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
    errors.push('Adresa de email este invalidă.');
  }
  normalized.membershipStatus = normalized.membershipStatus.toLowerCase();
  if (!STATUS_VALUES.has(normalized.membershipStatus)) errors.push('membershipStatus este invalid.');
  normalized.associationStatus = normalized.associationStatus.toLowerCase();
  if (!ASSOCIATION_STATUS_VALUES.has(normalized.associationStatus)) errors.push('associationStatus este invalid.');
  if (!normalized.userId && !normalized.email && !(normalized.familyName && normalized.givenName)) {
    errors.push('Rândul trebuie să conțină userId, email sau nume și prenume.');
  }
  if (normalized.userId && !/^[A-Za-z0-9_-]{1,120}$/.test(normalized.userId)) errors.push('userId este invalid.');

  return { normalized, errors };
}

export function validateImportRows(rows, maxRows = 1000) {
  if (!Array.isArray(rows)) return { rows: [], error: 'rows trebuie să fie un tablou.' };
  if (!rows.length) return { rows: [], error: 'Importul nu conține rânduri.' };
  if (rows.length > maxRows) return { rows: [], error: `Importul poate conține maximum ${maxRows} rânduri.` };
  return { rows: rows.map((row, index) => normalizeImportRow(row, index)), error: '' };
}

import assert from 'node:assert/strict';
import { normalizeImportRow, validateImportRows } from '../api/import-schema.js';

const valid = normalizeImportRow({
  sourceRow: 7,
  familyName: 'Ionescu',
  givenName: 'Andrei',
  email: 'ANDREI@EXAMPLE.TEST',
  birthDate: '03.04.1980',
  membershipStatus: 'active',
});
assert.deepEqual(valid.errors, []);
assert.equal(valid.normalized.email, 'andrei@example.test');
assert.equal(valid.normalized.birthDate, '1980-04-03T12:00:00.000Z');

const ejsonDate = normalizeImportRow({ familyName: 'Pop', givenName: 'Ana', joinedAt: new Date('2025-05-01T10:00:00.000Z') });
assert.equal(ejsonDate.normalized.joinedAt, '2025-05-01T10:00:00.000Z');

const invalid = normalizeImportRow({
  sourceRow: 0,
  email: 'invalid',
  membershipStatus: 'other',
  unexpected: 'must not be accepted',
});
assert.ok(invalid.errors.some((message) => message.includes('Câmpuri necunoscute')));
assert.ok(invalid.errors.some((message) => message.includes('email')));
assert.ok(invalid.errors.some((message) => message.includes('membershipStatus')));
assert.equal(Object.hasOwn(invalid.normalized, 'unexpected'), false);

assert.equal(validateImportRows([], 1000).error, 'Importul nu conține rânduri.');
assert.ok(validateImportRows(new Array(3).fill({ familyName: 'A', givenName: 'B' }), 2).error);

console.log('dossiers import schema: 9 assertions passed');

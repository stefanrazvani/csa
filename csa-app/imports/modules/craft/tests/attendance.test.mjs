import assert from 'node:assert/strict';
import test from 'node:test';
import { attendanceStatus, attendanceTotals, isYes, responseDeadline, responseFields } from '../attendance.js';
import { fieldDifferences, fingerprint, reconciliationUpdate } from '../../../system/migrations/server/reconciliation.js';

test('legacy zero strings never count as an accepted invitation', () => {
  assert.equal(isYes('0'), false);
  assert.equal(attendanceStatus({ confirmareFinala: '1', confirmareTinuta: '0', status: 'pending' }), 'declined');
  assert.equal(attendanceStatus({ confirmareFinala: 1 }), 'answered');
  assert.equal(attendanceStatus({ confirmareFinala: 0 }), 'pending');
});
test('submitting an absence records a response without accepting attendance', () => {
  const row = responseFields({ confirmareTinuta: '0', confirmareAgapa: '0', confirmareMeniuStandard: true, confirmareMeniuVegetarian: false });
  assert.equal(row.status, 'declined'); assert.equal(row.confirmareFinala, 1);
  assert.equal(row.confirmareMeniuStandard, false);
  assert.equal(attendanceTotals([row]).confirmed, 0);
});
test('an agape acceptance needs exactly one menu', () => {
  const payload = { confirmareTinuta: true, confirmareAgapa: true, confirmareMeniuStandard: true, confirmareMeniuVegetarian: true };
  assert.throws(() => responseFields(payload), /singur meniu/);
  assert.throws(() => responseFields({ ...payload, confirmareMeniuStandard: false, confirmareMeniuVegetarian: false }), /singur meniu/);
  assert.equal(responseFields({ ...payload, confirmareMeniuStandard: false }).confirmareMeniuVegetarian, true);
});
test('partial and malformed submissions cannot finalize an invitation', () => {
  assert.throws(() => responseFields({}));
  assert.throws(() => responseFields({ confirmareTinuta: 'no', confirmareAgapa: false, confirmareMeniuStandard: false, confirmareMeniuVegetarian: false }));
});
test('totals distinguish invitations, accepted participation, meals and actual presence', () => {
  const totals = attendanceTotals([
    { confirmareFinala: 1, confirmareTinuta: 1, confirmareAgapa: '1', confirmareMeniuVegetarian: '1' },
    { confirmareFinala: 1, confirmareTinuta: '0', attended: true },
    { status: 'pending', confirmareMeniuStandard: 1 },
    { confirmareFinala: 1 },
  ]);
  assert.deepEqual(totals, { invited: 4, confirmed: 1, declined: 1, pending: 1, answered: 1, agapa: 1, standard: 0, vegetarian: 1, present: 1 });
});
test('response deadline prefers confirmation deadline and falls back to event time', () => {
  assert.equal(responseDeadline({ dataConfirmare: '2030-01-01', dataTinuta: '2030-01-02' }).toISOString(), '2030-01-01T00:00:00.000Z');
  assert.equal(responseDeadline({ dataTinuta: '2030-01-02' }).getUTCDate(), 2);
  assert.equal(responseDeadline({ dataTinuta: 'invalid' }), null);
});
test('reconciliation fingerprints ignore key order but detect content changes', () => {
  assert.equal(fingerprint({ a: 1, b: new Date(0) }), fingerprint({ b: new Date(0), a: 1 }));
  assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }));
  assert.notEqual(fingerprint({ a: undefined }), fingerprint({ a: null }));
});
test('profile comparison never returns credentials, roles or excluded sensitive fields', () => {
  const source = { setari: { nume: 'Legacy', gdpr: 'private' }, services: { password: { bcrypt: 'secret' } }, roles: ['super_admin'] };
  assert.deepEqual(fieldDifferences('users', source, { setari: { nume: 'Nou' } }).map((row) => row.field), ['setari.nume']);
  assert.throws(() => reconciliationUpdate('users', source, ['services.password']));
  assert.throws(() => reconciliationUpdate('users', source, ['roles']));
});
test('selected-field reconciliation preserves unselected destination changes', () => {
  const source = { nume: 'Legacy', observatii: 'Legacy notes', nr: 12 };
  assert.deepEqual(reconciliationUpdate('convocatoare', source, ['nume']), { $set: { nume: 'Legacy' } });
  assert.deepEqual(reconciliationUpdate('convocatoare', source, ['dataTinuta']), { $unset: { dataTinuta: 1 } });
  assert.throws(() => reconciliationUpdate('convocatoare', source, []));
});

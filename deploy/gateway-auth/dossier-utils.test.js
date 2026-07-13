import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attachmentContentDisposition,
  dossierObjectPrefix,
  isActiveWindow,
  normalizeDossierDocumentFields,
  validDossierObjectReference,
} from './dossier-utils.js';

test('normalizează numai metadatele documentului acceptate', () => {
  const result = normalizeDossierDocumentFields({
    title: '  Adeverință  ',
    category: 'certificate',
    visibility: 'member',
    issuedAt: '2026-01-02',
    expiresAt: '2027-01-02',
    ignored: 'nu intră în document',
  });
  assert.equal(result.title, 'Adeverință');
  assert.equal(result.category, 'certificate');
  assert.equal(result.visibility, 'member');
  assert.equal(Object.hasOwn(result, 'ignored'), false);
  assert.throws(() => normalizeDossierDocumentFields({ title: '', category: 'other' }));
  assert.throws(() => normalizeDossierDocumentFields({ title: 'X', category: 'secret' }));
  assert.throws(() => normalizeDossierDocumentFields({ title: 'X', issuedAt: '2027-01-01', expiresAt: '2026-01-01' }));
});

test('referința MinIO rămâne în prefixul tenantului și al Fratelui', () => {
  const prefix = dossierObjectPrefix('tenant_1', 'user-1');
  assert.equal(prefix, 'tenant_1/dossiers/user-1/');
  assert.equal(validDossierObjectReference({
    provider: 'minio', bucket: 'csa-documents', key: `${prefix}doc/file.pdf`, size: 42,
  }, { eId: 'tenant_1', userId: 'user-1', bucket: 'csa-documents' }), true);
  assert.equal(validDossierObjectReference({
    provider: 'minio', bucket: 'csa-documents', key: `${prefix}../alt.pdf`, size: 42,
  }, { eId: 'tenant_1', userId: 'user-1', bucket: 'csa-documents' }), false);
  assert.equal(validDossierObjectReference({
    provider: 'minio', bucket: 'alt-bucket', key: `${prefix}doc/file.pdf`, size: 42,
  }, { eId: 'tenant_1', userId: 'user-1', bucket: 'csa-documents' }), false);
});

test('validează intervalele mandatelor', () => {
  const now = new Date('2026-07-13T12:00:00Z');
  assert.equal(isActiveWindow({ status: 'active', startAt: new Date('2026-01-01'), endAt: new Date('2026-12-31') }, now), true);
  assert.equal(isActiveWindow({ status: 'inactive' }, now), false);
  assert.equal(isActiveWindow({ status: 'active', endAt: new Date('2026-01-01') }, now), false);
});

test('generează Content-Disposition fără caractere de control', () => {
  const value = attachmentContentDisposition('Adeverință\r\n.pdf');
  assert.match(value, /^attachment; filename=/);
  assert.equal(value.includes('\r'), false);
  assert.equal(value.includes('\n'), false);
  assert.match(value, /filename\*=UTF-8''/);
});

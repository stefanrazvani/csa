import assert from 'node:assert/strict';
import test from 'node:test';
import { bulkPayload, projectionKey, tenantIndexName } from './projection-utils.js';

test('numele indexului este izolat și valid pentru tenant', () => {
  assert.equal(tenantIndexName('Tenant_AB-12'), 'csa-text-tenant_ab-12');
  assert.throws(() => tenantIndexName('***'));
});

test('cheia Arango este deterministă și separată per tenant', () => {
  assert.equal(projectionKey('a', 'x'), projectionKey('a', 'x'));
  assert.notEqual(projectionKey('a', 'x'), projectionKey('b', 'x'));
});

test('bulk OpenSearch conține o acțiune și un document per nod', () => {
  const payload = bulkPayload('csa-text-a', { title: 'Carte', minGrade: 1 }, [{
    _id: 'n1', eId: 'a', workId: 'w', versionId: 'v', type: 'paragraph', text: 'Text', minGrade: 2, updatedAt: new Date('2026-01-01T00:00:00Z'),
  }]);
  const lines = payload.trim().split('\n').map(JSON.parse);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].index._id, 'n1');
  assert.equal(lines[1].minGrade, 2);
});

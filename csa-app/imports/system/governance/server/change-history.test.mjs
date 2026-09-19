import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeChanges } from './change-history.js';
test('history captures changes, removed values and Dates without credentials', () => {
  const result = describeChanges({ status: 'Creat', nume: 'A', dataTinuta: new Date('2026-01-01'), token: 'old', observatii: 'private old' }, { status: 'Comunicat', dataTinuta: new Date('2026-02-01'), token: 'secret', observatii: 'private new' });
  assert.deepEqual(result.find(row => row.field === 'nume'), { field: 'nume', before: 'A', after: '(lipsește)' });
  assert.equal(result.find(row => row.field === 'dataTinuta').after, '2026-02-01T00:00:00.000Z');
  assert.equal(result.some(row => row.field === 'token'), false);
  assert.equal(JSON.stringify(result).includes('private'), false);
});
test('history omits unchanged and bookkeeping fields', () => {
  assert.deepEqual(describeChanges({ status: 'Creat', updatedAt: 1 }, { status: 'Creat', updatedAt: 2 }), []);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { exactVersionDeleteInput } from './object-store-utils.js';

test('rollbackul șterge exact versiunea întoarsă de PutObject', () => {
  assert.deepEqual(exactVersionDeleteInput('bucket', 'tenant/doc.pdf', 'version-123'), {
    Bucket: 'bucket',
    Key: 'tenant/doc.pdf',
    VersionId: 'version-123',
  });
});

test('un obiect fără VersionId folosește ștergerea neversionată', () => {
  assert.deepEqual(exactVersionDeleteInput('bucket', 'tenant/doc.pdf'), {
    Bucket: 'bucket',
    Key: 'tenant/doc.pdf',
  });
});

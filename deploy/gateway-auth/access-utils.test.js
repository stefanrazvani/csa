import assert from 'node:assert/strict';
import test from 'node:test';
import { platformAdminAssignmentSelector, selfDocumentVisibilityAllowed } from './access-utils.js';

test('super_admin este acceptat numai în scope-ul canonic sau explicit null', () => {
  assert.deepEqual(platformAdminAssignmentSelector('user-1'), {
    $and: [
      { 'user._id': 'user-1' },
      { $or: [{ 'role._id': 'super_admin' }, { role: 'super_admin' }] },
      { $or: [{ scope: 'default-grup' }, { scope: { $type: 10 } }] },
    ],
  });
});

test('un Frate își poate descărca numai documentele marcate explicit member', () => {
  assert.equal(selfDocumentVisibilityAllowed('member'), true);
  assert.equal(selfDocumentVisibilityAllowed('secretariat'), false);
  assert.equal(selfDocumentVisibilityAllowed(undefined), false);
  assert.equal(selfDocumentVisibilityAllowed('public'), false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import { hashMeteorPassword, meteorPasswordDigest, verifyGatewayPassword } from './password-utils.js';

test('migrated Meteor password hashes accept the original plaintext password', async () => {
  const password = 'Test-parola-ș-2026!';
  const stored = await bcrypt.hash(meteorPasswordDigest(password), 10);
  assert.deepEqual(await verifyGatewayPassword(password, stored), { valid: true, needsUpgrade: false });
  assert.equal((await verifyGatewayPassword('wrong', stored)).valid, false);
});
test('older gateway-only hashes are accepted and marked for compatible upgrade', async () => {
  const password = 'Test-gateway-2026!';
  const stored = await bcrypt.hash(password, 10);
  assert.deepEqual(await verifyGatewayPassword(password, stored), { valid: true, needsUpgrade: true });
  const upgraded = await hashMeteorPassword(password);
  assert.equal(await bcrypt.compare(meteorPasswordDigest(password), upgraded), true);
  assert.deepEqual(await verifyGatewayPassword(password, upgraded), { valid: true, needsUpgrade: false });
});
test('registration and reset produce hashes accepted by Meteor accounts-password', async () => {
  const password = 'New-password-2026!';
  assert.equal(await bcrypt.compare(meteorPasswordDigest(password), await hashMeteorPassword(password)), true);
});
test('invalid hashes and invalid inputs fail closed', async () => {
  assert.equal((await verifyGatewayPassword('test', 'broken')).valid, false);
  assert.equal((await verifyGatewayPassword(null, null)).valid, false);
});

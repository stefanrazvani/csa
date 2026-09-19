// Explicit opt-in: creates one temporary account and removes it and its sessions in finally.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';
if (process.env.CSA_AUTH_SMOKE !== '1') throw new Error('Set CSA_AUTH_SMOKE=1 for the controlled login check.');
const origin = process.env.CSA_GATEWAY_ORIGIN;
const client = new MongoClient(process.env.MONGO_URL);
await client.connect();
const database = client.db();
const id = `auth-check-${randomBytes(12).toString('hex')}`;
const email = `${id}@example.invalid`;
const password = randomBytes(30).toString('base64url');
const digest = createHash('sha256').update(password, 'utf8').digest('hex');
try {
  await database.collection('users').insertOne({ _id: id, emails: [{ address: email, verified: false }], setari: { status: '1' }, services: { password: { bcrypt: await bcrypt.hash(digest, 10) } }, entitati: { [process.env.CSA_LEGACY_EID]: {} }, createdAt: new Date() });
  const request = (passwordValue) => fetch(`${origin}/auth/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: passwordValue }), signal: AbortSignal.timeout(20000) });
  assert.equal((await request('incorrect-password')).status, 401);
  const response = await request(password);
  assert.equal(response.status, 200, 'Gateway must accept a Meteor-compatible password');
  const cookie = response.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie);
  const assertion = await fetch(`${origin}/auth/bootstrap`, { method: 'POST', headers: { Origin: origin, Cookie: cookie }, signal: AbortSignal.timeout(20000) });
  assert.equal(assertion.status, 200, 'Authenticated gateway assertion');
  const portal = await fetch(`${origin}/portal/templu`, { headers: { Cookie: cookie }, redirect: 'manual', signal: AbortSignal.timeout(30000) });
  assert.equal(portal.status, 200, 'Private Meteor portal must respond after authentication');
  const html = await portal.text();
  const policy = portal.headers.get('content-security-policy') || '';
  const nonce = html.match(/<script\b[^>]*nonce="([^"]+)"[^>]*>__meteor_runtime_config__/)?.[1];
  assert.ok(nonce, 'Runtime configuration must have a CSP nonce');
  assert.ok(policy.includes(`'nonce-${nonce}'`), 'HTML nonce must match the response policy');
  assert.match(policy, /style-src 'self' 'unsafe-inline'/, 'Meteor injected styles must be allowed');
  assert.match(policy, /script-src[^;]*'unsafe-eval'/, 'Meteor dynamic modules must be allowed');
  const publicPage = await fetch(origin, { signal: AbortSignal.timeout(20000) });
  assert.doesNotMatch(publicPage.headers.get('content-security-policy') || '', /unsafe-inline|unsafe-eval/, 'Public pages retain the strict policy');
  console.log('PASS wrong password rejected; Meteor hash login accepted; assertion issued; private HTML nonce and Meteor CSP compatibility verified; public CSP strict. Browser rendering still requires a browser check.');
} finally {
  await database.collection('gateway_sessions').deleteMany({ userId: id });
  await database.collection('users').deleteOne({ _id: id, 'emails.address': email });
  await client.close();
}

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import express from 'express';
import { confirmationFields, registerConfirmationRoutes } from './confirmation-routes.js';
import { responseFields } from '../../csa-app/imports/modules/craft/attendance.js';

test('public and portal responses use the same validation and stored values', () => {
  for (const attendance of [false, true]) for (const meal of [false, true]) for (const standard of [false, true]) for (const vegetarian of [false, true]) {
    const input = { confirmareTinuta: attendance, confirmareAgapa: meal, confirmareMeniuStandard: standard, confirmareMeniuVegetarian: vegetarian, motivAbsenta: ' test ' };
    if (meal && standard === vegetarian) { assert.throws(() => confirmationFields(input)); assert.throws(() => responseFields(input)); }
    else assert.deepEqual(confirmationFields(input), responseFields(input));
  }
  assert.throws(() => confirmationFields({ confirmareTinuta: 'false' }));
});

test('bearer invitation confines access, enforces revocation/deadline and saves an absence', async (t) => {
  const token = 'a'.repeat(43); const eId = 'test-tenant';
  const rows = {
    prezenta_confirmari: { _id: 'response', eId, userId: 'member', convocatorId: 'event', sys_status: 1, publicTokenHash: createHash('sha256').update(token).digest('hex'), userSnapshot: { email: 'private@example.test' } },
    convocatoare: { _id: 'event', eId, nume: 'Ținută test', dataConfirmare: new Date(Date.now() + 86400_000), sys_status: 1 },
    users: { _id: 'member', entitati: { [eId]: {} }, setari: { status: '1' }, services: { password: 'must-not-leak' } },
    entitati: { _id: eId, status: 'active' }, lodge_memberships: { userId: 'member', eId, status: 'active' },
  };
  const matches = (row, query) => row && Object.entries(query).every(([key, expected]) => {
    const value = key.split('.').reduce((result, part) => result?.[part], row);
    return expected && typeof expected === 'object' ? '$exists' in expected ? (value !== undefined) === expected.$exists : value !== expected.$ne : value === expected;
  });
  const writes = [];
  const database = { collection: (name) => ({
    async findOne(query) { return matches(rows[name], query) ? structuredClone(rows[name]) : null; },
    async updateOne(query, update) { if (!matches(rows[name], query)) return { matchedCount: 0 }; Object.assign(rows[name], update.$set); writes.push({ name, update }); return { matchedCount: 1 }; },
    async insertOne(value) { writes.push({ name, value }); },
  }) };
  const app = express(); app.use(express.json());
  let limited = false;
  registerConfirmationRoutes({ app, database, tenantId: eId, sameOrigin: (req, res, next) => req.get('origin') === 'http://test.local' ? next() : res.status(403).end(), rateLimit: () => !limited, mailer: null });
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const request = (path, body = { token }, origin = 'http://test.local') => fetch(`http://127.0.0.1:${server.address().port}/auth/confirmation/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
  assert.equal((await request('view', { token }, 'http://wrong.local')).status, 403);
  assert.equal((await request('view', { token: 'legacy-raw-id' })).status, 404);
  assert.equal((await request('view', { token: 'b'.repeat(43) })).status, 404);
  const view = await request('view'); assert.equal(view.status, 200); assert.match(view.headers.get('cache-control'), /no-store/);
  const exposed = await view.json(); assert.equal(exposed.name, 'Ținută test'); assert.equal(JSON.stringify(exposed).includes('private@'), false); assert.equal(JSON.stringify(exposed).includes('must-not-leak'), false);
  const response = { confirmareTinuta: false, confirmareAgapa: false, confirmareMeniuStandard: false, confirmareMeniuVegetarian: false, motivAbsenta: 'Test' };
  assert.equal((await request('respond', { token, response })).status, 200);
  assert.equal(rows.prezenta_confirmari.status, 'declined'); assert.equal(rows.prezenta_confirmari.confirmareFinala, 1);
  assert.ok(writes.some((write) => write.name === 'audit_events'));
  rows.convocatoare.dataConfirmare = new Date(Date.now() - 1000);
  assert.equal((await request('respond', { token, response })).status, 409);
  rows.convocatoare.dataConfirmare = new Date(Date.now() + 86400_000);
  rows.lodge_memberships.status = 'inactive'; assert.equal((await request('view')).status, 404);
  rows.lodge_memberships.status = 'active'; rows.users.setari.status = '0'; assert.equal((await request('view')).status, 404);
  rows.users.setari.status = '1'; rows.entitati.status = 'inactive'; assert.equal((await request('view')).status, 404);
  rows.entitati.status = 'active'; rows.prezenta_confirmari.eId = 'other-tenant'; assert.equal((await request('view')).status, 404);
  limited = true; assert.equal((await request('view')).status, 429);
});

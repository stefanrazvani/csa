// Explicitly restricted to the disposable local preview. Never use production credentials here.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { MongoClient } from '../csa-app/node_modules/mongodb/lib/index.js';
import ExcelJS from '../csa-app/node_modules/exceljs/excel.js';

const accessFile = process.argv[2];
if (!accessFile) throw new Error('Usage: node deploy/craft-local-smoke.mjs tmp/csa-preview-access.json');
const access = JSON.parse(await readFile(accessFile, 'utf8'));
const origin = 'http://127.0.0.1:18700';
const eId = 'csa-local-preview';

import { DDP } from './local-ddp.mjs';

const admin = await new DDP().connect();
const member = await new DDP().connect();
const dbClient = new MongoClient('mongodb://127.0.0.1:18701/meteor?directConnection=true');
await dbClient.connect();
const db = dbClient.db();
const events = []; const users = []; const terms = []; const works = []; const fixturePrefix = `smoke-${Date.now()}`;
let checks = 0;
function ok(label) { checks += 1; console.log(`PASS ${label}`); }
try {
  await admin.login(access.email, access.password);
  assert.equal((await admin.call('membership.context')).eId, eId, 'Refusing to mutate a non-preview tenant');
  const memberEmail = `${fixturePrefix}@example.test`; const password = randomBytes(24).toString('base64');
  const userId = await admin.call('admin.tenant.users.create', { email: memberEmail, password, name: 'Membru test automat', tenantAdmin: false }); users.push(userId);
  await admin.call('craft.memberships.upsert', userId, 1);
  await member.login(memberEmail, password);
  assert.equal((await member.call('craft.permissions')).write, false);
  await assert.rejects(member.call('craft.convocatoare.insert', { nume: 'Forbidden' })); ok('member cannot administer convocators');
  await assert.rejects(member.call('audit.history', {})); ok('ordinary member cannot read operation history');

  const future = new Date(Date.now() + 3 * 86400_000).toISOString();
  const deadline = new Date(Date.now() + 2 * 86400_000).toISOString();
  const event = await admin.call('craft.convocatoare.insert', { nume: 'Ținută test integrare', dataTinuta: future, dataConfirmare: deadline, numarTinuta: 99 }); events.push(event.id);
  assert.ok(event.createdConfirmations >= 1);
  assert.equal((await admin.call('craft.prezenta.prepare', event.id)).createdConfirmations, 0); ok('presence provisioning is idempotent');
  let response = await db.collection('prezenta_confirmari').findOne({ eId, convocatorId: event.id, userId });
  assert.ok(response);
  const absent = { confirmareTinuta: false, confirmareAgapa: false, confirmareMeniuStandard: false, confirmareMeniuVegetarian: false, motivAbsenta: 'Test' };
  await member.call('craft.confirmare.mine', response._id, absent);
  response = await db.collection('prezenta_confirmari').findOne({ _id: response._id });
  assert.equal(response.status, 'declined'); assert.equal(response.confirmareFinala, 1); ok('absence is finalized without counting as accepted attendance');
  await member.call('craft.confirmare.mine', response._id, { ...absent, confirmareTinuta: true, confirmareAgapa: true, confirmareMeniuStandard: true });
  response = await db.collection('prezenta_confirmari').findOne({ _id: response._id });
  assert.equal(response.status, 'confirmed'); ok('member can correct own response before deadline');
  await assert.rejects(admin.call('craft.confirmare.mine', response._id, absent)); ok('other account cannot overwrite member response');
  await admin.call('craft.convocatoare.update', event.id, { dataConfirmare: new Date(Date.now() - 1000).toISOString() });
  await assert.rejects(member.call('craft.confirmare.mine', response._id, absent), (error) => error.code === 'deadline');
  await admin.call('craft.confirmare.admin', response._id, absent); ok('deadline enforced; secretariat can correct after deadline');
  await admin.call('craft.convocatoare.update', event.id, { dataConfirmare: deadline });

  await admin.call('craft.articole.insert', event.id, { level: 1, order: 1, continut: 'Articol grad unu' });
  await admin.call('craft.articole.insert', event.id, { level: 3, order: 1, continut: 'Articol grad trei' });
  await member.subscribe('craft.documenteText', event.id);
  const published = [...member.rows.entries()].filter(([key]) => key.startsWith('documente_text:')).map(([, value]) => value);
  assert.equal(published.length, 1); assert.equal(published[0].level, 1); ok('PDF data source filters inaccessible grades');
  const memberPdf = await member.call('craft.convocatoare.pdf', event.id);
  const adminPdf = await admin.call('craft.convocatoare.pdf', event.id);
  assert.equal(Buffer.from(memberPdf.content, 'base64').subarray(0, 5).toString(), '%PDF-');
  await writeFile('tmp/convocator-member.pdf', Buffer.from(memberPdf.content, 'base64'));
  await writeFile('tmp/convocator-admin.pdf', Buffer.from(adminPdf.content, 'base64'));
  ok('PDF export generates valid files for member and administrator');
  const xlsx = await admin.call('craft.prezenta.xlsx', event.id);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(xlsx.content, 'base64'));
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.getRow(1).getCell(6).value, 'Confirmare ținută');
  assert.equal(sheet.lastRow.getCell(1).value, 'TOTAL');
  assert.equal(sheet.lastRow.getCell(6).value, 0);
  await assert.rejects(member.call('craft.prezenta.xlsx', event.id));
  ok('Excel export contains totals and enforces administrative access');
  const workId = `${fixturePrefix}-work`; works.push(workId);
  await db.collection('library_works').insertOne({ _id: workId, eId, title: 'Lucrare test', minGrade: 1, status: 'published' });
  await admin.call('craft.documents.linkLibrary', event.id, workId);
  await member.subscribe('craft.convocatorDocuments', event.id);
  assert.ok([...member.rows.values()].some((row) => row.libraryWorkId === workId));
  await db.collection('library_works').updateOne({ _id: workId, eId }, { $set: { minGrade: 3 } });
  const timeout = Date.now() + 5000;
  while ([...member.rows.values()].some((row) => row.libraryWorkId === workId) && Date.now() < timeout) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal([...member.rows.values()].some((row) => row.libraryWorkId === workId), false);
  ok('linked document metadata retracts when library grade is raised');
  const duplicate = await admin.call('craft.convocatoare.duplicate', event.id); events.push(duplicate.id);
  assert.equal(await db.collection('documente_text').countDocuments({ documentId: duplicate.id, eId }), 2);
  assert.equal(await db.collection('prezenta_confirmari').countDocuments({ convocatorId: duplicate.id, eId }), 0);
  assert.equal((await db.collection('convocatoare').findOne({ _id: duplicate.id })).dataTinuta, undefined); ok('duplication copies agenda but not dates/responses');

  await admin.call('admin.tenant.users.setAdmin', userId, true);
  assert.equal((await member.call('craft.permissions')).write, false); ok('tenant admin without office has no misleading edit permission');
  await admin.call('admin.tenant.users.setAdmin', userId, false);
  await admin.call('craft.memberships.upsert', userId, 3);
  const term = await admin.call('officeTerms.assign', { userId, officeCode: 'secretary', masonicYear: 'TEST', startAt: new Date(Date.now() - 60000).toISOString(), endAt: future }); terms.push(term.id);
  assert.equal((await member.call('craft.permissions')).write, true); ok('secretary office grants edit permission without explicit module role');

  const importedId = `${fixturePrefix}-imported`; events.push(importedId);
  await db.collection('convocatoare').insertOne({ _id: importedId, eId, nr: 9500, sys_status: 1 });
  const numbered = await Promise.all([admin.call('craft.convocatoare.insert', { nume: 'Număr A' }), admin.call('craft.convocatoare.insert', { nume: 'Număr B' })]); events.push(...numbered.map((row) => row.id));
  const numbers = await db.collection('convocatoare').find({ _id: { $in: numbered.map((row) => row.id) } }).toArray();
  assert.ok(numbers.every((row) => row.nr > 9500)); assert.equal(new Set(numbers.map((row) => row.nr)).size, 2); ok('counter reconciles imported maximum under concurrent creation');

  await admin.call('craft.prezenta.mark', response._id, true);
  assert.equal((await db.collection('prezenta_confirmari').findOne({ _id: response._id })).attended, true); ok('actual attendance is independent of invitation response');
  await admin.call('craft.convocatoare.remove', duplicate.id);
  assert.equal(await db.collection('documente_text').countDocuments({ documentId: duplicate.id, sys_status: 1 }), 0); ok('logical deletion archives related articles atomically');

  await assert.rejects(admin.call('craft.invitations.send', event.id), (error) => error.code === 'mail-unavailable'); ok('SMTP absence cannot masquerade as delivered invitations');
  await admin.call('craft.convocatoare.update', event.id, { nume: 'Audit înainte' });
  await admin.call('craft.convocatoare.update', event.id, { nume: 'Audit după' });
  const history = await admin.call('audit.history', { entityId: event.id, entityType: 'convocatoare' });
  const change = history.rows.find(row => row.metadata?.changes?.some(item => item.field === 'nume' && item.before === 'Audit înainte' && item.after === 'Audit după'));
  assert.ok(change); assert.ok(change.actorId); assert.ok(change.actorLabel); assert.equal(change.eId, eId);
  assert.ok(history.rows.every(row => row.eId === eId)); ok('history records actor and exact before/after values in the active tenant');
  const foreignHistoryId = `${fixturePrefix}-foreign-audit`;
  await db.collection('audit_events').insertOne({ _id: foreignHistoryId, eId: 'other-tenant', entityId: event.id, at: new Date(), action: 'fixture' });
  try { assert.equal((await admin.call('audit.history', { entityId: event.id })).rows.some(row => row._id === foreignHistoryId), false); }
  finally { await db.collection('audit_events').deleteOne({ _id: foreignHistoryId, eId: 'other-tenant' }); }
  ok('history never crosses tenant boundaries');
  await Promise.all([admin.call('craft.convocatoare.update', event.id, { nume: 'Audit concurent A' }), admin.call('craft.convocatoare.update', event.id, { nume: 'Audit concurent B' })]);
  const concurrent = (await admin.call('audit.history', { entityId: event.id, entityType: 'convocatoare' })).rows.flatMap(row => row.metadata?.changes || []).filter(item => item.field === 'nume' && String(item.after).startsWith('Audit concurent'));
  assert.equal(concurrent.length, 2);
  assert.equal(concurrent.filter(item => item.before === 'Audit după').length, 1);
  assert.ok(concurrent.some(item => concurrent.some(other => other !== item && other.after === item.before)));
  ok('concurrent updates preserve a consistent transactional audit chain');
  console.log(`craft-local-smoke: ${checks} checks passed`);
} finally {
  // Delete only the exact fixtures created by this run in the explicitly checked preview tenant.
  for (const [name, selector] of [
    ['convocatoare', { _id: { $in: events } }], ['documente_text', { documentId: { $in: events } }],
    ['prezenta', { convocatorId: { $in: events } }], ['prezenta_confirmari', { convocatorId: { $in: events } }],
    ['craft_memberships', { userId: { $in: users } }], ['lodge_memberships', { userId: { $in: users } }],
    ['degree_events', { userId: { $in: users } }], ['office_terms', { _id: { $in: terms } }],
    ['documente', { objectId: { $in: events } }], ['library_works', { _id: { $in: works } }],
  ]) await db.collection(name).deleteMany({ eId, ...selector });
  if (users.length) {
    await db.collection('role-assignment').deleteMany({ 'user._id': { $in: users } });
    await db.collection('users').deleteMany({ _id: { $in: users }, [`entitati.${eId}`]: { $exists: true } });
  }
  admin.close(); member.close(); await dbClient.close();
}

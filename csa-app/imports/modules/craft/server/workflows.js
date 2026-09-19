import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { MongoInternals } from 'meteor/mongo';
import { Random } from 'meteor/random';
import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';
import { Convocatoare, DocumenteText, Prezenta, PrezentaConfirmari, Documente } from '/imports/api/collections.js';
import { requireRole, getReadableCraftGrade } from '/imports/lib/access/server.js';
import { writeAuditEvent } from '/imports/system/governance/server/audit.js';
import { LibraryWorks } from '/imports/modules/study/api/collections.js';
import { nextNumber } from './counters.js';
import { preparePresenceForConvocator } from './methods.js';

export async function transaction(callback) {
  const session = MongoInternals.defaultRemoteCollectionDriver().mongo.client.startSession();
  try { return await session.withTransaction(() => callback(session)); }
  finally { await session.endSession(); }
}

Meteor.methods({
  async 'craft.convocatoare.duplicate'(sourceId) {
    check(sourceId, String);
    const { eId, userId } = await requireRole(this, 'convocatoare', 'write');
    const source = await Convocatoare.findOneAsync({ _id: sourceId, eId, sys_status: 1 });
    if (!source) throw new Meteor.Error('not-found', 'Convocator inexistent.');
    const grade = await getReadableCraftGrade(userId, eId);
    const articles = await DocumenteText.find({ documentId: sourceId, eId, sys_status: 1 }).fetchAsync();
    if (articles.some((row) => Number(row.level) > grade)) throw new Meteor.Error('forbidden', 'Nu puteți copia articolele unui grad inaccesibil.');
    const id = Random.id();
    const nr = await nextNumber(eId, 'convocatoare');
    const now = new Date();
    const metadata = Object.fromEntries(['numeLoja', 'nrLoja', 'orientul', 'templu', 'adresaTemplu', 'observatii', 'data_access'].filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
    await transaction(async (session) => {
      await Convocatoare.rawCollection().insertOne({ _id: id, eId, nr, ...metadata, nume: `${source.nume || 'Convocator'} — copie`, status: 'Creat', owner: userId, sys_status: 1, createdAt: now, updatedAt: now, copiedFrom: sourceId }, { session });
      for (const row of articles) {
        await DocumenteText.rawCollection().insertOne({ _id: Random.id(), eId, documentId: id, level: row.level, accessLevel: row.level, order: row.order, nr: row.nr, nrArticol: row.nrArticol || '', continut: row.continut, tip: 'articol', owner: userId, sys_status: 1, createdAt: now, updatedAt: now }, { session });
      }
    });
    // Dates and responses are intentionally not inherited. Saving the new date provisions invitations.
    await writeAuditEvent({ actorId: userId, eId, action: 'convocatoare.duplicate', entityType: 'convocator', entityId: id, metadata: { sourceId }, context: this });
    return { id };
  },

  async 'craft.convocatoare.remove'(id) {
    check(id, String);
    const { eId, userId } = await requireRole(this, 'convocatoare', 'delete');
    await transaction(async (session) => {
      const update = { $set: { sys_status: 0, updatedAt: new Date(), updatedBy: userId } };
      const changed = await Convocatoare.rawCollection().updateOne({ _id: id, eId, sys_status: 1 }, update, { session });
      if (!changed.matchedCount) throw new Meteor.Error('not-found', 'Convocator inexistent.');
      for (const [collection, selector] of [[DocumenteText, { documentId: id }], [Prezenta, { convocatorId: id }], [PrezentaConfirmari, { convocatorId: id }], [Documente, { moduleAlias: 'convocatoare', objectId: id }]]) {
        await collection.rawCollection().updateMany({ eId, ...selector }, update, { session });
      }
    });
    await writeAuditEvent({ actorId: userId, eId, action: 'convocatoare.remove', entityType: 'convocator', entityId: id, context: this });
    return { ok: true };
  },

  async 'craft.prezenta.link'(presenceId, convocatorId) {
    check(presenceId, String); check(convocatorId, String);
    const { eId, userId } = await requireRole(this, 'prezenta', 'admin');
    await transaction(async (session) => {
      const source = await Prezenta.rawCollection().findOne({ _id: presenceId, eId, 'legacyMetadata.unresolvedConvocator': true }, { session });
      const parent = await Convocatoare.rawCollection().findOne({ _id: convocatorId, eId, sys_status: 1 }, { session });
      if (!source || !parent) throw new Meteor.Error('not-found', 'Prezența neasociată sau convocatorul nu există.');
      const existing = await Prezenta.rawCollection().findOne({ convocatorId, eId }, { session });
      if (existing && existing._id !== presenceId) throw new Meteor.Error('conflict', 'Convocatorul are deja o prezență. Răspunsurile trebuie reconciliate înainte de asociere.');
      const rows = await PrezentaConfirmari.rawCollection().find({ idPrezenta: presenceId, eId }, { session }).toArray();
      for (const row of rows) {
        const duplicate = await PrezentaConfirmari.rawCollection().findOne({ eId, convocatorId, userId: row.userId, _id: { $ne: row._id } }, { session });
        if (duplicate) throw new Meteor.Error('conflict', 'Există răspunsuri pentru același membru la convocatorul ales. Asocierea nu a modificat datele.');
      }
      await Prezenta.rawCollection().updateOne({ _id: presenceId, eId }, { $set: { convocatorId, 'legacyMetadata.unresolvedConvocator': false, updatedBy: userId, updatedAt: new Date() } }, { session });
      await PrezentaConfirmari.rawCollection().updateMany({ idPrezenta: presenceId, eId }, { $set: { convocatorId, updatedAt: new Date() } }, { session });
    });
    await preparePresenceForConvocator({ eId, convocatorId, userId });
    await writeAuditEvent({ actorId: userId, eId, action: 'prezenta.link', entityType: 'presence', entityId: presenceId, metadata: { convocatorId }, context: this });
    return { ok: true };
  },

  async 'craft.documents.linkLibrary'(convocatorId, workId) {
    check(convocatorId, String); check(workId, String);
    const { eId, userId } = await requireRole(this, 'convocatoare', 'write');
    const grade = await getReadableCraftGrade(userId, eId);
    const work = await LibraryWorks.findOneAsync({ _id: workId, eId, status: 'published', minGrade: { $lte: grade } });
    const parent = await Convocatoare.findOneAsync({ _id: convocatorId, eId, sys_status: 1 });
    if (!work || !parent) throw new Meteor.Error('not-found', 'Convocatorul sau lucrarea publicată nu sunt accesibile.');
    await Documente.upsertAsync({ eId, moduleAlias: 'convocatoare', objectId: convocatorId, libraryWorkId: workId }, { $set: { filename: work.title, minGrade: work.minGrade, sys_status: 1, updatedAt: new Date() }, $setOnInsert: { owner: userId, createdAt: new Date() } });
    return { ok: true };
  },

  async 'craft.documents.unlink'(id) {
    check(id, String);
    const { eId } = await requireRole(this, 'convocatoare', 'delete');
    await Documente.updateAsync({ _id: id, eId, moduleAlias: 'convocatoare' }, { $set: { sys_status: 0, updatedAt: new Date() } });
    return { ok: true };
  },
});

DDPRateLimiter.addRule({ type: 'method', name: 'craft.invitations.send', userId: (id) => Boolean(id) }, 3, 60_000);

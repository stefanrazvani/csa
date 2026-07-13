import { Meteor } from 'meteor/meteor';
import { MongoClient } from 'mongodb';
import { Random } from 'meteor/random';
import {
  Convocatoare,
  Documente,
  DocumenteText,
  Entitati,
  MigrationRuns,
  Prezenta,
  PrezentaConfirmari,
} from '/imports/api/collections.js';
import { requireSuperAdmin } from '/imports/lib/access/server.js';

const COLLECTIONS = ['convocatoare', 'documente_text', 'prezenta', 'prezenta_confirmari', 'documente'];

function config() {
  const url = String(process.env.CSA_LEGACY_MONGO_URL || '').trim();
  const eId = String(process.env.CSA_LEGACY_EID || '').trim();
  if (!url) throw new Meteor.Error('migration-source-missing', 'CSA_LEGACY_MONGO_URL nu este configurat.');
  if (!eId) throw new Meteor.Error('migration-eid-missing', 'CSA_LEGACY_EID nu este configurat.');
  return { url, eId };
}

async function withLegacy(callback) {
  const { url, eId } = config();
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });
  try {
    await client.connect();
    return await callback(client.db(), eId);
  } finally {
    await client.close();
  }
}

async function sourceAudit(db, eId) {
  const counts = {};
  for (const name of COLLECTIONS) counts[name] = await db.collection(name).countDocuments({ eId });
  counts.users = await db.collection('users').countDocuments({ [`entitati.${eId}`]: { $exists: true } });
  counts.activeUsers = await db.collection('users').countDocuments({ [`entitati.${eId}`]: { $exists: true }, 'setari.status': '1' });

  const presences = await db.collection('prezenta').find({ eId }).toArray();
  let uniqueFallbackMatches = 0;
  let unresolvedPresence = 0;
  for (const row of presences) {
    if (row.convocatorId) continue;
    const matches = await db.collection('convocatoare').countDocuments({
      eId,
      numarTinuta: row.tinutaNr,
      dataTinuta: row.dataTinuta,
      numeLoja: row.numeLoja,
      nrLoja: row.nrLoja,
      orientul: row.orientul,
    });
    if (matches === 1) uniqueFallbackMatches += 1;
    else unresolvedPresence += 1;
  }
  return { eId, counts, uniqueFallbackMatches, unresolvedPresence };
}

function sanitizeUser(row, eId) {
  const setari = row.setari || {};
  const allowedSettings = ['tip', 'status', 'nume', 'prenume', 'oras', 'judet'];
  const safeSettings = Object.fromEntries(allowedSettings.filter((key) => setari[key] !== undefined).map((key) => [key, setari[key]]));
  const password = row.services?.password;
  return {
    _id: row._id,
    createdAt: row.createdAt || new Date(),
    emails: Array.isArray(row.emails) ? row.emails.map((item) => ({ address: String(item.address || '').trim().toLowerCase(), verified: Boolean(item.verified) })).filter((item) => item.address) : [],
    entitati: { [eId]: row.entitati?.[eId] || { nume: 'CSA', activ: 1 }, all: { nume: 'All', activ: 0 } },
    setari: safeSettings,
    profileExt: { nume: setari.nume || '', prenume: setari.prenume || '', limba: 'ro', timezone: 'Europe/Bucharest' },
    services: password ? { password: { ...(password.bcrypt ? { bcrypt: password.bcrypt } : {}), ...(password.srp ? { srp: password.srp } : {}) } } : undefined,
    legacyMetadata: {
      sourceCollection: 'users',
      sourceEId: eId,
      migratedAt: new Date(),
      excludedSensitiveFields: ['services.resume', 'services.email'],
      fieldsPendingPolicyDecision: ['caleBuletin', 'gdpr', 'termenisiConditii', 'recomandatDe'],
    },
  };
}

async function upsertById(collection, doc, dryRun, summary) {
  const exists = await collection.findOneAsync(doc._id, { fields: { _id: 1 } });
  summary[exists ? 'existing' : 'inserted'] += 1;
  if (!dryRun && !exists) await collection.insertAsync(doc);
}

async function migrate({ dryRun, actor }) {
  return withLegacy(async (db, eId) => {
    const audit = await sourceAudit(db, eId);
    const summary = { dryRun, eId, inserted: 0, existing: 0, unresolvedPresence: [], usersWithoutGrade: 0, audit };

    const entity = await db.collection('entitati').findOne({ _id: eId });
    if (entity) await upsertById(Entitati, { ...entity, legacyMetadata: { sourceCollection: 'entitati', migratedAt: new Date() } }, dryRun, summary);

    const users = await db.collection('users').find({ [`entitati.${eId}`]: { $exists: true } }).toArray();
    for (const user of users) {
      const candidate = sanitizeUser(user, eId);
      const exists = await Meteor.users.findOneAsync(candidate._id, { fields: { _id: 1 } });
      summary[exists ? 'existing' : 'inserted'] += 1;
      summary.usersWithoutGrade += 1;
      if (!dryRun && !exists) await Meteor.users.insertAsync(candidate);
    }

    const convocatoare = await db.collection('convocatoare').find({ eId }).toArray();
    for (const row of convocatoare) await upsertById(Convocatoare, { ...row, legacyMetadata: { sourceCollection: 'convocatoare' } }, dryRun, summary);

    const articles = await db.collection('documente_text').find({ eId }).toArray();
    for (const row of articles) await upsertById(DocumenteText, { ...row, accessLevel: Number(row.level || row.accessLevel || 1), legacyMetadata: { sourceCollection: 'documente_text' } }, dryRun, summary);

    const presences = await db.collection('prezenta').find({ eId }).toArray();
    const presenceMap = new Map();
    for (const row of presences) {
      let convocatorId = row.convocatorId;
      if (!convocatorId) {
        const matches = await db.collection('convocatoare').find({
          eId, numarTinuta: row.tinutaNr, dataTinuta: row.dataTinuta,
          numeLoja: row.numeLoja, nrLoja: row.nrLoja, orientul: row.orientul,
        }, { projection: { _id: 1 } }).toArray();
        if (matches.length === 1) convocatorId = matches[0]._id;
      }
      if (!convocatorId) summary.unresolvedPresence.push(row._id);
      presenceMap.set(row._id, convocatorId || null);
      await upsertById(Prezenta, { ...row, ...(convocatorId ? { convocatorId } : {}), legacyMetadata: { sourceCollection: 'prezenta', unresolvedConvocator: !convocatorId } }, dryRun, summary);
    }

    const confirmations = await db.collection('prezenta_confirmari').find({ eId }).toArray();
    for (const row of confirmations) {
      const userId = row.user?.id || row.userId;
      const convocatorId = row.convocatorId || presenceMap.get(row.idPrezenta) || undefined;
      await upsertById(PrezentaConfirmari, {
        ...row,
        userId,
        ...(convocatorId ? { convocatorId } : {}),
        userSnapshot: row.user ? { email: row.user.email || '', nume: row.user.nume || '', prenume: row.user.prenume || '' } : row.userSnapshot,
        publicTokenHash: undefined,
        legacyMetadata: { sourceCollection: 'prezenta_confirmari', publicTokenPending: true },
      }, dryRun, summary);
    }

    const documents = await db.collection('documente').find({ eId }).toArray();
    for (const row of documents) await upsertById(Documente, { ...row, legacyMetadata: { sourceCollection: 'documente' } }, dryRun, summary);

    if (!dryRun) {
      await MigrationRuns.insertAsync({ _id: Random.id(), type: 'csa-legacy-import', actor, summary, createdAt: new Date() });
    }
    return summary;
  });
}

Meteor.methods({
  async 'csaMigration.audit'() {
    await requireSuperAdmin(this);
    return withLegacy(sourceAudit);
  },
  async 'csaMigration.run'(confirmation) {
    const actor = await requireSuperAdmin(this);
    if (confirmation !== 'MIGRATE_CSA') throw new Meteor.Error('confirmation-required', 'Confirmarea este invalidă.');
    return migrate({ dryRun: false, actor });
  },
  async 'csaMigration.dryRun'() {
    const actor = await requireSuperAdmin(this);
    return migrate({ dryRun: true, actor });
  },
});


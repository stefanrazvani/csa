import { Meteor } from 'meteor/meteor';
import { MongoInternals } from 'meteor/mongo';
import { Random } from 'meteor/random';
import * as core from '/imports/api/collections.js';
import * as study from '/imports/modules/study/api/collections.js';
import * as administration from '/imports/modules/administration/api/collections.js';
import * as dossiers from '/imports/modules/dossiers/api/collections.js';
import { describeChanges } from './change-history.js';

const excluded = new Set(['AuditEvents', 'CraftCounters', 'MigrationRuns', 'ProcessingJobs', 'DossierAccessEvents', 'DossierImportBatches', 'DossierImportRows']);
// Called only from authenticated Meteor methods. Background jobs keep their own explicit audit.
function actor() { try { return Meteor.userId(); } catch { return null; } }
async function track(collection, operation, args, userId) {
  const session = MongoInternals.defaultRemoteCollectionDriver().mongo.client.startSession();
  const raw = collection.rawCollection();
  const user = await Meteor.users.findOneAsync(userId, { fields: { profile: 1, emails: 1, entitati: 1 } });
  const actorLabel = String(user?.profile?.name || user?.profile?.nume || user?.emails?.[0]?.address || userId).slice(0, 200);
  const activeEId = Object.entries(user?.entitati || {}).find(([, value]) => Number(value?.activ) === 1)?.[0] || '';
  try {
    return await session.withTransaction(async () => {
      let before = []; let after = []; let result;
      if (operation === 'insertAsync') {
        const document = { ...args[0], _id: args[0]._id || Random.id() };
        await raw.insertOne(document, { session }); after = [document]; result = document._id;
      } else {
        const selector = typeof args[0] === 'string' ? { _id: args[0] } : args[0];
        if (!selector || typeof selector !== 'object') throw new Meteor.Error('invalid-selector', 'Selector invalid.');
        const options = args[2] || {};
        const multi = operation === 'removeAsync' || options.multi;
        before = await raw.find(selector, { session }).limit(multi ? 1001 : 1).toArray();
        if (before.length > 1000) throw new Meteor.Error('batch-too-large', 'Operația trebuie împărțită în loturi de maximum 1000.');
        if (operation === 'removeAsync') {
          result = (await raw.deleteMany({ _id: { $in: before.map(row => row._id) } }, { session })).deletedCount;
        } else {
          const upsert = operation === 'upsertAsync' || options.upsert;
          const modifier = { ...args[1] };
          if (upsert && !before.length && !selector._id) modifier.$setOnInsert = { ...modifier.$setOnInsert, _id: Random.id() };
          const query = before.length ? { _id: { $in: before.map(row => row._id) } } : selector;
          const changed = await raw[multi ? 'updateMany' : 'updateOne'](query, modifier, { session, upsert: Boolean(upsert) });
          const ids = before.map(row => row._id); if (changed.upsertedId) ids.push(changed.upsertedId);
          after = await raw.find({ _id: { $in: ids } }, { session }).toArray();
          result = operation === 'upsertAsync'
            ? { numberAffected: changed.matchedCount + changed.upsertedCount, ...(changed.upsertedId ? { insertedId: changed.upsertedId } : {}) }
            : changed.matchedCount + changed.upsertedCount;
        }
      }
      const oldRows = new Map(before.map(row => [String(row._id), row]));
      const newRows = new Map(after.map(row => [String(row._id), row]));
      for (const id of new Set([...oldRows.keys(), ...newRows.keys()])) {
        const oldRow = oldRows.get(id) || {}; const newRow = newRows.get(id) || {};
        const changes = describeChanges(oldRow, newRow);
        if (!changes.length) continue;
        const row = newRows.get(id) || oldRows.get(id);
        const eId = row.eId || (collection === core.Entitati ? String(row._id) : activeEId);
        await core.AuditEvents.rawCollection().insertOne({
          _id: Random.id(), actorId: userId, actorLabel, eId,
          action: `${collection._name}.${!oldRows.has(id) ? 'create' : !newRows.has(id) ? 'delete' : 'update'}`,
          entityType: collection._name, entityId: id, outcome: 'success', at: new Date(),
          minGrade: Math.max(Number(oldRow.level || oldRow.minGrade || 0), Number(newRow.level || newRow.minGrade || 0)),
          metadata: { changes }, requestId: Random.id(24), activeEId, crossTenant: Boolean(eId && eId !== activeEId),
        }, { session });
      }
      return result;
    });
  } finally { await session.endSession(); }
}

for (const [name, collection] of Object.entries({ ...core, ...study, ...administration, ...dossiers })) {
  if (excluded.has(name)) continue;
  for (const operation of ['insertAsync', 'updateAsync', 'upsertAsync', 'removeAsync']) {
    const original = collection[operation].bind(collection);
    collection[operation] = async function (...args) {
      const userId = actor();
      return userId ? track(collection, operation, args, userId) : original(...args);
    };
  }
}

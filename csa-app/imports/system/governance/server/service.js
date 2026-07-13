import { Meteor } from 'meteor/meteor';
import {
  CraftMemberships,
  DegreeEvents,
  LodgeMemberships,
} from '/imports/api/collections.js';

export function cleanId(value, label = 'ID') {
  const id = String(value || '').trim().slice(0, 120);
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Meteor.Error('validation-error', `${label} invalid.`);
  }
  return id;
}

export function cleanText(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

export function validDate(value, label, optional = false) {
  if ((value === undefined || value === null || value === '') && optional) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Meteor.Error('validation-error', `${label} invalidă.`);
  return date;
}

export async function upsertCanonicalMembership({
  eId,
  userId,
  actorId,
  matriculationNo = '',
  status = 'active',
  joinedAt = null,
  source = 'governance',
}) {
  const safeEId = cleanId(eId, 'Tenant ID');
  const safeUserId = cleanId(userId, 'User ID');
  const safeStatus = ['active', 'suspended', 'inactive', 'left'].includes(status) ? status : 'active';
  const now = new Date();
  const set = {
    status: safeStatus,
    updatedAt: now,
    updatedBy: actorId,
  };
  const cleanMatriculationNo = cleanText(matriculationNo, 80);
  if (cleanMatriculationNo) set.matriculationNo = cleanMatriculationNo;
  if (joinedAt) set.joinedAt = validDate(joinedAt, 'Data intrării');
  if (safeStatus === 'left') set.leftAt = now;
  else set.leftAt = null;

  const setOnInsert = {
    eId: safeEId,
    userId: safeUserId,
    source: cleanText(source, 80) || 'governance',
    createdAt: now,
    createdBy: actorId,
  };
  if (!set.joinedAt) setOnInsert.joinedAt = now;
  try {
    await LodgeMemberships.upsertAsync(
      { eId: safeEId, userId: safeUserId },
      { $set: set, $setOnInsert: setOnInsert },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    await LodgeMemberships.updateAsync({ eId: safeEId, userId: safeUserId }, { $set: set });
  }
  return LodgeMemberships.findOneAsync({ eId: safeEId, userId: safeUserId });
}

export async function recordDegree({
  eId,
  userId,
  grade,
  actorId,
  effectiveAt = new Date(),
  note = '',
  documentId = '',
  source = 'governance',
  recordIfUnchanged = true,
}) {
  const safeEId = cleanId(eId, 'Tenant ID');
  const safeUserId = cleanId(userId, 'User ID');
  const safeGrade = Number(grade);
  if (![1, 2, 3].includes(safeGrade)) throw new Meteor.Error('validation-error', 'Gradul trebuie să fie 1, 2 sau 3.');
  const when = validDate(effectiveAt, 'Data acordării');
  const now = new Date();
  if (when > now) throw new Meteor.Error('validation-error', 'Gradul nu poate deveni activ la o dată viitoare.');
  let membership = await LodgeMemberships.findOneAsync({ eId: safeEId, userId: safeUserId });
  if (!membership) {
    membership = await upsertCanonicalMembership({ eId: safeEId, userId: safeUserId, actorId, source });
  }

  const currentGrade = Number(membership.currentGrade || 0);
  let eventId = null;
  if (recordIfUnchanged || currentGrade !== safeGrade) {
    eventId = await DegreeEvents.insertAsync({
      eId: safeEId,
      userId: safeUserId,
      membershipId: membership._id,
      grade: safeGrade,
      eventType: 'degree_granted',
      effectiveAt: when,
      note: cleanText(note, 2000),
      documentId: cleanText(documentId, 160),
      source: cleanText(source, 80) || 'governance',
      status: 'active',
      createdAt: now,
      createdBy: actorId,
    });
  }

  await LodgeMemberships.updateAsync(
    { _id: membership._id, eId: safeEId },
    { $set: { currentGrade: safeGrade, gradeUpdatedAt: when, updatedAt: now, updatedBy: actorId } },
  );
  // Dual-write temporar: modulele craft existente continuă să funcționeze fără
  // să depindă de ordinea în care este lansat noul registru.
  await CraftMemberships.upsertAsync(
    { eId: safeEId, userId: safeUserId },
    {
      $set: { grade: safeGrade, status: 'active', updatedAt: now, updatedBy: actorId },
      $setOnInsert: { createdAt: now, createdBy: actorId },
    },
  );
  return { membershipId: membership._id, eventId, grade: safeGrade };
}

export async function importLegacyMemberships() {
  const legacyRows = await CraftMemberships.find(
    { status: 'active', grade: { $in: [1, 2, 3] } },
    { fields: { eId: 1, userId: 1, grade: 1, createdAt: 1, createdBy: 1, updatedAt: 1, updatedBy: 1 } },
  ).fetchAsync();
  let imported = 0;
  for (const legacy of legacyRows) {
    if (!legacy.eId || !legacy.userId) continue;
    const existing = await LodgeMemberships.findOneAsync(
      { eId: legacy.eId, userId: legacy.userId },
      { fields: { _id: 1, currentGrade: 1 } },
    );
    if (existing) continue;
    const now = new Date();
    try {
      await LodgeMemberships.upsertAsync(
        { eId: legacy.eId, userId: legacy.userId },
        {
          $setOnInsert: {
            eId: legacy.eId,
            userId: legacy.userId,
            status: 'active',
            currentGrade: Number(legacy.grade),
            joinedAt: legacy.createdAt || now,
            gradeUpdatedAt: legacy.updatedAt || legacy.createdAt || now,
            source: 'craft_memberships',
            createdAt: legacy.createdAt || now,
            createdBy: legacy.createdBy || 'legacy-migration',
            updatedAt: legacy.updatedAt || now,
            updatedBy: legacy.updatedBy || 'legacy-migration',
          },
        },
      );
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
    const canonical = await LodgeMemberships.findOneAsync(
      { eId: legacy.eId, userId: legacy.userId },
      { fields: { _id: 1 } },
    );
    try {
      await DegreeEvents.upsertAsync(
        { eId: legacy.eId, userId: legacy.userId, dedupeKey: 'craft_memberships:legacy_snapshot' },
        {
          $setOnInsert: {
            eId: legacy.eId,
            userId: legacy.userId,
            membershipId: canonical._id,
            grade: Number(legacy.grade),
            eventType: 'legacy_snapshot',
            dedupeKey: 'craft_memberships:legacy_snapshot',
            effectiveAt: legacy.updatedAt || legacy.createdAt || now,
            source: 'craft_memberships',
            status: 'active',
            createdAt: now,
            createdBy: 'legacy-migration',
          },
        },
      );
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
    imported += 1;
  }
  return imported;
}

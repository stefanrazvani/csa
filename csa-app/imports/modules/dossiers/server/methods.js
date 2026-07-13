import { createHash } from 'node:crypto';
import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';
import { check } from 'meteor/check';
import { Meteor } from 'meteor/meteor';
import { MongoInternals } from 'meteor/mongo';
import { Random } from 'meteor/random';
import {
  CraftMemberships,
  DegreeEvents,
  LodgeMemberships,
  OfficeTerms,
  PrezentaConfirmari,
} from '/imports/api/collections.js';
import { requireUser } from '/imports/lib/access/server.js';
import { writeAuditEvent } from '/imports/system/governance/server/audit.js';
import {
  BrotherDocuments,
  BrotherDossiers,
  BrotherSponsors,
  DossierDocumentGrants,
  DossierImportBatches,
  DossierImportRows,
  DossierNotes,
  MembershipEvents,
} from '../api/collections.js';
import { validateImportRows } from '../api/import-schema.js';
import {
  assertTenantMember,
  recordDossierAccess,
  requireDossierAdministrator,
  requireDossierViewer,
  safeId,
} from './access.js';

const MEMBERSHIP_EVENT_TYPES = new Set([
  'affiliation', 'transfer_in', 'transfer_out', 'leave_started', 'leave_ended',
  'demit', 'reinstatement', 'suspension', 'radiation', 'deceased', 'administrative_note',
]);
const DOCUMENT_CATEGORIES = new Set([
  'request', 'certificate', 'diploma', 'decision', 'identity_evidence',
  'transfer', 'leave', 'correspondence', 'other',
]);
const VISIBILITIES = new Set(['secretariat', 'member']);
const MEMBER_STATUSES = new Set(['active', 'suspended', 'inactive', 'left']);

function text(value, max = 500) {
  return String(value ?? '').replace(/\0/g, '').replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

function email(value) {
  const result = text(value, 254).toLowerCase();
  if (result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) {
    throw new Meteor.Error('validation-error', 'Adresa de email este invalidă.');
  }
  return result;
}

function optionalDate(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const result = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(result.getTime())) throw new Meteor.Error('validation-error', `${label} este invalidă.`);
  return result;
}

function visibility(value) {
  const result = text(value, 20).toLowerCase() || 'secretariat';
  if (!VISIBILITIES.has(result)) throw new Meteor.Error('validation-error', 'Vizibilitatea este invalidă.');
  return result;
}

function safeSha256(value) {
  const result = text(value, 64).toLowerCase();
  if (result && !/^[a-f0-9]{64}$/.test(result)) throw new Meteor.Error('validation-error', 'SHA-256 este invalid.');
  return result;
}

function audit(context, access, action, entityType, entityId, metadata = {}) {
  return writeAuditEvent({
    actorId: access.userId,
    eId: access.eId,
    activeEId: access.activeEId || access.eId,
    action,
    entityType,
    entityId,
    crossTenant: Boolean(access.crossTenant),
    metadata,
    context,
  });
}

async function logMutation(context, access, targetUserId, action, entityType, entityId, metadata = {}) {
  await audit(context, access, action, entityType, entityId, metadata);
  await recordDossierAccess(context, access, {
    targetUserId,
    action,
    resourceType: entityType,
    resourceId: entityId,
    metadata,
  });
}

async function withMongoTransaction(callback) {
  const session = MongoInternals.defaultRemoteCollectionDriver().mongo.client.startSession();
  try {
    return await session.withTransaction(() => callback(session));
  } finally {
    await session.endSession();
  }
}

async function ensureDossier(eId, userId, actorId) {
  const membership = await assertTenantMember(eId, userId);
  const now = new Date();
  await BrotherDossiers.upsertAsync(
    { eId, userId },
    {
      $set: { membershipId: membership?._id || null, updatedAt: now, updatedBy: actorId },
      $setOnInsert: {
        eId,
        userId,
        identity: {},
        contact: {},
        professional: {},
        association: { status: 'unknown' },
        dataQuality: { status: 'draft', reviewedAt: null, reviewedBy: null },
        sensitivity: 'restricted',
        createdAt: now,
        createdBy: actorId,
      },
    },
  );
  return BrotherDossiers.findOneAsync({ eId, userId });
}

function dossierSet(payload) {
  const identity = {
    givenName: text(payload?.identity?.givenName, 120),
    familyName: text(payload?.identity?.familyName, 120),
    birthName: text(payload?.identity?.birthName, 160),
    preferredName: text(payload?.identity?.preferredName, 160),
    birthDate: optionalDate(payload?.identity?.birthDate, 'Data nașterii'),
    birthPlace: text(payload?.identity?.birthPlace, 240),
    citizenship: text(payload?.identity?.citizenship, 120),
    maritalStatus: text(payload?.identity?.maritalStatus, 120),
  };
  const contact = {
    email: email(payload?.contact?.email),
    phone: text(payload?.contact?.phone, 60),
    address: {
      country: text(payload?.contact?.address?.country, 120),
      county: text(payload?.contact?.address?.county, 120),
      city: text(payload?.contact?.address?.city, 160),
      postalCode: text(payload?.contact?.address?.postalCode, 24),
      street: text(payload?.contact?.address?.street, 240),
      line2: text(payload?.contact?.address?.line2, 240),
    },
  };
  const professional = {
    occupation: text(payload?.professional?.occupation, 200),
    employer: text(payload?.professional?.employer, 240),
  };
  const associationStatus = text(payload?.association?.status, 32).toLowerCase() || 'unknown';
  if (!['member', 'non_member', 'pending', 'former', 'unknown'].includes(associationStatus)) {
    throw new Meteor.Error('validation-error', 'Statutul asociativ este invalid.');
  }
  const association = {
    memberNo: text(payload?.association?.memberNo, 80),
    status: associationStatus,
    joinedAt: optionalDate(payload?.association?.joinedAt, 'Data intrării în Asociație'),
  };
  return { identity, contact, professional, association };
}

function displayName(user, dossier) {
  return [dossier?.identity?.familyName, dossier?.identity?.givenName].filter(Boolean).join(' ')
    || [user?.setari?.nume, user?.setari?.prenume].filter(Boolean).join(' ')
    || [user?.profileExt?.nume, user?.profileExt?.prenume].filter(Boolean).join(' ')
    || user?.profile?.name
    || 'Membru';
}

function activeTerm(term, now = new Date()) {
  if (term.status !== 'active') return false;
  return (!term.startAt || new Date(term.startAt) <= now) && (!term.endAt || new Date(term.endAt) >= now);
}

function objectReference(value, eId, userId) {
  if (!value) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Meteor.Error('validation-error', 'Referința obiectului este invalidă.');
  const provider = text(value.provider, 20).toLowerCase();
  const bucket = text(value.bucket, 120);
  const key = text(value.key, 1000);
  const versionId = text(value.versionId, 160);
  if (provider !== 'minio' || bucket !== 'csa-documents') {
    throw new Meteor.Error('validation-error', 'Furnizorul de stocare nu este permis.');
  }
  const requiredPrefix = `${eId}/dossiers/${userId}/`;
  if (!key.startsWith(requiredPrefix) || key.includes('..') || /[\\\0]/.test(key)) {
    throw new Meteor.Error('validation-error', 'Cheia obiectului nu aparține dosarului și tenantului selectat.');
  }
  return {
    provider,
    bucket,
    key,
    versionId,
    size: Number.isSafeInteger(Number(value.size)) && Number(value.size) >= 0 ? Number(value.size) : 0,
    mimeType: text(value.mimeType, 160).toLowerCase(),
  };
}

Meteor.methods({
  async 'dossiers.context'(targetUserId = '', requestedEId = '') {
    check(targetUserId, String);
    check(requestedEId, String);
    const actorId = await requireUser(this);
    const access = await requireDossierViewer(this, targetUserId || actorId, requestedEId);
    let canManage = Boolean(access.superAdmin || !access.self);
    if (!canManage) {
      try {
        await requireDossierAdministrator(this, { action: 'context', requestedEId, audit: false });
        canManage = true;
      } catch (error) {
        canManage = false;
      }
    }
    return {
      eId: access.eId,
      userId: actorId,
      targetUserId: access.targetUserId,
      canManage,
      self: access.targetUserId === actorId,
      platformAdmin: Boolean(access.superAdmin),
    };
  },

  async 'dossiers.ensure'(targetUserId, requestedEId = '') {
    check(targetUserId, String);
    check(requestedEId, String);
    const memberId = safeId(targetUserId, 'User ID');
    const access = await requireDossierAdministrator(this, { action: 'create', requestedEId, targetUserId: memberId });
    const dossier = await ensureDossier(access.eId, memberId, access.userId);
    await logMutation(this, access, memberId, 'dossiers.create', 'brother_dossier', dossier._id);
    return { id: dossier._id };
  },

  async 'dossiers.personal.update'(targetUserId, payload, requestedEId = '') {
    check(targetUserId, String);
    check(payload, Object);
    check(requestedEId, String);
    const memberId = safeId(targetUserId, 'User ID');
    const access = await requireDossierAdministrator(this, { action: 'personal.write', requestedEId, targetUserId: memberId });
    const dossier = await ensureDossier(access.eId, memberId, access.userId);
    const now = new Date();
    await BrotherDossiers.updateAsync(
      { _id: dossier._id, eId: access.eId, userId: memberId },
      {
        $set: {
          ...dossierSet(payload),
          dataQuality: {
            status: payload?.reviewed === true ? 'reviewed' : 'draft',
            reviewedAt: payload?.reviewed === true ? now : null,
            reviewedBy: payload?.reviewed === true ? access.userId : null,
          },
          updatedAt: now,
          updatedBy: access.userId,
        },
      },
    );
    await logMutation(this, access, memberId, 'dossiers.personal.update', 'brother_dossier', dossier._id, {
      sections: 'identity,contact,professional,association',
    });
    return { id: dossier._id };
  },

  async 'dossiers.profile.save'(targetUserId, payload, requestedEId = '') {
    check(targetUserId, String);
    check(payload, Object);
    check(requestedEId, String);
    const memberId = safeId(targetUserId, 'User ID');
    // Scrierea agregată nu acceptă tenant implicit: clientul trebuie să trimită
    // explicit același eId în argument și în payload.
    const tenantId = safeId(requestedEId, 'Tenant ID');
    if (safeId(payload.eId, 'Tenant ID') !== tenantId) {
      throw new Meteor.Error('invalid-eid', 'Tenantul formularului nu corespunde tenantului solicitat.');
    }
    const access = await requireDossierAdministrator(this, {
      action: 'profile.write', requestedEId: tenantId, targetUserId: memberId,
    });
    if (access.eId !== tenantId) throw new Meteor.Error('invalid-eid', 'Tenantul solicitat nu este activ.');
    await assertTenantMember(access.eId, memberId);

    const membershipPayload = payload.membership;
    const personalPayload = payload.personal;
    if (!membershipPayload || typeof membershipPayload !== 'object' || Array.isArray(membershipPayload)
      || !personalPayload || typeof personalPayload !== 'object' || Array.isArray(personalPayload)) {
      throw new Meteor.Error('validation-error', 'Apartenența și datele personale sunt obligatorii.');
    }
    const status = text(membershipPayload.status, 20).toLowerCase() || 'active';
    if (!MEMBER_STATUSES.has(status)) throw new Meteor.Error('validation-error', 'Statutul apartenenței este invalid.');
    const matriculationNo = text(membershipPayload.matriculationNo, 80);
    const joinedAt = optionalDate(membershipPayload.joinedAt, 'Data intrării');
    const dossierFields = dossierSet(personalPayload);
    const reviewed = personalPayload.reviewed === true;
    const now = new Date();
    const insertedMembershipId = Random.id();
    const insertedDossierId = Random.id();

    let saved;
    try {
      saved = await withMongoTransaction(async (session) => {
        const memberships = LodgeMemberships.rawCollection();
        const dossiers = BrotherDossiers.rawCollection();
        const craftMemberships = CraftMemberships.rawCollection();
        const membershipSet = {
          status,
          leftAt: status === 'left' ? now : null,
          updatedAt: now,
          updatedBy: access.userId,
        };
        if (matriculationNo) membershipSet.matriculationNo = matriculationNo;
        if (joinedAt) membershipSet.joinedAt = joinedAt;
        const membershipOnInsert = {
          _id: insertedMembershipId,
          eId: access.eId,
          userId: memberId,
          source: 'dossiers.profile.save',
          createdAt: now,
          createdBy: access.userId,
        };
        if (!joinedAt) membershipOnInsert.joinedAt = now;
        await memberships.updateOne(
          { eId: access.eId, userId: memberId },
          {
            $set: membershipSet,
            $setOnInsert: membershipOnInsert,
          },
          { upsert: true, session },
        );
        const membership = await memberships.findOne(
          { eId: access.eId, userId: memberId },
          { projection: { _id: 1 }, session },
        );
        if (!membership?._id) throw new Meteor.Error('invalid-state', 'Apartenența nu a putut fi salvată.');

        await dossiers.updateOne(
          { eId: access.eId, userId: memberId },
          {
            $set: {
              membershipId: membership._id,
              ...dossierFields,
              dataQuality: {
                status: reviewed ? 'reviewed' : 'draft',
                reviewedAt: reviewed ? now : null,
                reviewedBy: reviewed ? access.userId : null,
              },
              updatedAt: now,
              updatedBy: access.userId,
            },
            $setOnInsert: {
              _id: insertedDossierId,
              eId: access.eId,
              userId: memberId,
              sensitivity: 'restricted',
              createdAt: now,
              createdBy: access.userId,
            },
          },
          { upsert: true, session },
        );
        const dossier = await dossiers.findOne(
          { eId: access.eId, userId: memberId },
          { projection: { _id: 1 }, session },
        );
        if (!dossier?._id) throw new Meteor.Error('invalid-state', 'Dosarul nu a putut fi salvat.');

        // Compatibilitate temporară cu modulele craft vechi, în aceeași tranzacție.
        await craftMemberships.updateOne(
          { eId: access.eId, userId: memberId },
          { $set: { status: status === 'active' ? 'active' : 'inactive', updatedAt: now, updatedBy: access.userId } },
          { session },
        );
        return { dossierId: dossier._id, membershipId: membership._id };
      });
    } catch (error) {
      if (error?.code === 11000) {
        throw new Meteor.Error('duplicate-matriculation', 'Numărul matricol este deja folosit în Loja selectată.');
      }
      throw error;
    }

    await logMutation(this, access, memberId, 'dossiers.profile.save', 'brother_dossier', saved.dossierId, {
      membershipId: saved.membershipId,
      membershipStatus: status,
      sections: 'membership,identity,contact,professional,association',
    });
    return { id: saved.dossierId, membershipId: saved.membershipId };
  },

  async 'dossiers.membershipEvents.create'(targetUserId, payload, requestedEId = '') {
    check(targetUserId, String);
    check(payload, Object);
    check(requestedEId, String);
    const memberId = safeId(targetUserId, 'User ID');
    const access = await requireDossierAdministrator(this, { action: 'timeline.write', requestedEId, targetUserId: memberId });
    await ensureDossier(access.eId, memberId, access.userId);
    const eventType = text(payload.type, 40).toLowerCase();
    if (!MEMBERSHIP_EVENT_TYPES.has(eventType)) throw new Meteor.Error('validation-error', 'Tipul evenimentului este invalid.');
    const effectiveAt = optionalDate(payload.effectiveAt, 'Data evenimentului');
    if (!effectiveAt) throw new Meteor.Error('validation-error', 'Data evenimentului este obligatorie.');
    const id = await MembershipEvents.insertAsync({
      eId: access.eId,
      userId: memberId,
      type: eventType,
      effectiveAt,
      originLodge: {
        name: text(payload.originLodge?.name, 240),
        number: text(payload.originLodge?.number, 80),
        orient: text(payload.originLodge?.orient, 160),
      },
      destinationLodge: {
        name: text(payload.destinationLodge?.name, 240),
        number: text(payload.destinationLodge?.number, 80),
        orient: text(payload.destinationLodge?.orient, 160),
      },
      documentId: payload.documentId ? safeId(payload.documentId, 'Document ID') : null,
      note: text(payload.note, 3000),
      visibility: visibility(payload.visibility || 'member'),
      source: text(payload.source, 80) || 'manual',
      status: 'active',
      createdAt: new Date(),
      createdBy: access.userId,
    });
    await logMutation(this, access, memberId, 'dossiers.membershipEvents.create', 'membership_event', id, { eventType });
    return { id };
  },

  async 'dossiers.membershipEvents.remove'(targetUserId, eventId, requestedEId = '') {
    check(targetUserId, String);
    check(eventId, String);
    check(requestedEId, String);
    const memberId = safeId(targetUserId, 'User ID');
    const id = safeId(eventId, 'Event ID');
    const access = await requireDossierAdministrator(this, { action: 'timeline.delete', requestedEId, targetUserId: memberId });
    const changed = await MembershipEvents.updateAsync(
      { _id: id, eId: access.eId, userId: memberId, status: { $ne: 'deleted' } },
      { $set: { status: 'deleted', deletedAt: new Date(), deletedBy: access.userId } },
    );
    if (!changed) throw new Meteor.Error('not-found', 'Evenimentul nu există.');
    await logMutation(this, access, memberId, 'dossiers.membershipEvents.remove', 'membership_event', id);
    return { ok: true };
  },

  async 'dossiers.sponsors.save'(targetUserId, payload, requestedEId = '') {
    check(targetUserId, String);
    check(payload, Object);
    check(requestedEId, String);
    const memberId = safeId(targetUserId, 'User ID');
    const access = await requireDossierAdministrator(this, { action: 'sponsors.write', requestedEId, targetUserId: memberId });
    await ensureDossier(access.eId, memberId, access.userId);
    const sponsorUserId = payload.sponsorUserId ? safeId(payload.sponsorUserId, 'Sponsor User ID') : '';
    const externalName = text(payload.externalName, 240);
    if (!sponsorUserId && !externalName) throw new Meteor.Error('validation-error', 'Sponsorul trebuie identificat prin cont sau nume istoric.');
    if (sponsorUserId) await assertTenantMember(access.eId, sponsorUserId);
    const kind = ['primary', 'secondary', 'historical'].includes(payload.kind) ? payload.kind : 'primary';
    const now = new Date();
    const selector = payload.id
      ? { _id: safeId(payload.id, 'Sponsor ID'), eId: access.eId, userId: memberId }
      : { _id: Random.id(), eId: access.eId, userId: memberId };
    const id = selector._id;
    await BrotherSponsors.upsertAsync(selector, {
      $set: {
        sponsorUserId: sponsorUserId || null,
        externalName,
        kind,
        fromAt: optionalDate(payload.fromAt, 'Data sponsorizării'),
        note: text(payload.note, 2000),
        visibility: visibility(payload.visibility || 'member'),
        status: 'active',
        updatedAt: now,
        updatedBy: access.userId,
      },
      $setOnInsert: { eId: access.eId, userId: memberId, createdAt: now, createdBy: access.userId },
    });
    await logMutation(this, access, memberId, 'dossiers.sponsors.save', 'brother_sponsor', id, { kind });
    return { id };
  },

  async 'dossiers.documents.register'(targetUserId, payload, requestedEId = '') {
    check(targetUserId, String);
    check(payload, Object);
    check(requestedEId, String);
    const memberId = safeId(targetUserId, 'User ID');
    const access = await requireDossierAdministrator(this, { action: 'documents.write', requestedEId, targetUserId: memberId });
    await ensureDossier(access.eId, memberId, access.userId);
    const title = text(payload.title, 240);
    if (!title) throw new Meteor.Error('validation-error', 'Titlul documentului este obligatoriu.');
    const category = text(payload.category, 40).toLowerCase() || 'other';
    if (!DOCUMENT_CATEGORIES.has(category)) throw new Meteor.Error('validation-error', 'Categoria documentului este invalidă.');
    const objectRef = objectReference(payload.objectRef, access.eId, memberId);
    const sha256 = safeSha256(payload.sha256);
    if (objectRef && (!sha256 || !objectRef.mimeType || !objectRef.size)) {
      throw new Meteor.Error('validation-error', 'Obiectul MinIO necesită MIME, dimensiune și SHA-256.');
    }
    const now = new Date();
    const id = Random.id();
    await BrotherDocuments.insertAsync({
      _id: id,
      eId: access.eId,
      userId: memberId,
      title,
      category,
      documentNumber: text(payload.documentNumber, 120),
      issuer: text(payload.issuer, 240),
      issuedAt: optionalDate(payload.issuedAt, 'Data emiterii'),
      expiresAt: optionalDate(payload.expiresAt, 'Data expirării'),
      objectRef,
      sha256,
      originalName: text(payload.originalName, 300),
      storageState: objectRef ? 'available' : 'metadata_only',
      visibility: visibility(payload.visibility),
      note: text(payload.note, 2000),
      status: 'active',
      createdAt: now,
      createdBy: access.userId,
      updatedAt: now,
      updatedBy: access.userId,
    });
    await logMutation(this, access, memberId, 'dossiers.documents.register', 'brother_document', id, {
      category,
      storageState: objectRef ? 'available' : 'metadata_only',
    });
    return { id, storageState: objectRef ? 'available' : 'metadata_only' };
  },

  async 'dossiers.documents.authorizeDownload'(documentId, requestedEId = '') {
    check(documentId, String);
    check(requestedEId, String);
    const id = safeId(documentId, 'Document ID');
    const actorId = await requireUser(this);
    const initial = await BrotherDocuments.findOneAsync({ _id: id }, { fields: { eId: 1, userId: 1, visibility: 1, status: 1, storageState: 1, objectRef: 1 } });
    if (!initial || initial.status !== 'active') throw new Meteor.Error('not-found', 'Documentul nu există.');
    const access = await requireDossierViewer(this, initial.userId, requestedEId || initial.eId);
    if (access.eId !== initial.eId || (access.self && !access.superAdmin && initial.visibility === 'secretariat')) {
      throw new Meteor.Error('forbidden', 'Documentul nu este vizibil în acest context.');
    }
    if (initial.storageState !== 'available' || !initial.objectRef?.key) {
      throw new Meteor.Error('not-available', 'Documentul are numai metadate și nu conține un fișier disponibil.');
    }
    const token = Random.secret(40);
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);
    await DossierDocumentGrants.insertAsync({
      eId: initial.eId,
      documentId: id,
      actorId,
      targetUserId: initial.userId,
      tokenHash,
      expiresAt,
      usedAt: null,
      createdAt: new Date(),
    });
    await logMutation(this, access, initial.userId, 'dossiers.documents.download.authorize', 'brother_document', id, { expiresInSeconds: 120 });
    return {
      url: `/portal-api/dossiers/documents/${encodeURIComponent(id)}?ticket=${encodeURIComponent(token)}`,
      expiresAt,
    };
  },

  async 'dossiers.documents.remove'(targetUserId, documentId, requestedEId = '') {
    check(targetUserId, String);
    check(documentId, String);
    check(requestedEId, String);
    const memberId = safeId(targetUserId, 'User ID');
    const id = safeId(documentId, 'Document ID');
    const access = await requireDossierAdministrator(this, { action: 'documents.delete', requestedEId, targetUserId: memberId });
    const changed = await BrotherDocuments.updateAsync(
      { _id: id, eId: access.eId, userId: memberId, status: 'active' },
      { $set: { status: 'deleted', deletedAt: new Date(), deletedBy: access.userId } },
    );
    if (!changed) throw new Meteor.Error('not-found', 'Documentul nu există.');
    await logMutation(this, access, memberId, 'dossiers.documents.remove', 'brother_document', id, { objectRetention: 'retained' });
    return { ok: true };
  },

  async 'dossiers.notes.create'(targetUserId, payload, requestedEId = '') {
    check(targetUserId, String);
    check(payload, Object);
    check(requestedEId, String);
    const memberId = safeId(targetUserId, 'User ID');
    const access = await requireDossierAdministrator(this, { action: 'notes.write', requestedEId, targetUserId: memberId });
    await ensureDossier(access.eId, memberId, access.userId);
    const body = text(payload.body, 10_000);
    if (!body) throw new Meteor.Error('validation-error', 'Nota nu poate fi goală.');
    const id = await DossierNotes.insertAsync({
      eId: access.eId,
      userId: memberId,
      title: text(payload.title, 200),
      body,
      visibility: visibility(payload.visibility),
      status: 'active',
      createdAt: new Date(),
      createdBy: access.userId,
      updatedAt: new Date(),
      updatedBy: access.userId,
    });
    await logMutation(this, access, memberId, 'dossiers.notes.create', 'dossier_note', id, { visibility: visibility(payload.visibility) });
    return { id };
  },

  async 'dossiers.registry.generate'(requestedEId = '') {
    check(requestedEId, String);
    const access = await requireDossierAdministrator(this, { action: 'registry.generate', requestedEId });
    const [canonicalMemberships, tenantUsers] = await Promise.all([
      LodgeMemberships.find({ eId: access.eId }, { sort: { matriculationNo: 1 }, limit: 5000 }).fetchAsync(),
      Meteor.users.find(
        { [`entitati.${access.eId}`]: { $exists: true } },
        { fields: { profile: 1, profileExt: 1, setari: 1 }, limit: 5000 },
      ).fetchAsync(),
    ]);
    const canonicalByUser = new Map(canonicalMemberships.map((row) => [row.userId, row]));
    const userIds = [...new Set([...tenantUsers.map((row) => row._id), ...canonicalMemberships.map((row) => row.userId)])];
    const memberships = userIds.map((userId) => canonicalByUser.get(userId) || {
      userId,
      matriculationNo: '',
      currentGrade: 0,
      status: tenantUsers.find((row) => row._id === userId)?.setari?.status === '1' ? 'active' : 'inactive',
      joinedAt: null,
      legacyOnly: true,
    }).sort((left, right) => String(left.matriculationNo || '').localeCompare(String(right.matriculationNo || ''), 'ro', { numeric: true }));
    const [users, dossiers, degreeEvents, officeTerms, membershipEvents, sponsors, confirmations] = await Promise.all([
      Meteor.users.find({ _id: { $in: userIds } }, { fields: { profile: 1, profileExt: 1, setari: 1 } }).fetchAsync(),
      BrotherDossiers.find({ eId: access.eId, userId: { $in: userIds } }).fetchAsync(),
      DegreeEvents.find({ eId: access.eId, userId: { $in: userIds }, status: { $ne: 'revoked' } }, { sort: { effectiveAt: -1 } }).fetchAsync(),
      OfficeTerms.find({ eId: access.eId, userId: { $in: userIds } }, { sort: { startAt: -1 } }).fetchAsync(),
      MembershipEvents.find({ eId: access.eId, userId: { $in: userIds }, status: 'active' }, { sort: { effectiveAt: -1 } }).fetchAsync(),
      BrotherSponsors.find({ eId: access.eId, userId: { $in: userIds }, status: 'active' }).fetchAsync(),
      PrezentaConfirmari.find({ eId: access.eId, userId: { $in: userIds }, sys_status: 1 }, { fields: { userId: 1, status: 1, confirmareFinala: 1 } }).fetchAsync(),
    ]);
    const byId = (rows) => new Map(rows.map((row) => [row.userId || row._id, row]));
    const usersById = new Map(users.map((row) => [row._id, row]));
    const dossiersById = byId(dossiers);
    const grouped = (rows) => rows.reduce((map, row) => map.set(row.userId, [...(map.get(row.userId) || []), row]), new Map());
    const degreesById = grouped(degreeEvents);
    const officesById = grouped(officeTerms);
    const eventsById = grouped(membershipEvents);
    const sponsorsById = grouped(sponsors);
    const confirmationsById = grouped(confirmations);
    const now = new Date();
    const rows = memberships.map((membership, index) => {
      const dossier = dossiersById.get(membership.userId);
      const degrees = degreesById.get(membership.userId) || [];
      const gradeHistory = [1, 2, 3].map((grade) => {
        const event = degrees.find((row) => Number(row.grade) === grade);
        return {
          grade,
          effectiveAt: event?.effectiveAt || null,
          lodgeName: event?.lodgeName || event?.lodge || event?.originLodge?.name || '',
        };
      });
      const gradeDates = Object.fromEntries(gradeHistory.map((entry) => [`grade${entry.grade}At`, entry.effectiveAt]));
      const offices = (officesById.get(membership.userId) || []).filter((term) => activeTerm(term, now));
      const history = eventsById.get(membership.userId) || [];
      const attendance = confirmationsById.get(membership.userId) || [];
      return {
        rowNo: index + 1,
        userId: membership.userId,
        matriculationNo: membership.matriculationNo || '',
        displayName: displayName(usersById.get(membership.userId), dossier),
        birthDate: dossier?.identity?.birthDate || null,
        birthPlace: dossier?.identity?.birthPlace || '',
        citizenship: dossier?.identity?.citizenship || '',
        maritalStatus: dossier?.identity?.maritalStatus || '',
        occupation: dossier?.professional?.occupation || '',
        employer: dossier?.professional?.employer || '',
        contact: {
          email: dossier?.contact?.email || '',
          phone: dossier?.contact?.phone || '',
          address: dossier?.contact?.address || {},
        },
        membershipStatus: membership.status,
        joinedAt: membership.joinedAt || null,
        currentGrade: Number(membership.currentGrade || membership.grade || 0),
        ...gradeDates,
        gradeHistory,
        associationMemberNo: dossier?.association?.memberNo || '',
        associationStatus: dossier?.association?.status || 'unknown',
        activeOffices: offices.map((term) => ({ code: term.officeCode, masonicYear: term.masonicYear })),
        sponsors: (sponsorsById.get(membership.userId) || []).map((row) => ({ sponsorUserId: row.sponsorUserId || null, externalName: row.externalName || '', kind: row.kind })),
        lastMembershipEvent: history[0] ? { type: history[0].type, effectiveAt: history[0].effectiveAt } : null,
        membershipEvents: history.map((event) => ({
          type: event.type,
          effectiveAt: event.effectiveAt,
          originLodge: event.originLodge || null,
          destinationLodge: event.destinationLodge || null,
        })),
        participation: {
          invitations: attendance.length,
          confirmed: attendance.filter((row) => row.status === 'confirmed' || Number(row.confirmareFinala) === 1).length,
        },
        dataQuality: dossier?.dataQuality?.status || 'missing',
      };
    });
    await logMutation(this, access, access.userId, 'dossiers.registry.generate', 'dossier_registry', access.eId, { rowCount: rows.length });
    return { eId: access.eId, generatedAt: new Date(), rows };
  },

  async 'dossiers.import.stage'(payload, requestedEId = '') {
    check(payload, Object);
    check(requestedEId, String);
    const access = await requireDossierAdministrator(this, { action: 'import.stage', requestedEId });
    const sourceName = text(payload.sourceName, 300);
    if (!sourceName) throw new Meteor.Error('validation-error', 'Numele sursei este obligatoriu.');
    const sourceHash = payload.sourceHash ? safeSha256(payload.sourceHash) : '';
    const validation = validateImportRows(payload.rows, 1000);
    if (validation.error) throw new Meteor.Error('validation-error', validation.error);
    const batchId = Random.id();
    const now = new Date();
    const validCount = validation.rows.filter((row) => !row.errors.length).length;
    const invalidCount = validation.rows.length - validCount;
    await DossierImportBatches.insertAsync({
      _id: batchId,
      eId: access.eId,
      sourceName,
      sourceHash,
      rowCount: validation.rows.length,
      validCount,
      invalidCount,
      status: invalidCount ? 'needs_review' : 'staged',
      schemaVersion: 1,
      createdAt: now,
      createdBy: access.userId,
    });
    try {
      for (const [rowIndex, row] of validation.rows.entries()) {
        const fingerprint = createHash('sha256').update(JSON.stringify(row.normalized)).digest('hex');
        await DossierImportRows.insertAsync({
          eId: access.eId,
          batchId,
          rowIndex,
          sourceRow: row.normalized.sourceRow,
          normalized: row.normalized,
          errors: row.errors,
          fingerprint,
          status: row.errors.length ? 'invalid' : 'valid',
          createdAt: now,
          createdBy: access.userId,
        });
      }
    } catch (error) {
      await DossierImportRows.removeAsync({ eId: access.eId, batchId });
      await DossierImportBatches.removeAsync({ _id: batchId, eId: access.eId });
      throw error;
    }
    await logMutation(this, access, access.userId, 'dossiers.import.stage', 'dossier_import_batch', batchId, {
      rowCount: validation.rows.length,
      validCount,
      invalidCount,
    });
    return { batchId, status: invalidCount ? 'needs_review' : 'staged', rowCount: validation.rows.length, validCount, invalidCount };
  },

  async 'dossiers.import.preview'(batchId, limit = 100, requestedEId = '') {
    check(batchId, String);
    check(limit, Number);
    check(requestedEId, String);
    const id = safeId(batchId, 'Batch ID');
    const access = await requireDossierAdministrator(this, { action: 'import.preview', requestedEId });
    const batch = await DossierImportBatches.findOneAsync({ _id: id, eId: access.eId });
    if (!batch) throw new Meteor.Error('not-found', 'Importul staged nu există.');
    const rows = await DossierImportRows.find(
      { eId: access.eId, batchId: id },
      { sort: { sourceRow: 1 }, limit: Math.min(Math.max(Math.floor(limit), 1), 500), fields: { fingerprint: 0 } },
    ).fetchAsync();
    await logMutation(this, access, access.userId, 'dossiers.import.preview', 'dossier_import_batch', id, { returnedRows: rows.length });
    return { batch, rows };
  },
});

DDPRateLimiter.addRule({ type: 'method', name: /^dossiers\./, userId: (value) => Boolean(value) }, 50, 10_000);
DDPRateLimiter.addRule({ type: 'method', name: /^dossiers\.import\./, userId: (value) => Boolean(value) }, 5, 60_000);

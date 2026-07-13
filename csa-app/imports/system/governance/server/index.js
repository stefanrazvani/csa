import { check, Match } from 'meteor/check';
import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';
import { Meteor } from 'meteor/meteor';
import {
  AuditEvents,
  CraftMemberships,
  DegreeEvents,
  Entitati,
  ExternalVisitors,
  LodgeMemberships,
  OfficeDefinitions,
  OfficeDelegations,
  OfficeTerms,
} from '/imports/api/collections.js';
import {
  getEffectiveGrade,
  hasActiveOffice,
  requireCompositeAccess,
  requireSuperAdmin,
} from '/imports/lib/access/server.js';
import { writeAuditEvent } from './audit.js';
import { cleanId, cleanText, importLegacyMemberships, recordDegree, upsertCanonicalMembership, validDate } from './service.js';
import { seedGovernanceTenant } from './seed.js';
import './indexes.js';

const OPTIONAL_DATE = Match.Maybe(Match.OneOf(Date, String));
const MEMBER_STATUSES = ['active', 'suspended', 'inactive', 'left'];
const VISITOR_STATUSES = ['invited', 'confirmed', 'declined', 'attended', 'cancelled'];

function cleanOfficeCode(value) {
  const code = String(value || '').trim().toLowerCase().slice(0, 80);
  if (!/^[a-z][a-z0-9_-]*$/.test(code)) throw new Meteor.Error('validation-error', 'Codul funcției este invalid.');
  return code;
}

function cleanEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Meteor.Error('validation-error', 'Adresa de email este invalidă.');
  }
  return email;
}

async function assertTenantUser(userId, eId) {
  const target = await Meteor.users.findOneAsync(
    { _id: cleanId(userId, 'User ID'), [`entitati.${eId}`]: { $exists: true } },
    { fields: { _id: 1 } },
  );
  if (!target) throw new Meteor.Error('not-found', 'Utilizatorul nu aparține tenantului.');
  return target;
}

function contextAudit(access, context, action, entityType, entityId, metadata = {}) {
  return writeAuditEvent({
    actorId: access.userId,
    eId: access.eId,
    activeEId: access.activeEId || access.eId,
    action,
    entityType,
    entityId,
    crossTenant: access.crossTenant,
    metadata: { platformAdmin: access.superAdmin, ...metadata },
    context,
  });
}

async function governanceAdmin(context, alias, action = 'admin', requestedEId = '') {
  const officeCodes = alias === 'visitorInvitations' ? ['secretary', 'hospitalier', 'venerable'] : ['secretary', 'venerable'];
  return requireCompositeAccess(context, {
    alias,
    action,
    officeCodes,
    allowTenantAdmin: true,
    requestedEId,
  });
}

Meteor.publish('membership.current', async function membershipCurrentPublication() {
  if (!this.userId) return this.ready();
  const { userId, eId } = await requireCompositeAccess(this, {});
  return [
    LodgeMemberships.find({ eId, userId, status: 'active' }, { fields: { eId: 1, userId: 1, matriculationNo: 1, currentGrade: 1, status: 1, joinedAt: 1 } }),
    DegreeEvents.find({ eId, userId, status: { $ne: 'revoked' } }, { fields: { eId: 1, userId: 1, grade: 1, eventType: 1, effectiveAt: 1 }, sort: { effectiveAt: -1 } }),
  ];
});

Meteor.publish('membership.admin', async function membershipAdminPublication(requestedEId = '') {
  check(requestedEId, String);
  const access = await governanceAdmin(this, 'membership', 'read', requestedEId);
  await contextAudit(access, this, 'membership.read', 'tenant', access.eId, { publication: true });
  return [
    LodgeMemberships.find({ eId: access.eId }, { sort: { matriculationNo: 1, createdAt: 1 } }),
    Meteor.users.find(
      { [`entitati.${access.eId}`]: { $exists: true } },
      { fields: { emails: 1, profile: 1, setari: 1 }, sort: { 'emails.0.address': 1 } },
    ),
  ];
});

Meteor.publish('degreeEvents.admin', async function degreeEventsAdminPublication(userId = '', requestedEId = '') {
  check(userId, String);
  check(requestedEId, String);
  const access = await governanceAdmin(this, 'degreeEvents', 'read', requestedEId);
  const selector = { eId: access.eId };
  if (userId) selector.userId = cleanId(userId, 'User ID');
  await contextAudit(access, this, 'degreeEvents.read', 'member', userId, { publication: true });
  return DegreeEvents.find(selector, { sort: { effectiveAt: -1, createdAt: -1 } });
});

Meteor.publish('officeTerms.current', async function officeTermsCurrentPublication() {
  if (!this.userId) return this.ready();
  const access = await requireCompositeAccess(this, {});
  const now = new Date();
  const activeWindow = [
    { $or: [{ startAt: { $exists: false } }, { startAt: { $lte: now } }] },
    { $or: [{ endAt: { $exists: false } }, { endAt: { $gte: now } }] },
  ];
  const delegatedTermIds = await OfficeDelegations.find(
    { eId: access.eId, delegateUserId: access.userId, status: 'active', $and: activeWindow },
    { fields: { officeTermId: 1 } },
  ).fetchAsync();
  return [
    OfficeDefinitions.find({ eId: access.eId, status: 'active' }, { sort: { order: 1, name: 1 } }),
    OfficeTerms.find({
      eId: access.eId,
      status: 'active',
      $and: activeWindow,
      $or: [{ userId: access.userId }, { _id: { $in: delegatedTermIds.map((item) => item.officeTermId) } }],
    }),
    OfficeDelegations.find({ eId: access.eId, delegateUserId: access.userId, status: 'active', $and: activeWindow }),
  ];
});

Meteor.publish('officeTerms.admin', async function officeTermsAdminPublication(requestedEId = '') {
  check(requestedEId, String);
  const access = await governanceAdmin(this, 'officeTerms', 'read', requestedEId);
  await contextAudit(access, this, 'officeTerms.read', 'tenant', access.eId, { publication: true });
  return [
    OfficeDefinitions.find({ eId: access.eId }, { sort: { order: 1, name: 1 } }),
    OfficeTerms.find({ eId: access.eId }, { sort: { startAt: -1, officeCode: 1 } }),
    OfficeDelegations.find({ eId: access.eId }, { sort: { startAt: -1 } }),
  ];
});

Meteor.publish('visitorInvitations.admin', async function visitorInvitationsAdminPublication(requestedEId = '') {
  check(requestedEId, String);
  const access = await governanceAdmin(this, 'visitorInvitations', 'read', requestedEId);
  await contextAudit(access, this, 'visitorInvitations.read', 'tenant', access.eId, { publication: true });
  return ExternalVisitors.find({ eId: access.eId }, { sort: { visitAt: -1, createdAt: -1 } });
});

Meteor.publish('audit.recent', async function auditRecentPublication(limit = 100, requestedEId = '') {
  check(limit, Match.Integer);
  check(requestedEId, String);
  const access = await governanceAdmin(this, 'audit', 'read', requestedEId);
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  await contextAudit(access, this, 'audit.read', 'tenant', access.eId, { publication: true, limit: safeLimit });
  return AuditEvents.find({ eId: access.eId }, { sort: { at: -1 }, limit: safeLimit });
});

Meteor.publish('audit.global', async function auditGlobalPublication(limit = 200) {
  check(limit, Match.Integer);
  const actorId = await requireSuperAdmin(this);
  const safeLimit = Math.min(Math.max(limit, 1), 1000);
  await writeAuditEvent({
    actorId,
    eId: '*',
    action: 'audit.global.read',
    entityType: 'platform',
    metadata: { publication: true, limit: safeLimit, platformAdmin: true },
    context: this,
  });
  return AuditEvents.find({}, { sort: { at: -1 }, limit: safeLimit });
});

Meteor.methods({
  async 'membership.context'() {
    const access = await requireCompositeAccess(this, {});
    const [membership, grade, definitions, terms, delegations] = await Promise.all([
      LodgeMemberships.findOneAsync({ eId: access.eId, userId: access.userId, status: 'active' }),
      getEffectiveGrade(access.userId, access.eId),
      OfficeDefinitions.find({ eId: access.eId, status: 'active' }, { fields: { code: 1, name: 1, order: 1 } }).fetchAsync(),
      OfficeTerms.find({ eId: access.eId, userId: access.userId, status: 'active' }).fetchAsync(),
      OfficeDelegations.find({ eId: access.eId, delegateUserId: access.userId, status: 'active' }).fetchAsync(),
    ]);
    const now = new Date();
    const activeTerms = terms.filter((term) => (!term.startAt || term.startAt <= now) && (!term.endAt || term.endAt >= now));
    const activeDelegations = delegations.filter((row) => (!row.startAt || row.startAt <= now) && (!row.endAt || row.endAt >= now));
    const candidates = [...new Set([...activeTerms, ...activeDelegations].map((row) => row.officeCode).filter(Boolean))];
    const codes = [];
    for (const code of candidates) {
      if (await hasActiveOffice(access.userId, access.eId, [code], now)) codes.push(code);
    }
    return {
      eId: access.eId,
      membership: membership || null,
      grade,
      offices: definitions.filter((item) => codes.includes(item.code)),
      legacyMembership: access.legacyMembership,
      superAdmin: access.superAdmin,
      tenantAdmin: access.tenantAdmin,
    };
  },

  async 'membership.upsert'(payload) {
    check(payload, {
      userId: String,
      matriculationNo: Match.Maybe(String),
      status: Match.Maybe(String),
      joinedAt: OPTIONAL_DATE,
    });
    const access = await governanceAdmin(this, 'membership');
    await assertTenantUser(payload.userId, access.eId);
    const status = payload.status || 'active';
    if (!MEMBER_STATUSES.includes(status)) throw new Meteor.Error('validation-error', 'Statutul apartenenței este invalid.');
    const membership = await upsertCanonicalMembership({
      eId: access.eId,
      userId: payload.userId,
      actorId: access.userId,
      matriculationNo: payload.matriculationNo,
      status,
      joinedAt: payload.joinedAt,
    });
    await CraftMemberships.updateAsync(
      { eId: access.eId, userId: payload.userId },
      { $set: { status: status === 'active' ? 'active' : 'inactive', updatedAt: new Date(), updatedBy: access.userId } },
    );
    await contextAudit(access, this, 'membership.upsert', 'lodge_membership', membership._id, { targetUserId: payload.userId, status });
    return { id: membership._id };
  },

  async 'degreeEvents.record'(payload) {
    check(payload, {
      userId: String,
      grade: Match.Integer,
      effectiveAt: OPTIONAL_DATE,
      note: Match.Maybe(String),
      documentId: Match.Maybe(String),
    });
    const access = await governanceAdmin(this, 'degreeEvents', 'write');
    await assertTenantUser(payload.userId, access.eId);
    const result = await recordDegree({
      eId: access.eId,
      userId: payload.userId,
      grade: payload.grade,
      effectiveAt: payload.effectiveAt || new Date(),
      note: payload.note,
      documentId: payload.documentId,
      actorId: access.userId,
    });
    await contextAudit(access, this, 'degreeEvents.record', 'lodge_membership', result.membershipId, { targetUserId: payload.userId, grade: payload.grade, eventId: result.eventId });
    return result;
  },

  async 'officeDefinitions.upsert'(payload) {
    check(payload, {
      id: Match.Maybe(String),
      code: String,
      name: String,
      permissions: Match.Maybe([String]),
      minGrade: Match.Maybe(Match.Integer),
      order: Match.Maybe(Match.Integer),
      status: Match.Maybe(String),
    });
    const access = await governanceAdmin(this, 'officeTerms');
    const code = cleanOfficeCode(payload.code);
    const name = cleanText(payload.name, 160);
    if (!name) throw new Meteor.Error('validation-error', 'Denumirea funcției este obligatorie.');
    const permissions = [...new Set((payload.permissions || []).map((item) => cleanText(item, 120)).filter((item) => /^[A-Za-z][A-Za-z0-9_-]*\.[a-z]+$/.test(item)))];
    if (permissions.length !== (payload.permissions || []).length) {
      throw new Meteor.Error('validation-error', 'Lista permisiunilor funcției conține valori invalide.');
    }
    const minGrade = payload.minGrade == null ? 3 : Number(payload.minGrade);
    if (![1, 2, 3].includes(minGrade)) throw new Meteor.Error('validation-error', 'Gradul minim trebuie sa fie 1, 2 sau 3.');
    const now = new Date();
    let id = payload.id ? cleanId(payload.id, 'Office ID') : '';
    if (id) {
      const updated = await OfficeDefinitions.updateAsync(
        { _id: id, eId: access.eId },
        { $set: { code, name, permissions, minGrade, order: payload.order || 100, status: payload.status === 'inactive' ? 'inactive' : 'active', updatedAt: now, updatedBy: access.userId } },
      );
      if (!updated) throw new Meteor.Error('not-found', 'Funcția nu există în tenantul activ.');
    } else {
      id = await OfficeDefinitions.insertAsync({
        eId: access.eId, code, name, permissions, minGrade, order: payload.order || 100,
        status: payload.status === 'inactive' ? 'inactive' : 'active', systemDefault: false,
        createdAt: now, createdBy: access.userId, updatedAt: now, updatedBy: access.userId,
      });
    }
    await contextAudit(access, this, 'officeDefinitions.upsert', 'office_definition', id, { code });
    return { id };
  },

  async 'officeTerms.assign'(payload) {
    check(payload, {
      userId: String,
      officeCode: String,
      masonicYear: String,
      startAt: Match.OneOf(Date, String),
      endAt: Match.OneOf(Date, String),
    });
    const access = await governanceAdmin(this, 'officeTerms');
    await assertTenantUser(payload.userId, access.eId);
    const officeCode = cleanOfficeCode(payload.officeCode);
    const definition = await OfficeDefinitions.findOneAsync({ eId: access.eId, code: officeCode, status: 'active' });
    if (!definition) throw new Meteor.Error('not-found', 'Funcția nu este definită în tenantul activ.');
    const targetGrade = await getEffectiveGrade(payload.userId, access.eId);
    if (targetGrade < Number(definition.minGrade || 3)) {
      throw new Meteor.Error('insufficient-grade', `Funcția necesită cel puțin gradul ${definition.minGrade || 3}.`);
    }
    const startAt = validDate(payload.startAt, 'Data de început');
    const endAt = validDate(payload.endAt, 'Data de sfârșit');
    const masonicYear = cleanText(payload.masonicYear, 40);
    if (!masonicYear) throw new Meteor.Error('validation-error', 'Anul masonic este obligatoriu.');
    if (endAt <= startAt) throw new Meteor.Error('validation-error', 'Data de sfârșit trebuie să fie ulterioară datei de început.');
    const overlap = await OfficeTerms.findOneAsync({
      eId: access.eId,
      userId: payload.userId,
      officeCode,
      status: 'active',
      startAt: { $lte: endAt },
      endAt: { $gte: startAt },
    }, { fields: { _id: 1 } });
    if (overlap) throw new Meteor.Error('office-term-overlap', 'Există deja un mandat suprapus pentru această funcție și persoană.');
    const now = new Date();
    const id = await OfficeTerms.insertAsync({
      eId: access.eId,
      officeDefinitionId: definition._id,
      officeCode,
      userId: payload.userId,
      masonicYear,
      startAt,
      endAt,
      status: 'active',
      createdAt: now,
      createdBy: access.userId,
      updatedAt: now,
      updatedBy: access.userId,
    });
    await contextAudit(access, this, 'officeTerms.assign', 'office_term', id, { targetUserId: payload.userId, officeCode });
    return { id };
  },

  async 'officeTerms.revoke'(id) {
    check(id, String);
    const access = await governanceAdmin(this, 'officeTerms');
    const safeId = cleanId(id, 'Mandate ID');
    const updated = await OfficeTerms.updateAsync(
      { _id: safeId, eId: access.eId, status: 'active' },
      { $set: { status: 'revoked', revokedAt: new Date(), revokedBy: access.userId, updatedAt: new Date(), updatedBy: access.userId } },
    );
    if (!updated) throw new Meteor.Error('not-found', 'Mandatul activ nu există.');
    await OfficeDelegations.updateAsync(
      { eId: access.eId, officeTermId: safeId, status: 'active' },
      { $set: { status: 'revoked', revokedAt: new Date(), revokedBy: access.userId } },
      { multi: true },
    );
    await contextAudit(access, this, 'officeTerms.revoke', 'office_term', safeId);
    return { ok: true };
  },

  async 'officeTerms.delegate'(payload) {
    check(payload, {
      officeTermId: String,
      delegateUserId: String,
      actions: Match.Maybe([String]),
      startAt: Match.OneOf(Date, String),
      endAt: Match.OneOf(Date, String),
    });
    const access = await requireCompositeAccess(this, {});
    const term = await OfficeTerms.findOneAsync({ _id: cleanId(payload.officeTermId, 'Mandate ID'), eId: access.eId, status: 'active' });
    if (!term) throw new Meteor.Error('not-found', 'Mandatul activ nu există.');
    if (!access.superAdmin && !access.tenantAdmin && term.userId !== access.userId) {
      throw new Meteor.Error('forbidden', 'Numai titularul sau administratorul poate delega mandatul.');
    }
    await assertTenantUser(payload.delegateUserId, access.eId);
    const definition = await OfficeDefinitions.findOneAsync({ eId: access.eId, code: term.officeCode, status: 'active' });
    const delegateGrade = await getEffectiveGrade(payload.delegateUserId, access.eId);
    if (!definition || delegateGrade < Number(definition.minGrade || 3)) {
      throw new Meteor.Error('insufficient-grade', `Delegatul trebuie să aibă cel puțin gradul ${definition?.minGrade || 3}.`);
    }
    const startAt = validDate(payload.startAt, 'Data de început');
    const endAt = validDate(payload.endAt, 'Data de sfârșit');
    if (startAt < term.startAt || endAt > term.endAt || endAt <= startAt) {
      throw new Meteor.Error('validation-error', 'Delegarea trebuie să fie inclusă în perioada mandatului.');
    }
    const now = new Date();
    const id = await OfficeDelegations.insertAsync({
      eId: access.eId,
      officeTermId: term._id,
      officeCode: term.officeCode,
      delegatorUserId: term.userId,
      delegateUserId: payload.delegateUserId,
      actions: [...new Set((payload.actions || []).map((item) => cleanText(item, 80)).filter(Boolean))],
      startAt,
      endAt,
      status: 'active',
      createdAt: now,
      createdBy: access.userId,
    });
    await contextAudit(access, this, 'officeTerms.delegate', 'office_delegation', id, { officeTermId: term._id, delegateUserId: payload.delegateUserId });
    return { id };
  },

  async 'officeTerms.revokeDelegation'(id) {
    check(id, String);
    const access = await requireCompositeAccess(this, {});
    const delegation = await OfficeDelegations.findOneAsync({ _id: cleanId(id, 'Delegation ID'), eId: access.eId, status: 'active' });
    if (!delegation) throw new Meteor.Error('not-found', 'Delegarea activă nu există.');
    if (!access.superAdmin && !access.tenantAdmin && delegation.delegatorUserId !== access.userId) {
      throw new Meteor.Error('forbidden', 'Numai titularul sau administratorul poate revoca delegarea.');
    }
    await OfficeDelegations.updateAsync(
      { _id: delegation._id, eId: access.eId, status: 'active' },
      { $set: { status: 'revoked', revokedAt: new Date(), revokedBy: access.userId } },
    );
    await contextAudit(access, this, 'officeTerms.revokeDelegation', 'office_delegation', delegation._id);
    return { ok: true };
  },

  async 'visitorInvitations.upsert'(payload) {
    check(payload, {
      id: Match.Maybe(String),
      name: String,
      email: Match.Maybe(String),
      lodgeName: Match.Maybe(String),
      gradeClaimed: Match.Maybe(Match.Integer),
      eventId: Match.Maybe(String),
      visitAt: OPTIONAL_DATE,
      status: Match.Maybe(String),
      notes: Match.Maybe(String),
    });
    const access = await governanceAdmin(this, 'visitorInvitations');
    const name = cleanText(payload.name, 160);
    if (!name) throw new Meteor.Error('validation-error', 'Numele vizitatorului este obligatoriu.');
    const gradeClaimed = Number(payload.gradeClaimed || 0);
    if (![0, 1, 2, 3].includes(gradeClaimed)) throw new Meteor.Error('validation-error', 'Gradul declarat este invalid.');
    const status = payload.status || 'invited';
    if (!VISITOR_STATUSES.includes(status)) throw new Meteor.Error('validation-error', 'Statutul invitației este invalid.');
    const email = cleanEmail(payload.email);
    const now = new Date();
    const data = {
      name,
      email,
      normalizedEmail: email || undefined,
      lodgeName: cleanText(payload.lodgeName, 160),
      gradeClaimed,
      eventId: cleanText(payload.eventId, 160),
      visitAt: payload.visitAt ? validDate(payload.visitAt, 'Data vizitei') : null,
      status,
      notes: cleanText(payload.notes, 2000),
      updatedAt: now,
      updatedBy: access.userId,
    };
    let id = payload.id ? cleanId(payload.id, 'Visitor ID') : '';
    if (id) {
      const updated = await ExternalVisitors.updateAsync({ _id: id, eId: access.eId }, { $set: data });
      if (!updated) throw new Meteor.Error('not-found', 'Vizitatorul nu există în tenantul activ.');
    } else {
      id = await ExternalVisitors.insertAsync({ eId: access.eId, ...data, createdAt: now, createdBy: access.userId });
    }
    await contextAudit(access, this, 'visitorInvitations.upsert', 'external_visitor', id, { eventId: data.eventId, status });
    return { id };
  },
});

for (const name of [
  'membership.context',
  'membership.upsert',
  'degreeEvents.record',
  'officeDefinitions.upsert',
  'officeTerms.assign',
  'officeTerms.revoke',
  'officeTerms.delegate',
  'officeTerms.revokeDelegation',
  'visitorInvitations.upsert',
]) {
  DDPRateLimiter.addRule({ type: 'method', name }, name === 'membership.context' ? 60 : 30, 60 * 1000);
}

Meteor.startup(async () => {
  const tenants = await Entitati.find({ status: { $ne: 'inactive' } }, { fields: { _id: 1 } }).fetchAsync();
  for (const tenant of tenants) await seedGovernanceTenant(tenant._id);
  const imported = await importLegacyMemberships();
  if (imported) console.warn(`[governance] Au fost importate ${imported} apartenențe din craft_memberships.`);
});

export { writeAuditEvent } from './audit.js';

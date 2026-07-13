import { Meteor } from 'meteor/meteor';
import {
  LodgeMemberships,
} from '/imports/api/collections.js';
import {
  requireCompositeAccess,
  requireUser,
} from '/imports/lib/access/server.js';
import { DossierAccessEvents } from '../api/collections.js';

const OFFICE_CODES = ['secretary', 'venerable'];

function safeId(value, label = 'ID') {
  const result = String(value || '').trim().slice(0, 120);
  if (!result || !/^[A-Za-z0-9_-]+$/.test(result)) {
    throw new Meteor.Error('validation-error', `${label} invalid.`);
  }
  return result;
}

export async function requireDossierAdministrator(context, {
  action = 'read', requestedEId = '', targetUserId = '', audit = true,
} = {}) {
  return requireCompositeAccess(context, {
    alias: 'membership',
    action: 'admin',
    minGrade: 3,
    officeCodes: OFFICE_CODES,
    requestedEId,
    auditAction: audit ? `dossiers.${action}` : '',
    auditEntityType: 'brother_dossier',
    auditEntityId: targetUserId ? safeId(targetUserId, 'User ID') : '',
  });
}

export async function requireDossierViewer(context, targetUserId = '', requestedEId = '', { audit = true } = {}) {
  const actorId = await requireUser(context);
  const targetId = targetUserId ? safeId(targetUserId, 'User ID') : actorId;
  if (targetId === actorId) {
    const access = await requireCompositeAccess(context, {
      requestedEId,
      auditAction: audit ? 'dossiers.self.read' : '',
      auditEntityType: 'brother_dossier',
      auditEntityId: targetId,
    });
    return { ...access, targetUserId: targetId, self: true, canManage: access.superAdmin };
  }
  const access = await requireDossierAdministrator(context, {
    action: 'read', requestedEId, targetUserId: targetId, audit,
  });
  await assertTenantMember(access.eId, targetId);
  return { ...access, targetUserId: targetId, self: false, canManage: true };
}

export async function assertTenantMember(eId, userId) {
  const safeUserId = safeId(userId, 'User ID');
  const canonical = await LodgeMemberships.findOneAsync(
    { eId, userId: safeUserId },
    { fields: { _id: 1, status: 1 } },
  );
  if (canonical) return canonical;
  const user = await Meteor.users.findOneAsync(
    { _id: safeUserId, [`entitati.${eId}`]: { $exists: true } },
    { fields: { _id: 1 } },
  );
  if (!user) throw new Meteor.Error('not-found', 'Fratele nu aparține Loji selectate.');
  return null;
}

export async function recordDossierAccess(context, access, {
  targetUserId, action, resourceType = 'brother_dossier', resourceId = '', outcome = 'success', metadata = {},
}) {
  const headers = context?.connection?.httpHeaders || {};
  return DossierAccessEvents.insertAsync({
    eId: access.eId,
    actorId: access.userId,
    targetUserId: safeId(targetUserId || access.userId, 'User ID'),
    action: String(action || 'read').trim().slice(0, 120),
    resourceType: String(resourceType || 'brother_dossier').trim().slice(0, 120),
    resourceId: String(resourceId || '').trim().slice(0, 160),
    outcome: ['success', 'denied', 'failed'].includes(outcome) ? outcome : 'success',
    crossTenant: Boolean(access.crossTenant),
    platformAdmin: Boolean(access.superAdmin),
    metadata: Object.fromEntries(Object.entries(metadata || {}).slice(0, 20).map(([key, value]) => [
      String(key).slice(0, 80),
      ['string', 'number', 'boolean'].includes(typeof value) ? String(value).slice(0, 300) : '[structured]',
    ])),
    source: {
      connectionId: String(context?.connection?.id || '').slice(0, 160),
      ip: String(context?.connection?.clientAddress || '').slice(0, 80),
      userAgent: String(headers['user-agent'] || '').slice(0, 500),
    },
    at: new Date(),
  });
}

export { safeId };

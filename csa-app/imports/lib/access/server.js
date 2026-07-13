import { Meteor } from 'meteor/meteor';
import { Roles } from 'meteor/roles';
import {
  CraftMemberships,
  DegreeEvents,
  Entitati,
  LodgeMemberships,
  OfficeDefinitions,
  OfficeDelegations,
  OfficeTerms,
} from '/imports/api/collections.js';
import { writeAuditEvent } from '/imports/system/governance/server/audit.js';

export async function requireUser(context) {
  if (!context?.userId) throw new Meteor.Error('not-authorized', 'Autentificare necesară.');
  return context.userId;
}

export async function getActiveEId(userId) {
  const user = await Meteor.users.findOneAsync(userId, { fields: { entitati: 1 } });
  const entries = Object.entries(user?.entitati || {});
  const active = entries.find(([key, value]) => key !== 'all' && Number(value?.activ) === 1);
  return active?.[0] || '';
}

export async function requireActiveEId(context) {
  const userId = await requireUser(context);
  const eId = await getActiveEId(userId);
  if (!eId) throw new Meteor.Error('invalid-eid', 'Nu există tenant activ.');
  return { userId, eId };
}

export async function isSuperAdmin(userId) {
  if (!userId) return false;
  // Acceptăm scope-ul canonic AppsV3 și scope-ul null folosit de primul bootstrap CSA.
  return Boolean(
    await Roles.userIsInRoleAsync(userId, ['super_admin'], { scope: 'default-grup' })
    || await Roles.userIsInRoleAsync(userId, ['super_admin'], { scope: null })
  );
}

export async function isTenantAdmin(userId, eId) {
  if (!userId || !eId) return false;
  return Boolean(await isSuperAdmin(userId)
    || await Roles.userIsInRoleAsync(userId, ['tenant_admin'], { scope: eId }));
}

export async function requireTenantAdmin(context, requestedEId = '') {
  const userId = await requireUser(context);
  const user = await Meteor.users.findOneAsync(userId, { fields: { entitati: 1 } });
  const activeEId = await getActiveEId(userId);
  const eId = String(requestedEId || activeEId || '').trim();
  if (!eId) throw new Meteor.Error('invalid-eid', 'Nu există tenant activ.');
  if (!await isSuperAdmin(userId) && !user?.entitati?.[eId]) {
    throw new Meteor.Error('forbidden', 'Utilizatorul nu aparține tenantului solicitat.');
  }
  if (!await isTenantAdmin(userId, eId)) {
    throw new Meteor.Error('forbidden', 'Este necesar rolul tenant_admin.');
  }
  return { userId, eId };
}

export async function requireRole(context, alias, action = 'read') {
  const { userId, eId } = await requireActiveEId(context);
  if (await isSuperAdmin(userId)) {
    await writeAuditEvent({
      actorId: userId,
      eId,
      activeEId: eId,
      action: `${alias}.${action}`,
      entityType: 'module',
      entityId: alias,
      metadata: { platformAdmin: true },
      context,
    });
    return { userId, eId, superAdmin: true };
  }
  // Administratorul tenantului are acces operațional la modulele active ale tenantului.
  const officeCodes = alias === 'convocatoare' || alias === 'prezenta'
    ? ['secretary', 'venerable']
    : alias === 'documents' ? ['secretary', 'treasurer', 'hospitalier', 'librarian'] : [];
  // Operațiile administrative legacy trec prin aceeași intersecție rol + mandat ca
  // modulele noi; rolul tenant_admin nu substituie singur funcția anuală.
  if (action !== 'read' && officeCodes.length) {
    return requireCompositeAccess(context, { alias, action, officeCodes, allowTenantAdmin: false });
  }
  // Orice membru activ al tenantului poate vedea metadatele convocatoarelor.
  // Conținutul articolelor rămâne filtrat separat și obligatoriu după grad.
  if (alias === 'convocatoare' && action === 'read') return { userId, eId, memberRead: true };
  const roles = [`${alias}_${action}`, `${alias}_admin`];
  if (!await Roles.userIsInRoleAsync(userId, roles, { scope: eId })) {
    throw new Meteor.Error('forbidden', `Lipsește permisiunea ${alias}_${action}.`);
  }
  return { userId, eId, superAdmin: false };
}

export async function requireSuperAdmin(context) {
  const userId = await requireUser(context);
  if (!await isSuperAdmin(userId)) throw new Meteor.Error('forbidden', 'Este necesar rolul super_admin.');
  return userId;
}

export async function getCraftGrade(userId, eId) {
  return getEffectiveGrade(userId, eId);
}

export async function getEffectiveGrade(userId, eId) {
  if (!userId || !eId) return 0;
  const membership = await LodgeMemberships.findOneAsync(
    { userId, eId },
    { fields: { currentGrade: 1, grade: 1, status: 1 } },
  );
  if (membership && membership.status !== 'active') return 0;
  const canonicalGrade = Number(membership?.currentGrade || membership?.grade || 0);
  if ([1, 2, 3].includes(canonicalGrade)) return canonicalGrade;

  const degreeEvent = await DegreeEvents.findOneAsync(
    { userId, eId, status: { $ne: 'revoked' }, effectiveAt: { $lte: new Date() } },
    { fields: { grade: 1 }, sort: { effectiveAt: -1, createdAt: -1 } },
  );
  const historicalGrade = Number(degreeEvent?.grade || 0);
  if ([1, 2, 3].includes(historicalGrade)) return historicalGrade;

  // Compatibilitate de citire pentru datele migrate înaintea registrului canonic.
  const legacyMembership = await CraftMemberships.findOneAsync(
    { userId, eId, status: 'active' },
    { fields: { grade: 1 } },
  );
  const grade = Number(legacyMembership?.grade || 0);
  return [1, 2, 3].includes(grade) ? grade : 0;
}

function activeAt(row, at) {
  if (!row || row.status !== 'active') return false;
  const starts = row.startAt || row.startsAt;
  const ends = row.endAt || row.endsAt;
  return (!starts || new Date(starts) <= at) && (!ends || new Date(ends) >= at);
}

export async function hasActiveOffice(userId, eId, officeCodes, at = new Date()) {
  const codes = [...new Set((Array.isArray(officeCodes) ? officeCodes : [officeCodes])
    .map((code) => String(code || '').trim().toLowerCase()).filter(Boolean))];
  if (!userId || !eId || !codes.length) return false;
  const instant = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(instant.getTime())) return false;
  const memberGrade = await getEffectiveGrade(userId, eId);
  if (![1, 2, 3].includes(memberGrade)) return false;
  const definitions = await OfficeDefinitions.find(
    { eId, code: { $in: codes }, status: 'active' },
    { fields: { code: 1, minGrade: 1 } },
  ).fetchAsync();
  const activeCodes = definitions
    .filter((item) => memberGrade >= Number(item.minGrade || 3))
    .map((item) => item.code);
  if (!activeCodes.length) return false;

  const directTerms = await OfficeTerms.find(
    { eId, userId, officeCode: { $in: activeCodes }, status: 'active' },
    { fields: { status: 1, startAt: 1, endAt: 1, startsAt: 1, endsAt: 1 } },
  ).fetchAsync();
  if (directTerms.some((term) => activeAt(term, instant))) return true;

  const delegations = await OfficeDelegations.find(
    { eId, delegateUserId: userId, officeCode: { $in: activeCodes }, status: 'active' },
    { fields: { status: 1, startAt: 1, endAt: 1, startsAt: 1, endsAt: 1, officeTermId: 1 } },
  ).fetchAsync();
  for (const delegation of delegations) {
    if (!activeAt(delegation, instant)) continue;
    const term = await OfficeTerms.findOneAsync(
      { _id: delegation.officeTermId, eId, officeCode: { $in: activeCodes }, status: 'active' },
      { fields: { status: 1, startAt: 1, endAt: 1, startsAt: 1, endsAt: 1 } },
    );
    if (activeAt(term, instant)) return true;
  }
  return false;
}

async function hasActiveOfficePermission(userId, eId, alias, action, at = new Date()) {
  const instant = at instanceof Date ? at : new Date(at);
  const requested = [`${alias}.${action}`, `${alias}.admin`];
  const directTerms = await OfficeTerms.find(
    { eId, userId, status: 'active' },
    { fields: { officeCode: 1, status: 1, startAt: 1, endAt: 1 } },
  ).fetchAsync();
  const directCodes = directTerms.filter((term) => activeAt(term, instant)).map((term) => term.officeCode);

  const delegatedCodes = [];
  const delegations = await OfficeDelegations.find(
    { eId, delegateUserId: userId, status: 'active' },
    { fields: { officeCode: 1, officeTermId: 1, actions: 1, status: 1, startAt: 1, endAt: 1 } },
  ).fetchAsync();
  for (const delegation of delegations) {
    if (!activeAt(delegation, instant)) continue;
    const delegatedActions = delegation.actions || [];
    if (delegatedActions.length && !delegatedActions.some((item) => requested.includes(item) || requested.includes(`${alias}.${item}`))) continue;
    const term = await OfficeTerms.findOneAsync(
      { _id: delegation.officeTermId, eId, officeCode: delegation.officeCode, status: 'active' },
      { fields: { status: 1, startAt: 1, endAt: 1 } },
    );
    if (activeAt(term, instant)) delegatedCodes.push(delegation.officeCode);
  }
  const officeCodes = [...new Set([...directCodes, ...delegatedCodes].filter(Boolean))];
  if (!officeCodes.length) return false;
  return Boolean(await OfficeDefinitions.findOneAsync(
    { eId, code: { $in: officeCodes }, status: 'active', permissions: { $in: requested } },
    { fields: { _id: 1 } },
  ));
}

async function activeMembership(userId, eId) {
  const membership = await LodgeMemberships.findOneAsync(
    { userId, eId, status: 'active' },
    { fields: { currentGrade: 1, matriculationNo: 1, status: 1 } },
  );
  if (membership) return { ...membership, legacy: false };
  const legacy = await CraftMemberships.findOneAsync(
    { userId, eId, status: 'active' },
    { fields: { grade: 1, status: 1 } },
  );
  if (legacy) return { ...legacy, currentGrade: legacy.grade, legacy: true };
  // Punte temporară pentru conturile migrate care au apartenența numai în
  // `Meteor.users.entitati`; nu acordă grad și poate fi eliminată după backfill.
  const legacyUser = await Meteor.users.findOneAsync(
    { _id: userId, [`entitati.${eId}`]: { $exists: true }, 'setari.status': '1' },
    { fields: { _id: 1 } },
  );
  return legacyUser ? { _id: `legacy-user:${userId}`, currentGrade: 0, legacy: true } : null;
}

/**
 * Autorizație compusă pentru modulele noi. `allowTenantAdmin` este un bypass
 * explicit pentru rol și funcție (nu pentru apartenență/tenant); super_admin
 * are acces complet. `requestedEId` este acceptat numai pentru super_admin.
 */
export async function requireCompositeAccess(context, {
  alias = '',
  action = 'read',
  minGrade = 0,
  officeCodes = [],
  allowTenantAdmin = false,
  requestedEId = '',
  auditAction = '',
  auditEntityType = '',
  auditEntityId = '',
  auditMetadata = {},
} = {}) {
  const userId = await requireUser(context);
  const activeEId = await getActiveEId(userId);
  const eId = String(requestedEId || activeEId || '').trim();
  if (!eId) throw new Meteor.Error('invalid-eid', 'Nu există tenant activ.');
  const tenant = await Entitati.findOneAsync(eId, { fields: { _id: 1, status: 1 } });
  if (!tenant || tenant.status === 'inactive') throw new Meteor.Error('invalid-eid', 'Tenantul nu este activ.');

  const superAdmin = await isSuperAdmin(userId);
  const crossTenant = Boolean(activeEId && activeEId !== eId);
  const audit = async (outcome, metadata = {}) => {
    if (!auditAction) return;
    await writeAuditEvent({
      actorId: userId,
      eId,
      activeEId,
      action: auditAction,
      entityType: auditEntityType,
      entityId: auditEntityId,
      outcome,
      crossTenant,
      metadata: { ...auditMetadata, ...metadata },
      context,
    });
  };

  if (superAdmin) {
    if (auditAction) await audit('success', { platformAdmin: true });
    else {
      await writeAuditEvent({
        actorId: userId,
        eId,
        activeEId,
        action: 'platform_admin.access',
        entityType: 'module',
        entityId: String(alias || 'tenant'),
        crossTenant,
        metadata: { platformAdmin: true, requestedAction: action, minGrade, officeCodes },
        context,
      });
    }
    return { userId, eId, activeEId, grade: 3, superAdmin: true, tenantAdmin: true, crossTenant, officesSatisfied: true };
  }
  if (requestedEId && requestedEId !== activeEId) {
    await audit('denied', { reason: 'cross-tenant' });
    throw new Meteor.Error('forbidden', 'Accesul cross-tenant este rezervat administratorului platformei.');
  }

  const membership = await activeMembership(userId, eId);
  if (!membership) {
    await audit('denied', { reason: 'membership' });
    throw new Meteor.Error('membership-required', 'Este necesară o apartenență activă la Lojă.');
  }
  const grade = await getEffectiveGrade(userId, eId);
  const requiredGrade = Number(minGrade || 0);
  if (requiredGrade && (![1, 2, 3].includes(requiredGrade) || grade < requiredGrade)) {
    await audit('denied', { reason: 'grade', requiredGrade, grade });
    throw new Meteor.Error('insufficient-grade', 'Gradul activ nu permite această operație.');
  }

  const tenantAdmin = await isTenantAdmin(userId, eId);
  const adminBypass = Boolean(allowTenantAdmin && tenantAdmin);
  const cleanAlias = String(alias || '').trim();
  const cleanAction = String(action || 'read').trim();
  if (cleanAlias && !adminBypass) {
    const roles = [`${cleanAlias}_${cleanAction}`, `${cleanAlias}_admin`];
    const [roleGranted, officeGranted] = await Promise.all([
      Roles.userIsInRoleAsync(userId, roles, { scope: eId }),
      hasActiveOfficePermission(userId, eId, cleanAlias, cleanAction),
    ]);
    if (!roleGranted && !officeGranted) {
      await audit('denied', { reason: 'role', requiredRoles: roles });
      throw new Meteor.Error('forbidden', `Lipsește permisiunea ${cleanAlias}_${cleanAction}.`);
    }
  }

  const normalizedOffices = (Array.isArray(officeCodes) ? officeCodes : [officeCodes]).filter(Boolean);
  const officesSatisfied = !normalizedOffices.length || adminBypass
    || await hasActiveOffice(userId, eId, normalizedOffices);
  if (!officesSatisfied) {
    await audit('denied', { reason: 'office', requiredOffices: normalizedOffices });
    throw new Meteor.Error('office-required', 'Este necesară o funcție activă pentru această operație.');
  }

  await audit('success');
  return {
    userId,
    eId,
    activeEId,
    grade,
    superAdmin: false,
    tenantAdmin,
    crossTenant: false,
    officesSatisfied,
    legacyMembership: Boolean(membership.legacy),
  };
}

export async function getReadableCraftGrade(userId, eId, alias = 'convocatoare') {
  const grade = await getCraftGrade(userId, eId);
  if (grade) return grade;
  if (await isSuperAdmin(userId)) return 3;
  const bypassEnabled = process.env.CSA_CRAFT_ADMIN_GRADE_BYPASS === '1';
  if (bypassEnabled && (
    await Roles.userIsInRoleAsync(userId, [`${alias}_admin`], { scope: eId })
  )) return 3;
  throw new Meteor.Error('craft-grade-required', 'Utilizatorul nu are grad masonic activ.');
}

import { Accounts } from 'meteor/accounts-base';
import { check, Match } from 'meteor/check';
import { Meteor } from 'meteor/meteor';
import { Roles } from 'meteor/roles';
import {
  Entitati,
  GroupMembers,
  GroupModules,
  Groups,
  Module,
} from '/imports/api/collections.js';
import {
  getActiveEId,
  isSuperAdmin,
  isTenantAdmin,
  requireSuperAdmin,
  requireTenantAdmin,
} from '/imports/lib/access/server.js';
import { seedGovernanceTenant } from '/imports/system/governance/server/seed.js';
import { writeAuditEvent } from '/imports/system/governance/server/audit.js';

const MODULE_ALIASES = ['convocatoare', 'prezenta', 'documents'];
const ACTIONS = ['read', 'write', 'delete', 'admin'];

async function auditAdmin(context, actorId, eId, action, entityType, entityId = '', metadata = {}) {
  const activeEId = await getActiveEId(actorId);
  return writeAuditEvent({
    actorId,
    eId,
    activeEId,
    action,
    entityType,
    entityId,
    crossTenant: Boolean(activeEId && eId && activeEId !== eId),
    metadata,
    context,
  });
}

function cleanText(value, max = 160) {
  return String(value || '').trim().slice(0, max);
}

function cleanEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Meteor.Error('validation-error', 'Adresa de email nu este validă.');
  }
  return email;
}

function assertSafeId(value, label = 'ID') {
  const id = cleanText(value, 120);
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Meteor.Error('validation-error', `${label} invalid.`);
  }
  return id;
}

async function ensureModuleRoles(alias) {
  for (const action of ACTIONS) {
    await Roles.createRoleAsync(`${alias}_${action}`, { unlessExists: true });
  }
}

async function seedTenantModules(eId, actorId) {
  for (const alias of MODULE_ALIASES) {
    await ensureModuleRoles(alias);
    await Module.upsertAsync(
      { eId, alias },
      {
        $setOnInsert: {
          eId,
          alias,
          nume: alias === 'documents' ? 'Documente' : `${alias[0].toUpperCase()}${alias.slice(1)}`,
          status: 'active',
          createdAt: new Date(),
          createdBy: actorId,
        },
      },
    );
  }
  await seedGovernanceTenant(eId, actorId);
}

async function attachUserToTenant(userId, eId, tenantName, active = false) {
  const safeEId = assertSafeId(eId, 'Tenant ID');
  await Meteor.users.updateAsync(
    { _id: userId },
    {
      $set: {
        [`entitati.${safeEId}`]: { nume: tenantName, activ: active ? 1 : 0 },
        'entitati.all': { nume: 'All', activ: 0 },
      },
    },
  );
}

async function recomputeUserRoles(eId, userId) {
  const memberships = await GroupMembers.find({ eId, userId }, { fields: { groupId: 1 } }).fetchAsync();
  const groupIds = memberships.map((row) => row.groupId).filter(Boolean);
  const grants = groupIds.length
    ? await GroupModules.find({ eId, groupId: { $in: groupIds }, status: { $ne: 'inactive' } }).fetchAsync()
    : [];
  const modules = await Module.find({ eId }, { fields: { _id: 1, alias: 1 } }).fetchAsync();
  const aliasById = new Map(modules.map((item) => [item._id, cleanText(item.alias).toLowerCase()]));
  const desired = new Set();

  for (const grant of grants) {
    const alias = cleanText(grant.alias || aliasById.get(grant.moduleId)).toLowerCase();
    if (!alias) continue;
    for (const action of ACTIONS) {
      if (grant.permissions?.[action] === true) desired.add(`${alias}_${action}`);
    }
  }

  const existing = await Roles.getRolesForUserAsync(userId, { scope: eId });
  const managed = existing.filter((role) => /_(read|write|delete|admin)$/.test(role));
  const toRemove = managed.filter((role) => !desired.has(role));
  const toAdd = [...desired].filter((role) => !existing.includes(role));
  if (toRemove.length) await Roles.removeUsersFromRolesAsync(userId, toRemove, { scope: eId });
  if (toAdd.length) await Roles.addUsersToRolesAsync(userId, toAdd, { scope: eId, ifExists: true });
}

async function createTenantUser({ email, name, password, eId, tenantAdmin }, actorId) {
  const tenant = await Entitati.findOneAsync(eId, { fields: { nume: 1 } });
  if (!tenant) throw new Meteor.Error('not-found', 'Tenantul nu există.');
  const safeEmail = cleanEmail(email);
  const safeName = cleanText(name, 120);
  const safePassword = String(password || '');
  if (safePassword.length < 12) {
    throw new Meteor.Error('validation-error', 'Parola trebuie să aibă minimum 12 caractere.');
  }

  let user = await Meteor.users.findOneAsync({ 'emails.address': safeEmail }, { fields: { _id: 1 } });
  if (!user) {
    const userId = await Accounts.createUserAsync({
      email: safeEmail,
      password: safePassword,
      profile: { name: safeName || safeEmail },
    });
    user = { _id: userId };
  }
  await attachUserToTenant(user._id, eId, tenant.nume || 'CSA', true);
  await Meteor.users.updateAsync(user._id, {
    $set: {
      'setari.status': '1',
      'registration.status': 'active',
      'registration.activatedAt': new Date(),
      'registration.activatedBy': actorId,
    },
  });
  if (tenantAdmin) {
    await Roles.addUsersToRolesAsync(user._id, ['tenant_admin'], { scope: eId, ifExists: true });
  }
  await Meteor.users.updateAsync(user._id, { $set: { updatedAt: new Date(), updatedBy: actorId } });
  return user._id;
}

Meteor.publish('admin.self', async function adminSelfPublication() {
  if (!this.userId) return this.ready();
  const user = await Meteor.users.findOneAsync(this.userId, { fields: { entitati: 1 } });
  const tenantIds = Object.keys(user?.entitati || {}).filter((id) => id !== 'all' && /^[A-Za-z0-9_-]+$/.test(id));
  return [
    Meteor.users.find({ _id: this.userId }, { fields: { emails: 1, profile: 1, entitati: 1 } }),
    Entitati.find({ _id: { $in: tenantIds } }, { fields: { nume: 1, cui: 1, status: 1 } }),
  ];
});

Meteor.publish('admin.global', async function adminGlobalPublication() {
  if (!this.userId || !await isSuperAdmin(this.userId)) return this.ready();
  await auditAdmin(this, this.userId, '*', 'admin.global.read', 'platform', '', { publication: true });
  return [
    Entitati.find({}, { sort: { nume: 1 } }),
    Module.find({}, { sort: { eId: 1, nume: 1 } }),
    Meteor.users.find({}, { fields: { emails: 1, profile: 1, entitati: 1, setari: 1, registration: 1, createdAt: 1 }, sort: { 'emails.0.address': 1 } }),
  ];
});

Meteor.publish('admin.tenant', async function adminTenantPublication(requestedEId = '') {
  if (!this.userId) return this.ready();
  const { eId } = await requireTenantAdmin(this, requestedEId);
  if (await isSuperAdmin(this.userId)) {
    await auditAdmin(this, this.userId, eId, 'admin.tenant.read', 'tenant', eId, { publication: true });
  }
  return [
    Entitati.find({ _id: eId }),
    Module.find({ eId }, { sort: { nume: 1 } }),
    Groups.find({ eId }, { sort: { nume: 1 } }),
    GroupMembers.find({ eId }),
    GroupModules.find({ eId }),
    Meteor.users.find(
      { [`entitati.${eId}`]: { $exists: true } },
      { fields: { emails: 1, profile: 1, entitati: 1, setari: 1, registration: 1, createdAt: 1 }, sort: { 'emails.0.address': 1 } },
    ),
  ];
});

Meteor.methods({
  async 'admin.context'() {
    if (!this.userId) return { authenticated: false };
    const eId = await getActiveEId(this.userId);
    const superAdmin = await isSuperAdmin(this.userId);
    const tenantAdmin = eId ? await isTenantAdmin(this.userId, eId) : false;
    const tenant = eId ? await Entitati.findOneAsync(eId, { fields: { nume: 1 } }) : null;
    return { authenticated: true, eId, tenantName: tenant?.nume || '', superAdmin, tenantAdmin };
  },

  async 'admin.setActiveTenant'(eId) {
    const userId = this.userId;
    if (!userId) throw new Meteor.Error('not-authorized', 'Autentificare necesară.');
    const safeEId = assertSafeId(eId, 'Tenant ID');
    const user = await Meteor.users.findOneAsync(userId, { fields: { entitati: 1 } });
    const superAdmin = await isSuperAdmin(userId);
    const tenant = await Entitati.findOneAsync(safeEId, { fields: { nume: 1 } });
    if (!tenant) throw new Meteor.Error('not-found', 'Tenantul nu există.');
    if (!superAdmin && !user?.entitati?.[safeEId]) throw new Meteor.Error('forbidden', 'Nu aparțineți tenantului.');
    if (!user?.entitati?.[safeEId]) await attachUserToTenant(userId, safeEId, tenant.nume || 'CSA');
    const refreshed = await Meteor.users.findOneAsync(userId, { fields: { entitati: 1 } });
    const changes = {};
    for (const id of Object.keys(refreshed?.entitati || {})) {
      if (id !== 'all' && /^[A-Za-z0-9_-]+$/.test(id)) changes[`entitati.${id}.activ`] = id === safeEId ? 1 : 0;
    }
    await Meteor.users.updateAsync(userId, { $set: changes });
    if (superAdmin) await auditAdmin(this, userId, safeEId, 'admin.tenant.select', 'tenant', safeEId);
    return true;
  },

  async 'admin.global.tenants.create'(payload) {
    const actorId = await requireSuperAdmin(this);
    check(payload, { name: String, cui: Match.Maybe(String) });
    const name = cleanText(payload.name, 160);
    if (!name) throw new Meteor.Error('validation-error', 'Denumirea tenantului este obligatorie.');
    const tenantId = await Entitati.insertAsync({
      nume: name,
      cui: cleanText(payload.cui, 32),
      status: 'active',
      createdAt: new Date(),
      createdBy: actorId,
      updatedAt: new Date(),
      updatedBy: actorId,
    });
    await seedTenantModules(tenantId, actorId);
    await attachUserToTenant(actorId, tenantId, name, true);
    await Roles.addUsersToRolesAsync(actorId, ['tenant_admin'], { scope: tenantId, ifExists: true });
    await auditAdmin(this, actorId, tenantId, 'admin.global.tenants.create', 'tenant', tenantId, { name });
    return tenantId;
  },

  async 'admin.global.tenants.update'(eId, payload) {
    const actorId = await requireSuperAdmin(this);
    const safeEId = assertSafeId(eId, 'Tenant ID');
    check(payload, { name: String, cui: Match.Maybe(String), status: Match.Maybe(String) });
    const name = cleanText(payload.name, 160);
    if (!name) throw new Meteor.Error('validation-error', 'Denumirea este obligatorie.');
    await Entitati.updateAsync(
      { _id: safeEId },
      { $set: { nume: name, cui: cleanText(payload.cui, 32), status: payload.status === 'inactive' ? 'inactive' : 'active', updatedAt: new Date(), updatedBy: actorId } },
    );
    await auditAdmin(this, actorId, safeEId, 'admin.global.tenants.update', 'tenant', safeEId, { status: payload.status || 'active' });
    return true;
  },

  async 'admin.global.users.create'(payload) {
    const actorId = await requireSuperAdmin(this);
    check(payload, { email: String, name: String, password: String, eId: String, tenantAdmin: Boolean });
    const userId = await createTenantUser(payload, actorId);
    await auditAdmin(this, actorId, payload.eId, 'admin.global.users.create', 'user', userId, { tenantAdmin: payload.tenantAdmin });
    return userId;
  },

  async 'admin.tenant.update'(payload) {
    const { userId, eId } = await requireTenantAdmin(this);
    check(payload, { name: String, cui: Match.Maybe(String) });
    const name = cleanText(payload.name, 160);
    if (!name) throw new Meteor.Error('validation-error', 'Denumirea este obligatorie.');
    await Entitati.updateAsync({ _id: eId }, { $set: { nume: name, cui: cleanText(payload.cui, 32), updatedAt: new Date(), updatedBy: userId } });
    await auditAdmin(this, userId, eId, 'admin.tenant.update', 'tenant', eId);
    return true;
  },

  async 'admin.tenant.users.create'(payload) {
    const { userId, eId } = await requireTenantAdmin(this);
    check(payload, { email: String, name: String, password: String, tenantAdmin: Boolean });
    const targetUserId = await createTenantUser({ ...payload, eId }, userId);
    await auditAdmin(this, userId, eId, 'admin.tenant.users.create', 'user', targetUserId, { tenantAdmin: payload.tenantAdmin });
    return targetUserId;
  },

  async 'admin.tenant.users.setAdmin'(targetUserId, enabled) {
    const { userId, eId } = await requireTenantAdmin(this);
    check(targetUserId, String);
    check(enabled, Boolean);
    const target = await Meteor.users.findOneAsync({ _id: targetUserId, [`entitati.${eId}`]: { $exists: true } }, { fields: { _id: 1 } });
    if (!target) throw new Meteor.Error('not-found', 'Utilizatorul nu aparține tenantului.');
    if (enabled) await Roles.addUsersToRolesAsync(targetUserId, ['tenant_admin'], { scope: eId, ifExists: true });
    else await Roles.removeUsersFromRolesAsync(targetUserId, ['tenant_admin'], { scope: eId });
    await auditAdmin(this, userId, eId, 'admin.tenant.users.setAdmin', 'user', targetUserId, { enabled });
    return true;
  },

  async 'admin.tenant.users.setStatus'(targetUserId, enabled) {
    const { userId, eId } = await requireTenantAdmin(this);
    check(targetUserId, String);
    check(enabled, Boolean);
    const target = await Meteor.users.findOneAsync({ _id: targetUserId, [`entitati.${eId}`]: { $exists: true } }, { fields: { _id: 1 } });
    if (!target) throw new Meteor.Error('not-found', 'Utilizatorul nu aparține tenantului.');
    await Meteor.users.updateAsync(targetUserId, {
      $set: {
        'setari.status': enabled ? '1' : '0',
        [`entitati.${eId}.activ`]: enabled ? 1 : 0,
        'registration.status': enabled ? 'active' : 'inactive',
        'registration.updatedAt': new Date(),
        'registration.updatedBy': userId,
      },
    });
    await auditAdmin(this, userId, eId, 'admin.tenant.users.setStatus', 'user', targetUserId, { enabled });
    return true;
  },

  async 'admin.tenant.groups.create'(name) {
    const { userId, eId } = await requireTenantAdmin(this);
    check(name, String);
    const safeName = cleanText(name, 120);
    if (!safeName) throw new Meteor.Error('validation-error', 'Numele grupului este obligatoriu.');
    if (await Groups.findOneAsync({ eId, nume: safeName })) throw new Meteor.Error('duplicate', 'Grupul există deja.');
    const groupId = await Groups.insertAsync({ eId, nume: safeName, status: 'active', createdAt: new Date(), createdBy: userId, updatedAt: new Date(), updatedBy: userId });
    await auditAdmin(this, userId, eId, 'admin.tenant.groups.create', 'group', groupId, { name: safeName });
    return groupId;
  },

  async 'admin.tenant.groups.remove'(groupId) {
    const { userId, eId } = await requireTenantAdmin(this);
    check(groupId, String);
    const group = await Groups.findOneAsync({ _id: groupId, eId }, { fields: { _id: 1 } });
    if (!group) throw new Meteor.Error('not-found', 'Grupul nu există.');
    const members = await GroupMembers.find({ eId, groupId }, { fields: { userId: 1 } }).fetchAsync();
    await GroupMembers.removeAsync({ eId, groupId });
    await GroupModules.removeAsync({ eId, groupId });
    await Groups.removeAsync({ _id: groupId, eId });
    for (const row of members) await recomputeUserRoles(eId, row.userId);
    await auditAdmin(this, userId, eId, 'admin.tenant.groups.remove', 'group', groupId);
    return true;
  },

  async 'admin.tenant.groups.setMember'(groupId, targetUserId, enabled) {
    const { userId, eId } = await requireTenantAdmin(this);
    check(groupId, String);
    check(targetUserId, String);
    check(enabled, Boolean);
    if (!await Groups.findOneAsync({ _id: groupId, eId })) throw new Meteor.Error('not-found', 'Grupul nu există.');
    if (!await Meteor.users.findOneAsync({ _id: targetUserId, [`entitati.${eId}`]: { $exists: true } })) {
      throw new Meteor.Error('not-found', 'Utilizatorul nu aparține tenantului.');
    }
    if (enabled) {
      await GroupMembers.upsertAsync(
        { eId, groupId, userId: targetUserId },
        { $setOnInsert: { eId, groupId, userId: targetUserId, createdAt: new Date(), createdBy: userId } },
      );
    } else await GroupMembers.removeAsync({ eId, groupId, userId: targetUserId });
    await recomputeUserRoles(eId, targetUserId);
    await auditAdmin(this, userId, eId, 'admin.tenant.groups.setMember', 'group', groupId, { targetUserId, enabled });
    return true;
  },

  async 'admin.tenant.groups.setModule'(groupId, moduleId, permissions) {
    const { userId, eId } = await requireTenantAdmin(this);
    check(groupId, String);
    check(moduleId, String);
    check(permissions, { read: Boolean, write: Boolean, delete: Boolean, admin: Boolean });
    if (!await Groups.findOneAsync({ _id: groupId, eId })) throw new Meteor.Error('not-found', 'Grupul nu există.');
    const module = await Module.findOneAsync({ _id: moduleId, eId }, { fields: { alias: 1 } });
    if (!module) throw new Meteor.Error('not-found', 'Modulul nu există în tenant.');
    const normalized = { ...permissions };
    if (normalized.admin) ACTIONS.forEach((action) => { normalized[action] = true; });
    await GroupModules.upsertAsync(
      { eId, groupId, moduleId },
      {
        $set: { alias: cleanText(module.alias).toLowerCase(), permissions: normalized, status: 'active', updatedAt: new Date(), updatedBy: userId },
        $setOnInsert: { eId, groupId, moduleId, createdAt: new Date(), createdBy: userId },
      },
    );
    const members = await GroupMembers.find({ eId, groupId }, { fields: { userId: 1 } }).fetchAsync();
    for (const row of members) await recomputeUserRoles(eId, row.userId);
    await auditAdmin(this, userId, eId, 'admin.tenant.groups.setModule', 'group', groupId, { moduleId, permissions: normalized });
    return true;
  },
});

Meteor.startup(async () => {
  await Roles.createRoleAsync('tenant_admin', { unlessExists: true });
  await Promise.all([
    Groups.rawCollection().createIndex({ eId: 1, nume: 1 }),
    GroupMembers.rawCollection().createIndex({ eId: 1, groupId: 1, userId: 1 }, { unique: true }),
    GroupMembers.rawCollection().createIndex({ eId: 1, userId: 1 }),
    GroupModules.rawCollection().createIndex({ eId: 1, groupId: 1, moduleId: 1 }, { unique: true }),
    Module.rawCollection().createIndex({ eId: 1, alias: 1 }, { unique: true }),
  ]);
});

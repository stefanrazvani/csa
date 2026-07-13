import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';
import { Roles } from 'meteor/roles';
import { Entitati, Module } from '/imports/api/collections.js';

const MODULE_ALIASES = ['convocatoare', 'prezenta', 'documents'];
const ACTIONS = ['read', 'write', 'delete', 'admin'];

// Statusul legacy trebuie aplicat la autentificare, altfel conturile dezactivate ar
// redeveni utilizabile doar pentru că hash-ul parolei a fost migrat corect.
Accounts.validateLoginAttempt((attempt) => {
  if (!attempt.allowed || !attempt.user) return attempt.allowed;
  const managedStatus = String(attempt.user.setari?.status || '');
  if (managedStatus && managedStatus !== '1') {
    throw new Meteor.Error('account-disabled', 'Contul nu este activ. Contactați administratorul asociației.');
  }
  return true;
});

Meteor.startup(async () => {
  for (const alias of MODULE_ALIASES) {
    for (const action of ACTIONS) {
      await Roles.createRoleAsync(`${alias}_${action}`, { unlessExists: true });
    }
  }
  await Roles.createRoleAsync('super_admin', { unlessExists: true });
  await Roles.createRoleAsync('tenant_admin', { unlessExists: true });

  // Promovarea administratorilor platformei este o operație explicită de
  // bootstrap. Codul de autorizare verifică numai rolul, niciodată emailul.
  const platformAdmins = String(process.env.CSA_PLATFORM_ADMIN_EMAILS || '')
    .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  for (const platformAdminEmail of platformAdmins) {
    const platformAdmin = await Accounts.findUserByEmail(platformAdminEmail, { fields: { _id: 1 } });
    if (!platformAdmin) {
      console.warn(`[startup] Administratorul platformei nu există încă: ${platformAdminEmail}`);
      continue;
    }
    await Roles.addUsersToRolesAsync(platformAdmin._id, ['super_admin'], { scope: 'default-grup', ifExists: true });
    await Roles.addUsersToRolesAsync(platformAdmin._id, ['super_admin'], { scope: null, ifExists: true });
  }

  const eId = String(process.env.CSA_LEGACY_EID || '').trim();
  if (eId) {
    // Instalarea curată trebuie să aibă tenantul CSA înaintea oricărui import legacy.
    await Entitati.upsertAsync(
      { _id: eId },
      { $setOnInsert: { _id: eId, nume: 'CSA', status: 'active', createdAt: new Date(), createdBy: 'system' } },
    );
    for (const alias of MODULE_ALIASES) {
      await Module.upsertAsync(
        { eId, alias },
        { $setOnInsert: { eId, alias, nume: alias, status: 'active', createdAt: new Date(), createdBy: 'system' } },
      );
    }

    const configuredAdmins = String(process.env.CSA_TENANT_ADMIN_EMAILS || '')
      .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
    for (const adminEmail of configuredAdmins) {
      const adminUser = await Accounts.findUserByEmail(adminEmail, { fields: { _id: 1 } });
      if (!adminUser) {
        console.warn(`[startup] Administratorul configurat nu există: ${adminEmail}`);
        continue;
      }
      await Roles.addUsersToRolesAsync(
        adminUser._id,
        ['tenant_admin', 'convocatoare_read', 'convocatoare_write', 'convocatoare_delete', 'convocatoare_admin'],
        { scope: eId, ifExists: true },
      );
    }
  }

  const email = String(process.env.CSA_BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.CSA_BOOTSTRAP_ADMIN_PASSWORD || '');
  if (email && password) {
    let user = await Meteor.users.findOneAsync({ 'emails.address': email }, { fields: { _id: 1 } });
    if (!user) {
      const userId = await Accounts.createUserAsync({ email, password, profile: { name: 'CSA Administrator' } });
      user = { _id: userId };
    } else {
      // Un bootstrap explicit poate roti parola contului inițial; variabila este ștearsă după pornire.
      await Accounts.setPasswordAsync(user._id, password, { logout: false });
    }
    // Scope-ul default-grup păstrează compatibilitatea cu nucleul AppsV3.
    await Roles.addUsersToRolesAsync(user._id, ['super_admin'], { scope: 'default-grup' });
    await Roles.addUsersToRolesAsync(user._id, ['super_admin'], { scope: null });
    if (eId && /^[A-Za-z0-9_-]+$/.test(eId)) {
      await Meteor.users.updateAsync(user._id, { $set: { [`entitati.${eId}`]: { nume: 'CSA', activ: 1 }, 'entitati.all': { nume: 'All', activ: 0 } } });
      await Roles.addUsersToRolesAsync(user._id, ['tenant_admin'], { scope: eId, ifExists: true });
    }
    console.warn('[startup] Contul bootstrap super_admin este activ. Eliminați parola bootstrap din mediu după prima autentificare.');
  }
});

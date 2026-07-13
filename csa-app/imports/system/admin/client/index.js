import './index.html';
import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { Template } from 'meteor/templating';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import {
  Entitati,
  GroupMembers,
  GroupModules,
  Groups,
  Module,
} from '/imports/api/collections.js';
import { renderPage } from '/imports/layout/client';
import { registerDualRoute } from '/imports/system/gateway/client';

registerDualRoute(FlowRouter, '/administrare-globala', () => renderPage('globalAdmin'));
registerDualRoute(FlowRouter, '/administrare-tenant', () => renderPage('tenantAdmin'));

function errorMessage(error) {
  return error?.reason || error?.message || 'Operația nu a putut fi finalizată.';
}

function formValues(form) {
  return Object.fromEntries(new FormData(form));
}

function decorateUser(user) {
  const status = String(user.setari?.status || (user.registration?.status === 'pending' ? '2' : '1'));
  return {
    ...user,
    email: user.emails?.[0]?.address || '-',
    name: user.profile?.name || user.emails?.[0]?.address || user._id,
    statusLabel: status === '1' ? 'Activ' : (status === '2' ? 'În verificare' : 'Inactiv'),
    isActive: status === '1',
  };
}

Template.globalAdmin.onCreated(function globalAdminCreated() {
  this.context = new ReactiveVar({ loading: true });
  this.message = new ReactiveVar('');
  Meteor.callAsync('admin.context').then((context) => {
    this.context.set(context);
    if (context.superAdmin) this.subscribe('admin.global');
  }).catch((error) => this.message.set(errorMessage(error)));
});

Template.globalAdmin.helpers({
  allowed() { return Template.instance().context.get()?.superAdmin === true; },
  loading() { return Template.instance().context.get()?.loading === true; },
  message() { return Template.instance().message.get(); },
  tenants() { return Entitati.find({}, { sort: { nume: 1 } }); },
  tenantOptions() { return Entitati.find({ status: { $ne: 'inactive' } }, { sort: { nume: 1 } }); },
  users() { return Meteor.users.find({}, { sort: { 'emails.0.address': 1 } }).fetch().map(decorateUser); },
});

Template.globalAdmin.events({
  async 'submit #globalTenantCreate'(event, instance) {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    try {
      const eId = await Meteor.callAsync('admin.global.tenants.create', { name: values.name, cui: values.cui || '' });
      instance.message.set(`Tenant creat: ${eId}`);
      event.currentTarget.reset();
    } catch (error) { instance.message.set(errorMessage(error)); }
  },
  async 'submit #globalUserCreate'(event, instance) {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    try {
      await Meteor.callAsync('admin.global.users.create', {
        email: values.email,
        name: values.name,
        password: values.password,
        eId: values.eId,
        tenantAdmin: values.tenantAdmin === 'on',
      });
      instance.message.set('Utilizator creat sau asociat tenantului.');
      event.currentTarget.reset();
    } catch (error) { instance.message.set(errorMessage(error)); }
  },
  async 'click .js-global-activate'(event, instance) {
    try {
      await Meteor.callAsync('admin.setActiveTenant', event.currentTarget.dataset.id);
      instance.message.set('Tenantul activ a fost schimbat.');
    } catch (error) { instance.message.set(errorMessage(error)); }
  },
});

Template.tenantAdmin.onCreated(function tenantAdminCreated() {
  this.context = new ReactiveVar({ loading: true });
  this.message = new ReactiveVar('');
  Meteor.callAsync('admin.context').then((context) => {
    this.context.set(context);
    if (context.tenantAdmin && context.eId) this.subscribe('admin.tenant', context.eId);
  }).catch((error) => this.message.set(errorMessage(error)));
});

Template.tenantAdmin.helpers({
  allowed() { return Template.instance().context.get()?.tenantAdmin === true; },
  loading() { return Template.instance().context.get()?.loading === true; },
  message() { return Template.instance().message.get(); },
  activeTenant() {
    const eId = Template.instance().context.get()?.eId;
    return eId ? Entitati.findOne(eId) : null;
  },
  users() { return Meteor.users.find({}, { sort: { 'emails.0.address': 1 } }).fetch().map(decorateUser); },
  groups() {
    const usersById = new Map(Meteor.users.find({}).fetch().map((user) => [user._id, decorateUser(user)]));
    const modules = Module.find({}, { sort: { nume: 1 } }).fetch();
    return Groups.find({}, { sort: { nume: 1 } }).fetch().map((group) => {
      const members = GroupMembers.find({ groupId: group._id }).fetch()
        .map((row) => usersById.get(row.userId))
        .filter(Boolean);
      const moduleRows = modules.map((module) => {
        const grant = GroupModules.findOne({ groupId: group._id, moduleId: module._id });
        return { ...module, permissions: grant?.permissions || {}, read: grant?.permissions?.read === true, write: grant?.permissions?.write === true, delete: grant?.permissions?.delete === true, admin: grant?.permissions?.admin === true };
      });
      return { ...group, members, modules: moduleRows };
    });
  },
});

Template.tenantAdmin.events({
  async 'submit #tenantDetailsForm'(event, instance) {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    try {
      await Meteor.callAsync('admin.tenant.update', { name: values.name, cui: values.cui || '' });
      instance.message.set('Datele tenantului au fost salvate.');
    } catch (error) { instance.message.set(errorMessage(error)); }
  },
  async 'submit #tenantUserCreate'(event, instance) {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    try {
      await Meteor.callAsync('admin.tenant.users.create', { email: values.email, name: values.name, password: values.password, tenantAdmin: values.tenantAdmin === 'on' });
      instance.message.set('Utilizatorul a fost creat sau asociat.');
      event.currentTarget.reset();
    } catch (error) { instance.message.set(errorMessage(error)); }
  },
  async 'click .js-user-admin'(event, instance) {
    try {
      await Meteor.callAsync('admin.tenant.users.setAdmin', event.currentTarget.dataset.id, event.currentTarget.dataset.enabled === '1');
      instance.message.set('Rolul tenant_admin a fost actualizat.');
    } catch (error) { instance.message.set(errorMessage(error)); }
  },
  async 'click .js-user-status'(event, instance) {
    try {
      await Meteor.callAsync('admin.tenant.users.setStatus', event.currentTarget.dataset.id, event.currentTarget.dataset.enabled === '1');
      instance.message.set('Statusul utilizatorului a fost actualizat.');
    } catch (error) { instance.message.set(errorMessage(error)); }
  },
  async 'submit #tenantGroupCreate'(event, instance) {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    try {
      await Meteor.callAsync('admin.tenant.groups.create', values.name);
      instance.message.set('Grup creat.');
      event.currentTarget.reset();
    } catch (error) { instance.message.set(errorMessage(error)); }
  },
  async 'click .js-group-remove'(event, instance) {
    try {
      await Meteor.callAsync('admin.tenant.groups.remove', event.currentTarget.dataset.id);
      instance.message.set('Grup șters și roluri recalculate.');
    } catch (error) { instance.message.set(errorMessage(error)); }
  },
  async 'submit .js-group-member-add'(event, instance) {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    try {
      await Meteor.callAsync('admin.tenant.groups.setMember', values.groupId, values.userId, true);
      instance.message.set('Membru adăugat și roluri recalculate.');
    } catch (error) { instance.message.set(errorMessage(error)); }
  },
  async 'click .js-group-member-remove'(event, instance) {
    try {
      await Meteor.callAsync('admin.tenant.groups.setMember', event.currentTarget.dataset.group, event.currentTarget.dataset.user, false);
      instance.message.set('Membru eliminat și roluri recalculate.');
    } catch (error) { instance.message.set(errorMessage(error)); }
  },
  async 'submit .js-module-permissions'(event, instance) {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    try {
      await Meteor.callAsync('admin.tenant.groups.setModule', values.groupId, values.moduleId, {
        read: values.read === 'on', write: values.write === 'on', delete: values.delete === 'on', admin: values.admin === 'on',
      });
      instance.message.set('Permisiuni salvate și roluri recalculate.');
    } catch (error) { instance.message.set(errorMessage(error)); }
  },
});

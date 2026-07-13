import './index.html';
import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { Template } from 'meteor/templating';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { Convocatoare, CraftMemberships, DocumenteText } from '/imports/api/collections.js';
import { renderPage } from '/imports/layout/client';
import { appPath, registerDualRoute } from '/imports/system/gateway/client';

registerDualRoute(FlowRouter, '/convocatoare', () => renderPage('craftConvocatoare'));
registerDualRoute(FlowRouter, '/convocator/:id', (params) => renderPage('craftConvocatorEditor', { id: params.id }));
registerDualRoute(FlowRouter, '/administrare-grade', () => renderPage('craftGradeAdmin'));
registerDualRoute(FlowRouter, '/migrari', () => renderPage('csaMigrations'));

function loadPermissions(instance) {
  instance.permissions = new ReactiveVar({ grade: 0, read: true, write: false, admin: false });
  Meteor.callAsync('craft.permissions').then((value) => instance.permissions.set(value)).catch(() => {});
}

function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateTimeValue(value) {
  const date = asDate(value);
  if (!date) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formatDateTime(value) {
  const date = asDate(value);
  return date ? new Intl.DateTimeFormat('ro-RO', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—';
}

function accessTimeValue(document) {
  const legacy = String(document?.data_access || '').trim();
  if (/^([01]\d|2[0-3]):[0-5]\d/.test(legacy)) return legacy.slice(0, 5);
  const date = asDate(document?.dataAccess);
  return date ? new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date) : '';
}

Template.craftConvocatoare.onCreated(function created() { this.subscribe('craft.convocatoare'); loadPermissions(this); });
Template.craftConvocatoare.helpers({
  rows: () => Convocatoare.find({ sys_status: 1 }, { sort: { nr: -1 } }),
  convocatorPath(id) { return appPath(`/convocator/${id}`); },
  canWrite() { return Template.instance().permissions.get().write; },
});
Template.craftConvocatoare.events({
  async 'click #newConvocator'() {
    const result = await Meteor.callAsync('craft.convocatoare.insert', { nume: 'Convocator nou' });
    FlowRouter.go(appPath(`/convocator/${result.id}`));
  },
});

Template.craftConvocatorEditor.onCreated(function created() {
  this.id = this.data.id;
  loadPermissions(this);
  this.subscribe('craft.convocator', this.id);
  this.subscribe('craft.documenteText', this.id);
});
Template.craftConvocatorEditor.helpers({
  document() { return Convocatoare.findOne(Template.instance().id); },
  grades: () => [1, 2, 3],
  canWrite() { return Template.instance().permissions.get().write; },
  statusSelected(current, expected) { return current === expected ? { selected: true } : null; },
  dateTimeValue,
  accessTimeValue,
  formatDateTime,
  canDelete() { return Template.instance().permissions.get().delete; },
  canReadLevel(level) {
    const permissions = Template.instance().permissions.get();
    return permissions.write || Number(level) <= Number(permissions.grade || 0);
  },
  articlesFor(level) { return DocumenteText.find({ documentId: Template.instance().id, level: Number(level), sys_status: 1 }, { sort: { order: 1 } }); },
});
Template.craftConvocatorEditor.events({
  async 'submit #convocatorForm'(event, instance) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    values.numarTinuta = Number(values.numarTinuta || 0);
    if (values.dataTinuta) values.dataTinuta = new Date(values.dataTinuta);
    if (values.dataConfirmare) values.dataConfirmare = new Date(values.dataConfirmare);
    await Meteor.callAsync('craft.convocatoare.update', instance.id, values);
  },
  async 'submit .articleForm'(event, instance) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    values.level = Number(event.currentTarget.dataset.level);
    values.order = Number(values.order || 0);
    await Meteor.callAsync('craft.articole.insert', instance.id, values);
    event.currentTarget.reset();
  },
  async 'submit .articleEditForm'(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    values.order = Number(values.order || 0);
    await Meteor.callAsync('craft.articole.update', event.currentTarget.dataset.id, values);
  },
  async 'click .articleRemove'(event) {
    const form = event.currentTarget.closest('.articleEditForm');
    if (form && window.confirm('Ștergeți acest articol?')) await Meteor.callAsync('craft.articole.remove', form.dataset.id);
  },
});

Template.craftGradeAdmin.onCreated(function created() { this.subscribe('craft.gradeAdmin'); });
Template.craftGradeAdmin.helpers({
  users() {
    const memberships = new Map(CraftMemberships.find({}).fetch().map((entry) => [entry.userId, entry]));
    return Meteor.users.find({}, { sort: { 'emails.0.address': 1 } }).fetch().map((user) => ({
      _id: user._id,
      name: [user.setari?.prenume, user.setari?.nume].filter(Boolean).join(' ') || user.profile?.name || user.emails?.[0]?.address || user._id,
      email: user.emails?.[0]?.address || '',
      currentGrade: memberships.get(user._id)?.grade || '—',
    }));
  },
  memberships() {
    const users = new Map(Meteor.users.find({}).fetch().map((user) => [user._id, user]));
    return CraftMemberships.find({}, { sort: { grade: -1, userId: 1 } }).fetch().map((membership) => {
      const user = users.get(membership.userId);
      return {
        ...membership,
        name: [user?.setari?.prenume, user?.setari?.nume].filter(Boolean).join(' ') || user?.profile?.name || membership.userId,
        email: user?.emails?.[0]?.address || '',
      };
    });
  },
});
Template.craftGradeAdmin.events({
  async 'submit #gradeForm'(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    await Meteor.callAsync('craft.memberships.upsert', values.userId, Number(values.grade));
    event.currentTarget.reset();
  },
});

Template.csaMigrations.onCreated(function created() { this.result = new ReactiveVar(''); });
Template.csaMigrations.helpers({ result: () => Template.instance().result.get() });
Template.csaMigrations.events({
  async 'click #migrationAudit'(event, instance) {
    try {
      instance.result.set(JSON.stringify(await Meteor.callAsync('csaMigration.audit'), null, 2));
    } catch (error) {
      instance.result.set(JSON.stringify({ error: error?.reason || error?.message }, null, 2));
    }
  },
  async 'click #migrationDryRun'(event, instance) {
    try {
      instance.result.set(JSON.stringify(await Meteor.callAsync('csaMigration.dryRun'), null, 2));
    } catch (error) {
      instance.result.set(JSON.stringify({ error: error?.reason || error?.message }, null, 2));
    }
  },
  async 'click #migrationRun'(event, instance) {
    const confirmation = document.getElementById('migrationConfirmation')?.value?.trim() || '';
    if (confirmation !== 'MIGRATE_CSA') {
      instance.result.set(JSON.stringify({ error: 'Confirmarea MIGRATE_CSA este obligatorie.' }, null, 2));
      return;
    }
    try {
      instance.result.set(JSON.stringify(await Meteor.callAsync('csaMigration.run', confirmation), null, 2));
    } catch (error) {
      instance.result.set(JSON.stringify({ error: error?.reason || error?.message }, null, 2));
    }
  },
});

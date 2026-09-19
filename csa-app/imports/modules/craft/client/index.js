import './index.html';
import './operations.js';
import { downloadCsv, downloadReport } from './operations.js';
import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { Template } from 'meteor/templating';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { Convocatoare, CraftMemberships, DocumenteText, Documente } from '/imports/api/collections.js';
import { LibraryWorks } from '/imports/modules/study/api/collections.js';
import { renderPage } from '/imports/layout/client';
import { appPath, registerDualRoute } from '/imports/system/gateway/client';

registerDualRoute(FlowRouter, '/convocatoare', () => renderPage('craftConvocatoare'));
registerDualRoute(FlowRouter, '/convocator/:id', (params) => renderPage('craftConvocatorEditor', { id: params.id }));
registerDualRoute(FlowRouter, '/administrare-grade', () => renderPage('craftGradeAdmin'));
registerDualRoute(FlowRouter, '/migrari', () => renderPage('csaMigrations'));

function loadPermissions(instance) {
  instance.message = new ReactiveVar('');
  instance.permissions = new ReactiveVar({ grade: 0, read: true, write: false, admin: false });
  Meteor.callAsync('craft.permissions').then((value) => {
    instance.permissions.set(value);
    if (value.write && instance.id) instance.subscribe('craft.libraryChoices');
  }).catch((error) => instance.message.set(error.reason || error.message));
}

function safeEvents(events) {
  return Object.fromEntries(Object.entries(events).map(([name, handler]) => [name, async function (event, instance) {
    try { instance.message?.set(''); await handler.call(this, event, instance); }
    catch (error) { instance.message?.set(error.reason || error.message || 'Operația nu a reușit.'); }
  }]));
}

function pageRows(instance) { return instance.lists?.rows?.rows() || []; }

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

Template.craftConvocatoare.onCreated(function created() { this.selected = new ReactiveVar([]); loadPermissions(this); });
Template.craftConvocatoare.helpers({
  rows: () => pageRows(Template.instance()),
  selectedCount: () => Template.instance().selected.get().length,
  selected: (id) => Template.instance().selected.get().includes(id),
  message: () => Template.instance().message.get(),
  presenceAdmin: () => Template.instance().permissions.get().presenceAdmin,
  attendancePath: () => appPath('/prezente'),
  convocatorPath(id) { return appPath(`/convocator/${id}`); },
  canWrite() { return Template.instance().permissions.get().write; },
});
Template.craftConvocatoare.events(safeEvents({
  'change .selectConvocator'(event, instance) { const id = event.currentTarget.dataset.id; instance.selected.set(event.currentTarget.checked ? [...new Set([...instance.selected.get(), id])] : instance.selected.get().filter((value) => value !== id)); },
  'click #selectConvocatorPage'(event, instance) { instance.selected.set([...new Set([...instance.selected.get(), ...pageRows(instance).map((row) => row._id)])]); },
  'click #clearConvocatorSelection'(event, instance) { instance.selected.set([]); },
  async 'click #duplicateSelectedConvocatoare, click #archiveSelectedConvocatoare'(event, instance) {
    const duplicate = event.currentTarget.id === 'duplicateSelectedConvocatoare';
    const ids = [...instance.selected.get()];
    if (!window.confirm(`${duplicate ? 'Duplicați' : 'Arhivați'} cele ${ids.length} convocatoare selectate?`)) return;
    let completed = 0;
    try {
      for (const id of ids) {
        if (duplicate) await Meteor.callAsync('craft.convocatoare.duplicate', id);
        else await Meteor.callAsync('craft.convocatoare.update', id, { status: 'Arhivat' });
        completed += 1; instance.selected.set(instance.selected.get().filter((value) => value !== id));
      }
      instance.message.set(`${completed} convocatoare ${duplicate ? 'duplicate' : 'arhivate'}.`);
    } catch (error) { instance.message.set(`${completed} operații finalizate. Restul au rămas selectate. ${error.reason || error.message}`); }
  },
  async 'click #exportConvocatoare'(event, instance) { const exported = await Meteor.callAsync('csa.list.export', 'convocatoare', instance.lists.rows.state()); downloadCsv('convocatoare.csv', [['Nr', 'Nume', 'Loja', 'Data', 'Status'], ...exported.map((row) => [row.nr, row.nume, row.numeLoja, formatDateTime(row.dataTinuta), row.status])]); },
  async 'click #newConvocator'() {
    const result = await Meteor.callAsync('craft.convocatoare.insert', { nume: 'Convocator nou' });
    FlowRouter.go(appPath(`/convocator/${result.id}`));
  },
}));

Template.craftConvocatorEditor.onCreated(function created() {
  this.id = this.data.id;
  this.reportSettings = new ReactiveVar(null);
  loadPermissions(this);
  this.subscribe('craft.convocator', this.id);
  this.subscribe('craft.documenteText', this.id);
  this.subscribe('craft.convocatorDocuments', this.id);
});
Template.craftConvocatorEditor.helpers({
  reportSettings: () => Template.instance().reportSettings.get(),
  canAdmin: () => Template.instance().permissions.get().admin,
  document() { return Convocatoare.findOne(Template.instance().id); },
  message: () => Template.instance().message.get(),
  presenceAdmin: () => Template.instance().permissions.get().presenceAdmin,
  attendancePath: () => appPath(`/prezente/${Template.instance().id}`),
  printPath: () => appPath(`/convocator/${Template.instance().id}/tipar`),
  attachments: () => Documente.find({ objectId: Template.instance().id, sys_status: 1 }),
  libraryChoices: () => LibraryWorks.find({ status: 'published' }, { sort: { title: 1 } }),
  libraryPath: (id) => appPath(`/biblioteca/${id}`),
  grades: () => [1, 2, 3],
  canWrite() { return Template.instance().permissions.get().write; },
  statusSelected(current, expected) { return current === expected ? { selected: true } : null; },
  dateTimeValue,
  accessTimeValue,
  formatDateTime,
  canDelete() { return Template.instance().permissions.get().delete; },
  canReadLevel(level) {
    const permissions = Template.instance().permissions.get();
    return Number(level) <= Number(permissions.grade || 0);
  },
  articlesFor(level) { return DocumenteText.find({ documentId: Template.instance().id, level: Number(level), sys_status: 1 }, { sort: { order: 1 } }); },
});
Template.craftConvocatorEditor.events(safeEvents({
  async 'click #downloadConvocatorPdf'(event, instance) { downloadReport(await Meteor.callAsync('craft.convocatoare.pdf', instance.id)); },
  async 'click #sendTestConvocator'(event, instance) {
    if (!window.confirm('Trimiteți PDF-ul de test la adresa de email a contului curent?')) return;
    await Meteor.callAsync('craft.convocatoare.sendTest', instance.id); instance.message.set('Emailul de test a fost trimis.');
  },
  async 'click #loadReportSettings'(event, instance) { instance.reportSettings.set(await Meteor.callAsync('craft.settings.get')); },
  async 'submit #reportSettingsForm'(event, instance) {
    event.preventDefault(); await Meteor.callAsync('craft.settings.save', Object.fromEntries(new FormData(event.currentTarget)));
    instance.message.set('Setările pentru PDF și confirmări au fost salvate.');
  },
  async 'click #duplicateConvocator'(event, instance) {
    const result = await Meteor.callAsync('craft.convocatoare.duplicate', instance.id);
    FlowRouter.go(appPath(`/convocator/${result.id}`));
  },
  async 'click #removeConvocator'(event, instance) {
    if (!window.confirm('Ștergeți logic convocatorul și înregistrările asociate? Datele rămân păstrate pentru audit.')) return;
    await Meteor.callAsync('craft.convocatoare.remove', instance.id); FlowRouter.go(appPath('/convocatoare'));
  },
  async 'submit #linkLibraryDocument'(event, instance) {
    event.preventDefault(); await Meteor.callAsync('craft.documents.linkLibrary', instance.id, new FormData(event.currentTarget).get('workId')); instance.message.set('Document asociat.');
  },
  async 'click .unlinkDocument'(event) { await Meteor.callAsync('craft.documents.unlink', event.currentTarget.dataset.id); },
  async 'submit #convocatorForm'(event, instance) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    values.numarTinuta = Number(values.numarTinuta || 0);
    if (values.dataTinuta) values.dataTinuta = new Date(values.dataTinuta);
    if (values.dataConfirmare) values.dataConfirmare = new Date(values.dataConfirmare);
    await Meteor.callAsync('craft.convocatoare.update', instance.id, values);
    instance.message.set('Convocator salvat.');
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
}));

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

Template.csaMigrations.onCreated(function created() { this.result = new ReactiveVar(''); this.comparison = new ReactiveVar(null); });
Template.csaMigrations.helpers({ result: () => Template.instance().result.get(), comparison: () => Template.instance().comparison.get(), formatValue: (value) => value === undefined ? '(lipsește)' : JSON.stringify(value) });
Template.csaMigrations.events({
  async 'submit #migrationCompare'(event, instance) {
    event.preventDefault();
    try { instance.comparison.set(await Meteor.callAsync('csaMigration.compare', new FormData(event.currentTarget).get('collection'))); instance.result.set('Comparație finalizată.'); }
    catch (error) { instance.result.set(error.reason || error.message); }
  },
  async 'click #migrationCompareNext'(event, instance) {
    const current = instance.comparison.get();
    try { instance.comparison.set(await Meteor.callAsync('csaMigration.compare', current.collection, current.next)); }
    catch (error) { instance.result.set(error.reason || error.message); }
  },
  async 'submit .migrationReconcile'(event, instance) {
    event.preventDefault();
    const current = instance.comparison.get(); const id = event.currentTarget.dataset.id;
    const row = current.rows.find((item) => item.id === id); const fields = new FormData(event.currentTarget).getAll('fields');
    if (!fields.length) { instance.result.set('Selectați cel puțin un câmp.'); return; }
    if (!window.confirm(`Preluați din legacy ${fields.join(', ')} pentru ${id}? Valorile curente vor fi păstrate în jurnalul migrării.`)) return;
    try {
      await Meteor.callAsync('csaMigration.reconcile', { collection: current.collection, id, fields, sourceHash: row.sourceHash, targetHash: row.targetHash });
      instance.comparison.set({ ...current, rows: current.rows.filter((item) => item.id !== id) }); instance.result.set('Câmpurile selectate au fost reconciliate. Pentru alte câmpuri ale aceluiași document refaceți comparația.');
    } catch (error) { instance.result.set(error.reason || error.message); }
  },
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

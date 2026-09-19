import './operations.html';
import './operations.css';
import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { Convocatoare, DocumenteText, Prezenta, PrezentaConfirmari } from '/imports/api/collections.js';
import { renderPage } from '/imports/layout/client';
import { appPath, registerDualRoute } from '/imports/system/gateway/client';
import { attendanceStatus, attendanceTotals, isYes } from '../attendance.js';

registerDualRoute(FlowRouter, '/prezente', () => renderPage('craftAttendance'));
registerDualRoute(FlowRouter, '/prezente/:id', ({ id }) => renderPage('craftAttendance', { id }));
registerDualRoute(FlowRouter, '/confirmari', () => renderPage('craftMyConfirmations'));
registerDualRoute(FlowRouter, '/confirmari/:id', ({ id }) => renderPage('craftMyConfirmations', { id }));
registerDualRoute(FlowRouter, '/confirmare/:token', ({ token }) => renderPage('craftMyConfirmations', { token }));
registerDualRoute(FlowRouter, '/convocator/:id/tipar', ({ id }) => renderPage('craftConvocatorPrint', { id }));

const labels = { confirmed: 'Participă', declined: 'Nu participă', pending: 'În așteptare', answered: 'Răspuns legacy fără opțiune' };
const formatDate = (value) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString('ro-RO') : '—';
const memberName = (row) => [row.userSnapshot?.prenume, row.userSnapshot?.nume].filter(Boolean).join(' ') || row.userSnapshot?.email || 'Membru';
const mealLabel = (row) => !isYes(row.confirmareAgapa) ? 'Nu' : isYes(row.confirmareMeniuVegetarian) ? 'Vegetarian' : isYes(row.confirmareMeniuStandard) ? 'Standard' : 'Da, meniu neprecizat';
const shared = { formatDate, responseLabel: (row) => labels[attendanceStatus(row)], mealLabel, craftPath: appPath };

export function downloadCsv(filename, rows) {
  const cell = (value) => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const url = URL.createObjectURL(new Blob(['\uFEFF', rows.map((row) => row.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadReport(report) {
  const bytes = Uint8Array.from(atob(report.content), (character) => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: report.mimeType }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = report.filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function action(instance, callback) {
  if (instance.busy.get()) return;
  instance.busy.set(true); instance.message.set('');
  try { instance.message.set(await callback() || 'Operația a fost salvată.'); }
  catch (error) { instance.message.set(error.reason || error.message || 'Operația nu a reușit.'); }
  finally { instance.busy.set(false); }
}

Template.craftAttendance.onCreated(function () {
  this.eventId = new ReactiveVar(this.data?.id || '');
  this.query = new ReactiveVar(''); this.editing = new ReactiveVar('');
  this.message = new ReactiveVar(''); this.busy = new ReactiveVar(false);
  this.allowed = new ReactiveVar(false); this.accessMessage = new ReactiveVar('Se verifică accesul…');
  this.subscribe('craft.convocatoare');
  Meteor.callAsync('craft.permissions').then((permissions) => {
    this.allowed.set(permissions.presenceAdmin);
    this.autorun(() => { if (this.allowed.get()) this.subscribe('craft.attendance.workspace', this.eventId.get(), { onError: error => this.message.set(error.reason || error.message) }); });
    this.accessMessage.set('Este necesară permisiunea de prezențe și un mandat activ de Secretar/Venerabil.');

  }).catch((error) => this.accessMessage.set(error.reason || error.message));
});

function eventRows(instance) {
  const id = instance.eventId.get();
  return id ? PrezentaConfirmari.find({ convocatorId: id, sys_status: 1 }, { sort: { 'userSnapshot.nume': 1 } }).fetch() : [];
}
Template.craftAttendance.helpers({
  ...shared,
  allowed: () => Template.instance().allowed.get(), accessMessage: () => Template.instance().accessMessage.get(),
  message: () => Template.instance().message.get(), busy: () => Template.instance().busy.get(),
  events: () => Convocatoare.find({ sys_status: 1 }, { sort: { dataTinuta: -1, nr: -1 } }),
  selectedEvent: () => Template.instance().eventId.get(),
  eventSelected(id) { return Template.instance().eventId.get() === id ? { selected: true } : {}; },
  rows() { const instance = Template.instance(); const query = instance.query.get(); return eventRows(instance).filter((row) => `${memberName(row)} ${row.userSnapshot?.email || ''}`.toLocaleLowerCase('ro').includes(query)); },
  totals: () => attendanceTotals(eventRows(Template.instance())),
  memberName() { return memberName(this); },
  editing() { return PrezentaConfirmari.findOne(Template.instance().editing.get()); },
  deliveryLabel: (state) => ({ sent: 'Trimis', sending: 'În curs', failed: 'Eșuat' }[state] || 'Netrimis'),
  unresolved: () => Prezenta.find({ 'legacyMetadata.unresolvedConvocator': true, sys_status: 1 }).fetch(),
  availableEvents() { const linked = new Set(Prezenta.find({}).fetch().map((row) => row.convocatorId)); return Convocatoare.find({ sys_status: 1 }).fetch().filter((row) => !linked.has(row._id)); },
});
Template.craftAttendance.events({
  'click .js-export-xlsx'(event, instance) { void action(instance, async () => { downloadReport(await Meteor.callAsync('craft.prezenta.xlsx', instance.eventId.get())); return 'Raportul Excel a fost generat.'; }); },
  'change #attendanceEvent'(event, instance) { instance.eventId.set(event.currentTarget.value); instance.editing.set(''); instance.message.set(''); },
  'input #attendanceSearch'(event, instance) { instance.query.set(event.currentTarget.value.trim().toLocaleLowerCase('ro')); },
  'click .js-edit-response'(event, instance) { instance.editing.set(event.currentTarget.dataset.id); },
  'click .js-prepare'(event, instance) { void action(instance, async () => { const result = await Meteor.callAsync('craft.prezenta.prepare', instance.eventId.get()); return `${result.createdConfirmations} invitații noi. Răspunsurile existente au fost păstrate.`; }); },
  'click .js-send, click .js-resend'(event, instance) {
    const resend = event.currentTarget.classList.contains('js-resend');
    if (!window.confirm(resend ? 'Trimiteți din nou emailuri tuturor membrilor invitați și înlocuiți linkurile anterioare?' : 'Trimiteți emailurile de invitație care nu au fost încă trimise?')) return;
    void action(instance, async () => { const result = await Meteor.callAsync('craft.invitations.send', instance.eventId.get(), resend); return `Trimise: ${result.sent}; omise: ${result.skipped}; eșuate: ${result.failed}.`; });
  },
  'change .js-attended'(event, instance) { const input = event.currentTarget; void action(instance, async () => { await Meteor.callAsync('craft.prezenta.mark', input.dataset.id, input.checked); }); },
  'submit .js-link-presence'(event, instance) { event.preventDefault(); const form = event.currentTarget; void action(instance, () => Meteor.callAsync('craft.prezenta.link', form.dataset.id, new FormData(form).get('convocatorId')).then(() => 'Prezența a fost asociată.')); },
  'click .js-export'(event, instance) {
    downloadCsv('prezente.csv', [['Membru', 'Email', 'Răspuns', 'Agapă / meniu', 'Motiv absență', 'Motiv absență agapă', 'Prezent efectiv'], ...eventRows(instance).map((row) => [memberName(row), row.userSnapshot?.email, labels[attendanceStatus(row)], mealLabel(row), row.motivAbsenta, row.motivAbsentaAgapa, row.attended === true ? 'Da' : row.attended === false ? 'Nu' : 'Neînregistrat'])]);
  },
});

Template.craftMyConfirmations.onCreated(function () {
  this.message = new ReactiveVar(''); this.selectedId = new ReactiveVar(this.data?.id || '');
  this.autorun(() => { const id=this.selectedId.get(); if(id) this.subscribe('craft.confirmari.mine', id, { onError: error=>this.message.set(error.reason||error.message) }); });
  if (this.data?.token) Meteor.callAsync('craft.confirmare.get', this.data.token).then((result) => this.selectedId.set(result.id)).catch((error) => this.message.set(error.reason || error.message));
});
Template.craftMyConfirmations.helpers({ ...shared,
  message: () => Template.instance().message.get(),
  rows: () => PrezentaConfirmari.find({ userId: Meteor.userId(), sys_status: 1 }, { sort: { dataTinuta: -1 } }),
  selected: () => PrezentaConfirmari.findOne({ _id: Template.instance().selectedId.get(), userId: Meteor.userId(), sys_status: 1 }),
  responsePath: (id) => appPath(`/confirmari/${id}`),
});
Template.craftResponseForm.onCreated(function () { this.message = new ReactiveVar(''); this.busy = new ReactiveVar(false); });
Template.craftResponseForm.helpers({ ...shared,
  message: () => Template.instance().message.get(), busy: () => Template.instance().busy.get(),
  selectedFlag(value, expected) { return value !== undefined && value !== null && isYes(value) === expected ? { selected: true } : {}; },
  menuSelected(row, menu) { return isYes(row[menu === 'standard' ? 'confirmareMeniuStandard' : 'confirmareMeniuVegetarian']) ? { selected: true } : {}; },
});
Template.craftResponseForm.events({
  'submit .js-response-form'(event, instance) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
    values.confirmareMeniuStandard = values.menu === 'standard'; values.confirmareMeniuVegetarian = values.menu === 'vegetarian'; delete values.menu;
    void action(instance, async () => { await Meteor.callAsync(instance.data.admin ? 'craft.confirmare.admin' : 'craft.confirmare.mine', instance.data.row._id, values); return 'Răspunsul a fost salvat.'; });
  },
});
Template.craftConvocatorPrint.onCreated(function () { this.id = this.data.id; this.subscribe('craft.convocator', this.id); this.subscribe('craft.documenteText', this.id); });
Template.craftConvocatorPrint.helpers({ ...shared,
  document: () => Convocatoare.findOne(Template.instance().id), backPath: () => appPath(`/convocator/${Template.instance().id}`),
  sections() { const documentId = Template.instance().id; return [1, 2, 3].map((level) => ({ level, articles: DocumenteText.find({ documentId, level, sys_status: 1 }, { sort: { order: 1 } }).fetch() })).filter((section) => section.articles.length); },
});
Template.craftConvocatorPrint.events({ 'click .js-print'() { window.print(); } });

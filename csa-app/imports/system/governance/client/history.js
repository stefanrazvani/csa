import './history.html';
import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { renderPage } from '/imports/layout/client';
import { registerDualRoute } from '/imports/system/gateway/client';
registerDualRoute(FlowRouter, '/istoric', () => renderPage('csaHistory'));
function load(instance) { instance.lists?.rows?.set({ page: 0 }); }
Template.csaHistory.onCreated(function () {
  this.rows = new ReactiveVar([]); this.page = new ReactiveVar(0); this.more = new ReactiveVar(false);
  this.error = new ReactiveVar(''); this.busy = new ReactiveVar(false); this.filters = {}; this.request = 0;

});
Template.csaHistory.onDestroyed(function () { this.destroyed = true; this.request += 1; });
Template.csaHistory.helpers({
  rows: () => Template.instance().rows.get(), error: () => Template.instance().error.get(), busy: () => Template.instance().busy.get(),
  previousDisabled: () => Template.instance().page.get() === 0 || Template.instance().busy.get(),
  nextDisabled: () => !Template.instance().more.get() || Template.instance().busy.get(), pageNumber: () => Template.instance().page.get() + 1,
  historyDate: value => value ? new Intl.DateTimeFormat('ro-RO', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value)) : '—',
  historyValue: value => value === null ? '—' : String(value),
  historyAction: value => ({ create: 'Creare', insert: 'Creare', update: 'Modificare', remove: 'Arhivare / ștergere', delete: 'Ștergere', duplicate: 'Duplicare', mark: 'Prezență efectivă', response: 'Răspuns participare', assign: 'Atribuire', setAdmin: 'Drepturi administrator', setStatus: 'Stare cont', publish: 'Publicare', send: 'Trimitere', reverse: 'Stornare', link: 'Asociere' }[String(value).split('.').pop()] || value),
  historyOutcome: value => ({ success: 'Reușit', denied: 'Acces refuzat', failed: 'Eșuat' }[value] || value),
  historyEntity: value => ({ convocatoare: 'Convocatoare', convocator: 'Convocator', documente_text: 'Articol', prezenta_confirmari: 'Confirmare / prezență', prezenta: 'Prezență', confirmation: 'Confirmare', brother_dossiers: 'Dosar', lodge_memberships: 'Matricol', craft_memberships: 'Apartenență', degree_events: 'Grad', office_terms: 'Funcție', office_term: 'Funcție', library_works: 'Bibliotecă', documente: 'Document', treasury_transactions: 'Metale', hospitality_cases: 'Ospitalier', user: 'Utilizator', groups: 'Grup de acces', group_members: 'Membri grup' }[value] || value),
  historyDetails: value => value?.sourceId ? `Copiat din înregistrarea ${value.sourceId}` : typeof value?.enabled === 'boolean' ? (value.enabled ? 'Activat' : 'Dezactivat') : 'Operație înregistrată; comparația câmpurilor nu este disponibilă pentru acest eveniment.',
});
Template.csaHistory.events({
  'submit .js-history-filter'(event, instance) {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
    data.includeAccess = event.currentTarget.elements.includeAccess.checked;
    if (data.from) data.from = new Date(`${data.from}T00:00:00`).toISOString();
    if (data.to) data.to = new Date(`${data.to}T23:59:59.999`).toISOString();
    instance.filters = data; instance.page.set(0); load(instance);
  },
  'click .js-history-refresh'(event, instance) { load(instance); },
  'click .js-history-prev'(event, instance) { if (!instance.busy.get()) { instance.page.set(Math.max(0, instance.page.get() - 1)); load(instance); } },
  'click .js-history-next'(event, instance) { if (!instance.busy.get() && instance.more.get()) { instance.page.set(instance.page.get() + 1); load(instance); } },
});

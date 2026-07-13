import './dashboard.css';
import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { Template } from 'meteor/templating';
import { appPath } from '/imports/system/gateway/client';

function loadDashboard(instance) {
  instance.loading.set(true);
  instance.error.set('');
  Meteor.callAsync('dashboard.summary')
    .then((summary) => instance.summary.set(summary))
    .catch((error) => instance.error.set(error?.reason || error?.message || 'Dashboardul nu a putut fi încărcat.'))
    .finally(() => instance.loading.set(false));
}

Template.csaHome.onCreated(function dashboardCreated() {
  this.summary = new ReactiveVar(null);
  this.loading = new ReactiveVar(true);
  this.error = new ReactiveVar('');
  loadDashboard(this);
});

Template.csaHome.helpers({
  loading() { return Template.instance().loading.get(); },
  dashboardError() { return Template.instance().error.get(); },
  summary() { return Template.instance().summary.get(); },
  homePath(path) { return appPath(path); },
  eventHeading(mode) { return mode === 'upcoming' ? 'Următoarele convocatoare' : 'Convocatoare recente'; },
  formatDate(value) {
    if (!value) return 'Dată neprecizată';
    return new Intl.DateTimeFormat('ro-RO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  },
  confirmationStatus(value) {
    const status = String(value || '').trim();
    return status || 'Neconfirmat';
  },
  hasEvents(rows) { return Array.isArray(rows) && rows.length > 0; },
  hasConfirmations(rows) { return Array.isArray(rows) && rows.length > 0; },
});

Template.csaHome.events({
  'click .js-dashboard-retry'(event, instance) { loadDashboard(instance); },
});

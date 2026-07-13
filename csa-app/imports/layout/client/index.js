import './index.html';
import '/imports/system/auth/client/auth.css';
import { Accounts } from 'meteor/accounts-base';
import { Blaze } from 'meteor/blaze';
import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { Template } from 'meteor/templating';
import { Tracker } from 'meteor/tracker';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { startNovaParticles } from '/imports/system/auth/client/particles.js';
import {
  appPath,
  gatewayMode,
  gatewayState,
  logoutGateway,
  registerDualRoute,
} from '/imports/system/gateway/client';

let layoutView;
let pageView;
let requestedTemplate = 'csaHome';
let requestedData = {};
const resetToken = new ReactiveVar('');
let finishResetFlow = null;
const EXPERIENCE_GATE_STORAGE_PREFIX = 'csa.temple-experience.gate.v1';

function callbackPromise(action) {
  return new Promise((resolve, reject) => action((error) => (error ? reject(error) : resolve())));
}

function loginWithPassword(email, password) {
  return callbackPromise((done) => Meteor.loginWithPassword(email, password, done));
}

function logout() {
  return callbackPromise((done) => Meteor.logout(done));
}

function resetPassword(token, password) {
  return callbackPromise((done) => Accounts.resetPassword(token, password, done));
}

function mountRequestedPage() {
  const app = document.getElementById('app');
  if (!app) return;
  if (!layoutView) layoutView = Blaze.render(Template.csaLayout, app);
  Tracker.afterFlush(() => {
    const target = document.getElementById('page-content');
    if (!target) return;
    if (pageView) Blaze.remove(pageView);
    const state = gatewayState.get();
    const selected = gatewayMode && state === 'loading'
      ? 'csaGatewayLoading'
      : (Meteor.userId() ? requestedTemplate : 'csaLogin');
    pageView = Blaze.renderWithData(Template[selected], requestedData, target);
  });
}

export function renderPage(templateName, data = {}) {
  requestedTemplate = templateName;
  requestedData = data;
  mountRequestedPage();
}

Accounts.onResetPasswordLink((token, done) => {
  resetToken.set(token);
  finishResetFlow = done;
  requestedTemplate = 'csaHome';
  mountRequestedPage();
});

Meteor.startup(() => {
  Tracker.autorun(() => {
    Meteor.userId();
    gatewayState.get();
    mountRequestedPage();
  });
});

registerDualRoute(FlowRouter, '/', () => renderPage('csaHome'));
registerDualRoute(FlowRouter, '/dashboard', () => renderPage('csaHome'));

function experienceGateStorageKey() {
  return `${EXPERIENCE_GATE_STORAGE_PREFIX}:${Meteor.userId() || 'anonymous'}`;
}

function experienceGateWasPassed() {
  try {
    return window.sessionStorage.getItem(experienceGateStorageKey()) === 'passed';
  } catch (error) {
    return false;
  }
}

function clearExperienceGate() {
  try {
    window.sessionStorage.removeItem(experienceGateStorageKey());
  } catch (error) {
    // Delogarea continuă și când sessionStorage nu este disponibil.
  }
}

Template.csaLayout.onCreated(function layoutCreated() {
  this.adminContext = new ReactiveVar({});
  this.autorun(() => {
    const userId = Meteor.userId();
    if (!userId) {
      this.adminContext.set({});
      return;
    }
    const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
    if (!experienceGateWasPassed() && !currentPath.endsWith('/templu')) {
      FlowRouter.go(appPath('/templu'));
    }
    this.subscribe('admin.self');
    Meteor.callAsync('admin.context').then((context) => this.adminContext.set(context)).catch(() => this.adminContext.set({}));
  });
});

Template.csaLayout.helpers({
  isSuperAdmin() { return Template.instance().adminContext.get()?.superAdmin === true; },
  isTenantAdmin() { return Template.instance().adminContext.get()?.tenantAdmin === true; },
  appPath(path) { return appPath(path); },
  currentUserEmail() { return Meteor.user()?.emails?.[0]?.address || ''; },
  hasTenants() { return Object.keys(Meteor.user()?.entitati || {}).some((id) => id !== 'all'); },
  tenantOptions() {
    const context = Template.instance().adminContext.get() || {};
    return Object.entries(Meteor.user()?.entitati || {})
      .filter(([id]) => id !== 'all')
      .map(([id, value]) => ({ id, name: value?.nume || id, selected: id === context.eId ? 'selected' : null }));
  },
});

Template.csaLayout.events({
  async 'change .js-active-tenant'(event, instance) {
    await Meteor.callAsync('admin.setActiveTenant', event.currentTarget.value);
    const context = await Meteor.callAsync('admin.context');
    instance.adminContext.set(context);
    FlowRouter.go(appPath('/'));
  },
  async 'click .js-logout'() {
    clearExperienceGate();
    if (gatewayMode) {
      await logoutGateway();
      return;
    }
    await logout();
    FlowRouter.go(appPath('/'));
  },
});

Template.csaLogin.onCreated(function loginCreated() {
  for (const name of ['error', 'notice', 'registerError', 'registerSuccess', 'forgotError', 'forgotSuccess', 'resetError', 'resetSuccess']) {
    this[name] = new ReactiveVar('');
  }
  for (const name of ['busy', 'registerBusy', 'forgotBusy', 'resetBusy']) this[name] = new ReactiveVar(false);
});

Template.csaLogin.onRendered(function loginRendered() {
  this.stopParticles = startNovaParticles(this.find('.csa-particles-canvas'));
});

Template.csaLogin.onDestroyed(function loginDestroyed() {
  this.stopParticles?.();
  document.querySelectorAll('.modal-backdrop').forEach((element) => element.remove());
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('padding-right');
});

Template.csaLogin.helpers({
  resetMode() { return Boolean(resetToken.get()); },
  loginError() { return Template.instance().error.get(); },
  loginNotice() { return Template.instance().notice.get(); },
  loginBusy() { return Template.instance().busy.get(); },
  registerError() { return Template.instance().registerError.get(); },
  registerSuccess() { return Template.instance().registerSuccess.get(); },
  registerBusy() { return Template.instance().registerBusy.get(); },
  forgotError() { return Template.instance().forgotError.get(); },
  forgotSuccess() { return Template.instance().forgotSuccess.get(); },
  forgotBusy() { return Template.instance().forgotBusy.get(); },
  resetError() { return Template.instance().resetError.get(); },
  resetSuccess() { return Template.instance().resetSuccess.get(); },
  resetBusy() { return Template.instance().resetBusy.get(); },
});

Template.csaLogin.events({
  async 'submit #csaLoginForm'(event, instance) {
    event.preventDefault();
    instance.error.set('');
    instance.busy.set(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await loginWithPassword(values.email.trim(), values.password);
      FlowRouter.go(appPath('/templu'));
    } catch (error) {
      instance.error.set(error?.reason || 'Autentificarea a eșuat.');
    } finally {
      instance.busy.set(false);
    }
  },

  async 'submit #csaRegisterForm'(event, instance) {
    event.preventDefault();
    instance.registerError.set('');
    instance.registerSuccess.set('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (values.password.length < 12) {
      instance.registerError.set('Parola trebuie să aibă minimum 12 caractere.');
      return;
    }
    if (values.password !== values.confirmPassword) {
      instance.registerError.set('Parolele introduse nu coincid.');
      return;
    }
    instance.registerBusy.set(true);
    try {
      await Meteor.callAsync('auth.register', {
        prenume: values.prenume,
        nume: values.nume,
        email: values.email,
        password: values.password,
        website: values.website || '',
      });
      event.currentTarget.reset();
      instance.registerSuccess.set('Cererea a fost înregistrată. Contul va putea fi folosit după aprobarea administratorului.');
    } catch (error) {
      instance.registerError.set(error?.reason || 'Înregistrarea nu a putut fi finalizată.');
    } finally {
      instance.registerBusy.set(false);
    }
  },

  async 'submit #csaForgotForm'(event, instance) {
    event.preventDefault();
    instance.forgotError.set('');
    instance.forgotSuccess.set('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    instance.forgotBusy.set(true);
    try {
      await Meteor.callAsync('auth.requestPasswordReset', values.email);
      event.currentTarget.reset();
      instance.forgotSuccess.set('Dacă adresa aparține unui cont, mesajul cu linkul de resetare a fost trimis.');
    } catch (error) {
      instance.forgotError.set(error?.reason || 'Solicitarea nu a putut fi procesată.');
    } finally {
      instance.forgotBusy.set(false);
    }
  },

  async 'submit #csaResetPasswordForm'(event, instance) {
    event.preventDefault();
    instance.resetError.set('');
    instance.resetSuccess.set('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (values.password.length < 12 || values.password !== values.confirmPassword) {
      instance.resetError.set(values.password.length < 12 ? 'Parola trebuie să aibă minimum 12 caractere.' : 'Parolele introduse nu coincid.');
      return;
    }
    instance.resetBusy.set(true);
    try {
      await resetPassword(resetToken.get(), values.password);
      instance.resetSuccess.set('Parola a fost schimbată.');
      resetToken.set('');
      finishResetFlow?.();
      finishResetFlow = null;
      FlowRouter.go(appPath('/'));
    } catch (error) {
      instance.resetError.set(error?.reason || 'Linkul este invalid sau a expirat.');
    } finally {
      instance.resetBusy.set(false);
    }
  },
});

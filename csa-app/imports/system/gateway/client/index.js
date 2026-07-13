import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';

export const gatewayMode = window.location.pathname === '/portal' || window.location.pathname.startsWith('/portal/');
export const gatewayState = new ReactiveVar(gatewayMode ? 'loading' : 'direct');

export function appPath(path = '/') {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (!gatewayMode) return normalized;
  return normalized === '/' ? '/portal/' : `/portal${normalized}`;
}

export function registerDualRoute(FlowRouter, path, action) {
  FlowRouter.route(path, { action });
  const portalPath = path === '/' ? '/portal/' : `/portal${path}`;
  FlowRouter.route(portalPath, { action });
}

function gatewayLogin(assertion) {
  return new Promise((resolve, reject) => {
    Accounts.callLoginMethod({
      methodArguments: [{ gatewayAssertion: assertion }],
      userCallback: (error) => (error ? reject(error) : resolve()),
    });
  });
}

export async function bootstrapGateway() {
  if (!gatewayMode) return;
  try {
    const response = await fetch('/auth/bootstrap', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.assertion) throw new Error(result.error || 'Sesiune indisponibilă.');
    await gatewayLogin(result.assertion);
    gatewayState.set('ready');
  } catch (error) {
    gatewayState.set('error');
    window.location.replace('/?login=required');
  }
}

export async function logoutGateway() {
  await new Promise((resolve) => Meteor.logout(() => resolve()));
  await fetch('/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }).catch(() => {});
  window.location.assign('/');
}

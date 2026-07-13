import './index.html';
import './temple.css';
import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { Template } from 'meteor/templating';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { renderPage } from '/imports/layout/client';
import { appPath, registerDualRoute } from '/imports/system/gateway/client';

const GATE_STORAGE_PREFIX = 'csa.private-gate.v1';
const ROOM_KINDS = new Set([
  'threshold',
  'reflection',
  'journal',
  'library',
  'study',
  'concepts',
  'projects',
  'secretariat',
  'treasury',
  'hospitality',
  'council',
  'dashboard',
]);
const ROOM_ICONS = {
  threshold: '◇',
  reflection: '◌',
  journal: '≡',
  library: '▤',
  study: '∴',
  concepts: '⌘',
  projects: '△',
  secretariat: '✦',
  treasury: '◈',
  hospitality: '○',
  council: '⬡',
  dashboard: '·',
};

registerDualRoute(FlowRouter, '/templu', () => renderPage('csaTemple'));

function gateStorageKey() {
  return `${GATE_STORAGE_PREFIX}:${Meteor.userId() || 'anonymous'}`;
}

function gateWasPassed() {
  try {
    return window.sessionStorage.getItem(gateStorageKey()) === 'passed';
  } catch (error) {
    return false;
  }
}

function rememberGatePass() {
  try {
    window.sessionStorage.setItem(gateStorageKey(), 'passed');
  } catch (error) {
    // Blocarea sessionStorage nu trebuie să blocheze accesul în aplicație.
  }
}

function releasePageScroll() {
  document.body.classList.remove('csa-gate-active');
}

function enterPortalDestination() {
  const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
  if (currentPath === '/' || currentPath === '/portal') {
    FlowRouter.go(appPath('/templu'));
    return;
  }
  document.querySelector('.csa-private-brand')?.focus();
}

function completeGate(instance, { animate = true } = {}) {
  if (instance.phase.get() !== 'closed') return;
  rememberGatePass();
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!animate || reduceMotion) {
    instance.phase.set('passed');
    releasePageScroll();
    window.setTimeout(enterPortalDestination, 0);
    return;
  }
  instance.phase.set('opening');
  window.setTimeout(() => {
    instance.phase.set('passed');
    releasePageScroll();
    enterPortalDestination();
  }, 920);
}

Template.csaPortalGate.onCreated(function portalGateCreated() {
  this.phase = new ReactiveVar(gateWasPassed() ? 'passed' : 'closed');
  this.knocks = new ReactiveVar(0);
  this.knockResetTimer = null;
});

Template.csaPortalGate.onRendered(function portalGateRendered() {
  if (this.phase.get() === 'closed') {
    document.body.classList.add('csa-gate-active');
    this.find('.js-gate-knocker')?.focus();
  }
});

Template.csaPortalGate.onDestroyed(function portalGateDestroyed() {
  window.clearTimeout(this.knockResetTimer);
  releasePageScroll();
});

Template.csaPortalGate.helpers({
  gateVisible() { return Template.instance().phase.get() !== 'passed'; },
  gateClass() {
    const instance = Template.instance();
    return `${instance.phase.get() === 'opening' ? 'is-opening' : ''} knock-count-${instance.knocks.get()}`;
  },
  knockStatus() {
    const count = Template.instance().knocks.get();
    if (!count) return 'Atingeți poarta de trei ori pentru a continua.';
    if (count === 1) return 'Prima bătaie.';
    if (count === 2) return 'A doua bătaie.';
    return 'Pragul se deschide.';
  },
});

Template.csaPortalGate.events({
  'click .js-gate-knocker'(event, instance) {
    event.preventDefault();
    if (instance.phase.get() !== 'closed') return;
    window.clearTimeout(instance.knockResetTimer);
    const count = instance.knocks.get() + 1;
    instance.knocks.set(count);
    if (count >= 3) {
      completeGate(instance);
      return;
    }
    instance.knockResetTimer = window.setTimeout(() => instance.knocks.set(0), 2600);
  },
  'click .js-gate-enter'(event, instance) {
    event.preventDefault();
    completeGate(instance);
  },
  'click .js-gate-skip'(event, instance) {
    event.preventDefault();
    completeGate(instance, { animate: false });
  },
  'keydown .csa-gate-overlay'(event, instance) {
    if (event.key === 'Escape') {
      completeGate(instance, { animate: false });
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...instance.findAll('button:not([disabled])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  },
});

function boundedNumber(value, fallback, minimum, maximum) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(maximum, Math.max(minimum, numeric)) : fallback;
}

function safeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 240) : fallback;
}

function safeLocalPath(value) {
  if (typeof value !== 'string') return null;
  const path = value.trim();
  if (!/^\/[a-z0-9/_-]*$/i.test(path) || path.startsWith('//')) return null;
  return path;
}

function normalizeRoom(room, index) {
  if (!room || typeof room !== 'object') return null;
  const kind = ROOM_KINDS.has(room.kind) ? room.kind : 'study';
  const label = safeText(room.label || room.title);
  if (!label) return null;
  const path = safeLocalPath(room.path || room.route);
  if (!path) return null;
  const position = room.position || {};
  return {
    key: safeText(room.key || room.id, `room-${index}`).replace(/[^a-z0-9_-]/gi, '-'),
    label,
    description: safeText(room.description, 'Spațiu disponibil în contextul dumneavoastră.'),
    kind,
    icon: ROOM_ICONS[kind],
    path,
    position: {
      x: boundedNumber(position.x ?? room.x, 50, 9, 91),
      y: boundedNumber(position.y ?? room.y, 50, 12, 86),
    },
  };
}

function normalizeContext(value) {
  const context = value && typeof value === 'object' ? value : {};
  const grade = boundedNumber(context.grade, 0, 0, 3);
  return {
    tenantName: safeText(context.tenantName, 'Spațiul privat'),
    grade,
    gradeLabel: safeText(context.gradeLabel, grade ? `Grad ${grade}` : 'Acces configurat de administrator'),
    offices: Array.isArray(context.offices)
      ? context.offices.slice(0, 12).map((office) => (
        safeText(typeof office === 'string' ? office : office?.label || office?.name)
      )).filter(Boolean)
      : [],
    platformAdmin: context.platformAdmin === true || context.isPlatformAdmin === true || context.superAdmin === true,
  };
}

function normalizeScene(value) {
  const scene = value && typeof value === 'object' ? value : {};
  const rooms = Array.isArray(scene.rooms)
    ? scene.rooms.slice(0, 24).map(normalizeRoom).filter(Boolean)
    : [];
  return {
    title: safeText(scene.title, 'Harta spațiului privat'),
    subtitle: safeText(scene.subtitle, 'Alegeți o zonă disponibilă.'),
    rooms,
  };
}

function safeFallback() {
  return {
    context: {
      tenantName: 'Spațiul privat',
      grade: 0,
      gradeLabel: 'Context indisponibil',
      offices: [],
      platformAdmin: false,
    },
    scene: {
      title: 'Harta este în curs de configurare',
      subtitle: 'Nu sunt afișate zone până când serverul nu confirmă drepturile de acces.',
      rooms: [{
        key: 'dashboard',
        label: 'Tablou de bord',
        description: 'Reveniți la informațiile deja disponibile.',
        kind: 'dashboard',
        icon: ROOM_ICONS.dashboard,
        path: '/',
        position: { x: 50, y: 52 },
      }],
    },
  };
}

async function loadTemple(instance) {
  instance.loading.set(true);
  instance.error.set('');
  try {
    const [contextValue, sceneValue] = await Promise.all([
      Meteor.callAsync('temple.context'),
      Meteor.callAsync('temple.scene'),
    ]);
    const context = normalizeContext(contextValue);
    const scene = normalizeScene(sceneValue);
    if (!scene.rooms.length) throw new Error('Serverul nu a returnat nicio zonă autorizată.');
    instance.context.set(context);
    instance.scene.set(scene);
    instance.fallback.set(false);
  } catch (error) {
    const fallback = safeFallback();
    instance.context.set(fallback.context);
    instance.scene.set(fallback.scene);
    instance.fallback.set(true);
    instance.error.set('Harta autorizată nu este disponibilă momentan. Este afișată numai revenirea sigură la dashboard.');
  } finally {
    instance.loading.set(false);
  }
}

Template.csaTemple.onCreated(function templeCreated() {
  this.loading = new ReactiveVar(true);
  this.error = new ReactiveVar('');
  this.context = new ReactiveVar(null);
  this.scene = new ReactiveVar(null);
  this.fallback = new ReactiveVar(false);
  loadTemple(this);
});

Template.csaTemple.helpers({
  loading() { return Template.instance().loading.get(); },
  templeError() { return Template.instance().error.get(); },
  context() { return Template.instance().context.get(); },
  scene() { return Template.instance().scene.get(); },
  isFallback() { return Template.instance().fallback.get(); },
  hasOffices(offices) { return Array.isArray(offices) && offices.length > 0; },
  sceneClass() {
    const grade = Template.instance().context.get()?.grade || 0;
    return `csa-temple--grade-${grade}`;
  },
  positionStyle() {
    return `left:${this.position.x}%;top:${this.position.y}%;`;
  },
  roomClass() { return `csa-temple-room--${this.kind}`; },
  roomPath(path) { return appPath(path || '/'); },
});

Template.csaTemple.events({
  'click .js-temple-retry'(event, instance) {
    event.preventDefault();
    loadTemple(instance);
  },
});

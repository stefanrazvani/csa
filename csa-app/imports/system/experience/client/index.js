import './index.html';
import './experience.css';
import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { Template } from 'meteor/templating';
import { Tracker } from 'meteor/tracker';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { renderPage } from '/imports/layout/client';
import { appPath, registerDualRoute } from '/imports/system/gateway/client';
import { normalizeExperienceManifest, safeExperienceFallback } from './manifest.js';
import { TempleExperienceSignals } from '../signals.js';

registerDualRoute(FlowRouter, '/templu', () => renderPage('csaTempleExperience'));

const QUALITY_ORDER = ['low', 'balanced', 'high'];
const QUALITY_LABELS = Object.freeze({ low: '◐ Economic', balanced: '◑ Echilibrat', high: '● Detaliat' });
const ITEM_SYMBOLS = Object.freeze({
  assembly: '◉',
  concept: '⌘',
  dashboard: '·',
  library: '▤',
  mentor: '◌',
  office: '✦',
  project: '△',
  symbol: '◇',
  tool: '∴',
});
const GATE_STORAGE_PREFIX = 'csa.temple-experience.gate.v1';
const QUALITY_STORAGE_KEY = 'csa.temple-experience.quality.v1';

function reducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

function mobileExperience() {
  return Boolean(window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 768);
}

function automaticQuality() {
  if (mobileExperience() || Number(navigator.deviceMemory || 8) <= 4 || Number(navigator.hardwareConcurrency || 8) <= 4) return 'low';
  if (Number(navigator.deviceMemory || 8) >= 8 && Number(navigator.hardwareConcurrency || 8) >= 8) return 'high';
  return 'balanced';
}

function storedQuality() {
  try {
    const value = window.localStorage.getItem(QUALITY_STORAGE_KEY);
    return QUALITY_ORDER.includes(value) ? value : automaticQuality();
  } catch (error) {
    return automaticQuality();
  }
}

function rememberQuality(value) {
  try {
    window.localStorage.setItem(QUALITY_STORAGE_KEY, value);
  } catch (error) {
    // Preferința este opțională; randarea continuă dacă storage-ul este blocat.
  }
}

function gateStorageKey(manifest) {
  return `${GATE_STORAGE_PREFIX}:${Meteor.userId() || 'anonymous'}`;
}

function gateWasPassed(manifest) {
  try {
    return window.sessionStorage.getItem(gateStorageKey(manifest)) === 'passed';
  } catch (error) {
    return false;
  }
}

function rememberGatePass(manifest) {
  try {
    window.sessionStorage.setItem(gateStorageKey(manifest), 'passed');
  } catch (error) {
    // Accesul nu trebuie blocat de indisponibilitatea sessionStorage.
  }
}

function dispatchExperienceEvent(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function setPageInteraction(active) {
  document.body.classList.toggle('csa-xp-active', active);
}

function findItem(instance, id) {
  return instance.manifest.get()?.interactives.find((item) => item.id === id) || null;
}

function focusAfterFlush(instance, selector) {
  Tracker.afterFlush(() => {
    if (!instance.destroyed) instance.find(selector)?.focus();
  });
}

// Panoul de detalii este non-modal: scena rămâne interactivă, iar selectarea
// unui alt reper înlocuiește direct conținutul panoului.
function focusSheet(instance) {
  Tracker.afterFlush(() => {
    if (instance.destroyed || !instance.selectedId.get()) return;
    instance.find('.js-xp-close-sheet')?.focus();
  });
}

function closeSheet(instance) {
  const id = instance.selectedId.get();
  instance.selectedId.set('');
  instance.renderer?.selectInteraction('');
  focusAfterFlush(instance, mobileExperience() ? '.js-xp-toggle-navigator' : `.js-xp-select[data-id="${id}"]`);
}

function selectItem(instance, id, { focus = true } = {}) {
  const item = findItem(instance, id);
  if (!item) return;
  // Trecerea de la un reper la altul nu cere închiderea panoului anterior.
  instance.selectedId.set(item.id);
  instance.navigatorOpen.set(false);
  instance.renderer?.selectInteraction(item.id);
  instance.screenReaderStatus.set(`${item.label}. ${item.description}`);
  dispatchExperienceEvent('csa:temple-select', { id: item.id, kind: item.kind });
  if (typeof instance.data?.onSelect === 'function') instance.data.onSelect(item);
  if (focus) focusSheet(instance);
}

function performKnock(instance) {
  if (instance.phase.get() !== 'gate') return;
  window.clearTimeout(instance.knockResetTimer);
  const count = Math.min(3, instance.knocks.get() + 1);
  instance.knocks.set(count);
  instance.renderer?.registerKnock(count);
  instance.screenReaderStatus.set(instance.manifest.get()?.gate?.[['', 'firstKnock', 'secondKnock', 'thirdKnock'][count]] || `Bătaia ${count}`);
  if (count >= 3) {
    completeGate(instance, { animate: true });
    return;
  }
  instance.knockResetTimer = window.setTimeout(() => {
    if (!instance.destroyed && instance.phase.get() === 'gate') instance.knocks.set(0);
  }, 2800);
}

async function completeGate(instance, { animate = true } = {}) {
  if (!['gate', 'opening'].includes(instance.phase.get())) return;
  const manifest = instance.manifest.get();
  rememberGatePass(manifest);
  window.clearTimeout(instance.knockResetTimer);
  const immediate = !animate || reducedMotion() || instance.webglFallback.get() || !instance.renderer;
  instance.phase.set(immediate ? 'atrium' : 'opening');
  instance.screenReaderStatus.set(immediate ? 'Edificiul este disponibil.' : 'Pragul se deschide.');
  try {
    await instance.renderer?.enterAtrium({ immediate });
  } catch (error) {
    instance.webglFallback.set(true);
  }
  if (instance.destroyed) return;
  instance.phase.set('atrium');
  dispatchExperienceEvent('csa:temple-entered', { grade: manifest?.access?.grade || 0, tenantId: manifest?.tenant?.id || '' });
  if (typeof instance.data?.onEntered === 'function') instance.data.onEntered(manifest);
  focusAfterFlush(instance, '.js-xp-toggle-navigator');
}

async function initializeRenderer(instance, generation) {
  if (instance.destroyed || instance.loading.get() || generation !== instance.generation) return;
  instance.renderer?.dispose();
  instance.renderer = null;
  const mount = instance.find('.js-xp-canvas-host');
  if (!mount) return;
  try {
    const { createExperienceRenderer } = await import('./engine.js');
    if (instance.destroyed || generation !== instance.generation) return;
    const renderer = await createExperienceRenderer(mount, instance.manifest.get(), {
      quality: instance.quality.get(),
      mobile: mobileExperience(),
      reducedMotion: reducedMotion(),
      onActivate: (interaction) => {
        if (instance.destroyed) return;
        if (interaction.type === 'gate') performKnock(instance);
        if (interaction.type === 'item') selectItem(instance, interaction.item.id);
      },
    });
    if (instance.destroyed || generation !== instance.generation) {
      renderer.dispose();
      return;
    }
    instance.renderer = renderer;
    if (instance.phase.get() === 'atrium') instance.renderer.showAtrium({ immediate: true });
  } catch (error) {
    if (instance.destroyed || generation !== instance.generation) return;
    instance.webglFallback.set(true);
    instance.screenReaderStatus.set('Randarea WebGL nu este disponibilă. Folosește lista accesibilă a reperelor.');
  }
}

async function providedManifest(instance) {
  const supplied = instance.data?.manifest;
  if (typeof supplied === 'function') return supplied();
  if (supplied && typeof supplied === 'object') return supplied;
  const viewGrade = instance.viewGrade.get();
  return Meteor.callAsync('temple.experienceManifest', viewGrade ? { viewGrade } : null);
}

async function loadExperience(instance) {
  const generation = ++instance.generation;
  instance.loading.set(true);
  instance.error.set('');
  instance.webglFallback.set(false);
  instance.selectedId.set('');
  instance.renderer?.dispose();
  instance.renderer = null;
  try {
    const raw = await providedManifest(instance);
    if (instance.destroyed || generation !== instance.generation) return;
    const manifest = normalizeExperienceManifest(raw);
    if (!manifest.interactives.length) throw new Error('Manifestul autorizat nu conține repere accesibile.');
    instance.manifest.set(manifest);
    instance.viewGrade.set(manifest.access.viewGrade || 0);
    instance.phase.set(gateWasPassed(manifest) ? 'atrium' : 'gate');
  } catch (error) {
    if (instance.destroyed || generation !== instance.generation) return;
    const fallback = safeExperienceFallback();
    instance.manifest.set(fallback);
    instance.phase.set('atrium');
    instance.webglFallback.set(true);
    instance.error.set('Scena autorizată nu a putut fi încărcată. Este disponibilă numai revenirea sigură la tabloul de bord.');
  } finally {
    if (!instance.destroyed && generation === instance.generation) {
      instance.loading.set(false);
      Tracker.afterFlush(() => {
        if (!instance.webglFallback.get()) initializeRenderer(instance, generation);
        if (instance.phase.get() === 'gate') instance.find('.js-xp-knock')?.focus();
        else instance.find('.js-xp-toggle-navigator')?.focus();
      });
    }
  }
}

Template.csaTempleExperience.onCreated(function experienceCreated() {
  this.loading = new ReactiveVar(true);
  this.error = new ReactiveVar('');
  this.manifest = new ReactiveVar(null);
  this.phase = new ReactiveVar('loading');
  this.knocks = new ReactiveVar(0);
  this.selectedId = new ReactiveVar('');
  this.navigatorOpen = new ReactiveVar(false);
  this.webglFallback = new ReactiveVar(false);
  this.viewGrade = new ReactiveVar(0);
  this.quality = new ReactiveVar(storedQuality());
  this.fullscreen = new ReactiveVar(false);
  this.screenReaderStatus = new ReactiveVar('');
  this.renderer = null;
  this.generation = 0;
  this.knockResetTimer = null;
  this.destroyed = false;
  this.rootElement = null;
  this.renderedForAccessReload = false;
  this.lastAccessRevision = null;
  this.onFullscreenChange = () => this.fullscreen.set(document.fullscreenElement === this.rootElement);
  this.subscribe('temple.experienceAccessSignal');
  this.autorun(() => {
    const userId = Meteor.userId();
    const revision = userId ? TempleExperienceSignals.findOne(userId)?.revision : null;
    if (!revision || revision === this.lastAccessRevision) return;
    const hadRevision = this.lastAccessRevision != null;
    this.lastAccessRevision = revision;
    if (hadRevision && this.renderedForAccessReload) loadExperience(this);
  });
});

Template.csaTempleExperience.onRendered(function experienceRendered() {
  this.rootElement = this.find('.csa-xp');
  this.renderedForAccessReload = true;
  setPageInteraction(true);
  document.addEventListener('fullscreenchange', this.onFullscreenChange);
  loadExperience(this);
});

Template.csaTempleExperience.onDestroyed(function experienceDestroyed() {
  this.destroyed = true;
  window.clearTimeout(this.knockResetTimer);
  document.removeEventListener('fullscreenchange', this.onFullscreenChange);
  this.renderer?.dispose();
  this.renderer = null;
  if (document.fullscreenElement === this.rootElement) document.exitFullscreen?.().catch(() => {});
  setPageInteraction(false);
});

Template.csaTempleExperience.helpers({
  loading() { return Template.instance().loading.get(); },
  experienceError() { return Template.instance().error.get(); },
  manifest() { return Template.instance().manifest.get(); },
  showGate() { return Template.instance().phase.get() === 'gate'; },
  showOpening() { return Template.instance().phase.get() === 'opening'; },
  showAtrium() { return Template.instance().phase.get() === 'atrium'; },
  webglFallback() { return Template.instance().webglFallback.get(); },
  experienceClass() {
    const instance = Template.instance();
    const grade = instance.manifest.get()?.access?.grade || 0;
    return `is-${instance.phase.get()} is-grade-${grade} ${instance.webglFallback.get() ? 'is-fallback' : ''}`;
  },
  knockCount() { return Template.instance().knocks.get(); },
  knocksRemaining() {
    const remaining = Math.max(0, 3 - Template.instance().knocks.get());
    return remaining === 1 ? 'Încă o atingere' : `${remaining} atingeri`;
  },
  knockStatus() {
    const instance = Template.instance();
    const gate = instance.manifest.get()?.gate || {};
    return [gate.instruction, gate.firstKnock, gate.secondKnock, gate.thirdKnock][instance.knocks.get()] || gate.instruction;
  },
  qualityLabel() { return QUALITY_LABELS[Template.instance().quality.get()] || QUALITY_LABELS.balanced; },
  fullscreenLabel() { return Template.instance().fullscreen.get() ? '↙ Revino' : '⛶ Ecran'; },
  showGradeSelector() {
    const access = Template.instance().manifest.get()?.access;
    return Number(access?.maxGrade || 0) > 1;
  },
  gradeOptions() {
    const access = Template.instance().manifest.get()?.access;
    const labels = { 1: 'Ucenic', 2: 'Calfă', 3: 'Maestru' };
    const maxGrade = Math.min(3, Math.max(0, Number(access?.maxGrade || 0)));
    const viewGrade = Number(access?.viewGrade || 0);
    const options = [];
    for (let grade = 1; grade <= maxGrade; grade += 1) {
      options.push({ value: grade, label: labels[grade], selected: grade === viewGrade });
    }
    return options;
  },
  navigatorExpanded() { return Template.instance().navigatorOpen.get() ? 'true' : 'false'; },
  navigatorClass() { return Template.instance().navigatorOpen.get() ? 'is-open' : ''; },
  selectedItem() { return findItem(Template.instance(), Template.instance().selectedId.get()); },
  itemSelected(id) { return Template.instance().selectedId.get() === id ? 'true' : 'false'; },
  itemClass(id) { return Template.instance().selectedId.get() === id ? 'is-selected' : ''; },
  itemSymbol(kind) { return ITEM_SYMBOLS[kind] || ITEM_SYMBOLS.symbol; },
  itemPath(path) { return appPath(path || '/'); },
  hasOffices(offices) { return Array.isArray(offices) && offices.length > 0; },
  hasSteps(steps) { return Array.isArray(steps) && steps.length > 0; },
  hasLearningPath(path) { return Array.isArray(path) && path.length > 0; },
  screenReaderStatus() { return Template.instance().screenReaderStatus.get(); },
});

Template.csaTempleExperience.events({
  'click .js-xp-knock'(event, instance) {
    event.preventDefault();
    performKnock(instance);
  },
  'click .js-xp-enter'(event, instance) {
    event.preventDefault();
    completeGate(instance, { animate: true });
  },
  'click .js-xp-skip'(event, instance) {
    event.preventDefault();
    completeGate(instance, { animate: false });
  },
  'keydown .csa-xp-gate-ui'(event, instance) {
    if (event.key === 'Escape') {
      event.preventDefault();
      completeGate(instance, { animate: false });
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...instance.findAll('.csa-xp-gate-ui button:not([disabled])')];
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
  'click .js-xp-select'(event, instance) {
    event.preventDefault();
    selectItem(instance, event.currentTarget.dataset.id);
  },
  'click .js-xp-close-sheet'(event, instance) {
    event.preventDefault();
    closeSheet(instance);
  },
  'keydown .csa-xp-sheet'(event, instance) {
    // Panoul este non-modal: Escape îl închide, iar Tab circulă liber în pagină.
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSheet(instance);
    }
  },
  'click .js-xp-toggle-navigator'(event, instance) {
    event.preventDefault();
    instance.navigatorOpen.set(!instance.navigatorOpen.get());
    if (instance.navigatorOpen.get()) focusAfterFlush(instance, '.js-xp-close-navigator');
  },
  'click .js-xp-close-navigator'(event, instance) {
    event.preventDefault();
    instance.navigatorOpen.set(false);
    focusAfterFlush(instance, '.js-xp-toggle-navigator');
  },
  'change .js-xp-grade'(event, instance) {
    const grade = Math.round(Number(event.currentTarget.value));
    if (![1, 2, 3].includes(grade) || grade === instance.viewGrade.get()) return;
    instance.viewGrade.set(grade);
    instance.screenReaderStatus.set(`Se încarcă templul pentru gradul selectat.`);
    loadExperience(instance);
  },
  'click .js-xp-quality'(event, instance) {
    event.preventDefault();
    const current = QUALITY_ORDER.indexOf(instance.quality.get());
    const next = QUALITY_ORDER[(current + 1) % QUALITY_ORDER.length];
    instance.quality.set(next);
    rememberQuality(next);
    instance.renderer?.setQuality(next);
    instance.screenReaderStatus.set(`Calitate grafică: ${QUALITY_LABELS[next].replace(/^[^\s]+\s/, '')}.`);
  },
  async 'click .js-xp-fullscreen'(event, instance) {
    event.preventDefault();
    try {
      if (document.fullscreenElement === instance.rootElement) await document.exitFullscreen();
      else await instance.rootElement?.requestFullscreen?.();
    } catch (error) {
      instance.screenReaderStatus.set('Afișarea pe tot ecranul nu este disponibilă.');
    }
  },
  'click .js-xp-follow'(event, instance) {
    const item = findItem(instance, instance.selectedId.get());
    if (typeof instance.data?.onNavigate !== 'function' || !item) return;
    event.preventDefault();
    instance.data.onNavigate(item);
  },
  'click .js-xp-retry'(event, instance) {
    event.preventDefault();
    loadExperience(instance);
  },
});

export { loadExperience };

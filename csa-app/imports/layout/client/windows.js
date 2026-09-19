import { objectSchemas } from '/imports/ui/objects/schema.js';
import WinBox from 'winbox/src/js/winbox.js';
import 'winbox/dist/css/winbox.min.css';
import { Blaze } from 'meteor/blaze';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';

export const openWindows = new ReactiveVar([]);
const windows = new Map();
let active = '';
let clearing = false;
const titles = {
  craftResponseWindow: 'Răspuns la invitație', groupAccessWindow: 'Membri și permisiuni', dossierFormWindow: 'Editor dosar', csaProfile: 'Profilul meu', csaObjectEditor: 'Adăugare / editare', csaObjectHistory: 'Istoric obiect',
  csaHome: 'Tablou de bord', csaTempleExperience: 'Templu', craftConvocatoare: 'Convocatoare',
  craftConvocatorEditor: 'Editor convocator', craftAttendance: 'Prezențe', craftMyConfirmations: 'Confirmările mele',
  craftConvocatorPrint: 'Tipărire convocator', craftGradeAdmin: 'Grade de acces', csaMigrations: 'Migrări',
  studyLibrary: 'Bibliotecă', studyReader: 'Lectură', studyDebate: 'Dezbatere', studyConcepts: 'Concepte',
  dossierWorkspace: 'Dosare frați', governanceAdmin: 'Registru și funcții', globalAdmin: 'Administrare globală',
  tenantAdmin: 'Utilizatori și acces', treasuryWorkspace: 'Metale', hospitalityWorkspace: 'Ospitalier',
  visitorWorkspace: 'Vizitatori', csaHistory: 'Istoric operațiuni',
};
function publish() {
  openWindows.set([...windows].map(([id, item]) => ({ id, title: item.title, active: id === active, minimized: Boolean(item.box?.min) })));
}
function margins() { return { top: 58, left: window.innerWidth < 800 ? 0 : 240, right: 0, bottom: 0 }; }
function fitWindow(box) {
  const bounds = margins();
  Object.assign(box, bounds);
  box.maxwidth = Math.max(150, window.innerWidth - bounds.left);
  box.maxheight = Math.max(box.header, window.innerHeight - bounds.top);
  if (box.full || box.min) return;
  if (box.max) {
    // WinBox.maximize() is a no-op on an already maximized window.
    box.resize(box.maxwidth, box.maxheight, true).move(bounds.left, bounds.top, true);
  } else {
    box.resize(Math.min(box.width, box.maxwidth), Math.min(box.height, box.maxheight));
    box.move(Math.max(bounds.left, Math.min(box.x, window.innerWidth - box.width)), Math.max(bounds.top, Math.min(box.y, window.innerHeight - box.height)));
  }
}
export function focusWindow(id) {
  const item = windows.get(id);
  if (!item) return false;
  if (item.box.min) item.box.restore();
  item.box.focus(); return true;
}
export function closeWindows() {
  clearing = true;
  for (const item of [...windows.values()]) item.box.close(true);
  windows.clear(); active = ''; clearing = false; publish();
}
export function confirmWindowChanges() {
  return ![...windows.values()].some(item => item.dirty)
    || window.confirm('Există formulare modificate în ferestrele deschise. Închideți ferestrele și continuați?');
}
export function openModule(template, data, path, onActivate) {
  // O instanță per ecran previne ID-uri duplicate în formularele legacy.
  const id = ['craftResponseWindow','groupAccessWindow'].includes(template) ? `${template}:${data.id}` : template === 'dossierFormWindow' ? `${template}:${data.userId}:${data.kind}` : ['csaObjectEditor','csaObjectHistory'].includes(template) ? `${template}:${data.kind}:${data.id || 'new'}` : template;
  const existing = windows.get(id);
  if (existing && JSON.stringify(existing.data) === JSON.stringify(data)) { focusWindow(id); return; }
  if (existing && existing.box.close() === true) return;
  const mount = document.createElement('section');
  mount.className = 'csa-window-content';
  mount.setAttribute('aria-label', titles[template] || template);
  const title = ['csaObjectEditor','csaObjectHistory'].includes(template) ? `${template==='csaObjectHistory'?'Istoric':data.id?'Consultare / editare':'Adaugă'} · ${objectSchemas[data.kind]?.label || 'Obiect'}` : titles[template] || template;
  mount.setAttribute('aria-label',title);
  const item = { title, data, path, dirty: false, view: null, box: null };
  windows.set(id, item);
  const box = new WinBox(item.title, {
    root: document.getElementById('page-content'), mount,
    width: '78%', height: '82%', x: 'center', y: 'center', max: true,
    ...margins(), background: '#183849', class: ['csa-module-window'],
    onfocus() { active = id; onActivate?.(template, data, path); publish(); },
    onminimize() { publish(); }, onrestore() { fitWindow(this); publish(); }, onmaximize() { publish(); },
    onclose(force) {
      if (!force && !clearing && item.dirty && !window.confirm('Formularul a fost modificat. Închideți fereastra?')) return true;
      windows.delete(id);
      if (item.view) { Blaze.remove(item.view); item.view = null; }
      if (active === id) active = '';
      publish();
      return false;
    },
  });
  item.box = box;
  for (const [selector, label] of [['.wb-min', 'Minimizează'], ['.wb-max', 'Maximizează sau restaurează'], ['.wb-full', 'Ecran complet'], ['.wb-close', 'Închide']]) {
    const control = box.dom.querySelector(selector);
    if (!control) continue;
    control.setAttribute('role', 'button'); control.setAttribute('aria-label', `${label}: ${item.title}`); control.tabIndex = 0;
    control.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); control.click(); } });
  }
  item.view = Blaze.renderWithData(Template[template], data, mount);
  mount.addEventListener('input', event => { if (event.target.closest('form')) item.dirty = true; });
  mount.addEventListener('change', event => { if (event.target.closest('form')) item.dirty = true; });
  active = id; publish();
}
export function markWindowClean(node) { for(const item of windows.values())if(item.box.dom.contains(node))item.dirty=false; }
export function closeWindowFor(node) { for(const item of windows.values())if(item.box.dom.contains(node)){item.box.close();return;} }
window.addEventListener('resize', () => {
  for (const { box } of windows.values()) fitWindow(box);
});
window.addEventListener('beforeunload', event => {
  if ([...windows.values()].some(item => item.dirty)) { event.preventDefault(); event.returnValue = ''; }
});

import './index.html';
import './dossiers.css';
import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { Template } from 'meteor/templating';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import {
  DegreeEvents,
  LodgeMemberships,
  OfficeTerms,
  PrezentaConfirmari,
} from '/imports/api/collections.js';
import { renderPage } from '/imports/layout/client';
import { appPath, registerDualRoute } from '/imports/system/gateway/client';
import {
  BrotherDocuments,
  BrotherDossiers,
  BrotherSponsors,
  DossierNotes,
  MembershipEvents,
} from '../api/collections.js';

registerDualRoute(FlowRouter, '/dosare-frati', () => renderPage('dossierWorkspace'));
registerDualRoute(FlowRouter, '/dosare-frati/:userId', () => renderPage('dossierWorkspace'));

const EVENT_LABELS = {
  affiliation: 'Afiliere', transfer_in: 'Transfer primit', transfer_out: 'Transfer plecat',
  leave_started: 'Început concediu', leave_ended: 'Revenire din concediu', demit: 'Adormire',
  reinstatement: 'Reintegrare', suspension: 'Suspendare', radiation: 'Radiere',
  deceased: 'Trecere la Orientul Etern', administrative_note: 'Mențiune administrativă',
};
const OFFICE_LABELS = {
  venerable: 'Venerabil', secretary: 'Secretar', treasurer: 'Trezorier',
  hospitalier: 'Ospitalier', librarian: 'Bibliotecar', mentor: 'Mentor',
  first_warden: 'Prim Supraveghetor', second_warden: 'Al Doilea Supraveghetor',
  orator: 'Orator', expert: 'Expert', master_of_ceremonies: 'Maestru de Ceremonii',
};

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function date(value) {
  if (!value) return '—';
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('ro-RO', { dateStyle: 'medium' }).format(parsed);
}

function dateInput(value) {
  if (!value) return '';
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function userName(user) {
  return [user?.setari?.nume, user?.setari?.prenume].filter(Boolean).join(' ')
    || [user?.profileExt?.nume, user?.profileExt?.prenume].filter(Boolean).join(' ')
    || user?.profile?.name
    || 'Membru';
}

function dossierName(dossier, user) {
  return [dossier?.identity?.familyName, dossier?.identity?.givenName].filter(Boolean).join(' ')
    || dossier?.identity?.preferredName
    || userName(user);
}

function emptyDossier(eId, userId) {
  return {
    eId, userId, identity: {}, contact: { address: {} }, professional: {},
    association: { status: 'unknown' }, dataQuality: { status: 'missing' },
  };
}

function selected(instance) {
  const context = instance.context.get();
  const userId = instance.selectedUserId.get() || context?.userId;
  if (!userId) return null;
  const dossier = BrotherDossiers.findOne({ eId: context.eId, userId }) || emptyDossier(context.eId, userId);
  const user = Meteor.users.findOne(userId) || {};
  const membership = LodgeMemberships.findOne({ eId: context.eId, userId }) || {
    userId,
    status: user?.setari?.status === '1' ? 'active' : 'inactive',
    currentGrade: 0,
  };
  return { userId, dossier, membership, user, displayName: dossierName(dossier, user) };
}

function values(form) {
  return Object.fromEntries(new FormData(form));
}

function setMessage(instance, value, timeout = 6000) {
  instance.message.set(value);
  if (timeout) window.setTimeout(() => {
    if (instance.message.get() === value) instance.message.set('');
  }, timeout);
}

function csvCell(value) {
  const normalized = value == null ? '' : String(value).replace(/\r?\n/g, ' ').trim();
  return `"${normalized.replace(/"/g, '""')}"`;
}

function registryEvent(row, type) {
  return row?.membershipEvents?.find((event) => event.type === type) || {};
}

function exportRegistryCsv(registry) {
  const headers = [
    'Nr. crt.', 'Nr. matricol', 'Nume și prenume', 'Grad I - data', 'Grad I - Loja',
    'Grad II - data', 'Grad II - Loja', 'Grad III - data', 'Grad III - Loja',
    'Transfer', 'Concediu', 'Adormire', 'Reintegrare', 'Radiere', 'Nași',
    'Membru Asociație', 'Stare masonică', 'Demnități / funcții', 'Data și locul nașterii',
    'Stare civilă', 'Domiciliu', 'Telefon', 'Email', 'Profesie',
  ];
  const lines = [headers.map(csvCell).join(',')];
  for (const row of registry?.rows || []) {
    const grade = (value) => row.gradeHistory?.find((entry) => entry.grade === value) || {};
    const transfer = registryEvent(row, 'transfer_in');
    const leave = registryEvent(row, 'leave_started');
    const demit = registryEvent(row, 'demit');
    const reinstatement = registryEvent(row, 'reinstatement');
    const radiation = registryEvent(row, 'radiation');
    const address = row.contact?.address || {};
    const values = [
      row.rowNo, row.matriculationNo, row.displayName,
      date(grade(1).effectiveAt), grade(1).lodgeName,
      date(grade(2).effectiveAt), grade(2).lodgeName,
      date(grade(3).effectiveAt), grade(3).lodgeName,
      [date(transfer.effectiveAt), transfer.originLodge?.name, transfer.destinationLodge?.name].filter((item) => item && item !== '—').join(' · '),
      date(leave.effectiveAt), date(demit.effectiveAt), date(reinstatement.effectiveAt), date(radiation.effectiveAt),
      (row.sponsors || []).map((item) => item.externalName || item.sponsorUserId).filter(Boolean).join('; '),
      row.associationStatus, row.membershipStatus,
      (row.activeOffices || []).map((item) => `${OFFICE_LABELS[item.code] || item.code}${item.masonicYear ? ` ${item.masonicYear}` : ''}`).join('; '),
      [date(row.birthDate), row.birthPlace].filter((item) => item && item !== '—').join(' · '),
      row.maritalStatus,
      [address.street, address.line2, address.postalCode, address.city, address.county, address.country].filter(Boolean).join(', '),
      row.contact?.phone, row.contact?.email,
      [row.occupation, row.employer].filter(Boolean).join(' · '),
    ];
    lines.push(values.map(csvCell).join(','));
  }
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `registru-matricol-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

Template.dossierWorkspace.onCreated(function dossierWorkspaceCreated() {
  this.context = new ReactiveVar(null);
  this.selectedUserId = new ReactiveVar(String(FlowRouter.getParam('userId') || ''));
  this.search = new ReactiveVar('');
  this.tab = new ReactiveVar('summary');
  this.message = new ReactiveVar('');
  this.registry = new ReactiveVar(null);

  const requestedTarget = this.selectedUserId.get();
  Meteor.callAsync('dossiers.context', requestedTarget, '')
    .then((context) => {
      this.context.set(context);
      if (!this.selectedUserId.get()) this.selectedUserId.set(context.userId);
    })
    .catch((error) => setMessage(this, error.reason || error.message, 0));

  this.autorun(() => {
    const context = this.context.get();
    if (!context?.eId) return;
    if (context.canManage) this.subscribe('dossiers.workspace', context.eId);
    const memberId = this.selectedUserId.get() || context.userId;
    if (memberId) this.subscribe('dossiers.detail', memberId, context.eId);
  });
});

Template.dossierWorkspace.helpers({
  canManage() { return Boolean(Template.instance().context.get()?.canManage); },
  loading() { return !Template.instance().context.get() || !Template.instance().subscriptionsReady(); },
  message() { return Template.instance().message.get(); },
  searchQuery() { return Template.instance().search.get(); },
  registry() { return Template.instance().registry.get(); },
  registryRows() { return Template.instance().registry.get()?.rows || []; },
  registrySummary() {
    const registry = Template.instance().registry.get();
    if (!registry) return '';
    const complete = registry.rows.filter((row) => row.dataQuality === 'reviewed').length;
    return `${registry.rows.length} înregistrări · ${complete} dosare verificate · generat la ${date(registry.generatedAt)}`;
  },
  memberRows() {
    const instance = Template.instance();
    const context = instance.context.get();
    if (!context?.eId) return [];
    const users = Meteor.users.find({}).fetch().filter((user) => Boolean(user.entitati?.[context.eId]) || user._id === context.userId);
    const ids = new Set([
      ...users.map((user) => user._id),
      ...LodgeMemberships.find({ eId: context.eId }).fetch().map((row) => row.userId),
      ...BrotherDossiers.find({ eId: context.eId }).fetch().map((row) => row.userId),
    ]);
    const query = normalize(instance.search.get());
    return [...ids].map((userId) => {
      const user = Meteor.users.findOne(userId) || {};
      const dossier = BrotherDossiers.findOne({ eId: context.eId, userId });
      const membership = LodgeMemberships.findOne({ eId: context.eId, userId }) || {};
      return {
        userId,
        displayName: dossierName(dossier, user),
        matriculationNo: membership.matriculationNo || '',
        grade: Number(membership.currentGrade || membership.grade || 0),
        status: membership.status || (user?.setari?.status === '1' ? 'active' : 'inactive'),
      };
    }).filter((row) => !query || normalize(`${row.displayName} ${row.matriculationNo}`).includes(query))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ro'));
  },
  selectedMember() { return selected(Template.instance()); },
  selectedClass(userId) { return Template.instance().selectedUserId.get() === userId ? 'is-selected' : ''; },
  activeTab(tab) { return Template.instance().tab.get() === tab; },
  tabClass(tab) { return Template.instance().tab.get() === tab ? 'is-active' : ''; },
  dossierReviewed() { return this.dossier?.dataQuality?.status === 'reviewed'; },
  reviewedChecked() { return this.dossier?.dataQuality?.status === 'reviewed' ? 'checked' : null; },
  timelineRows() {
    const member = selected(Template.instance());
    if (!member) return [];
    const eId = Template.instance().context.get().eId;
    const administrative = MembershipEvents.find({ eId, userId: member.userId, status: { $ne: 'deleted' } }).fetch().map((row) => ({
      ...row,
      kind: 'administrative',
      label: EVENT_LABELS[row.type] || 'Eveniment administrativ',
      description: row.note || row.originLodge?.name || row.destinationLodge?.name || 'Înregistrare în dosar',
      removable: true,
    }));
    const degrees = DegreeEvents.find({ eId, userId: member.userId, status: { $ne: 'revoked' } }).fetch().map((row) => ({
      ...row,
      kind: 'degree',
      label: `Gradul ${row.grade}`,
      description: row.note || (row.eventType === 'legacy_snapshot' ? 'Preluat din registrul istoric' : 'Eveniment de grad'),
      removable: false,
    }));
    const offices = OfficeTerms.find({ eId, userId: member.userId }).fetch().map((row) => ({
      ...row,
      _id: `office-${row._id}`,
      effectiveAt: row.startAt,
      kind: 'office',
      label: OFFICE_LABELS[row.officeCode] || row.officeCode,
      description: `Mandat ${row.masonicYear || ''} · ${row.status || ''}`,
      removable: false,
    }));
    return [...administrative, ...degrees, ...offices].sort((a, b) => new Date(b.effectiveAt || 0) - new Date(a.effectiveAt || 0));
  },
  documents() {
    const member = selected(Template.instance());
    const eId = Template.instance().context.get()?.eId;
    return member && eId ? BrotherDocuments.find({ eId, userId: member.userId, status: { $ne: 'deleted' } }, { sort: { issuedAt: -1, createdAt: -1 } }) : [];
  },
  notes() {
    const member = selected(Template.instance());
    const eId = Template.instance().context.get()?.eId;
    return member && eId ? DossierNotes.find({ eId, userId: member.userId, status: { $ne: 'deleted' } }, { sort: { createdAt: -1 } }) : [];
  },
  hasNotes() {
    const member = selected(Template.instance());
    const eId = Template.instance().context.get()?.eId;
    return Boolean(member && eId && DossierNotes.find({ eId, userId: member.userId, status: { $ne: 'deleted' } }).count());
  },
  sponsors() {
    const member = selected(Template.instance());
    const eId = Template.instance().context.get()?.eId;
    return member && eId ? BrotherSponsors.find({ eId, userId: member.userId, status: { $ne: 'deleted' } }, { sort: { fromAt: -1 } }) : [];
  },
  participationRows() {
    const member = selected(Template.instance());
    const eId = Template.instance().context.get()?.eId;
    return member && eId ? PrezentaConfirmari.find({ eId, userId: member.userId, sys_status: 1 }, { sort: { dataTinuta: -1 } }) : [];
  },
  participationStats() {
    const member = selected(Template.instance());
    const eId = Template.instance().context.get()?.eId;
    const rows = member && eId ? PrezentaConfirmari.find({ eId, userId: member.userId, sys_status: 1 }).fetch() : [];
    const confirmed = rows.filter((row) => row.status === 'confirmed' || Number(row.confirmareFinala) === 1).length;
    return { total: rows.length, confirmed, pending: rows.length - confirmed };
  },
  officeRows() {
    const member = selected(Template.instance());
    const eId = Template.instance().context.get()?.eId;
    return member && eId ? OfficeTerms.find({ eId, userId: member.userId }, { sort: { startAt: -1 } }) : [];
  },
  formatDate: date,
  dateInput,
  valueOrDash(value) { return value || '—'; },
  initials(value) { return String(value || 'M').split(/\s+/).filter(Boolean).slice(0, 2).map((item) => item[0]).join('').toUpperCase(); },
  gradeLabel(value) { return [1, 2, 3].includes(Number(value)) ? Number(value) : '—'; },
  matriculationNoLabel(value) { return value ? `Matricol ${value}` : 'Matricol nealocat'; },
  membershipStatusLabel(value) { return ({ active: 'Activ', suspended: 'Suspendat', inactive: 'Inactiv', left: 'Plecat' })[value] || 'Necunoscut'; },
  associationStatusLabel(value) { return ({ member: 'Membru', non_member: 'Nemembru', pending: 'În curs', former: 'Fost membru', unknown: 'Necunoscut' })[value] || 'Necunoscut'; },
  dataQualityLabel(value) { return ({ reviewed: 'Verificat', draft: 'În lucru', missing: 'Dosar necompletat' })[value] || value; },
  selectedValue(current, expected) { return current === expected ? 'selected' : null; },
  addressLabel(address) { return [address?.street, address?.line2, address?.postalCode].filter(Boolean).join(', ') || '—'; },
  titleOrDefault(value) { return value || 'Fără titlu'; },
  visibilityLabel(value) { return value === 'member' ? 'Vizibil Fratelui' : 'Secretariat'; },
  storageLabel(value) { return value === 'available' ? 'Fișier securizat' : 'Numai metadate'; },
  hasStoredFile(row) { return row?.storageState === 'available'; },
  documentCategoryLabel(value) { return ({ request: 'Cerere', certificate: 'Certificat', diploma: 'Diplomă', decision: 'Decizie', identity_evidence: 'Dovadă identitate', transfer: 'Transfer', leave: 'Concediu', correspondence: 'Corespondență', other: 'Document' })[value] || 'Document'; },
  officeList(rows) { return rows?.length ? rows.map((row) => OFFICE_LABELS[row.code] || row.code).join(', ') : 'Nicio funcție'; },
  officeLabel(value) { return OFFICE_LABELS[value] || value || 'Funcție'; },
  officeInitial(value) { return (OFFICE_LABELS[value] || value || 'F')[0].toUpperCase(); },
  sponsorName(row) { return row.externalName || userName(Meteor.users.findOne(row.sponsorUserId)) || 'Necunoscut'; },
  sponsorInitials(row) {
    const value = row.externalName || userName(Meteor.users.findOne(row.sponsorUserId)) || 'N';
    return String(value).split(/\s+/).filter(Boolean).slice(0, 2).map((item) => item[0]).join('').toUpperCase();
  },
  sponsorKindLabel(value) { return ({ primary: 'Naș principal', secondary: 'Al doilea naș', historical: 'Mentor / istoric' })[value] || 'Naș'; },
  attendanceStatusLabel(status, finalValue) { return status === 'confirmed' || Number(finalValue) === 1 ? 'Confirmat' : status === 'declined' ? 'Declinat' : 'În așteptare'; },
});

Template.dossierWorkspace.events({
  'input .js-dossier-search'(event, instance) { instance.search.set(event.currentTarget.value); },
  'click .js-select-member'(event, instance) {
    const userId = event.currentTarget.dataset.userId;
    instance.selectedUserId.set(userId);
    instance.tab.set('summary');
    window.history.replaceState({}, '', appPath(`/dosare-frati/${encodeURIComponent(userId)}`));
  },
  'click .js-dossier-tab'(event, instance) { instance.tab.set(event.currentTarget.dataset.tab); },
  async 'click .js-generate-registry'(event, instance) {
    event.currentTarget.disabled = true;
    try {
      instance.registry.set(await Meteor.callAsync('dossiers.registry.generate', instance.context.get().eId));
    } catch (error) { setMessage(instance, error.reason || error.message); }
    finally { event.currentTarget.disabled = false; }
  },
  'click .js-close-registry'(event, instance) { instance.registry.set(null); },
  'click .js-export-registry'(event, instance) {
    event.preventDefault();
    exportRegistryCsv(instance.registry.get());
  },
  async 'submit .js-dossier-personal-form'(event, instance) {
    event.preventDefault();
    const v = values(event.currentTarget);
    const memberId = instance.selectedUserId.get();
    const context = instance.context.get();
    try {
      await Meteor.callAsync('dossiers.profile.save', memberId, {
        eId: context.eId,
        membership: {
          matriculationNo: v.matriculationNo,
          status: v.membershipStatus,
          joinedAt: v.joinedAt || undefined,
        },
        personal: {
          identity: { givenName: v.givenName, familyName: v.familyName, birthName: v.birthName, preferredName: v.preferredName, birthDate: v.birthDate, birthPlace: v.birthPlace, citizenship: v.citizenship, maritalStatus: v.maritalStatus },
          contact: { email: v.email, phone: v.phone, address: { country: v.country, county: v.county, city: v.city, postalCode: v.postalCode, street: v.street } },
          professional: { occupation: v.occupation, employer: v.employer },
          association: { memberNo: v.associationMemberNo, status: v.associationStatus, joinedAt: v.associationJoinedAt },
          reviewed: v.reviewed === 'on',
        },
      }, context.eId);
      setMessage(instance, 'Dosarul a fost salvat.');
    } catch (error) { setMessage(instance, error.reason || error.message); }
  },
  async 'submit .js-dossier-event-form'(event, instance) {
    event.preventDefault();
    const v = values(event.currentTarget);
    try {
      await Meteor.callAsync('dossiers.membershipEvents.create', instance.selectedUserId.get(), {
        type: v.type, effectiveAt: v.effectiveAt, visibility: v.visibility, note: v.note,
        originLodge: { name: v.originLodgeName }, destinationLodge: { name: v.destinationLodgeName },
      }, instance.context.get().eId);
      event.currentTarget.reset(); setMessage(instance, 'Evenimentul a fost înregistrat.');
    } catch (error) { setMessage(instance, error.reason || error.message); }
  },
  async 'click .js-remove-membership-event'(event, instance) {
    if (!window.confirm('Retrageți această înregistrare din cronologia activă?')) return;
    try {
      await Meteor.callAsync('dossiers.membershipEvents.remove', instance.selectedUserId.get(), event.currentTarget.dataset.id, instance.context.get().eId);
      setMessage(instance, 'Înregistrarea a fost retrasă.');
    } catch (error) { setMessage(instance, error.reason || error.message); }
  },
  async 'submit .js-dossier-document-form'(event, instance) {
    event.preventDefault();
    try {
      const form = event.currentTarget;
      const file = form.elements.file?.files?.[0];
      const context = instance.context.get();
      const memberId = instance.selectedUserId.get();
      if (file?.size) {
        if (!window.location.pathname.startsWith('/portal/')) {
          throw new Error('Încărcarea fișierelor se testează prin gateway-ul /portal; accesul direct permite salvarea metadatelor.');
        }
        const upload = new FormData(form);
        const response = await fetch(`/portal-api/dossiers/${encodeURIComponent(memberId)}/documents`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-CSA-Tenant': context.eId },
          body: upload,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Fișierul nu a putut fi încărcat.');
        form.reset();
        setMessage(instance, 'Documentul a fost scanat și arhivat securizat.');
        return;
      }
      const metadata = new FormData(form);
      metadata.delete('file');
      await Meteor.callAsync('dossiers.documents.register', memberId, Object.fromEntries(metadata), context.eId);
      form.reset(); setMessage(instance, 'Metadatele documentului au fost salvate.');
    } catch (error) { setMessage(instance, error.reason || error.message); }
  },
  async 'click .js-download-dossier-document'(event, instance) {
    event.currentTarget.disabled = true;
    try {
      if (!window.location.pathname.startsWith('/portal/')) {
        throw new Error('Descărcarea fișierelor securizate este disponibilă prin gateway-ul /portal.');
      }
      const result = await Meteor.callAsync('dossiers.documents.authorizeDownload', event.currentTarget.dataset.id, instance.context.get().eId);
      window.location.assign(result.url);
    } catch (error) { setMessage(instance, error.reason || error.message); event.currentTarget.disabled = false; }
  },
  async 'submit .js-dossier-note-form'(event, instance) {
    event.preventDefault();
    try {
      await Meteor.callAsync('dossiers.notes.create', instance.selectedUserId.get(), values(event.currentTarget), instance.context.get().eId);
      event.currentTarget.reset(); setMessage(instance, 'Nota a fost adăugată.');
    } catch (error) { setMessage(instance, error.reason || error.message); }
  },
  async 'submit .js-dossier-sponsor-form'(event, instance) {
    event.preventDefault();
    try {
      await Meteor.callAsync('dossiers.sponsors.save', instance.selectedUserId.get(), values(event.currentTarget), instance.context.get().eId);
      event.currentTarget.reset(); setMessage(instance, 'Legătura a fost adăugată.');
    } catch (error) { setMessage(instance, error.reason || error.message); }
  },
});

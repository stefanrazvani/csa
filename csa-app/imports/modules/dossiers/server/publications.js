import { Meteor } from 'meteor/meteor';
import {
  DegreeEvents,
  LodgeMemberships,
  OfficeTerms,
  PrezentaConfirmari,
} from '/imports/api/collections.js';
import {
  BrotherDocuments,
  BrotherDossiers,
  BrotherSponsors,
  DossierNotes,
  MembershipEvents,
} from '../api/collections.js';
import {
  recordDossierAccess,
  requireDossierAdministrator,
  requireDossierViewer,
} from './access.js';
import { publishWithReactiveDossierAccess } from './reactive-publication.js';

const LIST_DOSSIER_FIELDS = {
  eId: 1,
  userId: 1,
  'identity.givenName': 1,
  'identity.familyName': 1,
  'identity.preferredName': 1,
  updatedAt: 1,
};

const SELF_DOSSIER_FIELDS = {
  eId: 1,
  userId: 1,
  identity: 1,
  contact: 1,
  professional: 1,
  association: 1,
  dataQuality: 1,
  createdAt: 1,
  updatedAt: 1,
};

function stream(collection, cursor) {
  return { name: collection._name, cursor };
}

function memberVisibleSelector(eId, userId) {
  return {
    eId,
    userId,
    status: { $ne: 'deleted' },
    visibility: { $in: ['member', 'public'] },
  };
}

const SELF_EVENT_FIELDS = {
  eId: 1, userId: 1, type: 1, effectiveAt: 1, originLodge: 1,
  destinationLodge: 1, note: 1, visibility: 1, status: 1,
};

const SELF_DOCUMENT_FIELDS = {
  eId: 1, userId: 1, title: 1, category: 1, documentNumber: 1, issuer: 1,
  issuedAt: 1, expiresAt: 1, originalName: 1, storageState: 1, visibility: 1,
  note: 1, status: 1, createdAt: 1, updatedAt: 1,
};

const SELF_SPONSOR_FIELDS = {
  eId: 1, userId: 1, sponsorUserId: 1, externalName: 1, kind: 1,
  fromAt: 1, note: 1, visibility: 1, status: 1,
};

const SELF_NOTE_FIELDS = {
  eId: 1, userId: 1, title: 1, body: 1, visibility: 1,
  status: 1, createdAt: 1, updatedAt: 1,
};

function workspaceStreams(access) {
  return [
    stream(BrotherDossiers, BrotherDossiers.find(
      { eId: access.eId },
      { fields: LIST_DOSSIER_FIELDS, sort: { 'identity.familyName': 1 } },
    )),
    stream(LodgeMemberships, LodgeMemberships.find(
      { eId: access.eId },
      { fields: { eId: 1, userId: 1, matriculationNo: 1, currentGrade: 1, grade: 1, status: 1, joinedAt: 1, updatedAt: 1 } },
    )),
    stream(Meteor.users, Meteor.users.find(
      { [`entitati.${access.eId}`]: { $exists: true } },
      {
        fields: {
          'profile.name': 1,
          'profileExt.nume': 1,
          'profileExt.prenume': 1,
          'setari.nume': 1,
          'setari.prenume': 1,
          'setari.status': 1,
          [`entitati.${access.eId}`]: 1,
        },
      },
    )),
  ];
}

function detailStreams(access) {
  const { eId, targetUserId: memberId, self } = access;
  const selfRestricted = self && !access.superAdmin;
  const now = new Date();
  const degreeSelector = { eId, userId: memberId, status: { $ne: 'revoked' } };
  const officeSelector = { eId, userId: memberId };
  if (selfRestricted) {
    // O programare viitoare nu devine informație a membrului înainte de
    // data efectivă. Administratorii autorizați păstrează vederea completă.
    degreeSelector.effectiveAt = { $lte: now };
    officeSelector.$and = [
      { $or: [
        { startAt: { $exists: false } },
        { startAt: null },
        { startAt: { $lte: now } },
      ] },
      { $or: [
        { startsAt: { $exists: false } },
        { startsAt: null },
        { startsAt: { $lte: now } },
      ] },
    ];
  }

  const common = [
    stream(LodgeMemberships, LodgeMemberships.find(
      { eId, userId: memberId },
      { fields: { eId: 1, userId: 1, matriculationNo: 1, currentGrade: 1, grade: 1, status: 1, joinedAt: 1, leftAt: 1, updatedAt: 1 } },
    )),
    stream(DegreeEvents, DegreeEvents.find(
      degreeSelector,
      {
        fields: selfRestricted
          ? { eId: 1, userId: 1, grade: 1, eventType: 1, effectiveAt: 1, status: 1 }
          : { eId: 1, userId: 1, grade: 1, eventType: 1, effectiveAt: 1, note: 1, documentId: 1, status: 1 },
        sort: { effectiveAt: -1 },
      },
    )),
    stream(OfficeTerms, OfficeTerms.find(
      officeSelector,
      { fields: { eId: 1, userId: 1, officeCode: 1, masonicYear: 1, status: 1, startAt: 1, endAt: 1, startsAt: 1, endsAt: 1 }, sort: { startAt: -1 } },
    )),
    stream(PrezentaConfirmari, PrezentaConfirmari.find(
      { eId, userId: memberId, sys_status: 1 },
      { fields: { eId: 1, userId: 1, convocatorId: 1, dataTinuta: 1, status: 1, nume: 1, tinutaNr: 1, confirmareFinala: 1 }, sort: { dataTinuta: -1 }, limit: 100 },
    )),
    stream(Meteor.users, Meteor.users.find(
      { _id: memberId },
      { fields: { emails: 1, profile: 1, profileExt: 1, setari: 1 } },
    )),
  ];

  if (selfRestricted) {
    return [
      ...common,
      stream(BrotherDossiers, BrotherDossiers.find({ eId, userId: memberId }, { fields: SELF_DOSSIER_FIELDS })),
      stream(MembershipEvents, MembershipEvents.find(
        { ...memberVisibleSelector(eId, memberId), effectiveAt: { $lte: now } },
        { fields: SELF_EVENT_FIELDS, sort: { effectiveAt: -1 } },
      )),
      stream(BrotherDocuments, BrotherDocuments.find(memberVisibleSelector(eId, memberId), { fields: SELF_DOCUMENT_FIELDS, sort: { issuedAt: -1 } })),
      stream(BrotherSponsors, BrotherSponsors.find(memberVisibleSelector(eId, memberId), { fields: SELF_SPONSOR_FIELDS, sort: { fromAt: -1 } })),
      stream(DossierNotes, DossierNotes.find(memberVisibleSelector(eId, memberId), { fields: SELF_NOTE_FIELDS, sort: { createdAt: -1 } })),
    ];
  }

  return [
    ...common,
    stream(BrotherDossiers, BrotherDossiers.find({ eId, userId: memberId })),
    stream(MembershipEvents, MembershipEvents.find({ eId, userId: memberId, status: { $ne: 'deleted' } }, { sort: { effectiveAt: -1 } })),
    stream(BrotherDocuments, BrotherDocuments.find({ eId, userId: memberId, status: { $ne: 'deleted' } }, { fields: { objectRef: 0 }, sort: { issuedAt: -1 } })),
    stream(BrotherSponsors, BrotherSponsors.find({ eId, userId: memberId, status: { $ne: 'deleted' } }, { sort: { fromAt: -1 } })),
    stream(DossierNotes, DossierNotes.find({ eId, userId: memberId, status: { $ne: 'deleted' } }, { sort: { createdAt: -1 } })),
  ];
}

Meteor.publish('dossiers.workspace', async function dossiersWorkspacePublication(requestedEId = '') {
  if (typeof requestedEId !== 'string') return this.ready();
  let access;
  try {
    access = await requireDossierAdministrator(this, { action: 'workspace.read', requestedEId });
  } catch (error) {
    return this.ready();
  }
  try {
    await recordDossierAccess(this, access, {
      targetUserId: access.userId,
      action: 'workspace.read',
      resourceType: 'dossier_workspace',
    });
  } catch (error) {
    return this.ready();
  }
  try {
    await publishWithReactiveDossierAccess(this, {
      initialAccess: access,
      reauthorize: () => requireDossierAdministrator(this, {
        action: 'workspace.read', requestedEId, audit: false,
      }),
      buildStreams: workspaceStreams,
    });
  } catch (error) {
    return undefined;
  }
  return undefined;
});

Meteor.publish('dossiers.detail', async function dossiersDetailPublication(targetUserId = '', requestedEId = '') {
  if (typeof targetUserId !== 'string' || typeof requestedEId !== 'string') return this.ready();
  let access;
  try {
    access = await requireDossierViewer(this, targetUserId, requestedEId);
  } catch (error) {
    return this.ready();
  }
  try {
    const { targetUserId: memberId, self } = access;
    await recordDossierAccess(this, access, {
      targetUserId: memberId,
      action: self ? 'self.detail.read' : 'detail.read',
    });
  } catch (error) {
    return this.ready();
  }
  try {
    await publishWithReactiveDossierAccess(this, {
      initialAccess: access,
      reauthorize: () => requireDossierViewer(this, targetUserId, requestedEId, { audit: false }),
      buildStreams: detailStreams,
    });
  } catch (error) {
    return undefined;
  }
  return undefined;
});

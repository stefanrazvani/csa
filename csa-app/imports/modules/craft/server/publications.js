import { Meteor } from 'meteor/meteor';
import {
  CraftMemberships,
  Convocatoare,
  Documente,
  DocumenteText,
  Prezenta,
  PrezentaConfirmari,
} from '/imports/api/collections.js';
import { getReadableCraftGrade, requireRole } from '/imports/lib/access/server.js';
import { publishWithReactiveDossierAccess } from '/imports/modules/dossiers/server/reactive-publication.js';
import { LibraryWorks } from '/imports/modules/study/api/collections.js';
import { confirmationAccess } from './member-access.js';

const RESPONSE_FIELDS = { eId: 1, userId: 1, convocatorId: 1, idPrezenta: 1, nume: 1, tinutaNr: 1, dataTinuta: 1, dataConfirmare: 1, status: 1, confirmareFinala: 1, confirmareTinuta: 1, confirmareAgapa: 1, confirmareMeniuStandard: 1, confirmareMeniuVegetarian: 1, motivAbsenta: 1, motivAbsentaAgapa: 1, attended: 1, sys_status: 1, updatedAt: 1 };

Meteor.publish('craft.confirmari.mine', async function mine() {
  const access = await confirmationAccess(this);
  return publishWithReactiveDossierAccess(this, {
    initialAccess: access,
    reauthorize: () => confirmationAccess(this),
    buildStreams: ({ eId, userId }) => [{ collection: PrezentaConfirmari, cursor: PrezentaConfirmari.find({ eId, userId, sys_status: 1 }, { fields: RESPONSE_FIELDS, sort: { dataTinuta: -1 } }) }],
  });
});

Meteor.publish('craft.attendance.workspace', async function workspace() {
  const access = await requireRole(this, 'prezenta', 'admin');
  return publishWithReactiveDossierAccess(this, {
    initialAccess: access,
    reauthorize: () => requireRole(this, 'prezenta', 'admin'),
    buildStreams: ({ eId }) => [
      { collection: Prezenta, cursor: Prezenta.find({ eId, sys_status: 1 }) },
      { collection: PrezentaConfirmari, cursor: PrezentaConfirmari.find({ eId, sys_status: 1 }, { fields: { ...RESPONSE_FIELDS, userSnapshot: 1, 'delivery.state': 1, 'delivery.sentAt': 1, 'delivery.error': 1 } }) },
    ],
  });
});

const CONVOCATOR_FIELDS = {
  nr: 1,
  nume: 1,
  dataTinuta: 1,
  dataConfirmare: 1,
  dataAccess: 1,
  data_access: 1,
  status: 1,
  numarTinuta: 1,
  numeLoja: 1,
  nrLoja: 1,
  orientul: 1,
  templu: 1,
  adresaTemplu: 1,
  observatii: 1,
  createdAt: 1,
  sys_status: 1,
  eId: 1,
};

Meteor.publish('craft.convocatoare', async function publishConvocatoare() {
  const { eId } = await requireRole(this, 'convocatoare', 'read');
  return Convocatoare.find({ eId, sys_status: 1 }, { fields: CONVOCATOR_FIELDS, sort: { dataTinuta: -1, nr: -1 } });
});

Meteor.publish('craft.convocator', async function publishConvocator(id) {
  if (typeof id !== 'string') return this.ready();
  const { eId } = await requireRole(this, 'convocatoare', 'read');
  return Convocatoare.find({ _id: id, eId, sys_status: 1 }, { fields: CONVOCATOR_FIELDS });
});

Meteor.publish('craft.documenteText', async function publishDocumenteText(documentId) {
  if (typeof documentId !== 'string') return this.ready();
  const { userId, eId } = await requireRole(this, 'convocatoare', 'read');
  const grade = await getReadableCraftGrade(userId, eId);
  const exists = await Convocatoare.findOneAsync({ _id: documentId, eId, sys_status: 1 }, { fields: { _id: 1 } });
  if (!exists) return this.ready();
  return DocumenteText.find(
    { eId, documentId, sys_status: 1, level: { $lte: grade } },
    { sort: { level: 1, order: 1 } },
  );
});

Meteor.publish('craft.memberships', async function publishMemberships() {
  const { eId } = await requireRole(this, 'convocatoare', 'admin');
  return CraftMemberships.find({ eId }, { fields: { eId: 1, userId: 1, grade: 1, status: 1, updatedAt: 1 } });
});

Meteor.publish('craft.gradeAdmin', async function publishGradeAdmin() {
  const { eId } = await requireRole(this, 'convocatoare', 'admin');
  return [
    CraftMemberships.find({ eId }, { fields: { eId: 1, userId: 1, grade: 1, status: 1, updatedAt: 1 } }),
    Meteor.users.find(
      { [`entitati.${eId}`]: { $exists: true } },
      { fields: { emails: 1, profile: 1, setari: 1 }, sort: { 'emails.0.address': 1 } },
    ),
  ];
});

Meteor.publish('craft.prezente', async function publishPrezente() {
  const { eId } = await requireRole(this, 'prezenta', 'read');
  return Prezenta.find({ eId, sys_status: 1 }, { sort: { dataTinuta: -1 } });
});

Meteor.publish('craft.confirmari', async function publishConfirmari(convocatorId) {
  if (typeof convocatorId !== 'string') return this.ready();
  const { eId } = await requireRole(this, 'prezenta', 'admin');
  return PrezentaConfirmari.find(
    { eId, convocatorId, sys_status: 1 },
    { fields: { publicTokenHash: 0 }, sort: { 'userSnapshot.nume': 1, 'userSnapshot.prenume': 1 } },
  );
});

Meteor.publish('craft.documents', async function publishDocuments(objectId) {
  if (typeof objectId !== 'string') return this.ready();
  const { eId } = await requireRole(this, 'documents', 'read');
  return Documente.find({ eId, objectId, sys_status: 1 }, { fields: { privatePath: 0 } });
});

Meteor.publish('craft.convocatorDocuments', async function publishConvocatorDocuments(objectId) {
  if (typeof objectId !== 'string') return this.ready();
  const reauthorize = async () => {
    const access = await requireRole(this, 'convocatoare', 'read');
    const grade = await getReadableCraftGrade(access.userId, access.eId);
    const works = await LibraryWorks.find({ eId: access.eId, status: 'published', minGrade: { $lte: grade } }, { fields: { _id: 1 } }).fetchAsync();
    return { ...access, workIds: works.map((work) => work._id) };
  };
  return publishWithReactiveDossierAccess(this, {
    initialAccess: await reauthorize(), reauthorize,
    authorizationCursors: ({ eId }) => [LibraryWorks.find({ eId }, { fields: { status: 1, minGrade: 1 } })],
    buildStreams: ({ eId, workIds }) => [{ collection: Documente, cursor: Documente.find({ eId, moduleAlias: 'convocatoare', objectId, sys_status: 1, libraryWorkId: { $in: workIds } }, { fields: { eId: 1, objectId: 1, filename: 1, libraryWorkId: 1, minGrade: 1, sys_status: 1 } }) }],
  });
});

Meteor.publish('craft.libraryChoices', async function libraryChoices() {
  const { eId, userId } = await requireRole(this, 'convocatoare', 'write');
  const grade = await getReadableCraftGrade(userId, eId);
  return LibraryWorks.find({ eId, status: 'published', minGrade: { $lte: grade } }, { fields: { eId: 1, title: 1, minGrade: 1, status: 1 }, sort: { title: 1 } });
});

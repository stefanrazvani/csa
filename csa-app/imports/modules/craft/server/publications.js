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

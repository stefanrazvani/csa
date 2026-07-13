import { Meteor } from 'meteor/meteor';
import { Entitati, OfficeDefinitions, OfficeDelegations, OfficeTerms } from '/imports/api/collections.js';
import { requireCompositeAccess } from '/imports/lib/access/server.js';

const GRADE_LABELS = { 0: 'Grad neconfigurat', 1: 'Ucenic', 2: 'Calfă', 3: 'Maestru' };

function activeAt(row, now) {
  return row?.status === 'active' && (!row.startAt || row.startAt <= now) && (!row.endAt || row.endAt >= now);
}

async function templeAccess(context, audit = false) {
  const access = await requireCompositeAccess(context, {
    auditAction: audit ? 'temple.enter' : '', auditEntityType: audit ? 'temple' : '', auditEntityId: audit ? 'main' : '',
  });
  const now = new Date();
  if (access.superAdmin) {
    const definitions = await OfficeDefinitions.find({ eId: access.eId, status: 'active' }, { fields: { code: 1, name: 1, minGrade: 1, order: 1 }, sort: { order: 1 } }).fetchAsync();
    return { ...access, offices: definitions };
  }
  const [terms, delegations, definitions] = await Promise.all([
    OfficeTerms.find({ eId: access.eId, userId: access.userId, status: 'active' }).fetchAsync(),
    OfficeDelegations.find({ eId: access.eId, delegateUserId: access.userId, status: 'active' }).fetchAsync(),
    OfficeDefinitions.find({ eId: access.eId, status: 'active' }, { fields: { code: 1, name: 1, minGrade: 1, order: 1 }, sort: { order: 1 } }).fetchAsync(),
  ]);
  const directTerms = terms.filter((row) => activeAt(row, now));
  const delegatedTerms = [];
  for (const delegation of delegations.filter((row) => activeAt(row, now))) {
    const parent = terms.find((row) => row._id === delegation.officeTermId)
      || await OfficeTerms.findOneAsync({ _id: delegation.officeTermId, eId: access.eId, officeCode: delegation.officeCode, status: 'active' });
    if (activeAt(parent, now)) delegatedTerms.push(delegation);
  }
  const codes = new Set([...directTerms, ...delegatedTerms].map((row) => row.officeCode));
  return { ...access, offices: definitions.filter((item) => codes.has(item.code) && access.grade >= Number(item.minGrade || 3)) };
}

function room(key, label, description, kind, path, x, y) { return { key, label, description, kind, path, position: { x, y } }; }

function sceneRooms(access) {
  const rooms = [room('dashboard', 'Tablou de bord', 'Reperele și activitatea ta curentă.', 'dashboard', '/', 50, 75)];
  if (access.grade >= 1) rooms.push(
    room('reflection', 'Camera introspecției', 'Observație, meditație și lucrarea personală.', 'reflection', '/biblioteca', 23, 60),
    room('library-one', 'Biblioteca Ucenicului', 'Planșe și texte disponibile gradului întâi.', 'library', '/biblioteca', 77, 60),
  );
  if (access.grade >= 2) rooms.push(
    room('study', 'Atelierul cunoașterii', 'Științe, arte și dezvoltare prin studiu.', 'study', '/biblioteca', 27, 38),
    room('concepts', 'Planșa conceptelor', 'Legăturile validate dintre idei și surse.', 'concepts', '/concepte', 73, 38),
  );
  if (access.grade >= 3) rooms.push(
    room('projects', 'Sala proiectelor', 'Lucrare de grup, mentorat și continuitate.', 'projects', '/biblioteca', 36, 21),
    room('council', 'Sala de consiliu', 'Responsabilități și echilibrul lucrării comune.', 'council', '/', 64, 21),
  );
  const offices = new Set(access.offices.map((entry) => entry.code));
  if (access.superAdmin || offices.has('secretary') || offices.has('venerable')) rooms.push(room('secretariat', 'Secretariat', 'Matricol, convocatoare, prezențe și vizitatori.', 'secretariat', '/registru', 11, 30), room('visitors', 'Frați vizitatori', 'Invitații limitate și Loja de proveniență.', 'secretariat', '/vizitatori', 12, 48));
  if (access.superAdmin || offices.has('treasurer')) rooms.push(room('treasury', 'Metale', 'Bugete, cotizații și registrul mișcărilor.', 'treasury', '/metale', 89, 30));
  if (access.superAdmin || offices.has('hospitalier')) rooms.push(room('hospitality', 'Ospitalier', 'Evenimente și sprijin discret.', 'hospitality', '/ospitalier', 88, 48));
  return rooms;
}

Meteor.methods({
  async 'temple.context'() {
    const access = await templeAccess(this, true);
    const tenant = await Entitati.findOneAsync(access.eId, { fields: { nume: 1 } });
    return { tenantName: tenant?.nume || 'Loja', grade: access.grade, gradeLabel: GRADE_LABELS[access.grade] || GRADE_LABELS[0], offices: access.offices.map((entry) => ({ code: entry.code, label: entry.name })), platformAdmin: access.superAdmin };
  },
  async 'temple.scene'() {
    const access = await templeAccess(this);
    return {
      title: access.grade === 1 ? 'Pragul și piatra brută' : access.grade === 2 ? 'Atelierul cunoașterii' : access.grade === 3 ? 'Planșa completă' : 'Templul în așteptare',
      subtitle: access.grade ? 'Alege spațiul în care continui lucrarea.' : 'Administratorul Loji trebuie să configureze gradul activ.',
      rooms: sceneRooms(access),
    };
  },
});

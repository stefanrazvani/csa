import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';
import { Meteor } from 'meteor/meteor';
import {
  Convocatoare,
  CraftMemberships,
  Documente,
  DocumenteText,
  Entitati,
  Prezenta,
  PrezentaConfirmari,
} from '/imports/api/collections.js';
import {
  getActiveEId,
  getCraftGrade,
  getReadableCraftGrade,
  isSuperAdmin,
  isTenantAdmin,
  requireUser,
} from '/imports/lib/access/server.js';

const EVENT_FIELDS = {
  nr: 1,
  nume: 1,
  dataTinuta: 1,
  dataConfirmare: 1,
  data_access: 1,
  status: 1,
  numarTinuta: 1,
  numeLoja: 1,
  nrLoja: 1,
  orientul: 1,
  templu: 1,
};

async function eventRows(eId, grade) {
  const now = new Date();
  let mode = 'upcoming';
  let rows = await Convocatoare.find(
    { eId, sys_status: 1, dataTinuta: { $gte: now } },
    { fields: EVENT_FIELDS, sort: { dataTinuta: 1 }, limit: 5 },
  ).fetchAsync();
  if (!rows.length) {
    mode = 'recent';
    rows = await Convocatoare.find(
      { eId, sys_status: 1 },
      { fields: EVENT_FIELDS, sort: { dataTinuta: -1, nr: -1 }, limit: 5 },
    ).fetchAsync();
  }
  return {
    mode,
    rows: await Promise.all(rows.map(async (row) => ({
      ...row,
      readableArticles: grade > 0
        ? await DocumenteText.rawCollection().countDocuments({ eId, documentId: row._id, sys_status: 1, level: { $lte: grade } })
        : 0,
    }))),
  };
}

Meteor.methods({
  async 'dashboard.summary'() {
    const userId = await requireUser(this);
    const eId = await getActiveEId(userId);
    if (!eId) throw new Meteor.Error('invalid-eid', 'Nu există o organizație activă pentru acest cont.');
    const [user, tenant, grade, superAdmin, tenantAdmin] = await Promise.all([
      Meteor.users.findOneAsync(userId, { fields: { emails: 1, profile: 1, setari: 1 } }),
      Entitati.findOneAsync(eId, { fields: { nume: 1 } }),
      getCraftGrade(userId, eId),
      isSuperAdmin(userId),
      isTenantAdmin(userId, eId),
    ]);
    let readableGrade = grade;
    try {
      readableGrade = await getReadableCraftGrade(userId, eId);
    } catch (error) {
      // Dashboardul rămâne disponibil și utilizatorilor fără grad configurat.
    }

    const [events, confirmations, totalConfirmations, documentsCount] = await Promise.all([
      eventRows(eId, readableGrade),
      PrezentaConfirmari.find(
        { eId, userId, sys_status: 1 },
        { fields: { convocatorId: 1, dataTinuta: 1, dataConfirmare: 1, status: 1, nume: 1, tinutaNr: 1 }, sort: { dataTinuta: -1 }, limit: 5 },
      ).fetchAsync(),
      PrezentaConfirmari.rawCollection().countDocuments({ eId, userId, sys_status: 1 }),
      Documente.rawCollection().countDocuments({ eId, sys_status: 1 }),
    ]);

    let administration = null;
    if (tenantAdmin) {
      const [activeUsers, pendingUsers, inactiveUsers, membershipIds, convocatoare, articlesByLevel, presences, confirmationCount, unresolvedPresence] = await Promise.all([
        Meteor.users.find({ [`entitati.${eId}`]: { $exists: true }, 'setari.status': '1' }, { fields: { _id: 1 } }).fetchAsync(),
        Meteor.users.rawCollection().countDocuments({ [`entitati.${eId}`]: { $exists: true }, 'registration.status': 'pending' }),
        Meteor.users.rawCollection().countDocuments({ [`entitati.${eId}`]: { $exists: true }, 'setari.status': { $exists: true, $ne: '1' } }),
        CraftMemberships.rawCollection().distinct('userId', { eId, status: 'active' }),
        Convocatoare.rawCollection().countDocuments({ eId, sys_status: 1 }),
        DocumenteText.rawCollection().aggregate([
          { $match: { eId, sys_status: 1 } },
          { $group: { _id: '$level', count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]).toArray(),
        Prezenta.rawCollection().countDocuments({ eId }),
        PrezentaConfirmari.rawCollection().countDocuments({ eId, sys_status: 1 }),
        Prezenta.rawCollection().countDocuments({ eId, 'legacyMetadata.unresolvedConvocator': true }),
      ]);
      const membershipSet = new Set(membershipIds);
      administration = {
        activeUsers: activeUsers.length,
        pendingUsers,
        inactiveUsers,
        usersWithoutGrade: activeUsers.filter((entry) => !membershipSet.has(entry._id)).length,
        convocatoare,
        articleLevel1: articlesByLevel.find((entry) => Number(entry._id) === 1)?.count || 0,
        articleLevel2: articlesByLevel.find((entry) => Number(entry._id) === 2)?.count || 0,
        articleLevel3: articlesByLevel.find((entry) => Number(entry._id) === 3)?.count || 0,
        presences,
        confirmations: confirmationCount,
        documents: documentsCount,
        unresolvedPresence,
      };
    }

    const displayName = [user?.setari?.prenume, user?.setari?.nume].filter(Boolean).join(' ')
      || user?.profile?.name
      || user?.emails?.[0]?.address
      || 'Membru';
    return {
      generatedAt: new Date(),
      identity: {
        displayName,
        tenantName: tenant?.nume || eId,
        grade,
        gradeConfigured: grade > 0,
        superAdmin,
        tenantAdmin,
      },
      content: {
        eventMode: events.mode,
        events: events.rows,
        confirmations,
        totalConfirmations,
        documentsCount,
      },
      administration,
    };
  },
});

DDPRateLimiter.addRule({ type: 'method', name: 'dashboard.summary' }, 30, 60 * 1000);

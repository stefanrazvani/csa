import crypto from 'node:crypto';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { Roles } from 'meteor/roles';
import { check, Match } from 'meteor/check';
import {
  CraftCounters,
  CraftMemberships,
  Convocatoare,
  Documente,
  DocumenteText,
  Prezenta,
  PrezentaConfirmari,
} from '/imports/api/collections.js';
import { getCraftGrade, isSuperAdmin, isTenantAdmin, requireActiveEId, requireRole } from '/imports/lib/access/server.js';
import { recordDegree } from '/imports/system/governance/server/service.js';

const CONVOCATOR_FIELDS = [
  'nume', 'numeLoja', 'nrLoja', 'orientul', 'templu', 'adresaTemplu', 'status',
  'dataTinuta', 'dataConfirmare', 'dataAccess', 'data_access', 'numarTinuta', 'observatii',
];

function pick(source, fields) {
  return fields.reduce((target, field) => {
    if (source?.[field] !== undefined) target[field] = source[field];
    return target;
  }, {});
}

function normalizeDate(value, field) {
  if (value === undefined || value === null || value === '') return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Meteor.Error('validation-error', `${field} este invalidă.`);
  return date;
}

function sanitizeConvocator(payload = {}) {
  const data = pick(payload, CONVOCATOR_FIELDS);
  for (const field of ['nume', 'numeLoja', 'nrLoja', 'orientul', 'templu', 'adresaTemplu', 'status', 'observatii']) {
    if (data[field] !== undefined) data[field] = String(data[field]).trim().slice(0, field === 'observatii' ? 5000 : 300);
  }
  if (data.data_access !== undefined) {
    data.data_access = String(data.data_access).trim();
    if (data.data_access && !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.data_access)) {
      throw new Meteor.Error('validation-error', 'Ora accesului este invalidă.');
    }
  }
  if (data.numarTinuta !== undefined) data.numarTinuta = Number(data.numarTinuta || 0);
  if (data.dataTinuta !== undefined) data.dataTinuta = normalizeDate(data.dataTinuta, 'Data ținutei');
  if (data.dataConfirmare !== undefined) data.dataConfirmare = normalizeDate(data.dataConfirmare, 'Data confirmării');
  if (data.dataAccess !== undefined) data.dataAccess = normalizeDate(data.dataAccess, 'Data accesului');
  return data;
}

async function nextNumber(eId, key) {
  const result = await CraftCounters.rawCollection().findOneAndUpdate(
    { _id: `${eId}:${key}` },
    { $inc: { value: 1 }, $setOnInsert: { eId, key } },
    { upsert: true, returnDocument: 'after' },
  );
  return Number(result?.value || 1);
}

function sanitizeArticle(payload = {}) {
  const order = Number(payload.order);
  const continut = String(payload.continut || '').trim();
  const nrArticol = String(payload.nrArticol || '').trim();
  if (!Number.isInteger(order) || order < 1 || !continut) {
    throw new Meteor.Error('validation-error', 'Ordinea și conținutul articolului sunt obligatorii.');
  }
  return { order, continut: continut.slice(0, 20000), nrArticol: nrArticol.slice(0, 50) };
}

async function normalizeArticleOrder(eId, documentId, level, priorityId) {
  let rows = await DocumenteText.find(
    { eId, documentId, level, sys_status: 1 },
    { fields: { _id: 1, order: 1, createdAt: 1 }, sort: { order: 1, createdAt: 1, _id: 1 } },
  ).fetchAsync();
  if (priorityId) {
    const priority = rows.find((row) => row._id === priorityId);
    if (priority) {
      rows = rows.filter((row) => row._id !== priorityId);
      rows.splice(Math.min(Math.max(priority.order - 1, 0), rows.length), 0, priority);
    }
  }
  for (let index = 0; index < rows.length; index += 1) {
    const expected = index + 1;
    if (rows[index].order !== expected) {
      await DocumenteText.updateAsync(rows[index]._id, { $set: { order: expected, nr: expected } });
    }
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function presenceMetadata(convocator) {
  const tinutaNr = Number(convocator.numarTinuta || 0);
  const nameParts = [
    tinutaNr ? `Prezență ținută nr. ${tinutaNr}` : `Prezență convocator #${convocator.nr || ''}`,
    convocator.numeLoja || '',
    convocator.nrLoja ? `nr. ${convocator.nrLoja}` : '',
    convocator.orientul || '',
  ].filter(Boolean);
  return {
    nume: nameParts.join(' · '),
    tinutaNr,
    templu: convocator.templu || '',
    numeLoja: convocator.numeLoja || '',
    dataTinuta: convocator.dataTinuta,
    dataConfirmare: convocator.dataConfirmare,
    orientul: convocator.orientul || '',
    nrLoja: convocator.nrLoja || '',
  };
}

async function preparePresenceForConvocator({ eId, convocatorId, userId }) {
  const convocator = await Convocatoare.findOneAsync({ _id: convocatorId, eId, sys_status: 1 });
  if (!convocator) throw new Meteor.Error('not-found', 'Convocator inexistent.');
  const now = new Date();
  const metadata = presenceMetadata(convocator);
  let presence = await Prezenta.findOneAsync({ eId, convocatorId }, { fields: { _id: 1 } });
  if (!presence) {
    try {
      const presenceId = await Prezenta.insertAsync({
        eId,
        convocatorId,
        nr: await nextNumber(eId, 'prezenta'),
        status: 'prepared',
        ...metadata,
        owner: userId,
        sys_status: 1,
        createdAt: now,
        updatedAt: now,
      });
      presence = { _id: presenceId };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      presence = await Prezenta.findOneAsync({ eId, convocatorId }, { fields: { _id: 1 } });
    }
  } else {
    await Prezenta.updateAsync({ _id: presence._id, eId }, { $set: { ...metadata, updatedAt: now, sys_status: 1 } });
  }
  if (!presence?._id) throw new Meteor.Error('presence-create-failed', 'Prezența nu a putut fi pregătită.');

  const [activeUsers, memberships] = await Promise.all([
    Meteor.users.find(
      { [`entitati.${eId}`]: { $exists: true }, 'setari.status': '1' },
      { fields: { emails: 1, profile: 1, profileExt: 1, setari: 1 } },
    ).fetchAsync(),
    CraftMemberships.find({ eId, status: 'active' }, { fields: { userId: 1, grade: 1 } }).fetchAsync(),
  ]);
  const grades = new Map(memberships.map((entry) => [entry.userId, entry.grade]));
  const deliveryTokens = [];
  let createdConfirmations = 0;
  for (const member of activeUsers) {
    const snapshot = {
      email: member.emails?.[0]?.address || '',
      nume: member.profileExt?.nume || member.setari?.nume || '',
      prenume: member.profileExt?.prenume || member.setari?.prenume || '',
    };
    const existing = await PrezentaConfirmari.findOneAsync({ eId, convocatorId, userId: member._id }, { fields: { _id: 1 } });
    if (existing) {
      await PrezentaConfirmari.updateAsync(existing._id, { $set: { idPrezenta: presence._id, ...metadata, userSnapshot: snapshot, updatedAt: now } });
      continue;
    }
    const token = Random.secret(32);
    try {
      const confirmationId = await PrezentaConfirmari.insertAsync({
        eId,
        convocatorId,
        idPrezenta: presence._id,
        nr: await nextNumber(eId, 'prezenta_confirmari'),
        userId: member._id,
        gradeAtInvitation: Number(grades.get(member._id) || 0),
        ...metadata,
        userSnapshot: snapshot,
        publicTokenHash: hashToken(token),
        status: 'pending',
        confirmareFinala: 0,
        confirmareMeniuVegetarian: 0,
        confirmareMeniuStandard: 0,
        owner: userId,
        sys_status: 1,
        createdAt: now,
        updatedAt: now,
      });
      createdConfirmations += 1;
      deliveryTokens.push({ confirmationId, userId: member._id, token });
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }
  return { presenceId: presence._id, createdConfirmations, deliveryTokens, activeUsers: activeUsers.length };
}

Meteor.methods({
  async 'craft.permissions'() {
    const { userId, eId } = await requireActiveEId(this);
    const [superAdmin, tenantAdmin, grade] = await Promise.all([
      isSuperAdmin(userId),
      isTenantAdmin(userId, eId),
      getCraftGrade(userId, eId),
    ]);
    const write = superAdmin || tenantAdmin || await Roles.userIsInRoleAsync(userId, ['convocatoare_write', 'convocatoare_admin'], { scope: eId });
    const remove = superAdmin || tenantAdmin || await Roles.userIsInRoleAsync(userId, ['convocatoare_delete', 'convocatoare_admin'], { scope: eId });
    const admin = superAdmin || tenantAdmin || await Roles.userIsInRoleAsync(userId, ['convocatoare_admin'], { scope: eId });
    return { grade, read: true, write, delete: remove, admin };
  },

  async 'craft.memberships.upsert'(targetUserId, grade) {
    check(targetUserId, String);
    check(grade, Match.Integer);
    if (![1, 2, 3].includes(grade)) throw new Meteor.Error('validation-error', 'Gradul trebuie să fie 1, 2 sau 3.');
    const { userId, eId } = await requireRole(this, 'convocatoare', 'admin');
    const target = await Meteor.users.findOneAsync({ _id: targetUserId, [`entitati.${eId}`]: { $exists: true } }, { fields: { _id: 1 } });
    if (!target) throw new Meteor.Error('not-found', 'Userul nu aparține tenantului activ.');
    await recordDegree({
      eId,
      userId: targetUserId,
      grade,
      actorId: userId,
      effectiveAt: new Date(),
      source: 'craft.memberships.upsert',
      recordIfUnchanged: false,
    });
    return { ok: true };
  },

  async 'craft.convocatoare.insert'(payload) {
    check(payload, Object);
    const { userId, eId } = await requireRole(this, 'convocatoare', 'write');
    const now = new Date();
    const id = await Convocatoare.insertAsync({
      ...sanitizeConvocator(payload),
      nr: await nextNumber(eId, 'convocatoare'),
      status: String(payload.status || 'Creat'),
      eId,
      owner: userId,
      sys_status: 1,
      createdAt: now,
      updatedAt: now,
      log: [{ type: 'create', at: now, by: userId }],
    });
    try {
      const provisioning = await preparePresenceForConvocator({ eId, convocatorId: id, userId });
      return { id, presenceId: provisioning.presenceId, createdConfirmations: provisioning.createdConfirmations };
    } catch (error) {
      await PrezentaConfirmari.removeAsync({ eId, convocatorId: id });
      await Prezenta.removeAsync({ eId, convocatorId: id });
      await Convocatoare.removeAsync({ _id: id, eId });
      throw error;
    }
  },

  async 'craft.convocatoare.update'(id, payload) {
    check(id, String);
    check(payload, Object);
    const { userId, eId } = await requireRole(this, 'convocatoare', 'write');
    const data = sanitizeConvocator(payload);
    const updated = await Convocatoare.updateAsync(
      { _id: id, eId, sys_status: 1 },
      { $set: { ...data, updatedAt: new Date(), updatedBy: userId }, $push: { log: { type: 'update', at: new Date(), by: userId, fields: Object.keys(data) } } },
    );
    if (!updated) throw new Meteor.Error('not-found', 'Convocatorul nu există în tenantul activ.');
    const provisioning = await preparePresenceForConvocator({ eId, convocatorId: id, userId });
    return { ok: true, presenceId: provisioning.presenceId, createdConfirmations: provisioning.createdConfirmations };
  },

  async 'craft.articole.insert'(documentId, payload) {
    check(documentId, String);
    check(payload, Object);
    const { userId, eId } = await requireRole(this, 'convocatoare', 'write');
    const level = Number(payload.level);
    const article = sanitizeArticle(payload);
    if (![1, 2, 3].includes(level)) throw new Meteor.Error('validation-error', 'Nivelul articolului este invalid.');
    const parent = await Convocatoare.findOneAsync({ _id: documentId, eId, sys_status: 1 }, { fields: { _id: 1 } });
    if (!parent) throw new Meteor.Error('not-found', 'Convocator inexistent.');
    const id = await DocumenteText.insertAsync({
      documentId, level, accessLevel: level, order: article.order, nr: article.order, nrArticol: article.nrArticol || `${level}.${article.order}`,
      continut: article.continut, tip: 'articol', eId, owner: userId, sys_status: 1,
      createdAt: new Date(), updatedAt: new Date(), log: [{ type: 'create', at: new Date(), by: userId }],
    });
    await normalizeArticleOrder(eId, documentId, level, id);
    return { id };
  },

  async 'craft.articole.update'(id, payload) {
    check(id, String);
    check(payload, Object);
    const { userId, eId } = await requireRole(this, 'convocatoare', 'write');
    const current = await DocumenteText.findOneAsync({ _id: id, eId, sys_status: 1 }, { fields: { documentId: 1, level: 1 } });
    if (!current) throw new Meteor.Error('not-found', 'Articol inexistent.');
    const article = sanitizeArticle(payload);
    await DocumenteText.updateAsync(id, {
      $set: { ...article, updatedAt: new Date(), updatedBy: userId },
      $push: { log: { type: 'update', at: new Date(), by: userId } },
    });
    await normalizeArticleOrder(eId, current.documentId, current.level, id);
    return { ok: true };
  },

  async 'craft.articole.remove'(id) {
    check(id, String);
    const { userId, eId } = await requireRole(this, 'convocatoare', 'delete');
    const current = await DocumenteText.findOneAsync({ _id: id, eId, sys_status: 1 }, { fields: { documentId: 1, level: 1 } });
    if (!current) throw new Meteor.Error('not-found', 'Articol inexistent.');
    await DocumenteText.updateAsync(id, {
      $set: { sys_status: 0, updatedAt: new Date(), updatedBy: userId },
      $push: { log: { type: 'remove', at: new Date(), by: userId } },
    });
    await normalizeArticleOrder(eId, current.documentId, current.level);
    return { ok: true };
  },

  async 'craft.prezenta.prepare'(convocatorId) {
    check(convocatorId, String);
    const { userId, eId } = await requireRole(this, 'prezenta', 'admin');
    return preparePresenceForConvocator({ eId, convocatorId, userId });
  },

  async 'craft.confirmare.get'(token) {
    check(token, String);
    const row = await PrezentaConfirmari.findOneAsync(
      { publicTokenHash: hashToken(token), sys_status: 1 },
      { fields: { publicTokenHash: 0, userId: 0 } },
    );
    if (!row) throw new Meteor.Error('not-found', 'Confirmare inexistentă.');
    return row;
  },

  async 'craft.confirmare.submit'(token, payload) {
    check(token, String);
    check(payload, Object);
    const allowed = pick(payload, ['confirmareTinuta', 'confirmareAgapa', 'confirmareMeniuVegetarian', 'confirmareMeniuStandard', 'motivAbsenta', 'motivAbsentaAgapa']);
    for (const key of ['confirmareTinuta', 'confirmareAgapa', 'confirmareMeniuVegetarian', 'confirmareMeniuStandard']) {
      if (allowed[key] !== undefined) allowed[key] = Boolean(allowed[key]);
    }
    for (const key of ['motivAbsenta', 'motivAbsentaAgapa']) {
      if (allowed[key] !== undefined) allowed[key] = String(allowed[key]).trim().slice(0, 1000);
    }
    const updated = await PrezentaConfirmari.updateAsync(
      { publicTokenHash: hashToken(token), sys_status: 1, confirmareFinala: { $ne: 1 } },
      { $set: { ...allowed, confirmareFinala: 1, updatedAt: new Date() } },
    );
    if (!updated) throw new Meteor.Error('not-found-or-final', 'Confirmarea nu există sau a fost deja finalizată.');
    return { ok: true };
  },

  async 'craft.documents.register'(payload) {
    check(payload, Object);
    const { userId, eId } = await requireRole(this, 'documents', 'write');
    const moduleAlias = String(payload.moduleAlias || '').trim().toLowerCase();
    const objectId = String(payload.objectId || '').trim();
    const filename = String(payload.filename || '').trim();
    if (!moduleAlias || !objectId || !filename) throw new Meteor.Error('validation-error', 'Contextul și numele fișierului sunt obligatorii.');
    const id = await Documente.insertAsync({
      eId, moduleAlias, objectId, filename: filename.slice(0, 255), mimeType: String(payload.mimeType || 'application/octet-stream'),
      privatePath: String(payload.privatePath || ''), sourceDocumentId: payload.sourceDocumentId ? String(payload.sourceDocumentId) : undefined,
      owner: userId, sys_status: 1, createdAt: new Date(), updatedAt: new Date(),
    });
    return { id };
  },
});

import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { check, Match } from 'meteor/check';
import { MongoInternals } from 'meteor/mongo';
import {
  ConceptRelations, DocumentRights, LibraryVersions, LibraryWorks, ProcessingJobs,
  StudyAnnotations, StudyConcepts, StudyDebates, StudyMessages, TextAnchors, TextNodes,
} from '../api/collections.js';
import { studyContext } from './access.js';
import { segmentDirectText } from './segmentation.js';
import { writeAuditEvent } from '/imports/system/governance/server/audit.js';

const RELATION_TYPES = ['asociat', 'dezvolta', 'contrasteaza', 'exemplifica', 'referinta'];
const DEBATE_TARGET_TYPES = ['work', 'chapter', 'section', 'paragraph', 'sentence', 'selection', 'concept', 'relation'];

function cleanText(value, max = 300) {
  return String(value || '').replace(/\0/g, '').trim().slice(0, max);
}

function cleanGrade(value) {
  const grade = Number(value || 1);
  if (![1, 2, 3].includes(grade)) throw new Meteor.Error('validation-error', 'Gradul trebuie să fie 1, 2 sau 3.');
  return grade;
}

async function ensureReadableWork(eId, id, grade) {
  const work = await LibraryWorks.findOneAsync({ _id: id, eId, status: { $ne: 'removed' }, minGrade: { $lte: grade } });
  if (!work) throw new Meteor.Error('not-found', 'Lucrarea nu există sau nu este accesibilă.');
  return work;
}

async function appendAudit(eId, actor, action, resourceType, resourceId, metadata = {}) {
  await writeAuditEvent({ actorId: actor, eId, activeEId: eId, action, entityType: resourceType, entityId: resourceId, metadata });
}

async function withMongoTransaction(callback) {
  const session = MongoInternals.defaultRemoteCollectionDriver().mongo.client.startSession();
  try { return await session.withTransaction(() => callback(session)); }
  finally { await session.endSession(); }
}

function buildAnchors(nodes) {
  const occurrences = new Map();
  return nodes.map((node) => {
    const base = `${node.type}:${node.contentHash}`;
    const occurrence = (occurrences.get(base) || 0) + 1;
    occurrences.set(base, occurrence);
    return {
      anchorKey: `${base}:${occurrence}`,
      nodeId: node._id,
      versionId: node.versionId,
      minGrade: node.minGrade,
      type: node.type,
      contentHash: node.contentHash,
    };
  });
}

Meteor.methods({
  async 'study.context'() {
    const base = await studyContext(this, 'read', 1);
    let canManageLibrary = base.superAdmin;
    let canManageStudy = base.superAdmin;
    if (!base.superAdmin) {
      try { await studyContext(this, 'write', 1, 'library'); canManageLibrary = true; } catch (error) { /* Dreptul este opțional. */ }
      try { await studyContext(this, 'write', 1, 'study'); canManageStudy = true; } catch (error) { /* Dreptul este opțional. */ }
    }
    return { eId: base.eId, grade: base.grade, canManage: canManageLibrary, canManageLibrary, canManageStudy, superAdmin: base.superAdmin };
  },

  async 'study.works.create'(payload) {
    check(payload, Object);
    const { userId, eId, grade, superAdmin } = await studyContext(this, 'write', 1, 'library');
    const title = cleanText(payload.title, 240);
    if (!title) throw new Meteor.Error('validation-error', 'Titlul este obligatoriu.');
    const minGrade = cleanGrade(payload.minGrade);
    if (!superAdmin && minGrade > grade) throw new Meteor.Error('insufficient-grade', 'Nu puteți clasifica o lucrare peste gradul activ.');
    const now = new Date();
    const workId = Random.id();
    await withMongoTransaction(async (session) => {
      await LibraryWorks.rawCollection().insertOne({
        _id: workId, eId, title, author: cleanText(payload.author, 200), edition: cleanText(payload.edition, 120),
        language: cleanText(payload.language || 'ro', 12), minGrade, status: 'draft',
        createdAt: now, createdBy: userId, updatedAt: now, updatedBy: userId,
      }, { session });
      await DocumentRights.rawCollection().insertOne({
        _id: Random.id(), eId, workId, holder: cleanText(payload.rightsHolder, 240), license: cleanText(payload.license, 120),
        source: cleanText(payload.source, 500), processingAllowed: payload.processingAllowed === true,
        storageAllowed: payload.storageAllowed === true, createdAt: now, createdBy: userId,
      }, { session });
    });
    await appendAudit(eId, userId, 'library.work.create', 'library_work', workId);
    return { id: workId };
  },

  async 'study.works.importDirectText'(workId, payload) {
    check(workId, String);
    check(payload, Object);
    const { userId, eId, grade, superAdmin } = await studyContext(this, 'write', 1, 'library');
    const work = await LibraryWorks.findOneAsync({ _id: workId, eId, status: { $ne: 'removed' } });
    if (!work) throw new Meteor.Error('not-found', 'Lucrare inexistentă.');
    if (!superAdmin && Number(work.minGrade || 1) > grade) throw new Meteor.Error('insufficient-grade', 'Gradul activ nu permite modificarea lucrării.');
    const content = String(payload.content || '');
    if (!content.trim() || content.length > 2_000_000) throw new Meteor.Error('validation-error', 'Textul trebuie să conțină între 1 și 2.000.000 de caractere.');
    const versionId = Random.id();
    const segmented = segmentDirectText({ eId, workId, versionId, content, language: work.language, minGrade: work.minGrade, actor: userId });
    const anchors = buildAnchors(segmented.nodes);
    const now = new Date();
    let version = 0;
    await withMongoTransaction(async (session) => {
      const latest = await LibraryVersions.rawCollection().findOne({ eId, workId }, { sort: { version: -1 }, projection: { version: 1 }, session });
      version = Number(latest?.version || 0) + 1;
      await LibraryVersions.rawCollection().insertOne({
        _id: versionId, eId, workId, version, sourceType: 'direct_text', sourceHash: segmented.sourceHash,
        characterCount: segmented.characterCount, nodeCount: segmented.nodes.length, status: 'review',
        createdAt: now, createdBy: userId,
      }, { session });
      if (segmented.nodes.length) await TextNodes.rawCollection().insertMany(segmented.nodes, { ordered: true, session });
      if (anchors.length) await TextAnchors.rawCollection().bulkWrite(anchors.map((anchor) => ({ updateOne: {
        filter: { eId, workId, anchorKey: anchor.anchorKey },
        update: {
          $set: { minGrade: anchor.minGrade, updatedAt: now },
          $setOnInsert: { _id: Random.id(), eId, workId, anchorKey: anchor.anchorKey, type: anchor.type, contentHash: anchor.contentHash, createdAt: now },
          $addToSet: { targets: { versionId, nodeId: anchor.nodeId } },
        },
        upsert: true,
      } })), { ordered: true, session });
      await LibraryWorks.rawCollection().updateOne({ _id: workId, eId }, { $set: { reviewVersionId: versionId, updatedAt: now, updatedBy: userId } }, { session });
    });
    await appendAudit(eId, userId, 'library.version.import-direct', 'library_version', versionId, { workId, nodeCount: segmented.nodes.length });
    return { versionId, version, nodeCount: segmented.nodes.length };
  },

  async 'study.works.publish'(workId, versionId) {
    check(workId, String);
    check(versionId, String);
    const { userId, eId, grade, superAdmin } = await studyContext(this, 'write', 1);
    const [work, version, rights] = await Promise.all([
      LibraryWorks.findOneAsync({ _id: workId, eId }),
      LibraryVersions.findOneAsync({ _id: versionId, workId, eId, status: 'review' }),
      DocumentRights.findOneAsync({ workId, eId }),
    ]);
    if (!work || !version) throw new Meteor.Error('not-found', 'Lucrarea sau versiunea nu există.');
    if (!superAdmin && Number(work.minGrade || 1) > grade) throw new Meteor.Error('insufficient-grade', 'Gradul activ nu permite publicarea lucrării.');
    if (!rights?.storageAllowed || !rights?.processingAllowed || !rights?.holder || !rights?.license) {
      throw new Meteor.Error('rights-required', 'Titularul, licența și permisiunile de stocare/procesare sunt obligatorii.');
    }
    const now = new Date();
    await withMongoTransaction(async (session) => {
      const previousVersionId = work.currentVersionId;
      if (previousVersionId && previousVersionId !== versionId) {
        await LibraryVersions.rawCollection().updateOne({ _id: previousVersionId, eId, workId }, { $set: { status: 'archived', archivedAt: now, archivedBy: userId } }, { session });
        await TextNodes.rawCollection().updateMany({ eId, versionId: previousVersionId, status: 'published' }, { $set: { status: 'archived', archivedAt: now } }, { session });
      }
      await LibraryVersions.rawCollection().updateOne({ _id: versionId, eId, workId, status: 'review' }, { $set: { status: 'published', publishedAt: now, publishedBy: userId } }, { session });
      await TextNodes.rawCollection().updateMany({ eId, versionId }, { $set: { status: 'published', publishedAt: now } }, { session });
      await LibraryWorks.rawCollection().updateOne({ _id: workId, eId }, { $set: { status: 'published', currentVersionId: versionId, reviewVersionId: null, updatedAt: now, updatedBy: userId } }, { session });
      await ProcessingJobs.rawCollection().insertOne({
        _id: Random.id(), eId, type: 'project_library_version', status: 'pending', payload: { workId, versionId }, attempts: 0,
        createdAt: now, createdBy: userId,
      }, { session });
    });
    await appendAudit(eId, userId, 'library.version.publish', 'library_version', versionId, { workId });
    return { ok: true };
  },

  async 'study.annotations.upsert'(payload) {
    check(payload, Object);
    const minGrade = cleanGrade(payload.minGrade || 1);
    const { userId, eId } = await studyContext(this, 'read', minGrade);
    const anchorId = cleanText(payload.anchorId, 120);
    const text = cleanText(payload.text, 10_000);
    if (!anchorId || !text) throw new Meteor.Error('validation-error', 'Ancora și nota sunt obligatorii.');
    const anchor = await TextAnchors.findOneAsync({ _id: anchorId, eId, minGrade: { $lte: minGrade } });
    if (!anchor) throw new Meteor.Error('not-found', 'Ancora nu este accesibilă.');
    await StudyAnnotations.upsertAsync(
      { eId, userId, anchorId, scope: 'personal' },
      { $set: { text, minGrade, workId: anchor.workId, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    );
    await appendAudit(eId, userId, 'study.annotation.upsert', 'text_anchor', anchorId);
    return { ok: true };
  },

  async 'study.debates.create'(payload) {
    check(payload, Object);
    let minGrade = cleanGrade(payload.minGrade || 1);
    const { userId, eId } = await studyContext(this, 'read', minGrade);
    const title = cleanText(payload.title, 240);
    const targetType = cleanText(payload.targetType, 40);
    const targetId = cleanText(payload.targetId, 120);
    if (!title || !DEBATE_TARGET_TYPES.includes(targetType) || !targetId) throw new Meteor.Error('validation-error', 'Titlul sau tipul obiectului dezbaterii este invalid.');
    let workId = cleanText(payload.workId, 120) || null;
    if (['chapter', 'section', 'paragraph', 'sentence'].includes(targetType)) {
      const node = await TextNodes.findOneAsync({ _id: targetId, eId, status: 'published' }, { fields: { workId: 1, minGrade: 1, text: 1 } });
      if (!node) throw new Meteor.Error('not-found', 'Fragmentul nu există.');
      minGrade = Math.max(minGrade, Number(node.minGrade || 1));
      if ((await studyContext(this, 'read', minGrade)).grade < minGrade) throw new Meteor.Error('forbidden-grade', 'Grad insuficient.');
      workId = node.workId;
    } else if (targetType === 'work') {
      const work = await ensureReadableWork(eId, targetId, (await studyContext(this, 'read', minGrade)).grade);
      minGrade = Math.max(minGrade, Number(work.minGrade || 1));
      workId = work._id;
    } else if (targetType === 'concept') {
      const concept = await StudyConcepts.findOneAsync({ _id: targetId, eId, status: 'published', minGrade: { $lte: (await studyContext(this, 'read', minGrade)).grade } });
      if (!concept) throw new Meteor.Error('not-found', 'Conceptul nu este accesibil.');
      minGrade = Math.max(minGrade, Number(concept.minGrade || 1));
    } else if (targetType === 'relation') {
      const relation = await ConceptRelations.findOneAsync({ _id: targetId, eId, status: 'published', minGrade: { $lte: (await studyContext(this, 'read', minGrade)).grade } });
      if (!relation) throw new Meteor.Error('not-found', 'Relația nu este accesibilă.');
      minGrade = Math.max(minGrade, Number(relation.minGrade || 1));
    } else if (targetType === 'selection') {
      const anchor = await TextAnchors.findOneAsync({ _id: targetId, eId, minGrade: { $lte: (await studyContext(this, 'read', minGrade)).grade } });
      if (!anchor) throw new Meteor.Error('not-found', 'Selecția nu este accesibilă.');
      minGrade = Math.max(minGrade, Number(anchor.minGrade || 1));
      workId = anchor.workId;
    }
    const id = await StudyDebates.insertAsync({
      eId, workId, title, targetType, targetId, quoteSnapshot: cleanText(payload.quoteSnapshot, 4_000), minGrade,
      status: 'active', participants: [userId], createdAt: new Date(), createdBy: userId, updatedAt: new Date(),
    });
    await appendAudit(eId, userId, 'study.debate.create', 'study_debate', id);
    return { id };
  },

  async 'study.messages.insert'(debateId, payload) {
    check(debateId, String);
    check(payload, Object);
    const { userId, eId, grade } = await studyContext(this, 'read', 1);
    const debate = await StudyDebates.findOneAsync({ _id: debateId, eId, status: 'active', minGrade: { $lte: grade } });
    if (!debate) throw new Meteor.Error('not-found', 'Dezbaterea nu este accesibilă.');
    const text = cleanText(payload.text, 20_000);
    if (!text) throw new Meteor.Error('validation-error', 'Mesajul este gol.');
    const replyToId = payload.replyToId ? cleanText(payload.replyToId, 120) : null;
    if (replyToId && !await StudyMessages.findOneAsync({ _id: replyToId, eId, debateId, status: 'active' }, { fields: { _id: 1 } })) {
      throw new Meteor.Error('validation-error', 'Mesajul la care răspundeți nu aparține dezbaterii.');
    }
    const id = await StudyMessages.insertAsync({
      eId, debateId, text, replyToId,
      quote: cleanText(payload.quote, 2_000), minGrade: debate.minGrade, status: 'active',
      createdAt: new Date(), createdBy: userId, updatedAt: new Date(), updatedBy: userId,
    });
    await StudyDebates.updateAsync(debateId, { $set: { updatedAt: new Date() }, $addToSet: { participants: userId } });
    await appendAudit(eId, userId, 'study.message.insert', 'study_message', id, { debateId });
    return { id };
  },

  async 'study.concepts.create'(payload) {
    check(payload, Object);
    const { userId, eId, grade, superAdmin } = await studyContext(this, 'write', 1, 'study');
    const name = cleanText(payload.name, 160);
    const normalizedName = name.toLocaleLowerCase('ro-RO');
    if (!name) throw new Meteor.Error('validation-error', 'Numele conceptului este obligatoriu.');
    const minGrade = cleanGrade(payload.minGrade);
    if (!superAdmin && minGrade > grade) throw new Meteor.Error('insufficient-grade', 'Nu puteți clasifica un concept peste gradul activ.');
    const id = await StudyConcepts.insertAsync({
      eId, name, normalizedName, description: cleanText(payload.description, 4_000), minGrade,
      status: payload.status === 'proposed' ? 'proposed' : 'published', createdAt: new Date(), createdBy: userId, updatedAt: new Date(),
    });
    await ProcessingJobs.insertAsync({ eId, type: 'project_concepts', status: 'pending', payload: { conceptId: id }, attempts: 0, createdAt: new Date(), createdBy: userId });
    await appendAudit(eId, userId, 'study.concept.create', 'study_concept', id);
    return { id };
  },

  async 'study.concepts.link'(payload) {
    check(payload, Object);
    const { userId, eId, grade, superAdmin } = await studyContext(this, 'write', 1, 'study');
    const type = cleanText(payload.type, 40);
    if (!RELATION_TYPES.includes(type)) throw new Meteor.Error('validation-error', 'Tip de relație invalid.');
    const fromConceptId = cleanText(payload.fromConceptId, 120);
    const toConceptId = cleanText(payload.toConceptId, 120);
    const concepts = await StudyConcepts.find({ _id: { $in: [fromConceptId, toConceptId] }, eId, status: { $ne: 'removed' }, ...(!superAdmin ? { minGrade: { $lte: grade } } : {}) }).fetchAsync();
    if (concepts.length !== 2 || fromConceptId === toConceptId) throw new Meteor.Error('validation-error', 'Conceptele sunt invalide.');
    const minGrade = Math.max(...concepts.map((entry) => Number(entry.minGrade || 1)));
    const anchorId = payload.anchorId ? cleanText(payload.anchorId, 120) : null;
    if (anchorId && !await TextAnchors.findOneAsync({ _id: anchorId, eId, minGrade: { $lte: grade } }, { fields: { _id: 1 } })) {
      throw new Meteor.Error('validation-error', 'Ancora relației nu este accesibilă în tenantul și gradul activ.');
    }
    const id = await ConceptRelations.insertAsync({
      eId, fromConceptId, toConceptId, type, justification: cleanText(payload.justification, 4_000),
      anchorId, minGrade, status: 'published',
      createdAt: new Date(), createdBy: userId,
    });
    await ProcessingJobs.insertAsync({ eId, type: 'project_concepts', status: 'pending', payload: { relationId: id }, attempts: 0, createdAt: new Date(), createdBy: userId });
    await appendAudit(eId, userId, 'study.concept.link', 'concept_relation', id, { fromConceptId, toConceptId, type });
    return { id };
  },

  async 'study.search'(query, limit = 30) {
    check(query, String);
    check(limit, Match.Integer);
    const { eId, grade } = await studyContext(this, 'read', 1);
    const cleanQuery = cleanText(query, 120);
    if (cleanQuery.length < 2) return [];
    const regex = new RegExp(cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const currentVersions = await LibraryWorks.rawCollection().distinct('currentVersionId', { eId, status: 'published', minGrade: { $lte: grade }, currentVersionId: { $type: 'string' } });
    if (!currentVersions.length) return [];
    return TextNodes.find(
      { eId, versionId: { $in: currentVersions }, status: 'published', minGrade: { $lte: grade }, type: { $in: ['chapter', 'section', 'paragraph', 'sentence'] }, text: regex },
      { fields: { workId: 1, versionId: 1, parentId: 1, type: 1, order: 1, text: 1, minGrade: 1 }, limit: Math.min(Math.max(limit, 1), 50) },
    ).fetchAsync();
  },

  async 'study.graph'() {
    const { eId, grade } = await studyContext(this, 'read', 1);
    const concepts = await StudyConcepts.find({ eId, status: 'published', minGrade: { $lte: grade } }, { fields: { name: 1, description: 1, minGrade: 1 } }).fetchAsync();
    const ids = concepts.map((entry) => entry._id);
    const relations = ids.length ? await ConceptRelations.find({ eId, status: 'published', minGrade: { $lte: grade }, fromConceptId: { $in: ids }, toConceptId: { $in: ids } }).fetchAsync() : [];
    return { nodes: concepts, edges: relations };
  },
});

DDPRateLimiter.addRule({ type: 'method', name: /^(study\.(search|messages\.insert|debates\.create|annotations\.upsert))$/, userId: (value) => Boolean(value) }, 30, 10_000);

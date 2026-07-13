import { Meteor } from 'meteor/meteor';
import {
  ConceptRelations, DocumentRights, LibraryVersions, LibraryWorks, ProcessingJobs,
  StudyAnnotations, StudyConcepts, StudyDebates, StudyMessages, TextAnchors, TextNodes,
} from '../api/collections.js';
import { studyContext } from './access.js';

Meteor.publish('study.catalog', async function studyCatalogPublication() {
  try {
    const base = await studyContext(this, 'read', 1);
    const { eId, grade } = base;
    let manage = base.superAdmin;
    if (!manage) { try { await studyContext(this, 'write', 1, 'library'); manage = true; } catch (error) { /* Publică numai catalogul aprobat. */ } }
    return LibraryWorks.find(
      { eId, status: manage ? { $in: ['published', 'draft'] } : 'published', minGrade: { $lte: grade } },
      { fields: { eId: 1, title: 1, author: 1, edition: 1, language: 1, minGrade: 1, status: 1, currentVersionId: 1, reviewVersionId: 1, updatedAt: 1 }, sort: { title: 1 } },
    );
  } catch (error) { return this.ready(); }
});

Meteor.publish('study.work', async function studyWorkPublication(workId) {
  if (typeof workId !== 'string') return this.ready();
  try {
    const { userId, eId, grade, superAdmin } = await studyContext(this, 'read', 1);
    let manage = superAdmin;
    if (!manage) { try { await studyContext(this, 'write', 1, 'library'); manage = true; } catch (error) { /* Versiunile draft rămân ascunse. */ } }
    const work = await LibraryWorks.findOneAsync({ _id: workId, eId, status: manage ? { $ne: 'removed' } : 'published', minGrade: { $lte: grade } });
    if (!work) return this.ready();
    const versionIds = [work.currentVersionId, work.reviewVersionId].filter(Boolean);
    return [
      LibraryWorks.find({ _id: workId, eId, status: manage ? { $ne: 'removed' } : 'published', minGrade: { $lte: grade } }),
      LibraryVersions.find({ eId, workId, _id: { $in: manage ? versionIds : [work.currentVersionId].filter(Boolean) } }),
      TextNodes.find(
        { eId, workId, versionId: { $in: manage ? versionIds : [work.currentVersionId].filter(Boolean) }, minGrade: { $lte: grade }, status: manage ? { $in: ['draft', 'published'] } : 'published' },
        { sort: { createdAt: 1 }, fields: { eId: 1, workId: 1, versionId: 1, parentId: 1, type: 1, order: 1, text: 1, page: 1, minGrade: 1, status: 1, createdAt: 1 } },
      ),
      TextAnchors.find({ eId, workId, minGrade: { $lte: grade }, 'targets.versionId': { $in: versionIds } }),
      StudyAnnotations.find({ eId, workId, userId, minGrade: { $lte: grade } }),
      StudyDebates.find({ eId, workId, minGrade: { $lte: grade }, status: 'active' }, { sort: { updatedAt: -1 } }),
      ...(manage ? [DocumentRights.find({ eId, workId }), ProcessingJobs.find({ eId, 'payload.workId': workId }, { sort: { createdAt: -1 }, limit: 20 })] : []),
    ];
  } catch (error) { return this.ready(); }
});

Meteor.publish('study.debate', async function studyDebatePublication(debateId) {
  if (typeof debateId !== 'string') return this.ready();
  try {
    const { eId, grade } = await studyContext(this, 'read', 1);
    const debate = await StudyDebates.findOneAsync({ _id: debateId, eId, minGrade: { $lte: grade }, status: 'active' });
    if (!debate) return this.ready();
    return [
      StudyDebates.find({ _id: debateId, eId, minGrade: { $lte: grade }, status: 'active' }),
      StudyMessages.find({ eId, debateId, minGrade: { $lte: grade }, status: 'active' }, { sort: { createdAt: 1 }, limit: 500 }),
    ];
  } catch (error) { return this.ready(); }
});

Meteor.publish('study.concepts', async function studyConceptsPublication() {
  try {
    const base = await studyContext(this, 'read', 1);
    const { eId, grade } = base;
    let manage = base.superAdmin;
    if (!manage) { try { await studyContext(this, 'write', 1, 'study'); manage = true; } catch (error) { /* Propunerile rămân ascunse. */ } }
    return [
      StudyConcepts.find({ eId, status: manage ? { $ne: 'removed' } : 'published', minGrade: { $lte: grade } }, { sort: { name: 1 } }),
      ConceptRelations.find({ eId, status: 'published', minGrade: { $lte: grade } }),
    ];
  } catch (error) { return this.ready(); }
});

import { gradeSelector } from '/imports/ui/lists/query.js';
import { publishAuthorized } from '/imports/ui/lists/authorized-publication.js';
import { Meteor } from 'meteor/meteor';
import {
  ConceptRelations, DocumentRights, LibraryVersions, LibraryWorks, ProcessingJobs,
  StudyAnnotations, StudyConcepts, StudyDebates, StudyMessages, TextAnchors, TextNodes,
} from '../api/collections.js';
import { studyContext } from './access.js';

publishAuthorized('study.catalog', async function studyCatalogPublication() {
  try {
    const base = await studyContext(this, 'read', 1);
    const { eId, grade } = base;
    let manage = base.superAdmin;
    if (!manage) { try { await studyContext(this, 'write', 1, 'library'); manage = true; } catch (error) { /* Publică numai catalogul aprobat. */ } }
    return LibraryWorks.find(
      { eId, status: manage ? { $in: ['published', 'draft'] } : 'published', ...gradeSelector(grade) },
      { fields: { eId: 1, title: 1, author: 1, edition: 1, language: 1, minGrade: 1, status: 1, currentVersionId: 1, reviewVersionId: 1, updatedAt: 1 }, sort: { title: 1 } },
    );
  } catch (error) { return this.ready(); }
});

publishAuthorized('study.work', async function studyWorkPublication(workId) {
  if (typeof workId !== 'string') return this.ready();
  try {
    const { userId, eId, grade, superAdmin } = await studyContext(this, 'read', 1);
    let manage = superAdmin;
    if (!manage) { try { await studyContext(this, 'write', 1, 'library'); manage = true; } catch (error) { /* Versiunile draft rămân ascunse. */ } }
    const work = await LibraryWorks.findOneAsync({ _id: workId, eId, status: manage ? { $ne: 'removed' } : 'published', ...gradeSelector(grade) });
    if (!work) return this.ready();
    const versionIds = [work.currentVersionId, work.reviewVersionId].filter(Boolean);
    return [
      LibraryWorks.find({ _id: workId, eId, status: manage ? { $ne: 'removed' } : 'published', ...gradeSelector(grade) }),
      LibraryVersions.find({ eId, workId, _id: { $in: manage ? versionIds : [work.currentVersionId].filter(Boolean) } }),
      TextNodes.find(
        { eId, workId, versionId: { $in: manage ? versionIds : [work.currentVersionId].filter(Boolean) }, ...gradeSelector(grade), status: manage ? { $in: ['draft', 'published'] } : 'published' },
        { sort: { createdAt: 1 }, fields: { eId: 1, workId: 1, versionId: 1, parentId: 1, type: 1, order: 1, text: 1, page: 1, minGrade: 1, status: 1, createdAt: 1 } },
      ),
      TextAnchors.find({ eId, workId, ...gradeSelector(grade), 'targets.versionId': { $in: manage ? versionIds : [work.currentVersionId].filter(Boolean) } }),
      StudyAnnotations.find({ eId, workId, userId, ...gradeSelector(grade) }),
      StudyDebates.find({ eId, workId, ...gradeSelector(grade), status: 'active' }, { sort: { updatedAt: -1 } }),
      ...(manage ? [DocumentRights.find({ eId, workId }), ProcessingJobs.find({ eId, 'payload.workId': workId }, { sort: { createdAt: -1 }, limit: 20 })] : []),
    ];
  } catch (error) { return this.ready(); }
});

publishAuthorized('study.debate', async function studyDebatePublication(debateId) {
  if (typeof debateId !== 'string') return this.ready();
  try {
    const { eId, grade } = await studyContext(this, 'read', 1);
    const debate = await StudyDebates.findOneAsync({ _id: debateId, eId, ...gradeSelector(grade), status: 'active' });
    if (!debate) return this.ready();
    const work = await LibraryWorks.findOneAsync({ _id: debate.workId, eId, status: 'published', ...gradeSelector(grade) }, { fields: { _id: 1 } });
    if (!work) return this.ready();
    return [
      StudyDebates.find({ _id: debateId, eId, ...gradeSelector(grade), status: 'active' }),
      StudyMessages.find({ eId, debateId, ...gradeSelector(grade), status: 'active' }, { sort: { createdAt: 1 }, limit: 500 }),
    ];
  } catch (error) { return this.ready(); }
});

publishAuthorized('study.concepts', async function studyConceptsPublication() {
  try {
    const base = await studyContext(this, 'read', 1);
    const { eId, grade } = base;
    let manage = base.superAdmin;
    if (!manage) { try { await studyContext(this, 'write', 1, 'study'); manage = true; } catch (error) { /* Propunerile rămân ascunse. */ } }
    const conceptIds = (await StudyConcepts.find({ eId, status: manage ? { $ne: 'removed' } : 'published', ...gradeSelector(grade) }, { fields: { _id: 1 } }).fetchAsync()).map(row => row._id);
    return [
      StudyConcepts.find({ eId, status: manage ? { $ne: 'removed' } : 'published', ...gradeSelector(grade) }, { sort: { name: 1 } }),
      ConceptRelations.find({ eId, status: 'published', fromConceptId: { $in: conceptIds }, toConceptId: { $in: conceptIds }, ...gradeSelector(grade) }),
    ];
  } catch (error) { return this.ready(); }
});

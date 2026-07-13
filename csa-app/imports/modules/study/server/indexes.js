import { Meteor } from 'meteor/meteor';
import {
  ConceptRelations, DocumentRights, LibraryVersions, LibraryWorks, ProcessingJobs,
  StudyAnnotations, StudyConcepts, StudyDebates, StudyMessages, TextAnchors, TextNodes,
} from '../api/collections.js';

Meteor.startup(async () => {
  const indexes = [
    [LibraryWorks, { eId: 1, status: 1, minGrade: 1, title: 1 }, { name: 'works_tenant_status_grade_title' }],
    [LibraryVersions, { eId: 1, workId: 1, version: -1 }, { name: 'versions_work_version', unique: true }],
    [TextNodes, { eId: 1, versionId: 1, type: 1, order: 1 }, { name: 'nodes_version_type_order' }],
    [TextNodes, { eId: 1, workId: 1, minGrade: 1, status: 1 }, { name: 'nodes_work_grade_status' }],
    [TextAnchors, { eId: 1, workId: 1, versionId: 1 }, { name: 'anchors_work_version' }],
    [TextAnchors, { eId: 1, workId: 1, anchorKey: 1 }, { name: 'anchors_stable_key', unique: true, sparse: true }],
    [StudyAnnotations, { eId: 1, userId: 1, anchorId: 1 }, { name: 'annotations_user_anchor' }],
    [StudyAnnotations, { eId: 1, userId: 1, workId: 1, minGrade: 1 }, { name: 'annotations_user_work_grade' }],
    [StudyDebates, { eId: 1, targetType: 1, targetId: 1, status: 1 }, { name: 'debates_target_status' }],
    [StudyMessages, { eId: 1, debateId: 1, createdAt: 1 }, { name: 'messages_debate_time' }],
    [StudyConcepts, { eId: 1, normalizedName: 1 }, { name: 'concept_name_tenant', unique: true }],
    [ConceptRelations, { eId: 1, fromConceptId: 1, toConceptId: 1, type: 1 }, { name: 'concept_relation_unique', unique: true }],
    [ProcessingJobs, { status: 1, type: 1, createdAt: 1 }, { name: 'jobs_status_type_time' }],
    [DocumentRights, { eId: 1, workId: 1 }, { name: 'rights_work', unique: true }],
  ];
  for (const [collection, key, options] of indexes) await collection.rawCollection().createIndex(key, options);
});

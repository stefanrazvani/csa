import { Mongo } from 'meteor/mongo';

export const LibraryWorks = new Mongo.Collection('library_works');
export const LibraryVersions = new Mongo.Collection('library_versions');
export const TextNodes = new Mongo.Collection('text_nodes');
export const TextAnchors = new Mongo.Collection('text_anchors');
export const StudyAnnotations = new Mongo.Collection('study_annotations');
export const StudyDebates = new Mongo.Collection('study_debates');
export const StudyConcepts = new Mongo.Collection('study_concepts');
export const ConceptRelations = new Mongo.Collection('concept_relations');
export const StudyMessages = new Mongo.Collection('study_messages');
export const ProcessingJobs = new Mongo.Collection('processing_jobs');
export const DocumentRights = new Mongo.Collection('document_rights');

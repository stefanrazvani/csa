import { Mongo } from 'meteor/mongo';

export const Entitati = new Mongo.Collection('entitati');
export const Module = new Mongo.Collection('module');
export const Groups = new Mongo.Collection('groups');
export const GroupMembers = new Mongo.Collection('group_members');
export const GroupModules = new Mongo.Collection('group_modules');

export const CraftMemberships = new Mongo.Collection('craft_memberships');
export const Convocatoare = new Mongo.Collection('convocatoare');
export const DocumenteText = new Mongo.Collection('documente_text');
export const Prezenta = new Mongo.Collection('prezenta');
export const PrezentaConfirmari = new Mongo.Collection('prezenta_confirmari');
export const Documente = new Mongo.Collection('documente');
export const MigrationRuns = new Mongo.Collection('migration_runs');
export const CraftCounters = new Mongo.Collection('craft_counters');

// Nucleul canonic multi-tenant. CraftMemberships rămâne disponibil pe durata
// tranziției, însă apartenența, istoricul gradului și funcțiile sunt modelate
// separat pentru a nu mai depinde de profilul global al utilizatorului.
export const LodgeMemberships = new Mongo.Collection('lodge_memberships');
export const DegreeEvents = new Mongo.Collection('degree_events');
export const OfficeDefinitions = new Mongo.Collection('office_definitions');
export const OfficeTerms = new Mongo.Collection('office_terms');
export const OfficeDelegations = new Mongo.Collection('office_delegations');
export const ExternalVisitors = new Mongo.Collection('external_visitors');
export const AuditEvents = new Mongo.Collection('audit_events');

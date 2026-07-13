import { Mongo } from 'meteor/mongo';

// Datele curente ale Fratelui. Starea masonică (apartenență, grad și funcție)
// rămâne canonică în colecțiile de guvernanță și este doar proiectată în UI.
export const BrotherDossiers = new Mongo.Collection('brother_dossiers');
export const MembershipEvents = new Mongo.Collection('membership_events');
export const BrotherDocuments = new Mongo.Collection('brother_documents');
export const DossierDocumentGrants = new Mongo.Collection('dossier_document_grants');
export const BrotherSponsors = new Mongo.Collection('brother_sponsors');
export const DossierNotes = new Mongo.Collection('dossier_notes');
export const DossierAccessEvents = new Mongo.Collection('dossier_access_events');

// Staging-ul este intenționat separat de dosarul canonic. Importul nu scrie în
// registru până când un flux ulterior de reconciliere nu este aprobat explicit.
export const DossierImportBatches = new Mongo.Collection('dossier_import_batches');
export const DossierImportRows = new Mongo.Collection('dossier_import_rows');

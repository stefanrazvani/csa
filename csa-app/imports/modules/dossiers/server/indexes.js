import { Meteor } from 'meteor/meteor';
import {
  BrotherDocuments,
  BrotherDossiers,
  BrotherSponsors,
  DossierAccessEvents,
  DossierDocumentGrants,
  DossierImportBatches,
  DossierImportRows,
  DossierNotes,
  MembershipEvents,
} from '../api/collections.js';

const INDEXES = [
  [BrotherDossiers, { eId: 1, userId: 1 }, { name: 'brother_dossier_tenant_user_uq', unique: true }],
  [BrotherDossiers, { eId: 1, 'identity.familyName': 1, 'identity.givenName': 1 }, { name: 'brother_dossier_name' }],
  [MembershipEvents, { eId: 1, userId: 1, effectiveAt: -1 }, { name: 'membership_event_timeline' }],
  [MembershipEvents, { eId: 1, userId: 1, dedupeKey: 1 }, { name: 'membership_event_dedupe_uq', unique: true, sparse: true }],
  [BrotherDocuments, { eId: 1, userId: 1, issuedAt: -1 }, { name: 'brother_document_timeline' }],
  [BrotherDocuments, { eId: 1, 'objectRef.key': 1 }, { name: 'brother_document_object_uq', unique: true, sparse: true }],
  [DossierDocumentGrants, { tokenHash: 1 }, { name: 'dossier_document_grant_token_uq', unique: true }],
  [DossierDocumentGrants, { expiresAt: 1 }, { name: 'dossier_document_grant_ttl', expireAfterSeconds: 0 }],
  [BrotherSponsors, { eId: 1, userId: 1, sponsorUserId: 1, kind: 1 }, { name: 'brother_sponsor_member' }],
  [DossierNotes, { eId: 1, userId: 1, createdAt: -1 }, { name: 'dossier_note_timeline' }],
  [DossierAccessEvents, { eId: 1, targetUserId: 1, at: -1 }, { name: 'dossier_access_target' }],
  [DossierAccessEvents, { actorId: 1, at: -1 }, { name: 'dossier_access_actor' }],
  [DossierImportBatches, { eId: 1, createdAt: -1 }, { name: 'dossier_import_batch_timeline' }],
  [DossierImportRows, { eId: 1, batchId: 1, rowIndex: 1 }, { name: 'dossier_import_row_uq', unique: true }],
  [DossierImportRows, { eId: 1, batchId: 1, status: 1 }, { name: 'dossier_import_row_status' }],
];

Meteor.startup(async () => {
  for (const [collection, keys, options] of INDEXES) {
    try {
      await collection.rawCollection().createIndex(keys, options);
    } catch (error) {
      console.error(`[dossiers:indexes] ${options.name}:`, error?.message || error);
    }
  }
});

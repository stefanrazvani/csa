import { Meteor } from 'meteor/meteor';
import {
  AuditEvents,
  DegreeEvents,
  ExternalVisitors,
  LodgeMemberships,
  OfficeDefinitions,
  OfficeDelegations,
  OfficeTerms,
} from '/imports/api/collections.js';

const INDEXES = [
  [LodgeMemberships, { eId: 1, userId: 1 }, { name: 'lodge_membership_tenant_user_uq', unique: true }],
  [LodgeMemberships, { eId: 1, matriculationNo: 1 }, {
    name: 'lodge_membership_tenant_matriculation_uq',
    unique: true,
    partialFilterExpression: { matriculationNo: { $type: 'string' } },
  }],
  [LodgeMemberships, { eId: 1, status: 1, currentGrade: 1 }, { name: 'lodge_membership_access' }],
  [DegreeEvents, { eId: 1, userId: 1, effectiveAt: -1 }, { name: 'degree_event_member_timeline' }],
  [DegreeEvents, { eId: 1, membershipId: 1, status: 1 }, { name: 'degree_event_membership_status' }],
  [DegreeEvents, { eId: 1, userId: 1, dedupeKey: 1 }, {
    name: 'degree_event_dedupe_uq',
    unique: true,
    partialFilterExpression: { dedupeKey: { $type: 'string' } },
  }],
  [OfficeDefinitions, { eId: 1, code: 1 }, { name: 'office_definition_tenant_code_uq', unique: true }],
  [OfficeDefinitions, { eId: 1, status: 1, order: 1 }, { name: 'office_definition_catalog' }],
  [OfficeTerms, { eId: 1, userId: 1, status: 1, startAt: 1, endAt: 1 }, { name: 'office_term_member_access' }],
  [OfficeTerms, { eId: 1, officeCode: 1, masonicYear: 1, status: 1 }, { name: 'office_term_year_catalog' }],
  [OfficeDelegations, { eId: 1, delegateUserId: 1, status: 1, startAt: 1, endAt: 1 }, { name: 'office_delegation_delegate_access' }],
  [OfficeDelegations, { eId: 1, officeTermId: 1, status: 1 }, { name: 'office_delegation_term' }],
  [ExternalVisitors, { eId: 1, status: 1, visitAt: -1 }, { name: 'external_visitor_tenant_status' }],
  [ExternalVisitors, { eId: 1, normalizedEmail: 1 }, {
    name: 'external_visitor_tenant_email',
    partialFilterExpression: { normalizedEmail: { $type: 'string' } },
  }],
  [AuditEvents, { eId: 1, at: -1 }, { name: 'audit_tenant_timeline' }],
  [AuditEvents, { actorId: 1, at: -1 }, { name: 'audit_actor_timeline' }],
  [AuditEvents, { requestId: 1 }, {
    name: 'audit_request_id_uq',
    unique: true,
    partialFilterExpression: { requestId: { $type: 'string' } },
  }],
  [AuditEvents, { entityType: 1, entityId: 1, at: -1 }, { name: 'audit_entity_timeline' }],
];

Meteor.startup(async () => {
  for (const [collection, keys, options] of INDEXES) {
    try {
      await collection.rawCollection().createIndex(keys, options);
    } catch (error) {
      console.error(`[governance:indexes] ${options.name}:`, error?.message || error);
    }
  }
});

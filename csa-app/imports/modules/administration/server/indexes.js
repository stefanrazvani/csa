import { Meteor } from 'meteor/meteor';
import {
  HospitalityCases, HospitalityEvents, TreasuryAccounts, TreasuryBudgetLines, TreasuryBudgets,
  TreasuryPeriods, TreasuryTransactions, VisitorInvitations,
} from '../api/collections.js';

Meteor.startup(async () => {
  const specs = [
    [TreasuryPeriods, { eId: 1, year: 1 }, { name: 'treasury_period_year', unique: true }],
    [TreasuryAccounts, { eId: 1, code: 1 }, { name: 'treasury_account_code', unique: true }],
    [TreasuryBudgets, { eId: 1, periodId: 1, status: 1 }, { name: 'treasury_budget_period' }],
    [TreasuryBudgetLines, { eId: 1, budgetId: 1, category: 1 }, { name: 'treasury_budget_line_category' }],
    [TreasuryTransactions, { eId: 1, periodId: 1, accountId: 1, occurredAt: -1 }, { name: 'treasury_transaction_scope' }],
    [TreasuryTransactions, { eId: 1, reversalOf: 1 }, { name: 'treasury_reversal_once', unique: true, sparse: true }],
    [HospitalityEvents, { eId: 1, startsAt: -1, status: 1 }, { name: 'hospitality_event_time' }],
    [HospitalityCases, { eId: 1, assignedOfficeTermId: 1, status: 1 }, { name: 'hospitality_case_assignment' }],
    [VisitorInvitations, { eId: 1, eventId: 1, email: 1 }, { name: 'visitor_invitation_event_email', unique: true, sparse: true }],
  ];
  for (const [collection, keys, options] of specs) await collection.rawCollection().createIndex(keys, options);
});

import { Mongo } from 'meteor/mongo';

export const TreasuryPeriods = new Mongo.Collection('treasury_periods');
export const TreasuryAccounts = new Mongo.Collection('treasury_accounts');
export const TreasuryBudgets = new Mongo.Collection('treasury_budgets');
export const TreasuryBudgetLines = new Mongo.Collection('treasury_budget_lines');
export const TreasuryTransactions = new Mongo.Collection('treasury_transactions');
export const HospitalityEvents = new Mongo.Collection('hospitality_events');
export const HospitalityCases = new Mongo.Collection('hospitality_cases');
export const VisitorInvitations = new Mongo.Collection('visitor_invitations');

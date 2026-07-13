import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { MongoInternals } from 'meteor/mongo';
import { check, Match } from 'meteor/check';
import {
  HospitalityCases, HospitalityEvents, TreasuryAccounts, TreasuryBudgetLines, TreasuryBudgets,
  TreasuryPeriods, TreasuryTransactions, VisitorInvitations,
} from '../api/collections.js';
import { requireAdministrationAccess } from './access.js';
import { writeAuditEvent } from '/imports/system/governance/server/audit.js';

function text(value, max = 240) { return String(value || '').replace(/\0/g, '').trim().slice(0, max); }
function amount(value) { const result = Number(value); if (!Number.isSafeInteger(result) || result < 0) throw new Meteor.Error('validation-error', 'Suma trebuie exprimată în bani ca număr întreg pozitiv.'); return result; }
function date(value, label) { const result = value instanceof Date ? value : new Date(value); if (Number.isNaN(result.getTime())) throw new Meteor.Error('validation-error', `${label} este invalidă.`); return result; }
function audit(context, userId, eId, action, entityType, entityId, metadata = {}) {
  return writeAuditEvent({ actorId: userId, eId, activeEId: eId, action, entityType, entityId, metadata, context });
}

Meteor.methods({
  async 'treasury.context'() { const access = await requireAdministrationAccess(this, 'treasury', 'read'); let canWrite = access.superAdmin; if (!canWrite) { try { await requireAdministrationAccess(this, 'treasury', 'write'); canWrite = true; } catch (error) { /* Citirea poate exista fără scriere. */ } } return { canWrite }; },
  async 'hospitality.context'() { const access = await requireAdministrationAccess(this, 'hospitality', 'read'); let canWrite = access.superAdmin; if (!canWrite) { try { await requireAdministrationAccess(this, 'hospitality', 'write'); canWrite = true; } catch (error) { /* Citirea poate exista fără scriere. */ } } return { canWrite }; },
  async 'visitorInvitations.context'() { const access = await requireAdministrationAccess(this, 'secretariat', 'read'); let canWrite = access.superAdmin; if (!canWrite) { try { await requireAdministrationAccess(this, 'secretariat', 'write'); canWrite = true; } catch (error) { /* Citirea poate exista fără scriere. */ } } return { canWrite }; },
  async 'treasury.periods.create'(payload) {
    check(payload, Object); const { userId, eId } = await requireAdministrationAccess(this, 'treasury', 'write');
    const year = text(payload.year, 20); if (!year) throw new Meteor.Error('validation-error', 'Anul masonic este obligatoriu.');
    const id = await TreasuryPeriods.insertAsync({ eId, year, startsAt: date(payload.startsAt, 'Data de început'), endsAt: date(payload.endsAt, 'Data de sfârșit'), currency: text(payload.currency || 'RON', 3), status: 'open', createdAt: new Date(), createdBy: userId });
    await audit(this, userId, eId, 'treasury.periods.create', 'treasury_period', id);
    return { id };
  },
  async 'treasury.accounts.create'(payload) {
    check(payload, Object); const { userId, eId } = await requireAdministrationAccess(this, 'treasury', 'write');
    const code = text(payload.code, 32); const name = text(payload.name, 160); if (!code || !name) throw new Meteor.Error('validation-error', 'Codul și denumirea sunt obligatorii.');
    const id = await TreasuryAccounts.insertAsync({ eId, code, name, type: ['cash', 'bank', 'reserve'].includes(payload.type) ? payload.type : 'cash', openingBalanceMinor: amount(Number(payload.openingBalanceMinor || 0)), status: 'active', createdAt: new Date(), createdBy: userId }); await audit(this, userId, eId, 'treasury.accounts.create', 'treasury_account', id); return { id };
  },
  async 'treasury.budgets.create'(payload) {
    check(payload, Object); const { userId, eId } = await requireAdministrationAccess(this, 'treasury', 'write');
    const period = await TreasuryPeriods.findOneAsync({ _id: text(payload.periodId, 120), eId, status: 'open' }); if (!period) throw new Meteor.Error('not-found', 'Perioadă inexistentă.');
    const budgetId = await TreasuryBudgets.insertAsync({ eId, periodId: period._id, name: text(payload.name, 160) || `Buget ${period.year}`, status: 'draft', createdAt: new Date(), createdBy: userId });
    const lines = Array.isArray(payload.lines) ? payload.lines.slice(0, 200) : [];
    for (const row of lines) await TreasuryBudgetLines.insertAsync({ eId, budgetId, category: text(row.category, 120), direction: row.direction === 'income' ? 'income' : 'expense', plannedMinor: amount(Number(row.plannedMinor || 0)), createdAt: new Date(), createdBy: userId });
    await audit(this, userId, eId, 'treasury.budgets.create', 'treasury_budget', budgetId, { lineCount: lines.length });
    return { id: budgetId };
  },
  async 'treasury.transactions.create'(payload) {
    check(payload, Object); const { userId, eId } = await requireAdministrationAccess(this, 'treasury', 'write');
    const [period, account] = await Promise.all([TreasuryPeriods.findOneAsync({ _id: text(payload.periodId, 120), eId, status: 'open' }), TreasuryAccounts.findOneAsync({ _id: text(payload.accountId, 120), eId, status: 'active' })]);
    if (!period || !account) throw new Meteor.Error('not-found', 'Perioada sau contul nu există.');
    const id = await TreasuryTransactions.insertAsync({ eId, periodId: period._id, accountId: account._id, direction: payload.direction === 'income' ? 'income' : 'expense', amountMinor: amount(Number(payload.amountMinor)), category: text(payload.category, 120), description: text(payload.description, 1000), occurredAt: date(payload.occurredAt, 'Data tranzacției'), documentId: payload.documentId ? text(payload.documentId, 120) : null, status: 'draft', createdAt: new Date(), createdBy: userId, updatedAt: new Date() }); await audit(this, userId, eId, 'treasury.transactions.create', 'treasury_transaction', id); return { id };
  },
  async 'treasury.transactions.approve'(id) {
    check(id, String); const { userId, eId } = await requireAdministrationAccess(this, 'treasury', 'admin');
    const updated = await TreasuryTransactions.updateAsync({ _id: id, eId, status: 'draft' }, { $set: { status: 'approved', approvedAt: new Date(), approvedBy: userId, updatedAt: new Date() } }); if (!updated) throw new Meteor.Error('invalid-state', 'Tranzacția nu poate fi aprobată.'); await audit(this, userId, eId, 'treasury.transactions.approve', 'treasury_transaction', id); return { ok: true };
  },
  async 'treasury.transactions.post'(id) {
    check(id, String); const { userId, eId } = await requireAdministrationAccess(this, 'treasury', 'write');
    const updated = await TreasuryTransactions.updateAsync({ _id: id, eId, status: 'approved' }, { $set: { status: 'posted', postedAt: new Date(), postedBy: userId, updatedAt: new Date() } }); if (!updated) throw new Meteor.Error('invalid-state', 'Tranzacția trebuie aprobată înainte de înregistrare.'); await audit(this, userId, eId, 'treasury.transactions.post', 'treasury_transaction', id); return { ok: true };
  },
  async 'treasury.transactions.reverse'(id, reason) {
    check(id, String); check(reason, String); const { userId, eId } = await requireAdministrationAccess(this, 'treasury', 'admin');
    const reversalId = Random.id();
    const session = MongoInternals.defaultRemoteCollectionDriver().mongo.client.startSession();
    try {
      await session.withTransaction(async () => {
        const raw = TreasuryTransactions.rawCollection();
        const original = await raw.findOne({ _id: id, eId, status: 'posted', reversalId: { $exists: false } }, { session });
        if (!original) throw new Meteor.Error('invalid-state', 'Numai o tranzacție înregistrată și nereversată poate fi reversată.');
        const now = new Date();
        await raw.insertOne({
          ...original, _id: reversalId, direction: original.direction === 'income' ? 'expense' : 'income',
          description: `Reversare: ${text(reason, 500)}`, reversalOf: id, status: 'posted',
          createdAt: now, createdBy: userId, postedAt: now, postedBy: userId, updatedAt: now,
        }, { session });
        const update = await raw.updateOne(
          { _id: id, eId, status: 'posted', reversalId: { $exists: false } },
          { $set: { status: 'reversed', reversedAt: now, reversedBy: userId, reversalId } },
          { session },
        );
        if (update.modifiedCount !== 1) throw new Meteor.Error('invalid-state', 'Tranzacția a fost modificată concurent.');
      });
    } finally {
      await session.endSession();
    }
    await audit(this, userId, eId, 'treasury.transactions.reverse', 'treasury_transaction', id, { reversalId });
    return { id: reversalId };
  },
  async 'hospitality.events.create'(payload) {
    check(payload, Object); const { userId, eId } = await requireAdministrationAccess(this, 'hospitality', 'write');
    const title = text(payload.title, 200); if (!title) throw new Meteor.Error('validation-error', 'Titlul este obligatoriu.');
    const id = await HospitalityEvents.insertAsync({ eId, title, description: text(payload.description, 4000), startsAt: date(payload.startsAt, 'Data de început'), endsAt: date(payload.endsAt || payload.startsAt, 'Data de sfârșit'), location: text(payload.location, 300), minGrade: [1,2,3].includes(Number(payload.minGrade)) ? Number(payload.minGrade) : 1, status: 'published', createdAt: new Date(), createdBy: userId }); await audit(this, userId, eId, 'hospitality.events.create', 'hospitality_event', id); return { id };
  },
  async 'hospitality.cases.create'(payload) {
    check(payload, Object); const { userId, eId } = await requireAdministrationAccess(this, 'hospitality', 'write');
    const subject = text(payload.subject, 200); if (!subject) throw new Meteor.Error('validation-error', 'Subiectul este obligatoriu.');
    const id = await HospitalityCases.insertAsync({ eId, subject, personId: payload.personId ? text(payload.personId, 120) : null, notes: text(payload.notes, 10_000), sensitivity: 'restricted', status: 'open', createdAt: new Date(), createdBy: userId, updatedAt: new Date() }); await audit(this, userId, eId, 'hospitality.cases.create', 'hospitality_case', id); return { id };
  },
  async 'visitorInvitations.create'(payload) {
    check(payload, Object); const { userId, eId } = await requireAdministrationAccess(this, 'secretariat', 'write');
    const email = text(payload.email, 254).toLowerCase(); const originLodge = text(payload.originLodge, 240); if (!email || !originLodge) throw new Meteor.Error('validation-error', 'Emailul și Loja de proveniență sunt obligatorii.');
    const id = await VisitorInvitations.insertAsync({ eId, eventId: text(payload.eventId, 120), email, name: text(payload.name, 200), originLodge, attestedGrade: [1,2,3].includes(Number(payload.attestedGrade)) ? Number(payload.attestedGrade) : 1, status: 'invited', accessExpiresAt: date(payload.accessExpiresAt, 'Expirarea'), sharedDocumentIds: Array.isArray(payload.sharedDocumentIds) ? payload.sharedDocumentIds.slice(0,50).map((value)=>text(value,120)) : [], createdAt: new Date(), createdBy: userId }); await audit(this, userId, eId, 'visitorInvitations.create', 'visitor_invitation', id); return { id };
  },
});

DDPRateLimiter.addRule({ type: 'method', name: /^(treasury|hospitality|visitorInvitations)\./, userId: (value) => Boolean(value) }, 40, 10_000);

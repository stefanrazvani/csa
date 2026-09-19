import { publishAuthorized } from '/imports/ui/lists/authorized-publication.js';
import { Meteor } from 'meteor/meteor';
import { getCraftGrade } from '/imports/lib/access/server.js';
import {
  HospitalityCases, HospitalityEvents, TreasuryAccounts, TreasuryBudgetLines, TreasuryBudgets,
  TreasuryPeriods, TreasuryTransactions, VisitorInvitations,
} from '../api/collections.js';
import { requireAdministrationAccess } from './access.js';

publishAuthorized('treasury.workspace', async function treasuryWorkspacePublication() {
  try {
    const { eId } = await requireAdministrationAccess(this, 'treasury', 'read');
    return [
      TreasuryPeriods.find({ eId }, { sort: { startsAt: -1 } }), TreasuryAccounts.find({ eId, status: 'active' }, { sort: { code: 1 } }),
      TreasuryBudgets.find({ eId }, { sort: { createdAt: -1 } }), TreasuryBudgetLines.find({ eId }),

    ];
  } catch (error) { return this.ready(); }
});

publishAuthorized('hospitality.events', async function hospitalityEventsPublication() {
  try {
    const { userId, eId } = await requireAdministrationAccess(this, 'hospitality', 'read');
    const grade = await getCraftGrade(userId, eId);
    return HospitalityEvents.find({ eId, status: 'published', minGrade: { $lte: Math.max(grade, 1) } }, { sort: { startsAt: 1 } });
  } catch (error) { return this.ready(); }
});

publishAuthorized('hospitality.workspace', async function hospitalityWorkspacePublication() {
  try {
    const { eId } = await requireAdministrationAccess(this, 'hospitality', 'write');
    return [HospitalityEvents.find({ eId }, { sort: { startsAt: -1 } }), HospitalityCases.find({ eId }, { sort: { updatedAt: -1 } })];
  } catch (error) { return this.ready(); }
});

publishAuthorized('visitorInvitations.workspace', async function visitorInvitationsPublication() {
  try {
    const { eId } = await requireAdministrationAccess(this, 'secretariat', 'read');
    return VisitorInvitations.find({ eId }, { sort: { createdAt: -1 } });
  } catch (error) { return this.ready(); }
});

Meteor.methods({ async 'treasury.listTotals'() { const {eId}=await requireAdministrationAccess(this,'treasury','read'); const rows=await TreasuryTransactions.rawCollection().aggregate([{$match:{eId,status:'posted'}},{$group:{_id:'$direction',total:{$sum:'$amountMinor'}}}]).toArray(); const income=rows.find(r=>r._id==='income')?.total||0; const expense=rows.find(r=>r._id==='expense')?.total||0; return {income,expense,balance:income-expense}; } });

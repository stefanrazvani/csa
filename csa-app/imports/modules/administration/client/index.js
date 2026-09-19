import './index.html';
import './rooms.css';
import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { Template } from 'meteor/templating';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import {
  HospitalityCases, HospitalityEvents, TreasuryAccounts, TreasuryPeriods, TreasuryTransactions, VisitorInvitations,
} from '../api/collections.js';
import { renderPage } from '/imports/layout/client';
import { registerDualRoute } from '/imports/system/gateway/client';

registerDualRoute(FlowRouter, '/metale', () => renderPage('treasuryWorkspace'));
registerDualRoute(FlowRouter, '/ospitalier', () => renderPage('hospitalityWorkspace'));
registerDualRoute(FlowRouter, '/vizitatori', () => renderPage('visitorWorkspace'));

function parseRoDate(value, withTime = false) { const match = String(value || '').trim().match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?$/); if (!match) throw new Error(`Data trebuie să fie ${withTime ? 'ZZ.LL.AAAA HH:mm' : 'ZZ.LL.AAAA'}.`); return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4] || 12), Number(match[5] || 0)); }
function formValues(form) { return Object.fromEntries(new FormData(form)); }
function money(minor) { return new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(Number(minor || 0) / 100); }
function dateTime(value) { return value ? new Intl.DateTimeFormat('ro-RO', { dateStyle: 'medium', timeStyle: 'short' }).format(value) : '—'; }

Template.treasuryWorkspace.onCreated(function created() { this.subscribe('treasury.workspace'); this.context = new ReactiveVar({}); this.message = new ReactiveVar(''); Meteor.callAsync('treasury.context').then((value)=>this.context.set(value)).catch((error)=>this.message.set(error.reason||error.message)); });
Template.treasuryWorkspace.helpers({
  canWrite:()=>Template.instance().context.get().canWrite, message:()=>Template.instance().message.get(), periods:()=>TreasuryPeriods.find({status:'open'},{sort:{startsAt:-1}}), accounts:()=>TreasuryAccounts.find({status:'active'},{sort:{code:1}}), transactions:()=>TreasuryTransactions.find({},{sort:{occurredAt:-1}}),
  totalIncome(){return TreasuryTransactions.find({status:'posted',direction:'income'}).fetch().reduce((sum,row)=>sum+row.amountMinor,0)}, totalExpense(){return TreasuryTransactions.find({status:'posted',direction:'expense'}).fetch().reduce((sum,row)=>sum+row.amountMinor,0)}, postedBalance(){return TreasuryTransactions.find({status:'posted'}).fetch().reduce((sum,row)=>sum+(row.direction==='income'?row.amountMinor:-row.amountMinor),0)},
  formatMoney:money, signedMoney(row){return money((row.direction==='income'?1:-1)*row.amountMinor)}, formatDate(value){return value?new Intl.DateTimeFormat('ro-RO').format(value):'—'}, directionLabel(value){return value==='income'?'Încasare':'Plată'}, isDraft:(value)=>value==='draft', isApproved:(value)=>value==='approved',
});
Template.treasuryWorkspace.events({
  async 'click .js-approve-transaction'(event,instance){try{await Meteor.callAsync('treasury.transactions.approve',event.currentTarget.dataset.id)}catch(error){instance.message.set(error.reason||error.message)}},
  async 'click .js-post-transaction'(event,instance){try{await Meteor.callAsync('treasury.transactions.post',event.currentTarget.dataset.id)}catch(error){instance.message.set(error.reason||error.message)}},
});

Template.hospitalityWorkspace.onCreated(function created(){this.context=new ReactiveVar({canWrite:false});this.message=new ReactiveVar('');Meteor.callAsync('hospitality.context').then((context)=>{this.context.set(context);}).catch((error)=>this.message.set(error.reason||error.message))});
Template.hospitalityWorkspace.helpers({canWrite:()=>Template.instance().context.get().canWrite,message:()=>Template.instance().message.get(),events:()=>HospitalityEvents.find({},{sort:{startsAt:1}}),cases:()=>HospitalityCases.find({},{sort:{updatedAt:-1}}),formatDateTime:dateTime});
Template.hospitalityWorkspace.events({
});

Template.visitorWorkspace.onCreated(function created(){this.message=new ReactiveVar('');this.context=new ReactiveVar({canWrite:false});Meteor.callAsync('visitorInvitations.context').then((context)=>{this.context.set(context);}).catch((error)=>this.message.set(error.reason||error.message))});
Template.visitorWorkspace.helpers({message:()=>Template.instance().message.get(),canWrite:()=>Template.instance().context.get().canWrite,invitations:()=>VisitorInvitations.find({},{sort:{createdAt:-1}}),formatDateTime:dateTime});

Template.treasuryWorkspace.onCreated(function(){ this.totals=new ReactiveVar({income:0,expense:0,balance:0}); });
Template.treasuryWorkspace.helpers({ totalIncome:()=>Template.instance().totals.get().income,totalExpense:()=>Template.instance().totals.get().expense,postedBalance:()=>Template.instance().totals.get().balance });

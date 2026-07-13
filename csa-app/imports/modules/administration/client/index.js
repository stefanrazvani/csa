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
  async 'submit #treasuryPeriodForm'(event,instance){event.preventDefault();try{const v=formValues(event.currentTarget);await Meteor.callAsync('treasury.periods.create',{...v,startsAt:parseRoDate(v.startsAt),endsAt:parseRoDate(v.endsAt)});event.currentTarget.reset()}catch(error){instance.message.set(error.reason||error.message)}},
  async 'submit #treasuryAccountForm'(event,instance){event.preventDefault();try{const v=formValues(event.currentTarget);await Meteor.callAsync('treasury.accounts.create',{...v,openingBalanceMinor:Math.round(Number(v.openingBalance||0)*100)});event.currentTarget.reset()}catch(error){instance.message.set(error.reason||error.message)}},
  async 'submit #treasuryTransactionForm'(event,instance){event.preventDefault();try{const v=formValues(event.currentTarget);await Meteor.callAsync('treasury.transactions.create',{...v,amountMinor:Math.round(Number(v.amount)*100),occurredAt:parseRoDate(v.occurredAt)});event.currentTarget.reset()}catch(error){instance.message.set(error.reason||error.message)}},
  async 'click .js-approve-transaction'(event,instance){try{await Meteor.callAsync('treasury.transactions.approve',event.currentTarget.dataset.id)}catch(error){instance.message.set(error.reason||error.message)}},
  async 'click .js-post-transaction'(event,instance){try{await Meteor.callAsync('treasury.transactions.post',event.currentTarget.dataset.id)}catch(error){instance.message.set(error.reason||error.message)}},
});

Template.hospitalityWorkspace.onCreated(function created(){this.context=new ReactiveVar({canWrite:false});this.message=new ReactiveVar('');Meteor.callAsync('hospitality.context').then((context)=>{this.context.set(context);this.subscribe(context.canWrite?'hospitality.workspace':'hospitality.events')}).catch((error)=>this.message.set(error.reason||error.message))});
Template.hospitalityWorkspace.helpers({canWrite:()=>Template.instance().context.get().canWrite,message:()=>Template.instance().message.get(),events:()=>HospitalityEvents.find({},{sort:{startsAt:1}}),cases:()=>HospitalityCases.find({},{sort:{updatedAt:-1}}),formatDateTime:dateTime});
Template.hospitalityWorkspace.events({
  async 'submit #hospitalityEventForm'(event,instance){event.preventDefault();try{const v=formValues(event.currentTarget);await Meteor.callAsync('hospitality.events.create',{...v,minGrade:Number(v.minGrade),startsAt:parseRoDate(v.startsAt,true),endsAt:v.endsAt?parseRoDate(v.endsAt,true):parseRoDate(v.startsAt,true)});event.currentTarget.reset()}catch(error){instance.message.set(error.reason||error.message)}},
  async 'submit #hospitalityCaseForm'(event,instance){event.preventDefault();try{await Meteor.callAsync('hospitality.cases.create',formValues(event.currentTarget));event.currentTarget.reset()}catch(error){instance.message.set(error.reason||error.message)}},
});

Template.visitorWorkspace.onCreated(function created(){this.message=new ReactiveVar('');this.context=new ReactiveVar({canWrite:false});Meteor.callAsync('visitorInvitations.context').then((context)=>{this.context.set(context);this.subscribe('visitorInvitations.workspace')}).catch((error)=>this.message.set(error.reason||error.message))});
Template.visitorWorkspace.helpers({message:()=>Template.instance().message.get(),canWrite:()=>Template.instance().context.get().canWrite,invitations:()=>VisitorInvitations.find({},{sort:{createdAt:-1}}),formatDateTime:dateTime});
Template.visitorWorkspace.events({async 'submit #visitorInvitationForm'(event,instance){event.preventDefault();try{const v=formValues(event.currentTarget);await Meteor.callAsync('visitorInvitations.create',{...v,attestedGrade:Number(v.attestedGrade),accessExpiresAt:parseRoDate(v.accessExpiresAt,true)});event.currentTarget.reset()}catch(error){instance.message.set(error.reason||error.message)}}});

import './index.html';
import './governance.css';
import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { Template } from 'meteor/templating';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { AuditEvents, LodgeMemberships, OfficeDefinitions, OfficeTerms } from '/imports/api/collections.js';
import { renderPage } from '/imports/layout/client';
import { registerDualRoute } from '/imports/system/gateway/client';

registerDualRoute(FlowRouter, '/registru', () => renderPage('governanceAdmin'));

function parseDate(value) { const match=String(value||'').trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/); if(!match) throw new Error('Data trebuie să fie ZZ.LL.AAAA.'); return new Date(Number(match[3]),Number(match[2])-1,Number(match[1]),12); }
function userDisplay(user) { return { ...user, displayName: [user.setari?.prenume,user.setari?.nume].filter(Boolean).join(' ')||user.profile?.name||user.emails?.[0]?.address||user._id, email:user.emails?.[0]?.address||'' }; }

Template.governanceAdmin.onCreated(function created(){this.tab=new ReactiveVar('members');this.message=new ReactiveVar('');this.subscribe('membership.admin','');this.subscribe('degreeEvents.admin','','');this.subscribe('officeTerms.admin','');this.subscribe('audit.recent',150,'')});
Template.governanceAdmin.helpers({
  message:()=>Template.instance().message.get(),tabActive(tab){return Template.instance().tab.get()===tab?'active':''},isTab(tab){return Template.instance().tab.get()===tab},
  users:()=>Meteor.users.find({},{sort:{'emails.0.address':1}}).fetch().map(userDisplay),
  members(){const users=new Map(Meteor.users.find({}).fetch().map((u)=>[u._id,userDisplay(u)]));return LodgeMemberships.find({},{sort:{matriculationNo:1}}).fetch().map((m)=>({...m,...(users.get(m.userId)||{displayName:m.userId,email:''})}))},
  officeDefinitions:()=>OfficeDefinitions.find({status:'active'},{sort:{order:1}}),officeTerms:()=>OfficeTerms.find({},{sort:{startAt:-1}}),auditEvents:()=>AuditEvents.find({},{sort:{at:-1}}),
  gradeLabel(grade){return {1:'Ucenic',2:'Calfă',3:'Maestru'}[Number(grade)]||'Neconfigurat'},formatDate(value){return value?new Intl.DateTimeFormat('ro-RO').format(value):'—'},formatDateTime(value){return value?new Intl.DateTimeFormat('ro-RO',{dateStyle:'short',timeStyle:'short'}).format(value):'—'},officeName(code){return OfficeDefinitions.findOne({code})?.name||code},userName(id){return userDisplay(Meteor.users.findOne(id)||{_id:id}).displayName},activeOffice(status){return status==='active'},yesNo(value){return value?'Da':'Nu'},
});
Template.governanceAdmin.events({
  'click .js-governance-tab'(event,instance){instance.tab.set(event.currentTarget.dataset.tab)},
  async 'submit #membershipForm'(event,instance){event.preventDefault();try{const v=Object.fromEntries(new FormData(event.currentTarget));await Meteor.callAsync('membership.upsert',v);instance.message.set('Apartenența a fost salvată.');event.currentTarget.reset()}catch(error){instance.message.set(error.reason||error.message)}},
  async 'submit #degreeForm'(event,instance){event.preventDefault();try{const v=Object.fromEntries(new FormData(event.currentTarget));await Meteor.callAsync('degreeEvents.record',{...v,grade:Number(v.grade),effectiveAt:parseDate(v.effectiveAt)});instance.message.set('Gradul a fost înregistrat.');event.currentTarget.reset()}catch(error){instance.message.set(error.reason||error.message)}},
  async 'submit #officeTermForm'(event,instance){event.preventDefault();try{const v=Object.fromEntries(new FormData(event.currentTarget));await Meteor.callAsync('officeTerms.assign',{...v,startAt:parseDate(v.startAt),endAt:parseDate(v.endAt)});instance.message.set('Mandatul a fost alocat.');event.currentTarget.reset()}catch(error){instance.message.set(error.reason||error.message)}},
  async 'click .js-revoke-office'(event,instance){try{await Meteor.callAsync('officeTerms.revoke',event.currentTarget.dataset.id);instance.message.set('Mandatul a fost revocat.')}catch(error){instance.message.set(error.reason||error.message)}},
});

import './client.html';
import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { gatewayMode, registerDualRoute } from '/imports/system/gateway/client';
import { renderPage } from '/imports/layout/client';
registerDualRoute(FlowRouter,'/profilul-meu',()=>renderPage('csaProfile'));
Template.csaProfile.onCreated(function(){
  this.profile=new ReactiveVar({rows:[]}); this.error=new ReactiveVar(''); this.notice=new ReactiveVar(''); this.busy=new ReactiveVar(false);
  Meteor.callAsync('profile.mine').then(value=>this.profile.set(value)).catch(error=>this.error.set(error.reason || error.message));
});
Template.csaProfile.helpers({rows:()=>Template.instance().profile.get().rows,email:()=>Template.instance().profile.get().email,error:()=>Template.instance().error.get(),notice:()=>Template.instance().notice.get(),busy:()=>Template.instance().busy.get()});
Template.csaProfile.events({async 'click .js-profile-reset'(event,instance){
  instance.busy.set(true); instance.error.set(''); instance.notice.set('');
  try {
    if(gatewayMode){ const response=await fetch('/auth/forgot-password',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:instance.profile.get().email})}); if(!response.ok) throw new Error('Solicitarea nu a putut fi procesată. Încearcă mai târziu.'); }
    else await Meteor.callAsync('profile.requestPasswordReset');
    instance.notice.set('Resetarea a fost solicitată. Verifică mesajul de la Nova Reperta, inclusiv în Spam.');
  } catch(error){instance.error.set(error.reason || error.message);} finally{instance.busy.set(false);}
}});

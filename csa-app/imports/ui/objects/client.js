import './client.html';
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Random } from 'meteor/random';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { renderPage } from '/imports/layout/client';
import { markWindowClean, closeWindowFor } from '/imports/layout/client/windows.js';
import { appPath, registerDualRoute } from '/imports/system/gateway/client';
import { objectSchemas, editorFields } from './schema.js';
const Records=new Mongo.Collection('csa_object_records');
export function objectPath(kind,id=''){return appPath(`/obiect/${encodeURIComponent(kind)}/${id?encodeURIComponent(id):'nou'}`);}
export function historyPath(kind,id){return appPath(`/istoric-obiect/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`);}
registerDualRoute(FlowRouter,'/obiect/:kind/:id',params=>renderPage('csaObjectEditor',{kind:params.kind,id:params.id==='nou'?'':params.id,defaults:params.id==='nou'?Object.fromEntries(editorFields(params.kind).map(f=>[f.name,FlowRouter.getQueryParam(f.name)]).filter(([,v])=>v!==undefined)):{}}));
registerDualRoute(FlowRouter,'/istoric-obiect/:kind/:id',params=>renderPage('csaObjectHistory',{kind:params.kind,id:params.id}));
Template.csaObjectAdd.events({'click .js-object-add'(event,instance){FlowRouter.go(objectPath(instance.data.kind)+(instance.data.parentId?`?${encodeURIComponent(instance.data.parentField)}=${encodeURIComponent(instance.data.parentId)}`:''));}});
Template.csaObjectActions.events({'click .js-object-edit'(event,instance){FlowRouter.go(objectPath(instance.data.kind,instance.data.id));},'click .js-object-history'(event,instance){FlowRouter.go(historyPath(instance.data.kind,instance.data.id));}});
function errorText(error){return error.reason || error.message || 'Operația nu a putut fi finalizată.';}
function fieldOptions(f,context,value){const rows=[...(f.options||context.choices?.[f.lookup]||[])];if(value!==''&&!rows.some(o=>String(o.value)===String(value)))rows.push({value,label:String(value)});return rows;}
function inputValue(value,type){if(!value)return value??'';if(['date','datetime-local'].includes(type)){const date=new Date(value);if(Number.isNaN(+date))return '';const local=new Date(+date-date.getTimezoneOffset()*60000).toISOString();return local.slice(0,type==='date'?10:16);}return value;}
Template.csaObjectEditor.onCreated(function(){
  this.kind=this.data.kind;this.id=this.data.id;this.scope=Random.id();this.context=new ReactiveVar(null);this.baseline=new ReactiveVar(null);this.error=new ReactiveVar('');this.notice=new ReactiveVar('');this.busy=new ReactiveVar(false);this.loaded=new ReactiveVar(false);
  this.readContext=()=>Meteor.callAsync('objects.context',this.kind,this.id).then(value=>this.context.set(value)).catch(error=>{this.error.set(errorText(error));this.loaded.set(true);});
  this.readContext();
  if(this.id){this.subscribe('objects.record',this.kind,this.id,this.scope,{onReady:()=>{this.loaded.set(true);},onStop:error=>{this.baseline.set(null);if(error)this.error.set(errorText(error));}});this.autorun(()=>{const row=Records.findOne({scope:this.scope});if(row&&!this.baseline.get())this.baseline.set(row);if(this.loaded.get()&&!row)this.baseline.set(null);});}
  else {this.baseline.set({record:this.data.defaults||{},revision:''});this.loaded.set(true);}
});
Template.csaObjectEditor.helpers({
  readerPath(){const i=Template.instance();return i.id&&['work','debate'].includes(i.kind)?appPath(`/${i.kind==='work'?'biblioteca':'dezbatere'}/${i.id}`):'';},
  title:()=>objectSchemas[Template.instance().kind]?.label || 'Obiect',modeLabel:()=>Template.instance().id?'Consultare / editare':'Adăugare',objectId:()=>Template.instance().id,
  canEdit:()=>Template.instance().context.get()?.canEdit===true,loading:()=>!Template.instance().loaded.get()||!Template.instance().context.get()&&!Template.instance().error.get(),available:()=>!!Template.instance().baseline.get(),error:()=>Template.instance().error.get(),notice:()=>Template.instance().notice.get(),busy:()=>Template.instance().busy.get(),
  fields(){const i=Template.instance(),record=i.baseline.get()?.record||{},context=i.context.get()||{};return editorFields(i.kind,i.id).filter(f=>context.canEdit||!f.transient).map(f=>{const value=inputValue(record[f.name]??f.default??'',f.type);return {...f,value:f.type==='file'?'':value,disabled:!context.canEdit||Boolean(i.id&&f.immutable),isSelect:f.type==='select',isTextarea:f.type==='textarea',isCheckbox:f.type==='checkbox',checked:value===true,widthClass:['textarea','file'].includes(f.type)?'col-12':'col-md-6',options:fieldOptions(f,context,value).map(o=>({...o,selected:String(o.value)===String(value)})),accept:f.type==='file'?'.docx,.pdf':'',autocomplete:f.type==='password'?'new-password':'off'};});},
});
Template.csaObjectEditor.events({
  async 'submit .csa-object-form'(event,i){
    event.preventDefault();if(i.busy.get())return;i.busy.set(true);i.error.set('');i.notice.set('');
    const form=event.currentTarget,raw=Object.fromEntries(new FormData(form)),file=form.elements.sourceFile?.files?.[0];
    for(const f of editorFields(i.kind,i.id)){if(f.type==='checkbox')raw[f.name]=form.elements[f.name]?.checked===true;if(i.id&&f.immutable)raw[f.name]=i.baseline.get()?.record[f.name];}
    try{
      const payload=Object.fromEntries(editorFields(i.kind,i.id).filter(f=>!f.transient).map(f=>[f.name,raw[f.name]]));
      const result=await Meteor.callAsync('objects.save',i.kind,i.id,payload,i.baseline.get()?.revision||'');
      // Preserve the created ID before an optional import, so a retry cannot duplicate the work.
      const savedId=result.id;
      if(i.kind==='work'&&(String(raw.content||'').trim()||file)){
        try{
          if(String(raw.content||'').trim())await Meteor.callAsync('study.works.importDirectText',savedId,{content:raw.content});
          else {const upload=new FormData();upload.set('workId',savedId);upload.set('file',file,file.name);const response=await fetch('/portal-api/documents',{method:'POST',credentials:'include',headers:{'X-CSA-Tenant':i.context.get().eId},body:upload});const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Importul nu a putut fi pornit.');}
        }catch(error){i.notice.set(`Lucrarea a fost salvată; importul trebuie reluat din editorul ei. ${errorText(error)}`);markWindowClean(i.firstNode);if(!i.id){window.alert(i.notice.get());FlowRouter.go(objectPath(i.kind,savedId));closeWindowFor(i.firstNode);}return;}
      }
      markWindowClean(i.firstNode);
      if(!i.id){FlowRouter.go(objectPath(i.kind,savedId));closeWindowFor(i.firstNode);}
      else {for(const f of editorFields(i.kind,i.id).filter(f=>f.transient))if(form.elements[f.name])form.elements[f.name].value='';i.notice.set('Modificările au fost salvate.');i.baseline.set(null);}
    }catch(error){i.error.set(errorText(error));}finally{i.busy.set(false);}
  },
  'click .js-editor-history'(event,i){FlowRouter.go(historyPath(i.kind,i.id));},
  'click .js-editor-close'(event,i){closeWindowFor(i.firstNode);},
  'click .js-editor-reload'(event,i){if(!window.confirm('Reîncarci datele? Modificările nesalvate din acest editor se pierd.'))return;markWindowClean(i.firstNode);i.baseline.set(i.id?Records.findOne({scope:i.scope}):{record:{},revision:''});i.error.set('');i.readContext();},
});
Template.csaObjectHistory.onCreated(function(){
  this.scope=Random.id();this.page=new ReactiveVar(0);this.result=new ReactiveVar({rows:[],more:false});this.error=new ReactiveVar('');this.loading=new ReactiveVar(true);this.request=0;
  this.refresh=async()=>{const request=++this.request;this.loading.set(true);try{const result=await Meteor.callAsync('objects.history',this.data.kind,this.data.id,this.page.get());if(request===this.request)this.result.set(result);}catch(error){if(request===this.request){this.result.set({rows:[],more:false});this.error.set(errorText(error));}}finally{if(request===this.request)this.loading.set(false);}};
  this.subscribe('objects.record',this.data.kind,this.data.id,this.scope,{onStop:error=>{this.request++;this.result.set({rows:[],more:false});this.loading.set(false);if(error)this.error.set(errorText(error));}});
  this.autorun(()=>{this.page.get();if(Records.findOne({scope:this.scope}))this.refresh();else{this.request++;this.result.set({rows:[],more:false});}});
});
Template.csaObjectHistory.helpers({title:()=>objectSchemas[Template.instance().data.kind]?.label||'Obiect',rows:()=>Template.instance().result.get().rows,error:()=>Template.instance().error.get(),loading:()=>Template.instance().loading.get(),pageNumber:()=>Template.instance().page.get()+1,firstPage:()=>Template.instance().page.get()===0,lastPage:()=>!Template.instance().result.get().more,historyDate:value=>value?new Intl.DateTimeFormat('ro-RO',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'—'});
Template.csaObjectHistory.events({'click .js-object-history-refresh'(event,i){i.refresh();},'click .js-object-history-prev'(event,i){i.page.set(Math.max(0,i.page.get()-1));},'click .js-object-history-next'(event,i){if(i.result.get().more)i.page.set(i.page.get()+1);}});

import { Meteor } from 'meteor/meteor';
import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';
import * as core from '/imports/api/collections.js';
import * as study from '/imports/modules/study/api/collections.js';
import * as admin from '/imports/modules/administration/api/collections.js';
import { requireRole, getReadableCraftGrade, requireCompositeAccess } from '/imports/lib/access/server.js';
import { studyContext } from '/imports/modules/study/server/access.js';
import { requireAdministrationAccess } from '/imports/modules/administration/server/access.js';
import { confirmationAccess } from '/imports/modules/craft/server/member-access.js';
import { publishWithReactiveDossierAccess } from '/imports/modules/dossiers/server/reactive-publication.js';
import { schemas } from './schema.js';
import { mongoListQuery, gradeSelector } from './query.js';
const responseFields = { eId:1,userId:1,convocatorId:1,nume:1,dataTinuta:1,dataConfirmare:1,status:1,confirmareFinala:1,confirmareTinuta:1,confirmareAgapa:1,confirmareMeniuStandard:1,confirmareMeniuVegetarian:1,motivAbsenta:1,motivAbsentaAgapa:1,attended:1,sys_status:1,userSnapshot:1,'delivery.state':1,'delivery.sentAt':1,'delivery.error':1 };
async function craftAccess(context) { const access=await requireRole(context,'convocatoare','read'); await requireCompositeAccess(context,{}); return {...access,grade:await getReadableCraftGrade(access.userId,access.eId).catch(()=>0)}; }
async function catalogAccess(context, alias='library') { const access=await studyContext(context,'read'); let manage=access.superAdmin; if(!manage) { try { await studyContext(context,'write',1,alias); manage=true; } catch {} } return {...access,manage}; }
const live = { sys_status:1 };
function historySelector(a,p) {
 const clauses=[{eId:a.eId},gradeSelector(a.grade,'minGrade',true)];
 if(!p.includeAccess) clauses.push({entityType:{$ne:'module'},action:{$not:/\.read$/}});
 if(p.entityType) { const aliases={convocatoare:['convocatoare','convocator'],prezenta_confirmari:['prezenta_confirmari','confirmation','presence'],brother_dossiers:['brother_dossiers','brother_dossier'],office_terms:['office_terms','office_term'],library_works:['library_works','library_work']}; clauses.push({entityType:{$in:aliases[p.entityType]||[String(p.entityType).slice(0,100)]}}); }
 if(p.actor) { const re=new RegExp(String(p.actor).slice(0,100).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'); clauses.push({$or:[{actorLabel:re},{actorId:re}]}); }
 if(p.from || p.to) { const at={}; for(const [key,op] of [['from','$gte'],['to','$lte']]) if(p[key]) { const date=new Date(p[key]); if(Number.isNaN(+date)) throw new Meteor.Error('invalid-date','Dată invalidă.'); at[op]=date; } clauses.push({at}); }
 return {$and:clauses};
}
const definitions = {
 history:{collection:core.AuditEvents,access:c=>requireCompositeAccess(c,{alias:'audit',action:'read',officeCodes:['secretary','venerable'],allowTenantAdmin:true}),selector:historySelector,fields:{source:0}},
  convocatoare:{collection:core.Convocatoare,access:craftAccess,selector:a=>({eId:a.eId,...live,...gradeSelector(a.grade,'minGrade',true)}),fields:{nr:1,nume:1,numeLoja:1,dataTinuta:1,status:1,eId:1,sys_status:1}},
  confirmations:{collection:core.PrezentaConfirmari,access:confirmationAccess,selector:a=>({eId:a.eId,userId:a.userId,...live}),fields:responseFields},
  attendance:{collection:core.PrezentaConfirmari,access:c=>requireRole(c,'prezenta','admin'),selector:(a,p)=>({eId:a.eId,convocatorId:String(p.convocatorId||''),...live}),fields:responseFields},
  library:{collection:study.LibraryWorks,access:catalogAccess,selector:a=>({eId:a.eId,status:a.manage?{$in:['published','draft']}:'published',...gradeSelector(a.grade)}),fields:{eId:1,title:1,author:1,minGrade:1,status:1,currentVersionId:1,reviewVersionId:1}},
  concepts:{collection:study.StudyConcepts,access:c=>catalogAccess(c,'study'),selector:a=>({eId:a.eId,status:a.manage?{$ne:'removed'}:'published',...gradeSelector(a.grade)}),fields:{eId:1,name:1,description:1,minGrade:1,status:1}},
  treasury:{collection:admin.TreasuryTransactions,access:c=>requireAdministrationAccess(c,'treasury','read'),selector:a=>({eId:a.eId}),fields:{eId:1,occurredAt:1,direction:1,category:1,description:1,amountMinor:1,status:1}},
  events:{collection:admin.HospitalityEvents,access:c=>requireAdministrationAccess(c,'hospitality','read'),selector:a=>({eId:a.eId,status:'published',...gradeSelector(a.grade)}),fields:{eId:1,title:1,startsAt:1,location:1,minGrade:1,status:1,description:1}},
  cases:{collection:admin.HospitalityCases,access:c=>requireAdministrationAccess(c,'hospitality','write'),selector:a=>({eId:a.eId}),fields:{eId:1,subject:1,notes:1,status:1,updatedAt:1}},
  visitors:{collection:admin.VisitorInvitations,access:c=>requireAdministrationAccess(c,'secretariat','read'),selector:a=>({eId:a.eId}),fields:{eId:1,name:1,email:1,originLodge:1,attestedGrade:1,status:1,accessExpiresAt:1}},
};
Meteor.publish('csa.list', async function (name,scope,input={},params={}) {
  if (!Object.hasOwn(definitions,name) || typeof scope!=='string' || !/^[A-Za-z0-9]{8,40}$/.test(scope) || !input || typeof input!=='object' || !params || typeof params!=='object') throw new Meteor.Error('invalid-list','Listă invalidă.');
  const definition=definitions[name]; const records=new Map(); const context=this;
  // Publish into a request-scoped client collection, not a shared unfiltered list.
  const proxy={ userId:this.userId, connection:this.connection, ready:()=>context.ready(), stop:()=>context.stop(), onStop:cb=>context.onStop(cb),
    added(collection,id,fields) { records.set(id,fields); context.added('csa_list_rows',`${scope}:${id}`,{scope,recordId:id,record:fields}); },
    changed(collection,id,fields) { const record={...records.get(id)}; for(const [key,value] of Object.entries(fields)) { if(value===undefined) delete record[key]; else record[key]=value; } records.set(id,record); context.changed('csa_list_rows',`${scope}:${id}`,{record}); },
    removed(collection,id) { records.delete(id); context.removed('csa_list_rows',`${scope}:${id}`); },
  };
  const authorize=()=>definition.access(context);
  return publishWithReactiveDossierAccess(proxy,{ initialAccess:await authorize(), reauthorize:authorize, buildStreams(access) { const {selector,options}=mongoListQuery(definition.selector(access,params),input,schemas[name]); return [{collection:definition.collection,cursor:definition.collection.find(selector,{...options,fields:definition.fields})}]; } });
});
DDPRateLimiter.addRule({type:'subscription',name:'csa.list',connectionId:()=>true},120,60000);

Meteor.methods({async 'csa.list.export'(name,input={}) {
 if(name!=='convocatoare') throw new Meteor.Error('invalid-list','Export indisponibil.');
 const definition=definitions[name],access=await definition.access(this);
 const {selector,options}=mongoListQuery(definition.selector(access,{}),input,schemas[name]);
 const rows=await definition.collection.find(selector,{...options,skip:0,limit:10001,fields:definition.fields}).fetchAsync();
 if(rows.length>10000) throw new Meteor.Error('export-limit','Restrângeți filtrele la maximum 10.000 înregistrări.');
 const current=await definition.access(this); if(current.eId!==access.eId||current.grade!==access.grade) throw new Meteor.Error('access-changed','Accesul s-a schimbat; repetați exportul.');
 return rows;
}});
DDPRateLimiter.addRule({name:'csa.list.export',userId:()=>true},10,60000);

Meteor.startup(async()=>{
 const indexes=[
  [core.Convocatoare,{eId:1,sys_status:1,dataTinuta:-1,_id:-1}],
  [core.PrezentaConfirmari,{eId:1,userId:1,sys_status:1,dataTinuta:-1,_id:-1}],
  [study.LibraryWorks,{eId:1,status:1,minGrade:1,title:1,_id:1}],
  [admin.TreasuryTransactions,{eId:1,occurredAt:-1,_id:-1}],
  [core.AuditEvents,{eId:1,at:-1,_id:-1}],
 ];
 for(const [collection,keys] of indexes) await collection.rawCollection().createIndex(keys);
});

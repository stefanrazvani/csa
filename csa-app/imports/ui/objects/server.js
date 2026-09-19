import { confirmationAccess } from '/imports/modules/craft/server/member-access.js';
import * as dossiers from '/imports/modules/dossiers/api/collections.js';
import { requireDossierAdministrator } from '/imports/modules/dossiers/server/access.js';
import { craftMethods } from '/imports/modules/craft/server/methods.js';
import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';
import { createHash } from 'node:crypto';
import * as core from '/imports/api/collections.js';
import * as study from '/imports/modules/study/api/collections.js';
import * as admin from '/imports/modules/administration/api/collections.js';
import { requireCompositeAccess, requireTenantAdmin, requireSuperAdmin, getEffectiveGrade, getReadableCraftGrade, requireRole, isSuperAdmin } from '/imports/lib/access/server.js';
import { studyContext } from '/imports/modules/study/server/access.js';
import { requireAdministrationAccess } from '/imports/modules/administration/server/access.js';
import { studyMethods } from '/imports/modules/study/server/methods.js';
import { administrationMethods } from '/imports/modules/administration/server/methods.js';
import { governanceMethods } from '/imports/system/governance/server/index.js';
import { adminMethods } from '/imports/system/admin/server/index.js';
import { publishWithReactiveDossierAccess } from '/imports/modules/dossiers/server/reactive-publication.js';
import { writeAuditEvent } from '/imports/system/governance/server/audit.js';
import { describeChanges } from '/imports/system/governance/server/change-history.js';
import { gradeSelector } from '../lists/query.js';
import { objectSchemas, editorFields, cleanPayload } from './schema.js';

const studyAccess=alias=>(c,action)=>studyContext(c,action,1,alias);
const adminAccess=alias=>(c,action)=>requireAdministrationAccess(c,alias,action);
const governanceAccess=alias=>(c,action)=>requireCompositeAccess(c,{alias,action:action==='read'?'read':'admin',officeCodes:['secretary','venerable'],allowTenantAdmin:true});
const craftAccess=alias=>async(c,action)=>{const a=await requireRole(c,alias,action);return {...a,grade:await getReadableCraftGrade(a.userId,a.eId)};};
const dossierAccess=c=>requireDossierAdministrator(c,{audit:false});
const registry={
  debate:{collection:study.StudyDebates,access:c=>studyContext(c,'read',1),methods:studyMethods,create:'study.debates.create',classified:true,aliases:['study_debate']},
  message:{collection:study.StudyMessages,access:c=>studyContext(c,'read',1),classified:true,aliases:['study_message']},
  globalUser:{collection:Meteor.users,access:async c=>{await requireSuperAdmin(c);return requireCompositeAccess(c,{});},methods:adminMethods,create:'admin.global.users.create',aliases:['user']},
  gradeAssignment:{collection:core.CraftMemberships,access:c=>requireRole(c,'convocatoare','admin'),aliases:['craft_membership']},
  article:{collection:core.DocumenteText,access:craftAccess('convocatoare'),aliases:['article']},
  convocator:{collection:core.Convocatoare,access:craftAccess('convocatoare'),classified:true,legacyGrade:true,immutable:true,aliases:['convocator']},
  presence:{collection:core.Prezenta,access:c=>requireRole(c,'prezenta','admin'),immutable:true,aliases:['presence']},
  confirmation:{collection:core.PrezentaConfirmari,access:async c=>{try{return await requireRole(c,'prezenta','admin');}catch{return {...await confirmationAccess(c),ownOnly:true};}},immutable:true,aliases:['confirmation']},
  dossier:{collection:dossiers.BrotherDossiers,access:dossierAccess,immutable:true,aliases:['brother_dossier']},
  dossierNote:{collection:dossiers.DossierNotes,access:dossierAccess,aliases:['dossier_note']},
  dossierDocument:{collection:dossiers.BrotherDocuments,access:dossierAccess,aliases:['brother_document']},
  dossierEvent:{collection:dossiers.MembershipEvents,access:dossierAccess,immutable:true,aliases:['membership_event']},
  sponsor:{collection:dossiers.BrotherSponsors,access:dossierAccess,aliases:['brother_sponsor']},
  work:{collection:study.LibraryWorks,access:studyAccess('library'),methods:studyMethods,create:'study.works.create',aliases:['library_work'],classified:true},
  concept:{collection:study.StudyConcepts,access:studyAccess('study'),methods:studyMethods,create:'study.concepts.create',aliases:['study_concept'],classified:true},
  relation:{collection:study.ConceptRelations,access:studyAccess('study'),methods:studyMethods,create:'study.concepts.link',aliases:['concept_relation'],classified:true},
  period:{collection:admin.TreasuryPeriods,access:adminAccess('treasury'),methods:administrationMethods,create:'treasury.periods.create',aliases:['treasury_period']},
  account:{collection:admin.TreasuryAccounts,access:adminAccess('treasury'),methods:administrationMethods,create:'treasury.accounts.create',aliases:['treasury_account']},
  transaction:{collection:admin.TreasuryTransactions,access:adminAccess('treasury'),methods:administrationMethods,create:'treasury.transactions.create',aliases:['treasury_transaction']},
  event:{collection:admin.HospitalityEvents,access:adminAccess('hospitality'),methods:administrationMethods,create:'hospitality.events.create',aliases:['hospitality_event'],classified:true},
  case:{collection:admin.HospitalityCases,access:c=>requireAdministrationAccess(c,'hospitality','write'),methods:administrationMethods,create:'hospitality.cases.create',aliases:['hospitality_case']},
  visitor:{collection:admin.VisitorInvitations,access:adminAccess('secretariat'),methods:administrationMethods,create:'visitorInvitations.create',aliases:['visitor_invitation']},
  membership:{collection:core.LodgeMemberships,access:governanceAccess('membership'),methods:governanceMethods,create:'membership.upsert',aliases:['lodge_membership']},
  degree:{collection:core.DegreeEvents,access:governanceAccess('degreeEvents'),methods:governanceMethods,create:'degreeEvents.record',aliases:['degree_event'],immutable:true},
  office:{collection:core.OfficeTerms,access:governanceAccess('officeTerms'),methods:governanceMethods,create:'officeTerms.assign',aliases:['office_term']},
  tenant:{collection:core.Entitati,access:(c,action,id)=>id?requireTenantAdmin(c,id):requireSuperAdmin(c).then(async()=>({...await requireCompositeAccess(c,{}),superAdmin:true})),methods:adminMethods,create:'admin.global.tenants.create',aliases:['tenant']},
  user:{collection:Meteor.users,access:c=>requireTenantAdmin(c),methods:adminMethods,create:'admin.tenant.users.create',aliases:['user']},
  group:{collection:core.Groups,access:c=>requireTenantAdmin(c),methods:adminMethods,create:'admin.tenant.groups.create',aliases:['group']},
};
function definition(kind){if(!Object.hasOwn(registry,kind)||!registry[kind].collection)throw new Meteor.Error('invalid-object','Tip de obiect invalid.');return registry[kind];}
function selector(kind,access,id){
  if(kind==='tenant')return {_id:id||access.eId};
  if(['user','globalUser'].includes(kind))return {_id:id,...(access.superAdmin?{}:{[`entitati.${access.eId}`]:{$exists:true}})};
  return {_id:id,eId:access.eId,...(access.ownOnly?{userId:access.userId}:{}),...(registry[kind].classified?gradeSelector(access.grade,'minGrade',registry[kind].legacyGrade):{})};
}
function projection(kind){
  const fields=Object.fromEntries(editorFields(kind,'existing').filter(f=>!f.transient).map(f=>[f.name,1]));
  if(kind==='tenant'||kind==='group'){delete fields.name;fields.nume=1;}
  if(['user','globalUser'].includes(kind)){delete fields.name;delete fields.email;Object.assign(fields,{'profile.name':1,'emails.address':1,'setari.status':1});}
  return {...fields,...(['article','dossier','dossierNote','dossierDocument','dossierEvent','sponsor'].includes(kind)?{userId:1,documentId:1,level:1}:{}),eId:1,status:1,minGrade:1,createdAt:1,createdBy:1,updatedAt:1};
}
function values(kind,row){const result={...row};if(kind==='tenant'||kind==='group')result.name=row.nume;if(['user','globalUser'].includes(kind)){result.name=row.profile?.name||'';result.email=row.emails?.[0]?.address||'';}return result;}
function stable(value){if(value instanceof Date)return value.toISOString();if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,stable(value[k])]));return value;}
function revision(row){return createHash('sha256').update(JSON.stringify(stable(row))).digest('hex');}
export async function objectAccess(context,kind,id,action='read'){
  const def=definition(kind), access=await def.access(context,action,id);
  access.superAdmin=await isSuperAdmin(access.userId);
  access.grade=access.superAdmin?3:(access.grade??await getEffectiveGrade(access.userId,access.eId));
  if(!id)return {...access,kind};
  const row=await def.collection.findOneAsync(selector(kind,access,id),{fields:projection(kind)});
  if(!row)throw new Meteor.Error('not-found','Obiectul nu există sau nu este accesibil.');
  if(['debate','message'].includes(kind)){const debate=kind==='debate'?row:await study.StudyDebates.findOneAsync({_id:row.debateId,eId:access.eId,status:'active',...gradeSelector(access.grade)});if(!debate||!await study.LibraryWorks.findOneAsync({_id:debate.workId,eId:access.eId,status:'published',...gradeSelector(access.grade)}))throw new Meteor.Error('not-found','Dezbatere inaccesibilă.');if(action==='write'&&row.createdBy!==access.userId&&!access.superAdmin)throw new Meteor.Error('not-authorized','Poți edita numai contribuțiile proprii.');}
  if(kind==='article'&&(row.level>access.grade||!await core.Convocatoare.findOneAsync({_id:row.documentId,eId:access.eId,sys_status:1,...gradeSelector(access.grade,'minGrade',true)})))throw new Meteor.Error('not-found','Articol inaccesibil.');
  if(['work','concept'].includes(kind)&&row.status!=='published')await def.access(context,'write',id);
  if(kind==='relation'){
    const count=await study.StudyConcepts.find({eId:access.eId,_id:{$in:[row.fromConceptId,row.toConceptId]},...gradeSelector(access.grade),status:{$ne:'removed'}}).countAsync();
    if(count!==2)throw new Meteor.Error('not-found','Conceptele relației nu sunt accesibile.');
  }
  return {...access,kind,row};
}
async function choices(context,kind,access){
  const result={};
  for(const lookup of new Set(objectSchemas[kind].fields.map(f=>f.lookup).filter(Boolean))){
    let rows=[];
    if(lookup==='works')rows=(await study.LibraryWorks.find({eId:access.eId,status:'published',...gradeSelector(access.grade)},{fields:{title:1}}).fetchAsync()).map(r=>({value:r._id,label:r.title}));
    if(lookup==='debates'){const workIds=(await study.LibraryWorks.find({eId:access.eId,status:'published',...gradeSelector(access.grade)},{fields:{_id:1}}).fetchAsync()).map(r=>r._id);rows=(await study.StudyDebates.find({eId:access.eId,workId:{$in:workIds},status:'active',...gradeSelector(access.grade)},{fields:{title:1}}).fetchAsync()).map(r=>({value:r._id,label:r.title}));}
    if(lookup==='tenants')rows=(await core.Entitati.find({status:{$ne:'inactive'}},{fields:{nume:1}}).fetchAsync()).map(r=>({value:r._id,label:r.nume}));
    if(lookup==='convocators')rows=(await core.Convocatoare.find({eId:access.eId,sys_status:1,...gradeSelector(access.grade,'minGrade',true)},{fields:{nume:1,nr:1}}).fetchAsync()).map(r=>({value:r._id,label:`${r.nr} · ${r.nume}`}));
    if(lookup==='users')rows=(await Meteor.users.find({[`entitati.${access.eId}`]:{$exists:true}},{fields:{'profile.name':1,'emails.address':1}}).fetchAsync()).map(u=>({value:u._id,label:u.profile?.name||u.emails?.[0]?.address||u._id}));
    if(lookup==='concepts')rows=(await study.StudyConcepts.find({eId:access.eId,status:{$ne:'removed'},...gradeSelector(access.grade)},{fields:{name:1}}).fetchAsync()).map(r=>({value:r._id,label:r.name}));
    if(lookup==='periods')rows=(await admin.TreasuryPeriods.find({eId:access.eId,status:'open'},{fields:{year:1}}).fetchAsync()).map(r=>({value:r._id,label:r.year}));
    if(lookup==='accounts')rows=(await admin.TreasuryAccounts.find({eId:access.eId,status:'active'},{fields:{name:1}}).fetchAsync()).map(r=>({value:r._id,label:r.name}));
    if(lookup==='offices')rows=(await core.OfficeDefinitions.find({eId:access.eId,status:'active'},{fields:{name:1,code:1}}).fetchAsync()).map(r=>({value:r.code,label:r.name}));
    result[lookup]=rows;
  }
  return result;
}
Meteor.publish('objects.record',async function(kind,id,scope){
  check(kind,String);check(id,String);check(scope,String);if(!/^[A-Za-z0-9]{8,40}$/.test(scope))throw new Meteor.Error('invalid-scope');
  const context=this,def=definition(kind),records=new Map();
  const proxy={userId:this.userId,connection:this.connection,ready:()=>context.ready(),stop:()=>context.stop(),onStop:fn=>context.onStop(fn),
    added(name,key,fields){records.set(key,fields);context.added('csa_object_records',`${scope}:${key}`,{scope,record:{_id:key,...values(kind,fields)},revision:revision(fields)});},
    changed(name,key,fields){const row={...records.get(key)};for(const [k,v] of Object.entries(fields)){if(v===undefined)delete row[k];else row[k]=v;}records.set(key,row);context.changed('csa_object_records',`${scope}:${key}`,{record:{_id:key,...values(kind,row)},revision:revision(row)});},
    removed(name,key){records.delete(key);context.removed('csa_object_records',`${scope}:${key}`);},
  };
  const authorize=()=>objectAccess(context,kind,id,'read');
  return publishWithReactiveDossierAccess(proxy,{initialAccess:await authorize(),reauthorize:authorize,authorizationCursors:access=>[def.collection.find(selector(kind,access,id)),...(['debate','message'].includes(kind)?[study.LibraryWorks.find({eId:access.eId},{fields:{status:1,minGrade:1}}),study.StudyDebates.find({eId:access.eId},{fields:{status:1,minGrade:1,workId:1}})]:[]),...(kind==='article'?[core.Convocatoare.find({eId:access.eId},{fields:{sys_status:1,minGrade:1}})]:[]),...(kind==='relation'?[study.StudyConcepts.find({eId:access.eId},{fields:{minGrade:1,status:1}})]:[])],buildStreams:access=>[{collection:def.collection,cursor:def.collection.find(selector(kind,access,id),{fields:projection(kind)})}]});
});
Meteor.methods({
  async 'objects.context'(kind,id=''){
    check(kind,String);check(id,String);const access=await objectAccess(this,kind,id,id?'read':'write');
    let canEdit=!registry[kind].immutable||!id;try{await objectAccess(this,kind,id,'write');}catch{canEdit=false;}
    if(kind==='transaction'&&id&&access.row.status!=='draft')canEdit=false;
    if(kind==='office'&&id&&access.row.status!=='active')canEdit=false;
    return {canEdit,responseAdmin:kind==='confirmation'&&!access.ownOnly,eId:access.eId,choices:canEdit?await choices(this,kind,access):{}};
  },
  async 'objects.save'(kind,id,input,expectedRevision=''){
    check(kind,String);check(id,String);check(expectedRevision,String);
    const def=definition(kind),access=await objectAccess(this,kind,id,'write');
    let payload;try{payload=cleanPayload(kind,id,input);}catch(error){throw new Meteor.Error('validation-error',error.message);}
    for(const [start,end] of [['startsAt','endsAt'],['startAt','endAt'],['issuedAt','expiresAt']])if(payload[start]&&payload[end]&&payload[end]<payload[start])throw new Meteor.Error('validation-error','Sfârșitul trebuie să urmeze începutului.');
    if(payload.minGrade>access.grade&&!access.superAdmin)throw new Meteor.Error('insufficient-grade','Gradul depășește accesul curent.');
    if(kind==='gradeAssignment'&&!id){await craftMethods['craft.memberships.upsert'].call(this,payload.userId,payload.grade);return {id:(await core.CraftMemberships.findOneAsync({eId:access.eId,userId:payload.userId}))._id};}
    if(kind==='message'&&!id){const debate=await study.StudyDebates.findOneAsync({_id:payload.debateId,eId:access.eId,status:'active',...gradeSelector(access.grade)});if(!debate||!await study.LibraryWorks.findOneAsync({_id:debate.workId,eId:access.eId,status:'published',...gradeSelector(access.grade)}))throw new Meteor.Error('not-found');return studyMethods['study.messages.insert'].call(this,payload.debateId,{text:payload.text});}
    if(kind==='article'&&!id){if(payload.level>access.grade)throw new Meteor.Error('insufficient-grade');if(!await core.Convocatoare.findOneAsync({_id:payload.documentId,eId:access.eId,sys_status:1,...gradeSelector(access.grade,'minGrade',true)}))throw new Meteor.Error('not-found');return craftMethods['craft.articole.insert'].call(this,payload.documentId,payload);}
    if(!id){
      if(!def.create)throw new Meteor.Error('unsupported-operation','Folosește butonul de adăugare din modul.');
      const result=await def.methods[def.create].call(this,kind==='group'?payload.name:payload);
      return {id:typeof result==='string'?result:result.eventId||result.id||result.membershipId};
    }
    if(def.immutable)throw new Meteor.Error('immutable-record','Evenimentele istorice se corectează printr-un eveniment nou.');
    const {_id,...before}=access.row;if(revision(before)!==expectedRevision)throw new Meteor.Error('edit-conflict','Obiectul s-a modificat. Reîncarcă înainte de salvare.');
    for(const f of editorFields(kind,id).filter(f=>f.immutable))if(String(payload[f.name]??'')!==String(values(kind,before)[f.name]??''))throw new Meteor.Error('immutable-field',`${f.label} nu se modifică.`);
    if(kind==='gradeAssignment'){await craftMethods['craft.memberships.upsert'].call(this,payload.userId,payload.grade);return {id};}
    if(kind==='article'){await craftMethods['craft.articole.update'].call(this,id,payload);return {id};}
    if(kind==='membership'){await governanceMethods['membership.upsert'].call(this,payload);return {id};}
    if(kind==='tenant'){if(access.superAdmin)await adminMethods['admin.global.tenants.update'].call(this,id,payload);else await adminMethods['admin.tenant.update'].call(this,payload);return {id};}
    if(kind==='transaction'){
      if(before.status!=='draft')throw new Meteor.Error('invalid-state','Numai drafturile pot fi modificate.');
      if(!await admin.TreasuryPeriods.findOneAsync({_id:payload.periodId,eId:access.eId,status:'open'})||!await admin.TreasuryAccounts.findOneAsync({_id:payload.accountId,eId:access.eId,status:'active'}))throw new Meteor.Error('validation-error','Perioada sau contul nu sunt disponibile.');
    }
    for(const [start,end] of [['startsAt','endsAt'],['startAt','endAt']])if(payload[start]&&payload[end]&&payload[end]<=payload[start])throw new Meteor.Error('validation-error','Sfârșitul trebuie să urmeze începutului.');
    if(kind==='office'){
      const officeDefinition=await core.OfficeDefinitions.findOneAsync({eId:access.eId,code:before.officeCode,status:'active'});if(!officeDefinition||await getEffectiveGrade(before.userId,access.eId)<Number(officeDefinition.minGrade||3))throw new Meteor.Error('insufficient-grade','Gradul actual nu permite acest mandat.');
      if(before.status!=='active')throw new Meteor.Error('invalid-state','Mandatul nu mai este activ.');
      if(await core.OfficeTerms.findOneAsync({_id:{$ne:id},eId:access.eId,userId:before.userId,officeCode:before.officeCode,status:'active',startAt:{$lte:payload.endAt},endAt:{$gte:payload.startAt}}))throw new Meteor.Error('office-term-overlap','Intervalul se suprapune cu alt mandat.');
    }
    if(kind==='concept')payload.normalizedName=payload.name.toLocaleLowerCase('ro-RO');
    if(kind==='relation'){
      const concepts=await study.StudyConcepts.find({eId:access.eId,_id:{$in:[payload.fromConceptId,payload.toConceptId]},...gradeSelector(access.grade),status:{$ne:'removed'}}).fetchAsync();
      if(concepts.length!==2)throw new Meteor.Error('validation-error','Selectează două concepte distincte și accesibile.');payload.minGrade=Math.max(...concepts.map(r=>r.minGrade));
    }
    if(['user','globalUser'].includes(kind)){payload={'profile.name':payload.name};}
    if(kind==='group')payload={nume:payload.name};
    const guarded={...selector(kind,access,id),updatedAt:before.updatedAt??{$exists:false},...(before.status?{status:before.status}:{})};
    const changed=await def.collection.updateAsync(guarded,{$set:{...payload,updatedAt:new Date(),updatedBy:access.userId}});
    if(!changed)throw new Meteor.Error('edit-conflict','Obiectul s-a modificat. Reîncarcă înainte de salvare.');
    if(['user','globalUser'].includes(kind))await writeAuditEvent({actorId:access.userId,eId:access.eId,action:'user.profile.update',entityType:'user',entityId:id,metadata:{changes:describeChanges({name:before.profile?.name},{name:payload['profile.name']})},context:this});
    if(['concept','relation'].includes(kind))await study.ProcessingJobs.insertAsync({eId:access.eId,type:'project_concepts',status:'pending',payload:{[kind==='concept'?'conceptId':'relationId']:id},attempts:0,createdAt:new Date(),createdBy:access.userId});
    return {id};
  },
  async 'objects.history'(kind,id,page=0){
    check(kind,String);check(id,String);check(page,Number);
    const access=await objectAccess(this,kind,id,'read'),def=definition(kind),safePage=Math.max(0,Math.min(10000,Math.floor(page)||0));
    const target=kind==='dossier'?{$or:[{entityType:{$in:[def.collection._name,...def.aliases]},entityId:id},{entityType:'brother_dossier',entityId:access.row.userId}]}:kind==='work'?{$or:[{entityType:{$in:[def.collection._name,...def.aliases]},entityId:id},{entityType:'library_version','metadata.workId':id}]}:{entityType:{$in:[def.collection._name,...def.aliases]},entityId:id};
    const rows=await core.AuditEvents.find({$and:[{eId:access.eId},target,gradeSelector(access.grade,'minGrade',true)]},{fields:{actorId:1,actorLabel:1,action:1,outcome:1,at:1,'metadata.changes':1},sort:{at:-1,_id:-1},skip:safePage*20,limit:21}).fetchAsync();
    await objectAccess(this,kind,id,'read');return {rows:rows.slice(0,20),more:rows.length>20};
  },
});
DDPRateLimiter.addRule({type:'method',name:/^objects\./,userId:()=>true},100,60000);

Meteor.publish('craft.confirmation.record',async function(id){
  check(id,String);const context=this;const authorize=()=>objectAccess(context,'confirmation',id,'read');
  return publishWithReactiveDossierAccess(this,{initialAccess:await authorize(),reauthorize:authorize,authorizationCursors:a=>[core.PrezentaConfirmari.find(selector('confirmation',a,id))],buildStreams:a=>[{collection:core.PrezentaConfirmari,cursor:core.PrezentaConfirmari.find(selector('confirmation',a,id),{fields:{eId:1,userId:1,nume:1,dataTinuta:1,dataConfirmare:1,confirmareTinuta:1,confirmareAgapa:1,confirmareMeniuStandard:1,confirmareMeniuVegetarian:1,motivAbsenta:1,motivAbsentaAgapa:1,status:1,sys_status:1}})}]});
});

import { DocumenteText } from '/imports/api/collections.js';
import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { registerList } from './client.js';
import { schemas, col } from './schema.js';
import { appPath } from '/imports/system/gateway/client';
const bindings=[
 ['csaHistory','rows','history',{remote:'history',sort:'at',direction:-1,label:'istoric',params:i=>i.filters}],
 ['craftConvocatoare','rows','convocatoare',{remote:'convocatoare',sort:'dataTinuta',direction:-1,label:'convocatoare'}],
 ['craftAttendance','rows','attendance',{label:'prezențe'}],
 ['craftMyConfirmations','rows','confirmations',{remote:'confirmations',sort:'dataTinuta',direction:-1,label:'confirmări'}],
 ['studyLibrary','works','library',{remote:'library',label:'bibliotecă'}],
 ['studyConcepts','concepts','concepts',{label:'concepte'}],
 ['treasuryWorkspace','transactions','treasury',{remote:'treasury',sort:'occurredAt',direction:-1,label:'registrul de metale'}],
 ['hospitalityWorkspace','events','events',{remote:'events',label:'evenimente'}],
 ['hospitalityWorkspace','cases','cases',{remote:'cases',label:'cazuri',enabled:i=>i.context.get().canWrite}],
 ['visitorWorkspace','invitations','visitors',{remote:'visitors',label:'vizitatori'}],
 ['globalAdmin','tenants','tenants',{label:'loji'}],['globalAdmin','users','users',{label:'utilizatori'}],['tenantAdmin','users','users',{label:'utilizatori'}],
 ['governanceAdmin','members','members',{label:'matricol'}],['governanceAdmin','officeTerms','offices',{label:'mandate'}],
 ['craftGradeAdmin','memberships','grades',{label:'grade'}],['dossierWorkspace','memberRows','dossiers',{label:'dosare'}],
];
for(const [template,helper,schema,options] of bindings) registerList(template,helper,schemas[schema],options);
// Small derived collections use the same controls without a second server subscription.
for(const [template,helper,columns,label] of [
 ['treasuryWorkspace','periods',[col('year','An'),col('startsAt','Început','date'),col('endsAt','Sfârșit','date'),col('status','Stare')],'perioade'],
 ['treasuryWorkspace','accounts',[col('code','Cod'),col('name','Denumire'),col('type','Tip'),col('openingBalanceMinor','Sold inițial (bani)','number')],'conturi'],
 ['studyConcepts','relations',[col('fromConceptId','Concept sursă'),col('type','Relație'),col('toConceptId','Concept destinație'),col('justification','Justificare')],'relații'],
 ['studyReader','debates',[col('title','Titlu'),col('minGrade','Grad','number'),col('updatedAt','Actualizat','date')],'dezbateri'],
 ['studyDebate','messages',[col('createdAt','Data','date'),col('createdBy','Autor'),col('text','Mesaj')],'mesaje'],
 ['dossierWorkspace','documents',[col('title','Titlu'),col('category','Categorie'),col('issuedAt','Emis','date'),col('visibility','Vizibilitate')],'documente'],
 ['dossierWorkspace','notes',[col('title','Titlu'),col('body','Conținut'),col('createdAt','Data','date')],'note'],
 ['dossierWorkspace','participationRows',schemas.confirmations,'participări'],
 ['dossierWorkspace','officeRows',schemas.offices,'mandate'],
 ['dossierWorkspace','sponsors',[col('externalName','Nume'),col('kind','Tip'),col('fromAt','Data','date')],'nași și mentori'],
 ['dossierWorkspace','timelineRows',[col('effectiveAt','Data','date'),col('label','Eveniment'),col('description','Descriere')],'parcurs'],
 ['dossierWorkspace','registryRows',[col('name','Nume'),col('matriculationNo','Matricol'),col('dataQuality','Calitate')],'registrul generat'],
 ['governanceAdmin','auditEvents',[col('at','Data','date'),col('actorId','Utilizator'),col('action','Operațiune'),col('entityType','Tip')],'audit recent'],
]) registerList(template,helper,columns,{label});
Template.studyLibrary.helpers({workAction:()=>({label:'Deschide',path:appPath('/biblioteca')})});
Template.craftMyConfirmations.helpers({responseAction:()=>({label:'Răspunde',path:appPath('/confirmari')})});
Template.dossierWorkspace.helpers({memberAction:()=>({label:'Deschide',className:'js-select-member'})});

Template.treasuryWorkspace.onCreated(function(){ this.autorun(()=>{ this.lists.transactions.rows(); Meteor.callAsync('treasury.listTotals').then(value=>this.totals.set(value)).catch(()=>this.totals.set({income:0,expense:0,balance:0})); }); });

for (const grade of [1,2,3]) registerList('craftConvocatorEditor',`articles${grade}`,[col('nr','Nr. articol','number'),col('continut','Conținut'),col('order','Ordine','number')],{label:`articole de grad ${grade}`,sort:'order',rows:i=>DocumenteText.find({documentId:i.id,level:grade,sys_status:1})});
Template.craftConvocatorEditor.helpers({articleList(grade){return Template.instance().lists[`articles${grade}`];},articlesFor(grade){return Template.instance().lists[`articles${grade}`].rows();}});
registerList('csaMigrations','comparisonRows',[col('_id','ID'),col('status','Stare')],{label:'lotul de comparație',rows:i=>i.comparison.get()?.rows||[]});

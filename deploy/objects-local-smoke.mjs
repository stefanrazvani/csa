// Disposable local preview fixtures only. Does not send email or change real passwords.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {MongoClient} from '../csa-app/node_modules/mongodb/lib/index.js';
import {DDP} from './local-ddp.mjs';
const credentials=JSON.parse(await readFile('tmp/csa-preview-access.json','utf8'));
const mongo=await new MongoClient('mongodb://127.0.0.1:18701/meteor?directConnection=true').connect(),db=mongo.db(),admin=await new DDP().connect();
const eId='csa-local-preview',prefix=`objectqa${Date.now()}`,created=[],peers=[];let userId,checks=0;
const pass=s=>{console.log('PASS '+s);checks++;};
const collections={work:'library_works',concept:'study_concepts',relation:'concept_relations',period:'treasury_periods',account:'treasury_accounts',transaction:'treasury_transactions',event:'hospitality_events',case:'hospitality_cases',visitor:'visitor_invitations',group:'groups',article:'documente_text',debate:'study_debates',message:'study_messages',office:'office_terms'};
async function add(kind,payload){const result=await admin.call('objects.save',kind,'',payload,'');assert.ok(result.id,kind+' created ID');created.push([collections[kind],result.id]);return result.id;}
async function record(peer,kind,id){const scope='Record'+randomBytes(8).toString('hex');await peer.subscribe('objects.record',kind,id,scope);return [...peer.rows.values()].find(r=>r.scope===scope);}
async function edit(kind,id,payload){const row=await record(admin,kind,id);assert.ok(row?.revision,kind+' revision');await admin.call('objects.save',kind,id,payload,row.revision);return row;}
try{
 await admin.login(credentials.email,credentials.password);assert.equal((await admin.call('membership.context')).eId,eId);
 const password=randomBytes(24).toString('base64'),email=prefix+'@example.test';
 userId=(await admin.call('objects.save','user','',{email,name:prefix,password,tenantAdmin:false},'')).id;
 await admin.call('craft.memberships.upsert',userId,3);
 const peer=await new DDP().connect();peers.push(peer);await peer.login(email,password);
 const profile=await peer.call('profile.mine');assert.equal(profile.email,email);assert.ok(!JSON.stringify(profile).includes('services'));pass('profile returns only current user, no credentials');
 const conv=await admin.call('craft.convocatoare.insert',{nume:prefix});created.push(['convocatoare',conv.id]);
 const article=await add('article',{documentId:conv.id,level:1,nrArticol:'1.1',order:1,continut:'QA article'});await edit('article',article,{documentId:conv.id,level:1,nrArticol:'1.1',order:1,continut:'QA edited article'});pass('article editor preserves domain ordering and audit');
 const confirmation=await db.collection('prezenta_confirmari').findOne({eId,userId,convocatorId:conv.id});assert.ok(confirmation);await peer.subscribe('craft.confirmation.record',confirmation._id);assert.ok((await peer.call('objects.history','confirmation',confirmation._id,0)).rows.length);const other=await db.collection('prezenta_confirmari').findOne({eId,userId:{$ne:userId},convocatorId:conv.id});if(other)await assert.rejects(peer.subscribe('craft.confirmation.record',other._id));pass('confirmation editor/history are confined to owner or secretariat');
 const base={name:prefix,description:'Initial',minGrade:1,status:'published'};
 const concept=await add('concept',base),second=await add('concept',{...base,name:prefix+' two'});
 const old=await edit('concept',concept,{...base,description:'Changed',eId:'foreign',createdBy:'attacker'});
 await assert.rejects(admin.call('objects.save','concept',concept,base,old.revision),e=>e.code==='edit-conflict');
 const persisted=await db.collection('study_concepts').findOne({_id:concept});assert.equal(persisted.description,'Changed');assert.equal(persisted.eId,eId);pass('editor saves whitelisted fields and rejects stale revision');
 const history=await admin.call('objects.history','concept',concept,0);assert.ok(history.rows.some(r=>r.actorLabel&&r.metadata?.changes?.some(c=>c.field==='description')));pass('per-object history includes actor and before/after');
 await assert.rejects(peer.call('objects.save','concept',concept,base,old.revision));pass('read permission does not grant edit');
 await add('relation',{fromConceptId:concept,toConceptId:second,type:'asociat',justification:'QA'});
 const period=await add('period',{year:prefix,startsAt:'2026-01-01',endsAt:'2026-12-31'}),account=await add('account',{code:prefix,name:prefix,type:'cash',openingBalanceMinor:0});
 const transaction=await add('transaction',{periodId:period,accountId:account,direction:'income',amountMinor:100,occurredAt:'2026-09-20',category:'QA',description:'QA'});
 await admin.call('treasury.transactions.approve',transaction);assert.equal((await admin.call('objects.context','transaction',transaction)).canEdit,false);pass('approved transactions are read-only');
 await add('event',{title:prefix,startsAt:'2026-09-22T18:00:00',endsAt:'2026-09-22T19:00:00',location:'QA',description:'QA',minGrade:1});
 const caseId=await add('case',{subject:prefix,notes:'private'});await edit('case',caseId,{subject:prefix,notes:'updated private',status:'closed'});
 await add('visitor',{name:prefix,email,originLodge:'QA',attestedGrade:1,accessExpiresAt:'2026-10-01T18:00:00',eventId:''});
 const group=await add('group',{name:prefix});await edit('group',group,{name:prefix+' renamed'});pass('treasury, hospitality, visitor and group create/edit');
 const member=await admin.call('objects.save','membership','',{userId,matriculationNo:prefix,status:'active',joinedAt:'2026-09-20'},'');assert.ok(member.id);
 const office=await add('office',{userId,officeCode:'secretary',masonicYear:'2026 QA',startAt:'2026-09-20',endAt:'2026-12-31'});pass('membership and office use existing domain validation');
 const work=await add('work',{title:prefix,author:'QA',edition:'1',language:'ro',minGrade:1,rightsHolder:'QA',license:'QA',source:'QA',storageAllowed:true,processingAllowed:true});
 const imported=await admin.call('study.works.importDirectText',work,{content:'Test document. Second sentence.'});await admin.call('study.works.publish',work,imported.versionId);
 const debate=await add('debate',{title:prefix,workId:work,targetType:'work',targetId:work,quoteSnapshot:'',minGrade:1});
 const message=await peer.call('objects.save','message','',{debateId:debate,text:'QA contribution'},'');created.push(['study_messages',message.id]);const msg=await record(peer,'message',message.id);await peer.call('objects.save','message',message.id,{debateId:debate,text:'QA edited'},msg.revision);pass('library versions preserved; members edit own discussion contributions');
 const visible=await record(peer,'work',work);assert.ok(visible);
 await db.collection('library_works').updateOne({_id:work},{$set:{minGrade:4}});
 await new Promise(r=>setTimeout(r,400));assert.ok(![...peer.rows.values()].some(r=>r.scope===visible.scope));await assert.rejects(peer.call('objects.history','work',work,0));pass('reclassification retracts record and denies history');
 const foreign=prefix+'foreign';await db.collection('study_concepts').insertOne({_id:foreign,eId:'foreign',name:prefix,minGrade:1,status:'published'});created.push(['study_concepts',foreign]);await assert.rejects(peer.call('objects.context','concept',foreign));await assert.rejects(peer.call('objects.history','concept',foreign,0));pass('foreign-tenant editor and history fail closed');
 await assert.rejects(peer.call('objects.context','services',''));pass('unregistered object types fail closed');
 console.log(`objects-local-smoke: ${checks} checks passed`);
}finally{
 for(const peer of peers)peer.close();admin.close();
 for(const [collection,id] of created)if(collection)await db.collection(collection).deleteOne({_id:id,eId:{$in:[eId,'foreign']}});
 const convIds=created.filter(([c])=>c==='convocatoare').map(([,id])=>id);for(const c of ['prezenta','prezenta_confirmari'])await db.collection(c).deleteMany({eId,convocatorId:{$in:convIds}});
 const workIds=created.filter(([c])=>c==='library_works').map(([,id])=>id),conceptIds=created.filter(([c])=>c==='study_concepts').map(([,id])=>id);
 for(const c of ['library_versions','document_rights','text_nodes','text_anchors'])await db.collection(c).deleteMany({eId,workId:{$in:workIds}});
 await db.collection('processing_jobs').deleteMany({eId,$or:[{'payload.workId':{$in:workIds}},{'payload.conceptId':{$in:conceptIds}}]});
 if(userId){for(const c of ['lodge_memberships','craft_memberships','degree_events'])await db.collection(c).deleteMany({eId,userId});await db.collection('role-assignment').deleteMany({'user._id':userId});await db.collection('users').deleteOne({_id:userId,[`entitati.${eId}`]:{$exists:true}});}
 await mongo.close();
}

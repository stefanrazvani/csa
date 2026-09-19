// Disposable local preview only; no real members, mail, or production mutation.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { MongoClient } from '../csa-app/node_modules/mongodb/lib/index.js';
import { DDP } from './local-ddp.mjs';
const credentials=JSON.parse(await readFile(process.argv[2]||'tmp/csa-preview-access.json','utf8'));
const dbClient=await new MongoClient('mongodb://127.0.0.1:18701/meteor?directConnection=true').connect();
const db=dbClient.db(); const eId='csa-local-preview'; const prefix=`listcheck${Date.now()}`;
const admin=await new DDP().connect(); const peers=[]; const userIds=[]; let checks=0;
const pass=label=>{console.log('PASS '+label);checks++;};
async function until(predicate) { const end=Date.now()+8000; while(Date.now()<end) { if(predicate()) return; await new Promise(r=>setTimeout(r,50)); } assert.ok(predicate(),'Reactive update timeout'); }
const rows=(peer,scope)=>[...peer.rows.entries()].filter(([key,row])=>key.startsWith('csa_list_rows:')&&row.scope===scope).map(([,r])=>r.record);
try {
 await admin.login(credentials.email,credentials.password);
 assert.equal((await admin.call('membership.context')).eId,eId);
 for(let grade=1;grade<=3;grade++) {
  const email=`${prefix}-${grade}@example.test`,password=randomBytes(24).toString('base64');
  const id=await admin.call('admin.tenant.users.create',{email,password,name:`List QA ${grade}`,tenantAdmin:false});userIds.push(id);
  await admin.call('craft.memberships.upsert',id,grade);
  const peer=await new DDP().connect();peers.push(peer);await peer.login(email,password);
 }
 const works=[];for(let grade=1;grade<=3;grade++)for(let n=0;n<25;n++)works.push({_id:`${prefix}g${grade}n${String(n).padStart(2,'0')}`,eId,title:`${prefix} Știință ${grade} ${String(n).padStart(2,'0')}`,author:'Autor QA',minGrade:grade,status:'published'});
 works.push({_id:`${prefix}foreign`,eId:'foreign-tenant',title:prefix,minGrade:1,status:'published'});
 await db.collection('library_works').insertMany(works);
 for(let i=0;i<3;i++) { const scope=`GradeView${i+1}`;await peers[i].subscribe('csa.list','library',scope,{search:prefix,size:100,sort:'minGrade'},{eId:'foreign-tenant',grade:3});const result=rows(peers[i],scope);assert.equal(result.length,25*(i+1));assert.ok(result.every(r=>r.eId===eId&&r.minGrade<=i+1));pass(`grade ${i+1}: only authorized tenant/content transmitted`); }
 await peers[0].subscribe('csa.list','library','SearchView1',{search:prefix,filterField:'minGrade',filter:'3',size:100},{});assert.equal(rows(peers[0],'SearchView1').length,0);pass('filter cannot elevate grade');
 await peers[0].subscribe('csa.list','library','PageFirst1',{search:prefix,sort:'title',size:10,page:0},{});
 await peers[0].subscribe('csa.list','library','PageSecond1',{search:prefix,sort:'title',size:10,page:1},{});
 const first=rows(peers[0],'PageFirst1').sort((a,b)=>a.title.localeCompare(b.title));const second=rows(peers[0],'PageSecond1').sort((a,b)=>a.title.localeCompare(b.title));assert.equal(first.length,11);assert.equal(second.length,11);assert.equal(new Set([...first.slice(0,10),...second.slice(0,10)].map(r=>r.title)).size,20);pass('server pagination bounded, stable, independent per window');
 await peers[0].subscribe('csa.list','library','AccentView1',{search:'stiinta',filterField:'author',filter:'Autor QA',size:100},{});assert.equal(rows(peers[0],'AccentView1').length,25);pass('accent-insensitive search combines with column filtering');
 await peers[2].subscribe('study.catalog');
 await db.collection('lodge_memberships').updateOne({userId:userIds[2],eId},{$set:{currentGrade:1}});
 await until(()=>rows(peers[2],'GradeView3').length===25 && ![...peers[2].rows.entries()].some(([key,row])=>key.startsWith('library_works:')&&row.minGrade>1));pass('downgrade retracts high-grade rows in both new and compatibility subscriptions');
 const lowered=works.find(r=>r.eId===eId&&r.minGrade===1);
 await db.collection('library_works').updateOne({_id:lowered._id},{$set:{minGrade:3}});
 await until(()=>rows(peers[0],'GradeView1').length===24);pass('document reclassification removes inaccessible rows immediately');
 await db.collection('lodge_memberships').updateOne({userId:userIds[1],eId},{$set:{status:'suspended'}});
 await until(()=>rows(peers[1],'GradeView2').length===0);pass('suspension retracts all rows without reconnect');
 await assert.rejects(peers[0].subscribe('csa.list','treasury','DeniedTreasury',{},{}));pass('grade alone never grants financial office permissions');
 await assert.rejects(peers[0].subscribe('csa.list','users','UnknownDataset',{},{}));pass('unregistered datasets fail closed');
 console.log(`list-local-smoke: ${checks} checks passed`);
} finally {
 for(const peer of peers)peer.close();admin.close();
 await db.collection('library_works').deleteMany({_id:{$regex:`^${prefix}`},eId:{$in:[eId,'foreign-tenant']}});
 for(const name of ['lodge_memberships','craft_memberships','degree_events'])await db.collection(name).deleteMany({eId,userId:{$in:userIds}});
 await db.collection('role-assignment').deleteMany({'user._id':{$in:userIds}});
 await db.collection('users').deleteMany({_id:{$in:userIds},[`entitati.${eId}`]:{$exists:true}});await dbClient.close();
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanPayload,editorFields} from './schema.js';
test('object payloads ignore tenant, roles and operator injection',()=>{
 const p=cleanPayload('concept','id',{name:'Test',description:'Text',minGrade:1,status:'published',eId:'foreign',roles:['super_admin'],$set:{status:'removed'}});
 assert.deepEqual(Object.keys(p),['name','description','minGrade','status']);
 assert.throws(()=>cleanPayload('concept','id',{...p,name:{$ne:null}}));
});
test('password fields are create-only; metadata edits cannot carry credentials',()=>{
 const p=cleanPayload('user','id',{email:'user@example.test',name:'Name',password:'injected',tenantAdmin:true});
 assert.deepEqual(p,{email:'user@example.test',name:'Name'});
 assert.ok(!editorFields('globalUser','id').some(f=>f.type==='password'));
});
test('money, dates and classifications reject malformed data',()=>{
 assert.throws(()=>cleanPayload('transaction','',{periodId:'p',accountId:'a',direction:'income',amountMinor:1.5,occurredAt:'2026-09-20'}));
 assert.throws(()=>cleanPayload('concept','',{name:'N',minGrade:4,status:'published'}));
 assert.throws(()=>cleanPayload('period','',{year:'2026',startsAt:'invalid',endsAt:'2026-12-31'}));
});

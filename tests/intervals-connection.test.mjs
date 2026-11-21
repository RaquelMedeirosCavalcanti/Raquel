import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import * as runs from '../lib/runs.ts';
import * as secrets from '../lib/intervals-secret.ts';
import * as workouts from '../lib/intervals-workouts.ts';
import * as structure from '../lib/intervals-structure.ts';
function loadTs(file,imports){
 const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};new Function('exports','require',code)(exports,id=>{if(!(id in imports))throw Error('Unexpected import '+id);return imports[id]});return exports;
}
function harness(){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../drizzle/0003_intervals_connections.sql',import.meta.url),'utf8'));
 const env={INTERVALS_ENCRYPTION_KEY:btoa('01234567890123456789012345678901'),DB:{
  prepare(sql){return {bind(...params){return {
   first:async()=>db.prepare(sql).get(...params)||null,
   run:async()=>({meta:{changes:Number(db.prepare(sql).run(...params).changes)}})
  };}};}
 }};
 const plan={id:'owner:1',kind:'run',date:runs.today(),status:'planned',title:'Leve',hasPlan:true,planNotes:'',steps:[{label:'Corrida',detail:'3 km · 6:40–7:30 min/km'}]};
 let missingPace=false,badStructure=false,sent=[],user={userId:'owner',email:'owner@test.local'};
 const connection=loadTs('../lib/intervals-connection.ts',{'cloudflare:workers':{env},'./runs':runs,'./session-store':{sessionsForUser:async()=>[plan]},'./intervals-api':{checkIntervalsKey:async()=>({id:'123',name:'Conta de teste'}),checkIntervalsRunSettings:async()=>{if(missingPace)throw Error('Configure o Ritmo de limiar');},uploadIntervalsWorkouts:async(_key,items)=>{sent.push(...items);return items.map((item,i)=>({id:100+i,external_id:item.external_id,workout_doc:{steps:badStructure?[]:[{distance:3000,intensity:'active',pace:{start:400,end:450,units:'secs/km'}}]}}));}},'./intervals-secret':secrets,'./intervals-workouts':workouts,'./intervals-structure':structure});
 const route=loadTs('../app/api/intervals/route.ts',{'../../auth':{getAppUser:async()=>user},'../../../lib/site-access':{canManageTraining:u=>u?.email==='owner@test.local',sameOrigin:req=>req.headers.get('origin')===new URL(req.url).origin},'../../../lib/runs':runs,'../../../lib/intervals-connection':connection});
 return {db,connection,route,plan,sent,setMissingPace:v=>missingPace=v,setBadStructure:v=>badStructure=v,setUser:u=>user=u};
}
const request=(body,origin='https://site.test')=>new Request('https://site.test/api/intervals',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('connects, encrypts at rest, exports once, updates changed workouts and preserves the local prescription',async()=>{
 const h=harness(),before=structuredClone(h.plan);
 try{
  let result=await h.connection.connectIntervals('owner','example-private-key',false);assert.equal(result.connected,true);assert.equal(result.connection.automatic,false);
  const row=h.db.prepare('SELECT * FROM intervals_connections').get();assert.equal(JSON.stringify(row).includes('example-private-key'),false);assert.equal(JSON.stringify(result).includes('key_cipher'),false);
  assert.deepEqual(await h.connection.syncIntervals('owner'),{sent:1,unchanged:0});assert.deepEqual(h.plan,before);
  assert.deepEqual(await h.connection.syncIntervals('owner'),{sent:0,unchanged:1});assert.equal(h.sent.length,1);
  h.plan.title='Leve atualizado';assert.deepEqual(await h.connection.syncIntervals('owner'),{sent:1,unchanged:0});assert.equal(h.sent[0].external_id,h.sent[1].external_id);
  result=await h.connection.intervalsStatus('owner');assert.equal(result.connection.sentCount,1);
  await h.connection.disconnectIntervals('owner');assert.equal((await h.connection.intervalsStatus('owner')).connected,false);assert.equal(h.sent.length,2);
 }finally{h.db.close();}
});
test('automatic export is opt-in and connection changes are blocked during another export',async()=>{
 const h=harness();try{
  await h.connection.connectIntervals('owner','example-key',false);
  assert.equal((await h.connection.syncIntervals('owner',{automatic:true})).sent,0);assert.equal(h.sent.length,0);
  await h.connection.setIntervalsAutomatic('owner',true);assert.equal((await h.connection.syncIntervals('owner',{automatic:true})).sent,1);
  assert.equal((await h.connection.syncIntervals('owner',{automatic:true})).sent,0);assert.equal(h.sent.length,1);
  h.db.prepare('UPDATE intervals_connections SET lock_until=?').run(Date.now()+60000);
  await assert.rejects(()=>h.connection.disconnectIntervals('owner'),/envio em andamento/);
  await assert.rejects(()=>h.connection.connectIntervals('owner','example-key',false),/envio está em andamento/);
 }finally{h.db.close();}
});
test('new API denies anonymous, viewers and cross-origin writes; rejects invalid ranges and changed selections',async()=>{
 const h=harness();try{
  h.setUser(null);assert.equal((await h.route.GET()).status,401);assert.equal((await h.route.POST(request({action:'connect',key:'example-key'}))).status,401);
  h.setUser({userId:'viewer',email:'viewer@test.local'});assert.equal((await h.route.GET()).status,403);
  h.setUser({userId:'owner',email:'owner@test.local'});assert.equal((await h.route.POST(request({action:'connect',key:'example-key'},'https://evil.test'))).status,403);
  assert.equal((await h.route.POST(request({action:'connect',key:'example-key'}))).status,200);
  const invalid=await h.route.POST(request({action:'sync',from:'2026-02-31',to:'2026-12-31',ids:['owner:1']}));assert.equal(invalid.status,400);
  const selection=await h.route.POST(request({action:'sync',from:runs.today(),to:runs.addDays(runs.today(),1),ids:['no-longer-planned']}));assert.equal(selection.status,502);assert.equal(h.sent.length,0);
 }finally{h.db.close();}
});

test('does not mark a description-only upload as success and allows a retry after configuration is fixed',async()=>{
 const h=harness();try{
  await h.connection.connectIntervals('owner','example-key',false);
  h.setMissingPace(true);await assert.rejects(()=>h.connection.syncIntervals('owner'),/Ritmo de limiar/);assert.equal(h.sent.length,0);
  h.setMissingPace(false);h.setBadStructure(true);await assert.rejects(()=>h.connection.syncIntervals('owner'),/não confirmou todas as etapas/);
  let state=await h.connection.intervalsStatus('owner');assert.equal(state.connection.sentCount,0);assert.equal(state.connection.lastSuccess,undefined);
  h.setBadStructure(false);assert.equal((await h.connection.syncIntervals('owner')).sent,1);state=await h.connection.intervalsStatus('owner');assert.equal(state.connection.sentCount,1);
 }finally{h.db.close();}
});
test('revalidates workouts marked sent by the previous exporter even when their hash matches',async()=>{
 const h=harness();try{
  await h.connection.connectIntervals('owner','example-key',false);await h.connection.syncIntervals('owner');
  const row=h.db.prepare('SELECT data FROM intervals_connections').get(),data=JSON.parse(row.data);delete data.sent[h.plan.id].structureVersion;
  h.db.prepare('UPDATE intervals_connections SET data=?').run(JSON.stringify(data));
  assert.equal((await h.connection.syncIntervals('owner')).sent,1);assert.equal(h.sent.length,2);
 }finally{h.db.close();}
});

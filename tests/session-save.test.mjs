import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as runs from '../lib/runs.ts';
import * as distances from '../lib/distances.ts';

// Exercise the real route and synchronization guard with an isolated database.
function loadTs(file,imports){
 const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 new Function('exports','require',code)(exports,id=>{if(!(id in imports))throw Error('Unexpected import: '+id);return imports[id];});
 return exports;
}
function harness(){
 const sessions={},garminSync={};let lockUntil=0,writes=0,unavailable=false;
 const saved={id:'walk-qa',sourceId:'garmin:123',kind:'walk',hasPlan:false,date:'2026-11-13',actualDate:'2026-11-13',title:'Caminhada',status:'completed',plannedDistance:null,plannedTime:null,plannedPace:null,planNotes:'',distance:2.83,time:2278,effort:2,notes:'',avgHr:104,calories:171,calorieType:'total',calorieSource:'garmin',garminActiveCalories:127,garminCaloriesVersion:2};
 let row={id:saved.id,userId:'qa-owner',data:JSON.stringify(saved)};
 const db={select:()=>({from:table=>({where:async()=>{if(unavailable)throw Error('Database unavailable');return table===garminSync?[{lockUntil}]:[row];}})}),insert:()=>({values:value=>({onConflictDoUpdate:async()=>{writes++;row=value;}})})};
 const orm={eq:()=>true,and:()=>true};
 const sync=loadTs('../lib/garmin-sync.ts',{'cloudflare:workers':{env:{}},'drizzle-orm':orm,'../db':{getDb:()=>db},'../db/schema':{sessions,garminSync},'./session-store':{},'./runs':runs,'./garmin-api':{},'./modalities':{},'./garmin-reconcile':{}});
 const route=loadTs('../app/api/sessions/route.ts',{'../../../lib/garmin-sync':sync,'../../auth':{getAppUser:async()=>({userId:'qa-owner'})},'../../../lib/site-access':{canManageTraining:()=>true},'../../../lib/session-store':{},'../../../db':{getDb:()=>db},'../../../db/schema':{sessions},'drizzle-orm':orm,'../../../lib/runs':runs,'../../../lib/training-plan':{},'../../../lib/distances':distances});
 return {saved,route,setLock:value=>lockUntil=value,setUnavailable:()=>unavailable=true,writes:()=>writes,row:()=>row};
}
const request=body=>new Request('https://site.test/api/sessions',{method:'POST',headers:{origin:'https://site.test','Content-Type':'application/json'},body:JSON.stringify(body)});
test('editing walking notes reports an active Garmin sync, then saves after release without changing imported results',async()=>{
 const h=harness();const edited={...h.saved,notes:'Caminhada com a Gaya'};
 h.setLock(Date.now()+60000);
 let response=await h.route.POST(request(edited));let body=await response.json();
 assert.equal(response.status,409);assert.equal(body.code,'GARMIN_SYNC_BUSY');assert.match(body.error,/sincronização com o Garmin/);assert.match(body.error,/alterações continuam no formulário/);assert.ok(body.retryAfterSeconds>0&&body.retryAfterSeconds<=60);assert.equal(h.writes(),0);
 h.setLock(0);
 response=await h.route.POST(request(edited));body=await response.json();
 assert.equal(response.status,200);assert.equal(h.writes(),1);
 assert.deepEqual(JSON.parse(h.row().data),body.session);
 for(const [key,value] of Object.entries(edited))assert.deepEqual(body.session[key],value,key);
});
test('an expired synchronization lock permits saving; other storage failures keep the generic error',async()=>{
 const h=harness();h.setLock(Date.now()-1);
 assert.equal((await h.route.POST(request(h.saved))).status,200);
 h.setUnavailable();const response=await h.route.POST(request(h.saved));
 assert.equal(response.status,503);assert.equal((await response.json()).code,undefined);
});

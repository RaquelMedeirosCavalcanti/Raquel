import test from 'node:test';
import assert from 'node:assert/strict';
import {garminCalories,calorieSummary} from '../lib/calories.ts';
import {normalizeGarmin,reconcileGarmin,completeFromGarmin} from '../lib/garmin-reconcile.ts';
import {fetchGarmin} from '../lib/garmin-api.ts';
import {validateSession} from '../lib/runs.ts';
const raw={activityId:7,activityName:'Corrida',activityType:{typeKey:'running'},startTimeLocal:'2026-11-11',distance:5000,duration:1800};
const run=(extra={})=>normalizeGarmin({...raw,...extra},'owner');
test('prefers total workout calories, keeps active calories separate and distinguishes zero from missing',()=>{
 assert.deepEqual(garminCalories({calories:360,bmrCalories:40}),{calories:360,calorieType:'total',calorieSource:'garmin',garminActiveCalories:320});
 assert.equal(garminCalories({calories:360,bmrCalories:40,activeCalories:310}).garminActiveCalories,310);
 assert.equal(garminCalories({calories:0}).calories,0);
 assert.equal(garminCalories({calories:360}).calorieType,'total');
 assert.equal(garminCalories({summaryDTO:{calories:350,bmrCalories:50}}).calories,350);
 for(const calories of [undefined,null,'300',-1,Infinity,NaN])assert.equal(garminCalories({calories}).calories,null);
 assert.equal(garminCalories({totalKilocalories:2000,activeKilocalories:500}).calories,null);
 assert.equal(garminCalories({calories:10,bmrCalories:20}).calorieType,'total');
});
test('backfills the existing Garmin ID once, without changing manual results or duplicating the run',()=>{
 const saved={...run(),status:'adapted',time:1900,notes:'Minha nota'};
 const incoming=run({calories:360,bmrCalories:40});
 const result=reconcileGarmin([saved],[incoming,incoming]);
 assert.equal(result.changes.length,1);assert.equal(result.imported,0);assert.equal(result.completed,0);
 assert.equal(result.changes[0].calories,360);assert.equal(result.changes[0].time,1900);assert.equal(result.changes[0].status,'adapted');assert.equal(result.changes[0].notes,'Minha nota');
 assert.equal(reconcileGarmin(result.changes,[incoming]).changes.length,0);
 for(const manual of [{calories:123,calorieSource:'manual'},{calories:null,calorieSource:'manual'},{calories:123}]){const next=reconcileGarmin([{...saved,...manual}],[incoming]).changes[0];assert.equal(next.calories,manual.calories);assert.equal(next.garminActiveCalories,320);}
 assert.equal(reconcileGarmin([{id:'deleted',sourceId:incoming.sourceId,deleted:true}],[incoming]).changes.length,0);
 assert.equal(reconcileGarmin(result.changes,[run()]).changes.length,0);
 assert.equal(completeFromGarmin({...saved,hasPlan:true},incoming).calories,360);
});
test('totals include only completed activities, deduplicate Garmin IDs and report partial coverage',()=>{
 const a=run({calories:360,bmrCalories:40});
 const strength={...run(),id:'strength',sourceId:undefined,kind:'strength',calories:100,calorieSource:'manual'};
 const missing={...run(),id:'missing',sourceId:undefined};
 const skipped={...run({calories:900}),id:'skipped',sourceId:undefined,status:'skipped'};
 assert.deepEqual(calorieSummary([a,{...a,id:'duplicate'},strength,missing,skipped]),{calories:460,calorieCount:2,calorieMissing:1,calorieTotal:1});
 assert.equal(calorieSummary([missing]).calories,null);
 assert.equal(calorieSummary([{...strength,calories:0}]).calories,0);
 assert.equal(calorieSummary([run({calories:360})]).calorieTotal,1);
 for(const calories of [-1,Infinity,'300'])assert.match(validateSession({...a,calories}),/Calorias/);
 assert.equal(validateSession({...a,calories:0}),null);
});
test('fetches calories for historical runs with cached FIT details, without downloading FIT again',async()=>{
 const original=globalThis.fetch;const paths=[];
 const saved={...run(),garminDetails:{version:1,status:'complete',source:'fit',checkedAt:new Date().toISOString(),intervals:[]}};
 globalThis.fetch=async url=>{paths.push(String(url));if(String(url).includes('/token'))return new Response('fixture-token');if(String(url).includes('/search/'))return Response.json([]);if(String(url).endsWith('/activity/7'))return Response.json({summaryDTO:{calories:360,bmrCalories:40}});throw Error('Unexpected download');};
 try{
  const rows=await fetchGarmin('fixture-key','owner','2026-11-12','2026-11-12',true,[saved]);
  assert.equal(rows[0].calories,360);assert.deepEqual(rows[0].garminDetails,saved.garminDetails);assert.equal(paths.length,3);
  paths.length=0;await fetchGarmin('fixture-key','owner','2026-11-12','2026-11-12',true,rows);assert.equal(paths.length,2);
 }finally{globalThis.fetch=original;}
});

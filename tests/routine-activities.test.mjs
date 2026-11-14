import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeGarmin,reconcileGarmin} from '../lib/garmin-reconcile.ts';
import {sessionKind,modalityLabel} from '../lib/modalities.ts';
import {validateSession} from '../lib/runs.ts';
import {bounds,summarize} from '../lib/training-metrics.ts';
import {fetchGarmin} from '../lib/garmin-api.ts';
const raw=(id,type,extra={})=>({activityId:id,activityType:{typeKey:type},startTimeLocal:'2026-11-12 18:00:00',activityName:type,duration:1800,distance:2100,averageHR:100,calories:120,...extra});
const activity=(id,type,extra={})=>normalizeGarmin(raw(id,type,extra),'owner');
test('walks keep measured kilometers and Pilates needs no distance; legacy imports stay in their tabs',()=>{
 for(const type of ['walking','indoor_walking','treadmill_walking']){const s=activity(1,type);assert.equal(s.kind,'walk');assert.equal(s.distance,2.1);assert.equal(validateSession(s),null);}
 const p=activity(2,'pilates',{distance:0});assert.equal(p.kind,'pilates');assert.equal(p.distance,null);assert.equal(p.modality,'Pilates');assert.equal(validateSession(p),null);
 assert.equal(sessionKind({...p,kind:'other',modality:'pilates'}),'pilates');assert.equal(modalityLabel({kind:'other',modality:'Caminhada'}),'Caminhada');
 assert.equal(sessionKind({kind:'other',modality:'Ciclismo'}),'other');
});
test('new modalities do not complete run plans and repeated sync never duplicates them',()=>{
 const runPlan={...activity(1,'running'),id:'plan',sourceId:undefined,hasPlan:true,status:'planned',distance:null,time:null,actualDate:''};
 const walk=activity(2,'walking'),pilates=activity(3,'pilates',{distance:null});
 const result=reconcileGarmin([runPlan],[walk,pilates,walk]);assert.equal(result.changes.length,2);assert.equal(result.completed,0);assert.equal(result.imported,2);assert.equal(result.review.length,0);
 assert.equal(reconcileGarmin([runPlan,...result.changes],[walk,pilates]).changes.length,0);
 assert.equal(reconcileGarmin([{id:'deleted',sourceId:walk.sourceId,deleted:true}],[walk]).changes.length,0);
 const manual={...walk,id:'manual',sourceId:undefined};const review=reconcileGarmin([manual],[walk]);assert.equal(review.changes.length,0);assert.equal(review.review.length,1);
 assert.equal(reconcileGarmin([],[walk,activity(4,'walking')]).changes.length,2);
 assert.equal(reconcileGarmin([],[activity(5,'cycling'),activity(6,'strength_training')]).changes.length,1);
});
test('backfills previously discarded walk distance without replacing manual results',()=>{
 const incoming=activity(1,'walking');const saved={...incoming,kind:'other',distance:null,time:2000,notes:'Gaya'};
 const result=reconcileGarmin([saved],[incoming]);assert.equal(result.changes.length,1);assert.equal(result.changes[0].distance,2.1);assert.equal(result.changes[0].time,2000);assert.equal(result.changes[0].notes,'Gaya');
 assert.equal(reconcileGarmin([{...saved,distance:3}],[incoming]).changes.length,0);
});
test('day, week and month totals include each completed modality and exclude plans and other dates',()=>{
 const all=[activity(1,'running'),{...activity(2,'strength_training'),workout:'A'},activity(3,'walking'),activity(4,'pilates'),{...activity(5,'walking'),status:'planned'},activity(6,'walking',{startTimeLocal:'2026-10-31'})];
 for(const period of ['day','week','month']){const [start,end]=bounds('2026-11-12',period);const stats=summarize(all.filter(s=>s.actualDate>=start&&s.actualDate<=end));assert.equal(stats.count,4);assert.equal(stats.seconds,7200);assert.equal(stats.calories,480);assert.equal(stats.hr,100);}
});
test('all-activity query imports walk/Pilates totals, backfills calories and never downloads running FIT for them',async()=>{
 const previous=globalThis.fetch,paths=[];
 globalThis.fetch=async url=>{const path=String(url);paths.push(path);if(path.includes('/token'))return new Response('fixture');if(path.includes('/search/')){assert.equal(new URL(path).searchParams.has('activityType'),false);return Response.json([raw(1,'walking',{calories:null}),raw(2,'pilates',{distance:null,calories:null})]);}if(path.includes('/activity/'))return Response.json({summaryDTO:{calories:150,bmrCalories:20}});throw Error('Unexpected FIT download');};
 try{const rows=await fetchGarmin('fixture','owner','2026-11-12','2026-11-12');assert.equal(rows.length,2);assert.equal(rows[0].distance,2.1);assert.ok(rows.every(s=>s.calories===150&&s.garminActiveCalories===130));assert.equal(paths.length,4);}finally{globalThis.fetch=previous;}
});
test('recovers walking distance from summaryDTO even when calories are already present, then fills the existing record and pace',async()=>{
 const previous=globalThis.fetch,paths=[];
 const saved={...activity(9,'walking',{distance:null}),time:1800,notes:'Passeio da Gaya'};
 globalThis.fetch=async url=>{const path=String(url);paths.push(path);if(path.includes('/token'))return new Response('fixture');if(path.includes('/search/'))return Response.json([raw(9,'walking',{distance:null})]);if(path.endsWith('/activity/9'))return Response.json({summaryDTO:{distance:2400,duration:1800}});throw Error('Unexpected request');};
 try{
  const rows=await fetchGarmin('fixture','owner','2026-11-12','2026-11-12',false,[saved]);
  assert.equal(rows[0].distance,2.4);assert.equal(rows[0].time/rows[0].distance,750);
  const result=reconcileGarmin([saved],rows);assert.equal(result.changes.length,1);assert.equal(result.imported,0);assert.equal(result.changes[0].notes,saved.notes);assert.equal(result.changes[0].distance,2.4);
  assert.equal(reconcileGarmin(result.changes,rows).changes.length,0);assert.equal(paths.length,3);
  paths.length=0;await fetchGarmin('fixture','owner','2026-11-12','2026-11-12',false,result.changes);assert.equal(paths.length,2);
 }finally{globalThis.fetch=previous;}
});
test('fetches missing distance for historical walks outside the query window; missing or failed detail stays unknown and is retried later',async()=>{
 const previous=globalThis.fetch;let detailCalls=0,failed=false;
 const saved={...activity(10,'walking',{distance:null,startTimeLocal:'2026-10-01'}),garminCaloriesCheckedAt:new Date().toISOString()};
 globalThis.fetch=async url=>{const path=String(url);if(path.includes('/token'))return new Response('fixture');if(path.includes('/search/'))return Response.json([]);if(path.endsWith('/activity/10')){detailCalls++;return failed?new Response('',{status:503}):Response.json({summaryDTO:{distance:0}});}throw Error('Unexpected request');};
 try{
  const rows=await fetchGarmin('fixture','owner','2026-11-12','2026-11-12',false,[saved]);assert.equal(rows[0].distance,null);assert.ok(rows[0].garminDistanceCheckedAt);assert.equal(detailCalls,1);
  await fetchGarmin('fixture','owner','2026-11-12','2026-11-12',false,rows);assert.equal(detailCalls,1);
  failed=true;const retry=await fetchGarmin('fixture','owner','2026-11-12','2026-11-12',false,[{...saved,garminDistanceCheckedAt:'2026-01-01T00:00:00Z'}]);assert.equal(retry[0].distance,null);assert.equal(detailCalls,2);
 }finally{globalThis.fetch=previous;}
});

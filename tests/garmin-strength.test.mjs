import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeGarmin,reconcileGarmin} from '../lib/garmin-reconcile.ts';
import {garminCalories,mergeGarminCalories} from '../lib/calories.ts';
import {fetchGarmin} from '../lib/garmin-api.ts';
import {distanceText,normalizeSessionDistances} from '../lib/distances.ts';
import {validateSession} from '../lib/runs.ts';
const raw=(type='strength_training',extra={})=>({activityId:21,activityType:{typeKey:type},activityName:'Musculamento',startTimeLocal:'2026-11-12 19:00:00',duration:3300,averageHR:118,calories:390,bmrCalories:60,...extra});
const activity=(type,extra)=>normalizeGarmin(raw(type,extra),'owner');
const plan=(extra={})=>({...activity(),id:'plan',sourceId:undefined,hasPlan:true,date:'2026-11-12',actualDate:'',status:'planned',calories:null,calorieSource:undefined,calorieType:undefined,garminActiveCalories:undefined,workout:'B',time:null,avgHr:null,title:'Meu treino B',exercises:[{name:'Supino',sets:3,reps:'8–12',rest:'90 s',load:'18 kg',actualReps:'12 / 10 / 10'}],strengthLog:'Registro pessoal',notes:'Minha anotação',planNotes:'Meus ajustes',...extra});
test('recognizes strength and Portuguese aliases; standalone imports need no invented workout model',()=>{
 for(const type of ['strength_training','weight_training','musculamento','misculamento','musculação']){
  const s=activity(type);assert.equal(s.kind,'strength');assert.equal(validateSession(s),null);assert.equal(s.workout,undefined);assert.deepEqual(s.exercises,[]);
 }
 assert.equal(activity('cardio',{activityName:'Musculamento'}).kind,'other');
});
test('recognizes an Other activity named Musculamento and imports its measured totals into the plan',()=>{
 const p=plan({date:'2026-11-16'}),snapshot=structuredClone(p);
 const s=activity('other',{activityName:'Musculamento',startTimeLocal:'2026-11-16 12:44:00',duration:3174,calories:234});
 assert.equal(s.kind,'strength');assert.equal(s.modality,'Musculação');
 const r=reconcileGarmin([p],[s]);assert.equal(r.completed,1);assert.equal(r.review.length,0);
 const done=r.changes[0];assert.equal(done.time,3174);assert.equal(done.calories,234);assert.equal(done.avgHr,118);
 for(const key of ['id','title','workout','exercises','notes','planNotes','strengthLog'])assert.deepEqual(done[key],p[key]);
 assert.deepEqual(p,snapshot);assert.equal(reconcileGarmin([done],[s]).changes.length,0);
 for(const name of ['Musculação',' musculamento ','MUSCULAMENTO'])assert.equal(activity('other',{activityName:name}).kind,'strength');
 for(const name of ['Outros','Passeio','Não fiz musculamento'])assert.equal(activity('other',{activityName:name}).kind,'other');
 assert.equal(activity('running',{activityName:'Musculamento'}).kind,'run');
 assert.equal(activity('cardio',{activityName:'Musculamento'}).kind,'other');
});
test('completes strength and preserves every exercise, load, set, repetition and personal note through retries',()=>{
 const p=plan(),snapshot=structuredClone(p),s=activity();
 const result=reconcileGarmin([p],[s,s]);assert.equal(result.completed,1);assert.equal(result.changes.length,1);assert.equal(result.review.length,0);
 const done=result.changes[0];assert.equal(done.status,'completed');assert.equal(done.avgHr,118);assert.equal(done.time,3300);assert.equal(done.calories,390);assert.equal(done.garminActiveCalories,330);
 for(const key of ['id','title','workout','exercises','notes','planNotes','strengthLog'])assert.deepEqual(done[key],p[key]);
 assert.deepEqual(p,snapshot);assert.equal(reconcileGarmin([done],[s]).changes.length,0);
 const changed=reconcileGarmin([{...done,avgHr:null}],[s]).changes[0];assert.equal(changed.avgHr,118);assert.deepEqual(changed.exercises,p.exercises);
});
test('ambiguous strength sessions require review without modifying exercises',()=>{
 const p=plan();
 for(const [existing,incoming] of [[[p,plan({id:'second'})],[activity()]],[[p],[activity(),activity(undefined,{activityId:22})]]]){
  const result=reconcileGarmin(existing,incoming);assert.equal(result.changes.length,0);assert.ok(result.review.length);
 }
});
test('fills a unique completed strength prescription with empty metrics, preserving effort and all personal data',()=>{
 const p=plan({status:'completed',actualDate:'2026-11-12',effort:4,feedback:{pain:0,recovery:'good',reserve:3}}),snapshot=structuredClone(p);
 const r=reconcileGarmin([p],[activity()]);assert.equal(r.changes.length,1);assert.equal(r.completed,0);assert.equal(r.imported,0);assert.equal(r.review.length,0);
 const done=r.changes[0];assert.equal(done.id,p.id);assert.equal(done.time,3300);assert.equal(done.avgHr,118);assert.equal(done.calories,390);assert.equal(done.sourceId,'garmin:21');
 for(const key of ['effort','feedback','exercises','workout','title','notes','planNotes','strengthLog'])assert.deepEqual(done[key],p[key]);
 assert.deepEqual(p,snapshot);assert.equal(reconcileGarmin([done],[activity()]).changes.length,0);
 for(const extra of [{sourceId:'garmin:99'},{status:'skipped'},{actualDate:'2026-11-11'}]){
  const protectedResult=reconcileGarmin([{...p,...extra}],[activity()]);assert.equal(protectedResult.changes.length,0);assert.equal(protectedResult.review.length,1);
 }
});
test('moves an already imported standalone Garmin activity into the original prescription exactly once',()=>{
 const p=plan({status:'completed',actualDate:'2026-11-12',effort:4}),standalone={...activity(),feedback:{pain:null,recovery:'',reserve:null}},snapshot=structuredClone([p,standalone]);
 const r=reconcileGarmin([p,standalone],[activity()]);assert.equal(r.changes.length,2);assert.equal(r.review.length,0);
 const done=r.changes.find(s=>s.id===p.id),archived=r.changes.find(s=>s.id===standalone.id);
 assert.equal(done.hasPlan,true);assert.equal(done.time,3300);assert.equal(done.calories,390);assert.equal(done.avgHr,118);assert.equal(done.effort,4);assert.deepEqual(done.exercises,p.exercises);
 assert.equal(archived.deleted,true);assert.equal(archived.mergedInto,p.id);assert.equal(archived.sourceId,undefined);
 const active=r.changes.filter(s=>!s.deleted);assert.equal(active.length,1);assert.equal(active.filter(s=>s.sourceId==='garmin:21').length,1);
 assert.deepEqual([p,standalone],snapshot);assert.equal(reconcileGarmin(r.changes,[activity()]).changes.length,0);
 for(const existing of [[p,standalone,plan({id:'second'})],[p,standalone,plan({id:'manual',hasPlan:false,status:'completed',actualDate:p.actualDate,time:3000})]]){
  const blocked=reconcileGarmin(existing,[activity()]);assert.equal(blocked.changes.some(s=>s.id===p.id),false);assert.equal(blocked.changes.some(s=>s.deleted),false);
 }
 const missing=plan({status:'completed',actualDate:'2026-11-12'});
 for(const extra of [{deleted:true},{exercises:p.exercises},{notes:'Observação própria'},{effort:5}]){
  const blocked=reconcileGarmin([missing,{...standalone,...extra}],[activity()]);assert.equal(blocked.changes.some(s=>s.id===missing.id),false);
 }
});
test('upgrades old active energy to total, never downgrades totals, keeps manual main energy and zero active energy',()=>{
 const saved={...activity(),calories:330,calorieType:'active'};
 assert.equal(mergeGarminCalories(saved,activity()).calories,390);
 assert.equal(mergeGarminCalories(activity(),{calories:330,calorieType:'active'}).calories,390);
 assert.equal(mergeGarminCalories({...saved,calories:444,calorieSource:'manual'},activity()).calories,444);
 assert.deepEqual(garminCalories({summaryDTO:{calories:60,bmrCalories:60}}),{calories:60,calorieType:'total',calorieSource:'garmin',garminActiveCalories:0});
 assert.equal(garminCalories({activeCalories:330}).calorieType,'active');
 assert.equal(garminCalories({activeCalories:330,bmrCalories:60}).calories,390);
});
test('rounds imported and old session distances, displaying exactly two decimal places',()=>{
 const run=activity('running',{distance:2345.678});assert.equal(run.distance,2.35);assert.equal(distanceText(run.distance),'2,35');assert.equal(distanceText(2.3),'2,30');
 const old=normalizeSessionDistances({...run,distance:2.341234,plannedDistance:5.12999});assert.equal(old.distance,2.34);assert.equal(old.plannedDistance,5.13);
});
test('updates historical energy despite a recent old-rule check and fetches strength HR without FIT',async()=>{
 const original=globalThis.fetch;let downloads=0,details=0;
 const saved={...plan({status:'completed',actualDate:'2026-11-12'}),sourceId:'garmin:21',calories:330,calorieType:'active',calorieSource:'garmin',garminCaloriesVersion:undefined,garminCaloriesCheckedAt:new Date().toISOString()};
 globalThis.fetch=async url=>{const path=String(url);if(path.includes('/token'))return new Response('fixture');if(path.includes('/search/'))return Response.json([]);if(path.endsWith('/activity/21')){details++;return Response.json({summaryDTO:{calories:390,bmrCalories:60,averageHR:118,duration:3300}});}downloads++;throw Error('Unexpected download');};
 try{
  const rows=await fetchGarmin('fixture','owner','2026-11-13','2026-11-13',false,[saved]);assert.equal(rows[0].calories,390);assert.equal(rows[0].avgHr,118);assert.equal(rows[0].garminActiveCalories,330);assert.equal(downloads,0);assert.equal(details,1);
  const result=reconcileGarmin([saved],rows);assert.deepEqual(result.changes[0].exercises,saved.exercises);assert.equal(result.changes[0].time,3300);
  await fetchGarmin('fixture','owner','2026-11-13','2026-11-13',false,result.changes);assert.equal(details,1);
 }finally{globalThis.fetch=original;}
});

test('updates calories on historical Garmin activities of other modalities without automatically importing new ones',async()=>{
 const original=globalThis.fetch;
 const saved={...activity('cycling'),garminCaloriesVersion:undefined,calories:330,calorieType:'active'};
 globalThis.fetch=async url=>{const path=String(url);if(path.includes('/token'))return new Response('fixture');if(path.includes('/search/'))return Response.json([]);if(path.endsWith('/activity/21'))return Response.json({summaryDTO:{calories:390,bmrCalories:60}});throw Error('Unexpected request');};
 try{const rows=await fetchGarmin('fixture','owner','2026-11-13','2026-11-13',false,[saved]);assert.equal(rows[0].calories,390);const result=reconcileGarmin([saved],rows);assert.equal(result.changes[0].calories,390);assert.equal(result.imported,0);assert.equal(reconcileGarmin([],[activity('cycling')]).changes.length,0);}finally{globalThis.fetch=original;}
});

test('future strength realizations always use the original plan and preserve partial manual metrics and statuses',()=>{
 for(const date of ['2026-11-17','2026-11-18','2026-12-20'])for(const status of ['planned','completed','adapted','light']){
  const p=plan({date,actualDate:status==='planned'?'':date,status,effort:4,modality:'',optional:true,time:3600,avgHr:null,calories:111,calorieSource:'manual',calorieType:'total'});
  const s=activity('other',{activityName:'Musculamento',startTimeLocal:date+' 12:00:00'}),snapshot=structuredClone(p);
  const r=reconcileGarmin([p],[s]);assert.equal(r.changes.length,1);assert.equal(r.imported,0);assert.equal(r.review.length,0);
  const done=r.changes[0];assert.equal(done.id,p.id);assert.equal(done.hasPlan,true);assert.equal(done.time,3600);assert.equal(done.avgHr,118);assert.equal(done.calories,111);assert.equal(done.calorieSource,'manual');assert.equal(done.modality,'Musculação');
  assert.equal(done.status,status==='planned'?'completed':status);assert.equal(done.effort,4);assert.deepEqual(done.exercises,p.exercises);assert.deepEqual(p,snapshot);
  assert.equal(reconcileGarmin([done],[s]).changes.length,0);
 }
});

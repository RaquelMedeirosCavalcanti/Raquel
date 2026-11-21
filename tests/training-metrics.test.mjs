import test from 'node:test';
import assert from 'node:assert/strict';
import {bounds,completedInPeriod,summarize} from '../lib/training-metrics.ts';
import {normalizeGarmin,reconcileGarmin} from '../lib/garmin-reconcile.ts';
import {sessionKind} from '../lib/modalities.ts';
const session=(id,date,kind,time,calories,avgHr=100)=>({id,date,actualDate:date,kind,time,calories,avgHr,status:'completed',hasPlan:true,distance:null,plannedDistance:null});
const strength=[session('a','2026-11-16','strength',3174,234,104),session('b','2026-11-18','strength',2806,164,93),session('c','2026-11-20','strength',4553.27294921875,366,111)];
const week=[...strength,session('walk','2026-11-16','walk',2242.282958984375,171,98),session('run1','2026-11-17','run',2165.02099609375,331,160),session('run2','2026-11-19','run',2254.5380859375,325,145)];
test('historical Other imports named Musculamento appear under strength without changing specific sports',()=>{
 assert.equal(sessionKind({kind:'other',modality:'other',title:'Musculamento'}),'strength');
 assert.equal(sessionKind({kind:'run',title:'Musculamento'}),'run');
 assert.equal(sessionKind({kind:'other',modality:'Ciclismo',title:'Musculamento'}),'other');
});
test('weekly and monthly summaries include strength with other modalities, using actual dates',()=>{
 const other= session('previous','2026-11-15','pilates',1800,100);
 const all=[...week,other,{...strength[0],id:'future',status:'planned',date:'2026-11-23',actualDate:''},{...strength[1],id:'deleted',deleted:true}];
 assert.deepEqual(bounds('2026-11-21','week'),['2026-11-16','2026-11-22']);
 const rows=completedInPeriod(all,'2026-11-21','week'),stats=summarize(rows);
 assert.equal(rows.length,6);assert.equal(stats.count,6);assert.equal(stats.calories,1591);assert.equal(stats.calorieMissing,0);
 assert.equal(stats.seconds,17195.114990234375);assert.equal(new Set(rows.map(s=>s.actualDate)).size,5);
 assert.equal(Math.round(stats.hr),116);
 const lifts=summarize(rows.filter(s=>s.kind==='strength'));assert.equal(lifts.count,3);assert.equal(lifts.calories,764);assert.equal(lifts.seconds,10533.27294921875);
 const monthly=summarize(completedInPeriod(all,'2026-11-21','month'));assert.equal(monthly.count,7);assert.equal(monthly.calories,1691);
 assert.equal(completedInPeriod([{...strength[0],date:'2026-11-15'}],'2026-11-21','week').length,1);
});
test('every metric counts a linked Garmin activity once and prefers its prescription',()=>{
 const plan={...strength[0],sourceId:'garmin:1'},imported={...plan,id:'garmin-import',hasPlan:false,time:9000,calories:999};
 for(const rows of [[plan,imported],[imported,plan]]){
  const done=completedInPeriod(rows,'2026-11-21','week');assert.equal(done.length,1);assert.equal(done[0].id,plan.id);
  const stats=summarize(rows);assert.equal(stats.count,1);assert.equal(stats.seconds,3174);assert.equal(stats.calories,234);assert.equal(stats.hr,104);
 }
});
test('Garmin Other named Musculamento completes its prescription and enters both summaries once',()=>{
 const plan={...strength[0],status:'planned',actualDate:'',time:null,avgHr:null,calories:null};
 const raw={activityId:1,activityType:{typeKey:'other'},activityName:'Musculamento',startTimeLocal:'2026-11-16 12:00:00',duration:3174,averageHR:104,calories:234};
 const incoming=normalizeGarmin(raw,'owner'),result=reconcileGarmin([plan],[incoming]);
 assert.equal(result.changes.length,1);assert.equal(result.changes[0].id,plan.id);assert.equal(result.imported,0);
 for(const period of ['week','month']){const stats=summarize(completedInPeriod(result.changes,'2026-11-21',period));assert.equal(stats.count,1);assert.equal(stats.seconds,3174);assert.equal(stats.calories,234);}
 assert.equal(reconcileGarmin(result.changes,[incoming]).changes.length,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeGarmin,reconcileGarmin} from '../lib/garmin-reconcile.ts';
const plan=(extra={})=>({id:'plan',kind:'run',hasPlan:true,date:'2026-11-12',actualDate:'',title:'Corrida leve',status:'planned',steps:[{label:'Aquecimento',detail:'10 min'}],plannedPace:390,plannedDistance:5,plannedTime:1950,planNotes:'Manter leve',notes:'Observação pessoal',distance:null,time:null,avgHr:null,effort:null,...extra});
const run=(id=1,extra={})=>normalizeGarmin({activityId:id,activityName:'Corrida Garmin',activityType:{typeKey:'running'},startTimeLocal:'2026-11-12 23:40:00',startTimeGMT:'2026-11-13 02:40:00',distance:5100,duration:1920,averageHR:144,...extra},'owner');
test('uses Garmin local date and documented units, without inventing effort',()=>{
 const s=run();assert.equal(s.date,'2026-11-12');assert.equal(s.distance,5.1);assert.equal(s.time,1920);assert.equal(s.avgHr,144);assert.equal(s.effort,null);
 assert.equal(normalizeGarmin({activityName:'Missing id'},'owner'),null);
 assert.equal(run(2,{averageHR:999}).avgHr,null);
 for(const type of ['running','trail_running','treadmill_running','track_running'])assert.equal(run(2,{activityType:{typeKey:type}}).kind,'run');
 assert.equal(run(2,{activityType:{typeKey:'walking'}}).kind,'walk');
});
test('completes the single same-day plan while preserving its entire prescription',()=>{
 const p=plan(),snapshot=structuredClone(p),r=reconcileGarmin([p],[run()]);
 assert.equal(r.completed,1);assert.equal(r.imported,0);assert.equal(r.review.length,0);
 const changed=r.changes[0];assert.equal(changed.id,p.id);assert.equal(changed.title,p.title);assert.deepEqual(changed.steps,p.steps);assert.equal(changed.planNotes,p.planNotes);assert.equal(changed.notes,p.notes);assert.equal(changed.plannedDistance,5);assert.equal(changed.plannedPace,390);assert.equal(changed.status,'completed');assert.equal(changed.distance,5.1);assert.equal(changed.sourceId,'garmin:1');assert.deepEqual(p,snapshot);
});
test('retries and duplicate provider records never create a second result',()=>{
 const first=reconcileGarmin([plan()],[run(),run()]);assert.equal(first.changes.length,1);
 assert.equal(reconcileGarmin(first.changes,[run()]).changes.length,0);
 assert.equal(reconcileGarmin([{id:'deleted',sourceId:'garmin:1',deleted:true}],[run()]).changes.length,0);
});
test('multiple activities or plans require a choice without inflating totals',()=>{
 for(const [existing,incoming,n] of [[[plan()],[run(),run(2)],2],[[plan(),plan({id:'second'})],[run()],1]]){
  const r=reconcileGarmin(existing,incoming);assert.equal(r.changes.length,0);assert.equal(r.review.length,n);
 }
});
test('manual history, skipped, adapted and light statuses are never automatically overwritten',()=>{
 for(const status of ['skipped','completed','adapted','light']){
  const r=reconcileGarmin([plan({status,actualDate:'2026-11-12',distance:5,time:1900})],[run()]);assert.equal(r.changes.length,0);assert.equal(r.review.length,1);
 }
 const r=reconcileGarmin([plan({id:'manual',hasPlan:false,status:'completed',actualDate:'2026-11-12',distance:5,time:1900})],[run()]);assert.equal(r.review.length,1);
});
test('off-plan run is recorded once and never marks a neighboring date complete',()=>{
 const r=reconcileGarmin([plan({date:'2026-11-13'})],[run()]);assert.equal(r.imported,1);assert.equal(r.completed,0);assert.equal(r.changes[0].hasPlan,false);
});
test('runs still require valid distance and duration',()=>{
 for(const extra of [{distance:null},{duration:0},{distance:-1}]){const r=reconcileGarmin([plan()],[run(1,extra)]);assert.equal(r.changes.length,0);assert.equal(r.review.length,1);}
});

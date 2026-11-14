import test from 'node:test';
import assert from 'node:assert/strict';
import {Encoder,Profile} from '@garmin/fitsdk';
import {zipSync} from 'fflate';
import {decodeGarminActivity} from '../lib/garmin-fit.ts';
import {fitIntervals,summaryIntervals,needsGarminDetails,validateGarminDetails} from '../lib/garmin-intervals.ts';
import {normalizeGarmin,reconcileGarmin,completeFromGarmin} from '../lib/garmin-reconcile.ts';
import {fetchGarmin,boundedBytes} from '../lib/garmin-api.ts';
const checkedAt='2026-11-11T00:00:00Z';
const sampleLaps=[
 {wktStepIndex:0,totalTimerTime:300,totalDistance:480,avgHeartRate:100},
 {wktStepIndex:1,totalTimerTime:437.1,totalDistance:1000,avgHeartRate:140},
 {wktStepIndex:1,totalTimerTime:426.4,totalDistance:1000,avgHeartRate:145},
 {wktStepIndex:1,totalTimerTime:428.2,totalDistance:1000,avgHeartRate:150},
 {wktStepIndex:2,totalTimerTime:218.2,totalDistance:340,avgHeartRate:120}
];
function fitBytes(includeSteps=true){
 const encoder=new Encoder(),start=new Date('2026-11-11T10:00:00Z');
 encoder.onMesg(Profile.MesgNum.FILE_ID,{type:'activity',manufacturer:'garmin',product:1,serialNumber:1,timeCreated:start});
 if(includeSteps)['warmup','active','cooldown'].forEach((intensity,messageIndex)=>encoder.onMesg(Profile.MesgNum.WORKOUT_STEP,{messageIndex,intensity,durationType:'open'}));
 let elapsed=0;
 sampleLaps.forEach((lap,messageIndex)=>{const startTime=new Date(+start+elapsed*1000);elapsed+=lap.totalTimerTime;encoder.onMesg(Profile.MesgNum.LAP,{...lap,messageIndex,startTime,timestamp:new Date(+start+elapsed*1000),totalElapsedTime:lap.totalTimerTime,sport:'running'});});
 encoder.onMesg(Profile.MesgNum.SESSION,{startTime:start,timestamp:new Date(+start+elapsed*1000),sport:'running',totalTimerTime:elapsed,totalElapsedTime:elapsed,totalDistance:3820,numLaps:5,firstLapIndex:0});
 return encoder.close();
}
const activity=(details)=>({...normalizeGarmin({activityId:123,activityName:'Corrida',activityType:{typeKey:'running'},startTimeLocal:'2026-11-11 07:00:00',distance:3820,duration:1810,averageHR:135},'owner'),...(details?{garminDetails:details}:{})});
test('decodes real FIT binary and ZIP, groups main step, keeps each lap and weighted HR',()=>{
 for(const bytes of [fitBytes(),zipSync({'activity.fit':fitBytes(),'ignore.txt':new Uint8Array([1])})]){
  const groups=decodeGarminActivity(bytes);assert.deepEqual(groups.map(g=>g.type),['warmup','run','cooldown']);
  assert.equal(groups[1].laps.length,3);assert.equal(groups[1].distance,3);assert.ok(Math.abs(groups[1].time-1291.7)<0.01);
  assert.equal(Math.round(groups[1].time/groups[1].distance),431);assert.equal(Math.round(groups[1].avgHr),145);
 }
});
test('keeps recovery repetitions separate and never infers warmup from slower pace',()=>{
 const groups=fitIntervals([{intensity:'active',totalTimerTime:60,totalDistance:100},{intensity:'recovery',totalTimerTime:60,totalDistance:50},{intensity:'active',totalTimerTime:60,totalDistance:100}]);
 assert.deepEqual(groups.map(g=>g.type),['run','recovery','run']);
 assert.equal(fitIntervals([{totalTimerTime:300,totalDistance:500}])[0].type,'other');
 assert.equal(fitIntervals([{totalTimerTime:60,totalDistance:0}])[0].distance,0);
});
test('JSON summaries keep repetition counts without treating planned instructions as measured results',()=>{
 const rows=summaryIntervals([{splitType:'INTERVAL_WARMUP',duration:300,distance:480,averageHR:999},{splitType:'INTERVAL_ACTIVE',duration:1291.7,distance:3000,noOfSplits:3},{splitType:'MARKER_KILOMETER',duration:400,distance:1000}]);
 assert.equal(rows.length,2);assert.equal(rows[0].avgHr,null);assert.equal(rows[1].count,3);assert.equal(rows[1].distance,3);
 assert.deepEqual(summaryIntervals([{stepIndex:0,durationValue:300,intensity:'WARMUP'}]),[]);
});
test('backfills only details, preserving status, manual totals, notes, plan and deletion tombstones',()=>{
 const details={version:1,status:'complete',source:'fit',checkedAt,intervals:decodeGarminActivity(fitBytes())};
 const saved={...activity(),id:'plan-1',hasPlan:true,status:'adapted',distance:4,time:1900,effort:5,notes:'Minha observação',steps:[{label:'Meta',detail:'3 km'}]};
 const result=reconcileGarmin([saved],[activity(details)]);assert.equal(result.changes.length,1);assert.equal(result.completed,0);assert.equal(result.imported,0);
 assert.deepEqual(result.changes[0],{...saved,garminDetails:details});assert.equal(reconcileGarmin(result.changes,[activity(details)]).changes.length,0);
 assert.equal(reconcileGarmin([{id:'deleted',sourceId:'garmin:123',deleted:true}],[activity(details)]).changes.length,0);
 assert.deepEqual(completeFromGarmin(saved,activity(details)).garminDetails,details);
 assert.ok(validateGarminDetails(details));assert.equal(validateGarminDetails({...details,intervals:[{...details.intervals[0],time:NaN}]}),false);
});
test('invalid FIT is rejected and failed detail reads preserve imported totals; requests stay on Garmin',async()=>{
 assert.throws(()=>decodeGarminActivity(new Uint8Array([1,2,3])));
 const previous=globalThis.fetch,paths=[];
 globalThis.fetch=async(url)=>{paths.push(String(url));assert.ok(String(url).startsWith('https://personal.connectapi.garmin.com/'));
  if(String(url).includes('/token'))return new Response('fake-test-token');
  if(String(url).includes('/search/'))return Response.json([{activityId:123,activityType:{typeKey:'running'},startTimeLocal:'2026-11-11',distance:3820,duration:1810}]);
  return new Response('',{status:503});
 };
 try{const rows=await fetchGarmin('fake-test-key','owner','2026-11-11','2026-11-11',true);assert.equal(rows[0].distance,3.82);assert.equal(rows[0].garminDetails.status,'error');assert.equal(rows[0].time,1810);}finally{globalThis.fetch=previous;}
 assert.equal(paths.length,4);
});
test('fetches FIT details and caches successful steps for historical linked records',async()=>{
 const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url)=>{calls++;if(String(url).includes('/token'))return new Response('fake-test-token');if(String(url).includes('/search/'))return Response.json([]);if(String(url).includes('/download-'))return new Response(fitBytes());return Response.json({splitSummaries:[]});};
 try{
  const saved={...activity(),actualDate:'2026-11-01',date:'2026-11-01'};
  const rows=await fetchGarmin('fake-test-key','owner','2026-11-10','2026-11-11',true,[saved]);assert.equal(rows[0].garminDetails.status,'complete');assert.equal(rows[0].date,'2026-11-01');assert.equal(calls,4);
  calls=0;await fetchGarmin('fake-test-key','owner','2026-11-10','2026-11-11',true,rows);assert.equal(calls,2);
 }finally{globalThis.fetch=previous;}
});
test('retry timing is bounded and oversized downloads are rejected',async()=>{
 assert.equal(needsGarminDetails({version:1,status:'complete',checkedAt}),false);
 assert.equal(needsGarminDetails({version:1,status:'error',checkedAt},Date.parse(checkedAt)+60000),false);
 assert.equal(needsGarminDetails({version:1,status:'error',checkedAt},Date.parse(checkedAt)+3600001),true);
 await assert.rejects(()=>boundedBytes(new Response(new Uint8Array(20)),10));
});

test('uses associated workout metadata when FIT has lap step indexes but no step definitions',()=>{
 const groups=decodeGarminActivity(fitBytes(false),[{stepIndex:0,intensity:'WARMUP'},{stepIndex:1,intensity:'ACTIVE'},{stepIndex:2,intensity:'COOLDOWN'}]);
 assert.deepEqual(groups.map(g=>g.type),['warmup','run','cooldown']);assert.equal(groups[1].laps.length,3);
});
test('rate limiting stops enrichment and keeps available measured summaries',async()=>{
 const previous=globalThis.fetch;let downloads=0;
 globalThis.fetch=async(url)=>{if(String(url).includes('/token'))return new Response('fake-test-token');if(String(url).includes('/search/'))return Response.json([{activityId:123,activityType:{typeKey:'running'},startTimeLocal:'2026-11-11',distance:3820,duration:1810}]);if(String(url).includes('/download-')){downloads++;return new Response('',{status:429});}return Response.json({splitSummaries:[{splitType:'INTERVAL_WARMUP',duration:300,distance:480}]});};
 try{const rows=await fetchGarmin('fake-test-key','owner','2026-11-11','2026-11-11',true);assert.equal(rows[0].garminDetails.status,'summary');assert.equal(rows[0].garminDetails.intervals[0].type,'warmup');assert.equal(downloads,1);}finally{globalThis.fetch=previous;}
});

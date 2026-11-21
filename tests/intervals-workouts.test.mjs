import test from 'node:test';
import assert from 'node:assert/strict';
import {workoutDescription,toIntervalsWorkout,previewWorkouts} from '../lib/intervals-workouts.ts';
import {uploadIntervalsWorkouts,checkIntervalsKey,checkIntervalsRunSettings} from '../lib/intervals-api.ts';
import {encryptIntervalsKey,decryptIntervalsKey} from '../lib/intervals-secret.ts';
const session=(overrides={})=>({id:'owner:plan1',kind:'run',hasPlan:true,status:'planned',date:'2026-11-26',title:'Intervalado',planNotes:'',plannedDistance:null,plannedTime:null,plannedPace:null,steps:[{label:'Caminhada inicial',detail:'5 min'},{label:'Aquecimento em corrida',detail:'1 km leve · 6:40–7:30 min/km'},{label:'Repetir 6 vezes',detail:'1 min a 5:45–5:55 min/km + 1min30s caminhando/trotando, incluindo após a última repetição'},{label:'Desaquecimento em corrida',detail:'1 km leve · 6:40–7:30 min/km'},{label:'Caminhada final',detail:'3 min'}],...overrides});
test('preserves time, absolute pace ranges, warmup and recovery after all six repetitions',()=>{
 const result=workoutDescription(session());
 assert.equal(result,'- Caminhada inicial 300s intensity=warmup\n- Aquecimento em corrida 1km 6:40-7:30/km Pace intensity=warmup\n\n6x\n- Corrida 60s 5:45-5:55/km Pace intensity=interval\n- Recuperação 90s intensity=recovery\n\n- Desaquecimento em corrida 1km 6:40-7:30/km Pace intensity=cooldown\n- Caminhada final 180s intensity=cooldown');
 const workout=toIntervalsWorkout(session());assert.equal(workout.type,'Run');assert.equal(workout.target,'PACE');assert.equal(workout.start_date_local,'2026-11-26T00:00:00');assert.equal(workout.external_id,toIntervalsWorkout(session({title:'Renomeado',date:'2026-11-27'})).external_id);
});
test('distinguishes meters from minutes, decimal km, seconds and short accelerations',()=>{
 const steps=[{label:'Corrida leve',detail:'5,5 km · 6:40–7:30 min/km'},{label:'Repetir 3 vezes',detail:'800 m a 5:35–5:45 min/km + 2 min caminhando/trotando, incluindo após a última repetição'},{label:'Repetir 4 vezes',detail:'15 s suaves a aproximadamente 5:40–5:50 min/km + 45 s muito leves, inclusive após a última'}];
 const text=workoutDescription(session({steps}));assert.match(text,/5\.5km/);assert.match(text,/800mtr 5:35-5:45\/km Pace/);assert.match(text,/- Recuperação 120s/);assert.match(text,/4x\n- Corrida 15s 5:40-5:50\/km Pace intensity=interval\n- Recuperação 45s/);
});
test('does not silently replace ambiguous instructions with a simplified workout',()=>{
 for(const steps of [[{label:'Corrida',detail:'confortável'}],[{label:'Corrida',detail:'3 km + 5 min'}],[{label:'Repetir 3 vezes',detail:'2 min a 5:30–5:00 min/km + 90s incluindo após a última'}],[{label:'Repetir 3 vezes',detail:'2 min a 5:30–6:00 min/km + 90s de descanso'}]])assert.throws(()=>workoutDescription(session({steps})));
 assert.throws(()=>workoutDescription(session({steps:[],plannedDistance:5,planNotes:'Com aquecimento e desaquecimento'})));
 const rows=previewWorkouts([session({id:'bad',steps:[{label:'Corrida',detail:'livre'}]})],'2026-11-21','2026-12-01');assert.ok(rows[0].error);assert.equal(rows[0].description,undefined);
});
test('selects only planned future runs, excludes completed, skipped, strength, standalone and out of range',()=>{
 const list=[session(),session({id:'past',date:'2026-11-20'}),session({id:'completed',status:'completed'}),session({id:'skipped',status:'skipped'}),session({id:'lift',kind:'strength'}),session({id:'no-plan',hasPlan:false}),session({id:'later',date:'2027-01-01'})];
 assert.deepEqual(previewWorkouts(list,'2026-11-21','2026-12-31').map(p=>p.id),['owner:plan1']);
});
test('uses personal authentication, stable external IDs and the documented upsert endpoint',async()=>{
 let calls=0;const workouts=[toIntervalsWorkout(session())];
 const fake=async(url,options)=>{calls++;assert.equal(url,'https://intervals.icu/api/v1/athlete/0/events/bulk?upsert=true');assert.equal(options.method,'POST');assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,'Basic '+btoa('API_KEY:example-test-key'));assert.deepEqual(JSON.parse(options.body),workouts);return Response.json([{id:42,external_id:workouts[0].external_id}]);};
 const result=await uploadIntervalsWorkouts('example-test-key',workouts,fake);assert.equal(result[0].id,42);assert.equal(calls,1);
 await assert.rejects(()=>uploadIntervalsWorkouts('example-test-key',workouts,async()=>Response.json([])),/não foi confirmado/);
});
test('does not expose upstream request or account data in error messages',async()=>{
 for(const status of [401,403,429,500])await assert.rejects(()=>checkIntervalsKey('secret',async()=>new Response('sensitive upstream body',{status})),error=>!error.message.includes('sensitive')&&!error.message.includes('secret'));
});
test('does not follow redirects or disclose the redirect destination',async()=>{
 let calls=0;
 await assert.rejects(()=>checkIntervalsKey('example-key',async(_url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://unexpected.example/private'}});}),error=>/redirecionou/.test(error.message)&&!error.message.includes('unexpected.example'));
 assert.equal(calls,1);
});
test('encrypts the API key using a random nonce, binds it to the user and detects tampering',async()=>{
 const secret=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
 const first=await encryptIntervalsKey('example-private-key','owner',secret),second=await encryptIntervalsKey('example-private-key','owner',secret);
 assert.notEqual(first,second);assert.equal(first.includes('example-private-key'),false);assert.equal(await decryptIntervalsKey(first,'owner',secret),'example-private-key');
 await assert.rejects(()=>decryptIntervalsKey(first,'viewer',secret));
 await assert.rejects(()=>decryptIntervalsKey(first.slice(0,-3)+'AAA','owner',secret));
});

test('blocks export when running threshold or pace zones are missing without changing sport settings',async()=>{
 for(const settings of [{},{threshold_pace:0,pace_zones:[90]},{threshold_pace:3},{threshold_pace:3,pace_zones:[]}]){
  await assert.rejects(()=>checkIntervalsRunSettings('example-key',async(url,options)=>{
   assert.equal(url,'https://intervals.icu/api/v1/athlete/0/sport-settings/Run');assert.equal(options.method,'GET');return Response.json(settings);
  }),/Ritmo de limiar/);
 }
 await checkIntervalsRunSettings('example-key',async()=>Response.json({threshold_pace:3,pace_zones:[75,90,100,110]}));
});

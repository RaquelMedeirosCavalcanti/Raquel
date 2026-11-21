import test from 'node:test';
import assert from 'node:assert/strict';
import {assertWorkoutStructure} from '../lib/intervals-structure.ts';
import {toIntervalsWorkout} from '../lib/intervals-workouts.ts';
const simple={name:'Leve',description:'- Caminhada inicial 300s intensity=warmup\n- Corrida leve 5km 6:40-7:30/km Pace intensity=active\n- Caminhada final 180s intensity=cooldown'};
const doc={steps:[{duration:300,intensity:'warmup'},{distance:5000,intensity:'active',pace:{start:400,end:450,units:'secs/km'}},{duration:180,intensity:'cooldown'}]};
test('requires real steps with the prescribed distances, times, intensity and absolute pace targets',()=>{
 assert.doesNotThrow(()=>assertWorkoutStructure(simple,doc));
 for(const bad of [undefined,{}, {steps:[]},{steps:[{}]}, {steps:doc.steps.slice(1)}])assert.throws(()=>assertWorkoutStructure(simple,bad));
 for(const mutate of [d=>delete d.steps[1].pace,d=>d.steps[1].pace.units='pace_zone',d=>d.steps[1].pace.end=460,d=>d.steps[1].distance=4000,d=>d.steps[0].duration=3000,d=>d.steps[0].intensity='active',d=>d.steps[1].reps=2]){
  const bad=structuredClone(doc);mutate(bad);assert.throws(()=>assertWorkoutStructure(simple,bad));
 }
});
test('keeps repeat groups and recovery after the final repetition',()=>{
 const workout={name:'Intervalado',description:'- Caminhada 300s intensity=warmup\n\n6x\n- Corrida 60s 5:45-5:55/km Pace intensity=interval\n- Recuperação 90s intensity=recovery\n\n- Caminhada 180s intensity=cooldown'};
 const parsed={steps:[{duration:300,intensity:'warmup'},{reps:6,steps:[{duration:60,intensity:'interval',pace:{start:345,end:355,units:'secs/km'}},{duration:90,intensity:'recovery'}]},{duration:180,intensity:'cooldown'}]};
 assert.doesNotThrow(()=>assertWorkoutStructure(workout,parsed));
 for(const mutate of [d=>d.steps[1].reps=5,d=>d.steps[1].steps.pop(),d=>d.steps[1].steps[0].intensity='active']){
  const bad=structuredClone(parsed);mutate(bad);assert.throws(()=>assertWorkoutStructure(workout,bad));
 }
});
test('simple distance-only planning still produces a valid active step',()=>{
 const workout=toIntervalsWorkout({id:'plan',kind:'run',hasPlan:true,date:'2026-11-23',title:'Leve',planNotes:'',plannedDistance:5});
 assert.doesNotThrow(()=>assertWorkoutStructure(workout,{steps:[{distance:5000,intensity:'active'}]}));
});

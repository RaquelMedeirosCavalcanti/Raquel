import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchingSeriesSessions,sessionExercises,withExerciseSets,setsLabel} from '../lib/strength-series.ts';
const plan=JSON.parse(readFileSync(new URL('../lib/training-plan.json',import.meta.url)));
const original=plan.sessions.find(s=>s.kind==='strength'&&s.workout==='B');

test('limits the sequence to planned sessions with the same workout model',()=>{
 const data=[original,...['planned','completed','adapted','light','skipped'].map((status,i)=>({...original,id:`b-${i}`,status})),{...original,id:'other-model',workout:'A'},{...original,id:'unplanned',hasPlan:false},{...original,id:'run',kind:'run'}];
 assert.deepEqual(matchingSeriesSessions(data,original).map(s=>s.id),['b-0']);
 assert.deepEqual(matchingSeriesSessions(data,{...original,hasPlan:false}),[]);
});
test('materializes reduced templates and keeps all other session and exercise data',()=>{
 const s={...original,notes:'Minha observação',exercises:[{name:'Meu exercício',sets:2,reps:'8–12',rest:'60 s',load:'10 kg',actualReps:'10 / 10'}]};
 const snapshot=structuredClone(s),changed=withExerciseSets(s,3);
 assert.equal(changed.exercises[0].sets,3);
 assert.deepEqual(changed.exercises[0],{...s.exercises[0],sets:3});
 assert.equal(changed.notes,s.notes);
 assert.match(changed.planNotes,/3 séries por exercício/);
 assert.deepEqual(s,snapshot);
 assert.equal(setsLabel(changed),'3 séries por exercício');
 const template=withExerciseSets({...original,exercises:undefined,reduced:true},3);
 assert.ok(template.exercises.length>0);
 assert.ok(template.exercises.every(e=>e.sets===3));
 assert.equal(sessionExercises({...original,exercises:[]}).length,0);
});
test('updates all pending occurrences, preserving completed history and other workout models',()=>{
 const data=plan.sessions;
 const history={...original,id:'history',status:'completed',exercises:[{name:'Personalizado',sets:2,reps:'10',load:'8 kg',rest:'60 s'}]};
 const targets=matchingSeriesSessions([...data,history],original);
 assert.equal(targets.length,data.filter(s=>s.id!==original.id&&s.kind==='strength'&&s.workout==='B'&&s.status==='planned').length);
 const updated=targets.map(s=>withExerciseSets(s,3));
 assert.ok(updated.every(s=>s.exercises.every(e=>e.sets===3)));
 assert.equal(history.exercises[0].sets,2);
 assert.ok(targets.every(s=>s.workout==='B'));
});

import plan from './training-plan.json' with {type:'json'};
import type {Exercise,Session} from './runs';

export type SeriesChange={sets:number;workout:NonNullable<Session['workout']>};
export function sessionExercises(s:Session):Exercise[]{
 return s.exercises??(s.workout?plan.workouts[s.workout].exercises.map(e=>({name:String(e[0]),sets:s.reduced?2:Number(e[1]),reps:String(e[2]),rest:String(e[3]),load:''})):[]);
}
export function matchingSeriesSessions(data:Session[],s:Session):Session[]{
 if(s.kind!=='strength'||!s.workout||!s.hasPlan)return [];
 return data.filter(x=>x.id!==s.id&&x.kind==='strength'&&x.hasPlan&&x.workout===s.workout&&x.status==='planned').sort((a,b)=>a.date.localeCompare(b.date));
}
export function withExerciseSets(s:Session,sets:number):Session{
 return {...s,exercises:sessionExercises(s).map(e=>({...e,sets})),planNotes:s.planNotes.replace(/\b\d+ séries por exercício\./g,`${sets} séries por exercício.`)};
}
export function setsLabel(s:Session):string{
 const values=[...new Set(sessionExercises(s).map(e=>e.sets))];
 return values.length===1?`${values[0]} séries por exercício`:'Séries conforme a tabela';
}

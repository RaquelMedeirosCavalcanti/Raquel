import type {IntervalsWorkout} from './intervals-workouts.ts';

type Step={duration?:number;distance?:number;pace?:{start?:number;end?:number;value?:number;units?:string};intensity?:string;reps?:number;steps?:Step[]};
const close=(a:unknown,b:number)=>typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<0.1;
const seconds=(v:string)=>{const [m,s]=v.split(':').map(Number);return m*60+s;};

// Compare the parsed response with the complete prescription, including repeat
// boundaries. A successful HTTP response alone does not confirm a workout.
export function assertWorkoutStructure(workout:IntervalsWorkout,doc:unknown){
 const mismatch=()=>{throw Error(`${workout.name}: o Intervals.icu não confirmou todas as etapas, repetições e metas de pace. O treino não foi marcado como enviado. Confira as configurações de ritmo da corrida no Intervals.icu e tente novamente.`);};
 const expected:Step[]=[],root=expected;
 let block:Step[]|undefined;
 for(const raw of workout.description.split('\n')){
  const text=raw.trim();
  if(!text){block=undefined;continue;}
  const repeat=text.match(/^(\d+)x$/);
  if(repeat){block=[];root.push({reps:Number(repeat[1]),steps:block});continue;}
  const match=text.match(/^- .*?\s(\d+(?:\.\d+)?)(s|km|mtr)(?:\s+(\d+:\d{2})(?:-(\d+:\d{2}))?\/km Pace)?\s+intensity=(warmup|active|interval|recovery|cooldown)$/);
  if(!match)mismatch();
  const [,amount,unit,low,high,intensity]=match!;
  const step:Step={intensity,...(unit==='s'?{duration:Number(amount)}:{distance:Number(amount)*(unit==='km'?1000:1)}),...(low?{pace:{start:seconds(low),end:seconds(high||low),units:'secs/km'}}:{})};
  (block||root).push(step);
 }
 const actual=(doc as {steps?:unknown})?.steps;
 function compare(wanted:Step[],received:unknown):boolean{
  if(!Array.isArray(received)||received.length!==wanted.length)return false;
  return wanted.every((w,i)=>{
   const r=received[i] as Step;
   if(!r||typeof r!=='object')return false;
   if(w.steps)return r.reps===w.reps&&compare(w.steps,r.steps);
   if(r.steps||r.reps)return false;
   if(w.distance!==undefined&&!close(r.distance,w.distance))return false;
   if(w.duration!==undefined&&!close(r.duration,w.duration))return false;
   if(r.intensity!==w.intensity)return false;
   if(w.pace){
    if(r.pace?.units!=='secs/km')return false;
    const bounds=[r.pace.start??r.pace.value,r.pace.end??r.pace.value].sort((a,b)=>(a??0)-(b??0));
    if(!close(bounds[0],w.pace.start!)||!close(bounds[1],w.pace.end!))return false;
   }else if(r.pace)return false;
   return true;
  });
 }
 if(!expected.length||!compare(expected,actual))mismatch();
}

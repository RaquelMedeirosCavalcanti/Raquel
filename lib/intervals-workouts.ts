import type {Session} from './runs.ts';

export type IntervalsWorkout={category:'WORKOUT';type:'Run';start_date_local:string;name:string;description:string;external_id:string;target:'PACE'};
export type WorkoutPreview={id:string;date:string;title:string;description?:string;error?:string};
export class WorkoutConversionError extends Error {}
const fail=(message:string):never=>{throw new WorkoutConversionError(message)};
const clock=(seconds:number)=>`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
const positive=(value:number)=>Number.isFinite(value)&&value>0;

function duration(text:string):string {
 const distance=text.match(/^\s*(\d+(?:[.,]\d+)?)\s*(km|m)(?![a-z])/i);
 if(distance){const n=Number(distance[1].replace(',','.'));if(positive(n))return `${n}${distance[2].toLowerCase()==='km'?'km':'mtr'}`;}
 const time=text.match(/^\s*(?:(\d+)\s*(?:min|m)(?![a-z])\s*)?(?:(\d+)\s*(?:s|seg)(?![a-z]))?/i);
 const seconds=time?Number(time[1]||0)*60+Number(time[2]||0):0;
 if(positive(seconds))return `${seconds}s`;
 return fail('A etapa precisa começar com uma duração ou distância explícita.');
}
function paceTarget(text:string):string {
 const match=text.match(/\b(\d{1,2}):([0-5]\d)(?:\s*[-–—]\s*(\d{1,2}):([0-5]\d))?\s*(?:min\s*\/\s*km|\/\s*km)/i);
 if(!match){
  if(/\d\s*[:%]|\b(?:z[1-5]|bpm)\b/i.test(text))fail('A meta desta etapa precisa de revisão antes do envio.');
  return '';
 }
 const a=Number(match[1])*60+Number(match[2]),b=match[3]?Number(match[3])*60+Number(match[4]):a;
 if(!positive(a)||!positive(b)||a>b)fail('Confira os limites de pace da etapa.');
 return ` ${clock(a)}${a===b?'':'-'+clock(b)}/km Pace`;
}
function line(label:string,detail:string,intensity?:string):string {
 if(/[+\n\r]|\bou\s+\d/i.test(detail))fail('Esta etapa tem alternativas ou vários trechos. Separe-os antes do envio.');
 // Cue text must not be interpreted as another duration by the workout parser.
 const cue=label.replace(/[\r\n]/g,' ').replace(/\d/g,'').trim().slice(0,100);
 const kind=intensity||(/aquecimento|inicial/i.test(label)&&!/desaquecimento/i.test(label)?'warmup':/desaquecimento|final/i.test(label)?'cooldown':/recupera|descanso/i.test(label)?'recovery':'active');
 return `- ${cue} ${duration(detail)}${paceTarget(detail)} intensity=${kind}`;
}
export function workoutDescription(session:Session):string {
 if(session.kind&&session.kind!=='run')fail('O envio está disponível para treinos de corrida.');
 if(!session.hasPlan)fail('Este registro não tem planejamento.');
 const result:string[]=[];
 if(session.steps?.length){
  for(const step of session.steps){
   const repeat=step.label.match(/^\s*Repetir\s+(\d+)\s+vezes\s*$/i);
   try{
    if(repeat){
     const count=Number(repeat[1]),parts=step.detail.split('+');
     if(count<1||count>50||parts.length!==2)fail('Confira o bloco de repetições.');
     if(!/inclus|ap[oó]s\s+(?:a\s+)?[uú]ltima/i.test(parts[1]))fail('Especifique se a recuperação ocorre também após a última repetição.');
     result.push(`\n${count}x\n${line('Corrida',parts[0],'interval')}\n${line('Recuperação',parts[1])}\n`);
    }else result.push(line(step.label,step.detail));
   }catch(e){fail(`${step.label}: ${e instanceof Error?e.message:'revise a etapa.'}`);}
  }
 }else{
  // Never silently discard a prescription expressed only in free text.
  if(session.planNotes.trim())fail('Descreva o planejamento em etapas para preservar todos os trechos.');
  if(positive(session.plannedDistance??0))result.push(`- Corrida ${session.plannedDistance}km`);
  else if(positive(session.plannedTime??0))result.push(`- Corrida ${session.plannedTime}s`);
  else fail('Informe etapas, distância ou duração planejadas.');
  const low=session.plannedPaceMin??session.plannedPace,high=session.plannedPaceMax??low;
  if(low!=null&&high!=null)result[0]+=paceTarget(`${clock(Math.round(low))}–${clock(Math.round(high))} min/km`);
  result[0]+=' intensity=active';
 }
 return result.join('\n').trim();
}
export function toIntervalsWorkout(session:Session):IntervalsWorkout {
 return {category:'WORKOUT',type:'Run',start_date_local:session.date+'T00:00:00',name:session.title.slice(0,120),description:workoutDescription(session),external_id:'meu-ritmo:'+session.id,target:'PACE'};
}
export function previewWorkouts(sessions:Session[],from:string,to:string):WorkoutPreview[]{
 return sessions.filter(s=>(!s.kind||s.kind==='run')&&s.hasPlan&&s.status==='planned'&&s.date>=from&&s.date<=to).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)).map(s=>{
  try{return {id:s.id,date:s.date,title:s.title,description:workoutDescription(s)}}catch(e){return {id:s.id,date:s.date,title:s.title,error:e instanceof Error?e.message:'Revise as etapas.'}}
 });
}

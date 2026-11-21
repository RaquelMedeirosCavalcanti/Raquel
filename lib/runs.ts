import {validateGarminDetails,type GarminDetails} from './garmin-intervals.ts';
export type Status = 'planned'|'completed'|'adapted'|'light'|'skipped';
export type Exercise = {name:string;sets:number;reps:string;rest:string;load:string;actualReps?:string};
export type Session = {feedback?:{pain:number|null;recovery:''|'good'|'regular'|'poor';reserve:number|null};garminActiveCalories?:number|null;garminCaloriesVersion?:2;garminMetricsCheckedAt?:string;calories?:number|null;calorieType?:'active'|'total'|'unspecified';calorieSource?:'garmin'|'manual';garminCaloriesCheckedAt?:string;garminDistanceCheckedAt?:string;garminDetails?:GarminDetails;modality?:string;avgHr?:number|null;exercises?:Exercise[];sourceId?:string;id:string; kind?:'run'|'strength'|'walk'|'pilates'|'other'; workout?:'A'|'B'|'C'|'D'; optional?:boolean; reduced?:boolean; rir?:string; strengthLog?:string; plannedPaceMin?:number; plannedPaceMax?:number; steps?:{label:string;detail:string}[]; hasPlan:boolean; date:string; actualDate:string; title:string; status:Status; plannedDistance:number|null; plannedTime:number|null; plannedPace:number|null; planNotes:string; distance:number|null; time:number|null; effort:number|null; notes:string};
export const statuses: Record<Status,string>={planned:'Planejado',completed:'Realizado',adapted:'Adaptado',light:'Leve',skipped:'Não realizado'};
export const isDone=(s:Session)=>['completed','adapted','light'].includes(s.status);
export function parseTime(s:string):number|null{if(!s.trim())return null;if(!/^\d{1,3}:[0-5]\d(?::[0-5]\d)?$/.test(s))return NaN;return s.split(':').reduce((a,b)=>a*60+Number(b),0)}
export function timeText(n:number|null|undefined){if(n==null||!Number.isFinite(n))return '—';const s=Math.round(n);return s>=3600?`${Math.floor(s/3600)}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`:`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}
export const pace=(s:Session)=>s.distance&&s.time?s.time/s.distance:null;
export function dayKey(d:Date){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
export function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date())}
export function monday(key:string){const d=new Date(key+'T12:00:00');d.setDate(d.getDate()-(d.getDay()+6)%7);return dayKey(d)}
export function addDays(key:string,n:number){const d=new Date(key+'T12:00:00');d.setDate(d.getDate()+n);return dayKey(d)}
export const shortDate=(key:string)=>new Date(key+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
export function validateSession(s:Session):string|null{
 if(!s||typeof s.id!=='string'||s.id.length>100||!Object.keys(statuses).includes(s.status))return 'Registro inválido.';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s.date)||Number.isNaN(new Date(s.date+'T12:00:00').valueOf())||dayKey(new Date(s.date+'T12:00:00'))!==s.date)return 'Informe uma data válida.';
 if(typeof s.title!=='string'||!s.title.trim()||s.title.length>120)return 'Informe um título de até 120 caracteres.';
 if([s.notes,s.planNotes].some(x=>typeof x!=='string'||x.length>5000))return 'As observações devem ter até 5.000 caracteres.';
 for(const n of [s.distance,s.time,s.plannedDistance,s.plannedTime,s.plannedPace])if(n!==null&&(typeof n!=='number'||!Number.isFinite(n)||n<=0))return 'Distância, tempo e pace devem ser maiores que zero.';
 if(s.effort!==null&&(!Number.isInteger(s.effort)||s.effort<1||s.effort>10))return 'O esforço deve estar entre 1 e 10.';
 if(s.kind&&s.kind!=='run'&&s.kind!=='strength'&&s.kind!=='walk'&&s.kind!=='pilates'&&s.kind!=='other')return 'Tipo de treino inválido.';
 if(s.kind==='strength'&&((s.hasPlan&&!s.workout)||(s.workout&&!['A','B','C','D'].includes(s.workout))))return 'Treino de musculação inválido.';
 if(s.strengthLog!==undefined&&(typeof s.strengthLog!=='string'||s.strengthLog.length>5000))return 'O registro deve ter até 5.000 caracteres.';
 if(s.calories!=null&&(typeof s.calories!=='number'||!Number.isFinite(s.calories)||s.calories<0))return 'Calorias devem ser um número maior ou igual a zero.';
 if(s.garminActiveCalories!=null&&(typeof s.garminActiveCalories!=='number'||!Number.isFinite(s.garminActiveCalories)||s.garminActiveCalories<0))return 'Calorias ativas inválidas.';
 if(s.garminCaloriesVersion!==undefined&&s.garminCaloriesVersion!==2)return 'Versão de calorias inválida.';
 if(s.garminMetricsCheckedAt!==undefined&&(typeof s.garminMetricsCheckedAt!=='string'||!Number.isFinite(Date.parse(s.garminMetricsCheckedAt))))return 'Data de consulta inválida.';
 if(s.calorieType!==undefined&&!['active','total','unspecified'].includes(s.calorieType))return 'Tipo de calorias inválido.';
 if(s.calorieSource!==undefined&&!['garmin','manual'].includes(s.calorieSource))return 'Origem de calorias inválida.';
 if(s.garminDistanceCheckedAt!==undefined&&(typeof s.garminDistanceCheckedAt!=='string'||!Number.isFinite(Date.parse(s.garminDistanceCheckedAt))))return 'Data de consulta da distância inválida.';
 if(s.garminCaloriesCheckedAt!==undefined&&(typeof s.garminCaloriesCheckedAt!=='string'||!Number.isFinite(Date.parse(s.garminCaloriesCheckedAt))))return 'Data de consulta de calorias inválida.';
 if(s.avgHr!=null&&(!Number.isFinite(s.avgHr)||s.avgHr<20||s.avgHr>250))return 'Frequência cardíaca deve estar entre 20 e 250 bpm.';
 if(s.exercises&&(!Array.isArray(s.exercises)||s.exercises.length>40||s.exercises.some(e=>!e.name||e.name.length>120||!Number.isInteger(e.sets)||e.sets<1||e.sets>30||[e.reps,e.rest,e.load,e.actualReps||''].some(v=>typeof v!=='string'||v.length>200))))return 'Revise os exercícios, séries e cargas.';
 if(s.steps&&(!Array.isArray(s.steps)||s.steps.length>30||s.steps.some(e=>typeof e.label!=='string'||typeof e.detail!=='string'||e.label.length>200||e.detail.length>1000)))return 'Revise as etapas do treino.';
 if(s.garminDetails&&!validateGarminDetails(s.garminDetails))return 'Detalhes Garmin inválidos.';
 if(s.modality&&(typeof s.modality!=='string'||s.modality.length>100))return 'Modalidade inválida.';
 if(isDone(s)){if((s.kind==='walk'||s.kind==='pilates')&&!s.time)return 'Informe o tempo realizado.';if((!s.kind||s.kind==='run')&&(!s.distance||!s.time))return 'Informe a distância e o tempo realizados.';if(!/^\d{4}-\d{2}-\d{2}$/.test(s.actualDate)||dayKey(new Date(s.actualDate+'T12:00:00'))!==s.actualDate)return 'Informe a data de realização.';if(s.actualDate>today())return 'A realização não pode estar no futuro.';}
 else if(s.distance!==null||s.time!==null||s.effort!==null||s.avgHr!=null||s.calories!=null)return 'Treinos sem realização não devem ter resultados.';
 return null;
}

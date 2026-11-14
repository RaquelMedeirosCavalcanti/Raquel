export type IntervalType = 'warmup'|'run'|'recovery'|'rest'|'cooldown'|'other';
export type GarminLap = {index:number;type:IntervalType;time:number|null;distance:number|null;avgHr:number|null;stepIndex?:number};
export type GarminInterval = GarminLap & {label:string;laps?:GarminLap[];count?:number};
export type GarminDetails = {version:1;status:'complete'|'summary'|'unavailable'|'error';source?:'fit'|'api';checkedAt:string;intervals:GarminInterval[]};
export const intervalLabels:Record<IntervalType,string>={warmup:'Aquecimento',run:'Corrida',recovery:'Recuperação',rest:'Descanso',cooldown:'Desaquecimento',other:'Volta'};
const nonnegative=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const duration=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>0?v:null;
const heartRate=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=20&&v<=250?v:null;
export function intervalType(value:unknown):IntervalType {
 const key=String(value??'').replaceAll('_','').toLowerCase();
 return /warmup$/.test(key)?'warmup':/cooldown$/.test(key)?'cooldown':/recovery$/.test(key)?'recovery':/rest$/.test(key)?'rest':/^(active|interval|intervalactive|runactive)$/.test(key)?'run':'other';
}
// Summary rows may combine several repetitions. Keep them identified as summaries;
// do not turn prescribed durations into measured results or fabricate a sequence.
export function summaryIntervals(rows:unknown):GarminInterval[] {
 if(!Array.isArray(rows))return [];
 return rows.filter(r=>r&&/^INTERVAL_(ACTIVE|WARMUP|COOLDOWN|REST|RECOVERY|OTHER)$/.test(r.splitType)).slice(0,500).flatMap((r,i)=>{
  const type=intervalType(r.splitType),time=duration(r.duration),meters=nonnegative(r.distance);
  if(time===null&&meters===null)return [];
  const count=Number.isInteger(r.noOfSplits)&&r.noOfSplits>0?r.noOfSplits:1;
  return [{index:i,type,label:intervalLabels[type],time,distance:meters===null?null:meters/1000,avgHr:heartRate(r.averageHR),count}];
 });
}
export function fitIntervals(laps:Record<string,any>[],steps:Record<string,any>[]=[]):GarminInterval[] {
 const stepMap=new Map(steps.map(s=>[s.messageIndex??s.stepIndex,s]));
 const groups:GarminInterval[]=[];
 for(const [index,r] of laps.slice(0,500).entries()){
  const time=duration(r.totalTimerTime),meters=nonnegative(r.totalDistance);
  if(time===null&&meters===null)continue;
  const stepIndex=Number.isInteger(r.wktStepIndex)&&r.wktStepIndex>=0&&r.wktStepIndex<65535?r.wktStepIndex:undefined;
  const step=stepMap.get(stepIndex),type=intervalType(step?.intensity??r.intensity);
  const lap:GarminLap={index,type,time,distance:meters===null?null:meters/1000,avgHr:heartRate(r.avgHeartRate),...(stepIndex===undefined?{}:{stepIndex})};
  const previous=groups.at(-1);
  if(previous&&previous.type===type&&type!=='other'&&previous.stepIndex===stepIndex){previous.laps!.push(lap);}
  else groups.push({...lap,index:groups.length,label:intervalLabels[type],laps:[lap]});
 }
 for(const g of groups){
  const laps=g.laps!;
  g.time=laps.every(l=>l.time!==null)?laps.reduce((n,l)=>n+l.time!,0):null;
  g.distance=laps.every(l=>l.distance!==null)?laps.reduce((n,l)=>n+l.distance!,0):null;
  // Missing heart rate is shown as missing; never average averages without weights.
  g.avgHr=laps.every(l=>l.avgHr!==null&&l.time!==null)&&g.time?laps.reduce((n,l)=>n+l.avgHr!*l.time!,0)/g.time:null;
 }
 return groups;
}
export function needsGarminDetails(details:GarminDetails|undefined,now=Date.now()){
 if(!details||details.version!==1)return true;
 if(details.status==='complete')return false;
 return now-Date.parse(details.checkedAt)>(details.status==='error'?3600000:86400000);
}
export function validateGarminDetails(d:GarminDetails):boolean {
 if(!d||d.version!==1||!['complete','summary','unavailable','error'].includes(d.status)||typeof d.checkedAt!=='string'||!Number.isFinite(Date.parse(d.checkedAt))||!Array.isArray(d.intervals)||d.intervals.length>500)return false;
 const valid=(l:GarminLap)=>l&&Number.isInteger(l.index)&&l.index>=0&&l.type in intervalLabels&&[l.time,l.distance].every(v=>v===null||typeof v==='number'&&Number.isFinite(v)&&v>=0)&&(l.avgHr===null||heartRate(l.avgHr)!==null);
 return d.intervals.every(g=>valid(g)&&typeof g.label==='string'&&g.label.length<=120&&(!g.laps||Array.isArray(g.laps)&&g.laps.length<=500&&g.laps.every(valid)));
}

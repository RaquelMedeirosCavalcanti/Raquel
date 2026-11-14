import {garminCalories,type CalorieData} from './calories.ts';
import {automaticActivity,sessionKind} from './modalities.ts';
import {normalizeGarmin} from './garmin-reconcile.ts';
import {isDone,type Session} from './runs.ts';
import {needsGarminDetails,summaryIntervals,type GarminDetails} from './garmin-intervals.ts';
import {decodeGarminActivity} from './garmin-fit.ts';
import {roundDistance} from './distances.ts';
const base='https://personal.connectapi.garmin.com';
const MAX_FILE_BYTES=6*1024*1024;
const positive=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)&&value>0?value:null;
// Activity details use summaryDTO; the activity list exposes these fields at the root.
export function garminTotals(activity:Record<string,any>):{distance:number|null;time:number|null;avgHr:number|null}{
 const summary=activity.summaryDTO||{};
 const meters=positive(summary.distance)??positive(activity.distance);
 return {distance:meters===null?null:(roundDistance(meters/1000)||null),time:positive(summary.duration)??positive(activity.duration),avgHr:positive(summary.averageHR)??positive(activity.averageHR)};
}
// Bounded reads also protect responses without Content-Length.
export async function boundedBytes(response:Response,maxBytes:number):Promise<Uint8Array>{
 if(Number(response.headers.get('content-length'))>maxBytes){await response.body?.cancel();throw Error('Arquivo Garmin muito grande.');}
 const reader=response.body?.getReader();if(!reader)throw Error('Resposta Garmin vazia.');
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw Error('Arquivo Garmin muito grande.');chunks.push(value);}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.byteLength;}return result;
}
async function detailsForActivity(token:string,id:string,includeFit=true):Promise<{details:GarminDetails;limited:boolean;energy:CalorieData;totals:ReturnType<typeof garminTotals>}>{
 const checkedAt=new Date().toISOString();let energy:CalorieData={calories:null};let intervals:GarminDetails['intervals']=[],limited=false;
 let totals:ReturnType<typeof garminTotals>={distance:null,time:null,avgHr:null};
 const request=async(path:string)=>{
  const r=await fetch(base+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
  if(r.status===429)limited=true;
  if(!r.ok){await r.body?.cancel();throw Error('Detalhes Garmin indisponíveis.');}return r;
 };
 try{
  const r=await request('/activity-service/activity/'+id);
  const summary=JSON.parse(new TextDecoder().decode(await boundedBytes(r,2*1024*1024)));
  intervals=summaryIntervals(summary.splitSummaries);energy=garminCalories(summary);totals=garminTotals(summary);
 }catch{/* FIT can still supply steps when the summary request fails. */}
 if(!includeFit)return {energy,totals,details:{version:1,status:intervals.length?'summary':'unavailable',source:'api',checkedAt,intervals},limited};
 try{
  if(limited)throw Error('Limite de consultas.');
  const r=await request('/download-service/files/activity/'+id);
  const bytes=await boundedBytes(r,MAX_FILE_BYTES);
  let measured=decodeGarminActivity(bytes);
  if(measured.length&&measured.every(g=>g.type==='run'||g.type==='other')&&measured.some(g=>g.stepIndex!==undefined)){
   try{
    const wr=await request('/activity-service/activity/'+id+'/workouts');
    const workouts=JSON.parse(new TextDecoder().decode(await boundedBytes(wr,1024*1024)));
    const steps=Array.isArray(workouts)?workouts.flatMap(w=>Array.isArray(w.steps)?w.steps:[]):[];
    if(steps.length)measured=decodeGarminActivity(bytes,steps);
   }catch{/* Keep measured laps even if the prescription is unavailable. */}
  }
  if(intervals.some(g=>g.type==='warmup'||g.type==='cooldown')&&measured.every(g=>g.type==='run'||g.type==='other'))return {energy,totals,details:{version:1,status:'summary',source:'api',checkedAt,intervals},limited};
  if(measured.length)return {energy,totals,details:{version:1,status:'complete',source:'fit',checkedAt,intervals:measured},limited};
  return {energy,totals,details:{version:1,status:intervals.length?'summary':'unavailable',source:'api',checkedAt,intervals},limited};
 }catch{
  return {energy,totals,details:{version:1,status:intervals.length?'summary':'error',source:'api',checkedAt,intervals},limited};
 }
}
// Official Garmin Personal API. Detail failures preserve the activity totals.
export async function fetchGarmin(key:string,userId:string,from:string,to:string,runningOnly=false,known:Session[]=[]):Promise<Session[]> {
 const tr=await fetch(base+'/personalapitoken-service/personal-api/personal-api-key/token',{method:'POST',headers:{Authorization:'ApiKey '+key},signal:AbortSignal.timeout(20000)});
 if(!tr.ok)throw Error(tr.status===401||tr.status===403?'A Garmin recusou a chave. Atualize a conexão se ela expirou ou foi revogada.':'Não foi possível autenticar na Garmin. Tentaremos novamente.');
 const raw=(await tr.text()).trim();let token=raw;
 try{const parsed=JSON.parse(raw);token=typeof parsed==='string'?parsed:parsed.access_token||parsed.accessToken}catch{}
 if(typeof token!=='string'||!token)throw Error('A Garmin retornou uma autenticação não reconhecida.');
 const all:Session[]=[];let finished=false;
 for(let start=0;start<1000;start+=100){
  const params=new URLSearchParams({start:String(start),limit:'100',startDate:from,endDate:to,excludeChildren:'true',...(runningOnly?{activityType:'running'}:{})});
  const r=await fetch(base+'/activitylist-service/activities/search/activities?'+params,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error(r.status===429?'Limite de consultas Garmin atingido. Tentaremos novamente mais tarde.':'Não foi possível consultar as atividades na Garmin. Tentaremos novamente.');
  const body=await r.json();if(!Array.isArray(body))throw Error('A Garmin retornou atividades em um formato não reconhecido.');
  for(const a of body){const s=normalizeGarmin(a,userId);if(s&&s.date>=from&&s.date<=to)all.push(s);}
  if(body.length<100){finished=true;break;}
 }
 if(!finished)throw Error('Mais de 1.000 atividades no período. Consulte um intervalo menor.');
 // Enrich already linked historical records without importing new historical runs.
 for(const s of known){if(isDone(s)&&/^garmin:\d+$/.test(s.sourceId||'')&&!all.some(a=>a.sourceId===s.sourceId))all.push({...s,kind:sessionKind(s)});}
 const deadline=Date.now()+60000;let remaining=6;
 // Missing walking distance takes priority over optional running interval details.
 for(const s of [...all].sort((a,b)=>Number(sessionKind(b)==='walk'&&!b.distance)-Number(sessionKind(a)==='walk'&&!a.distance))){
  const saved=known.find(k=>k.sourceId===s.sourceId);
  if(!automaticActivity(s)&&!saved)continue;
  if(saved&&!isDone(saved))continue;
  if(saved?.garminDetails)s.garminDetails=saved.garminDetails;
  const needDetails=sessionKind(s)==='run'&&needsGarminDetails(s.garminDetails);
  const distanceCheckedAt=saved?.garminDistanceCheckedAt;
  const needDistance=sessionKind(s)==='walk'&&!s.distance&&!saved?.distance&&(!distanceCheckedAt||Date.now()-Date.parse(distanceCheckedAt)>86400000);
  const needCalories=(s.calories==null||s.calorieType!=='total')&&saved?.calorieSource!=='manual'&&(!saved?.garminCaloriesCheckedAt||saved.garminCaloriesVersion!==2||Date.now()-Date.parse(saved.garminCaloriesCheckedAt)>86400000);
  const needMetrics=sessionKind(s)==='strength'&&(!s.avgHr||!s.time||s.garminActiveCalories==null)&&(!saved?.garminMetricsCheckedAt||Date.now()-Date.parse(saved.garminMetricsCheckedAt)>86400000);
  if((!needDetails&&!needCalories&&!needDistance&&!needMetrics)||remaining<=0||Date.now()>deadline)continue;
  remaining--;
  const result=await detailsForActivity(token,s.sourceId!.slice(7),needDetails);
  if(needDetails)s.garminDetails=result.details;
  if(sessionKind(s)==='walk'&&!s.distance&&result.totals.distance)s.distance=result.totals.distance;
  if(sessionKind(s)==='walk'&&!s.time&&result.totals.time)s.time=result.totals.time;
  if(needDistance&&!result.limited)s.garminDistanceCheckedAt=new Date().toISOString();
  if(result.energy.calories!=null&&(s.calories==null||result.energy.calorieType==='total'||s.calorieType!=='total'))Object.assign(s,result.energy);
  else if(result.energy.garminActiveCalories!=null)s.garminActiveCalories=result.energy.garminActiveCalories;
  if(needMetrics){if(!s.avgHr&&result.totals.avgHr&&result.totals.avgHr>=20&&result.totals.avgHr<=250)s.avgHr=result.totals.avgHr;if(!s.time&&result.totals.time)s.time=result.totals.time;if(!result.limited)s.garminMetricsCheckedAt=new Date().toISOString();}
  if(!result.limited)s.garminCaloriesVersion=2;
  if(needCalories)s.garminCaloriesCheckedAt=new Date().toISOString();
  if(result.limited)break;
 }
 return all;
}

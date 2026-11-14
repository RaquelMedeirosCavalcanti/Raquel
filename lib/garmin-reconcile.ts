import {garminCalories,mergeGarminCalories} from './calories.ts';
import {isDone, type Session} from './runs.ts';
import {sessionKind,automaticActivity,isStrengthType} from './modalities.ts';

import {normalizeSessionDistances,roundDistance} from './distances.ts';

export type ReviewRun={session:Session;reason:string};
export function normalizeGarmin(a:Record<string,any>,userId:string):Session|null {
 const id=String(a.activityId??'');
 if(!/^\d+$/.test(id))return null;
 const kindKey=String(a.activityType?.typeKey||'');
 const run=/^(running|.*_running|treadmill|trail_run)$/.test(kindKey);
 const strength=isStrengthType(kindKey);
 const walk=/^(walking|.*_walking)$/.test(kindKey);
 const pilates=kindKey==='pilates';
 const date=String(a.startTimeLocal||'').slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
 const positive=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>0?v:null;
 const hr=positive(a.averageHR);
 return {...garminCalories(a),garminCaloriesVersion:2,id:`${userId}:garmin-${id}`,sourceId:`garmin:${id}`,kind:run?'run':strength?'strength':walk?'walk':pilates?'pilates':'other',modality:run?'Corrida':strength?'Musculação':walk?'Caminhada':pilates?'Pilates':/cycling/.test(kindKey)?'Ciclismo':kindKey.replaceAll('_',' ').slice(0,100),...(strength?{exercises:[]}:{}),hasPlan:false,date,actualDate:date,title:String(a.activityName||'Atividade Garmin').slice(0,120),status:'completed',plannedDistance:null,plannedTime:null,plannedPace:null,planNotes:'',distance:(run||walk)&&positive(a.distance)?(roundDistance(a.distance/1000)||null):null,time:positive(a.duration),avgHr:hr&&hr>=20&&hr<=250?hr:null,effort:null,notes:'Importado do Garmin Connect.'};
}

export function completeFromGarmin(plan:Session,activity:Session):Session {
 return normalizeSessionDistances({...mergeGarminCalories(plan,activity),status:'completed',actualDate:activity.actualDate,distance:activity.distance,time:activity.time,avgHr:activity.avgHr,sourceId:activity.sourceId,...(activity.garminDetails?{garminDetails:activity.garminDetails}:{}),...(activity.garminCaloriesVersion?{garminCaloriesVersion:activity.garminCaloriesVersion}:{})});
}

// Only an unambiguous same-modality activity/plan pair is automatically linked. Historical
// manual records, skipped days and multiple recordings require the owner's choice.
export function reconcileGarmin(existing:Session[],incoming:Session[]) {
 const changes:Session[]=[],review:ReviewRun[]=[];
 const seen=new Set(existing.map(s=>s.sourceId).filter(Boolean));
 const unique=incoming.filter((s,i,a)=>s.sourceId&&(automaticActivity(s)||existing.some(x=>x.sourceId===s.sourceId&&isDone(x)))&&a.findIndex(x=>x.sourceId===s.sourceId)===i);
 let completed=0,imported=0;
 for(const activity of unique){
  if(seen.has(activity.sourceId)){
   const saved=existing.find(s=>s.sourceId===activity.sourceId);
   if(saved&&isDone(saved)){
    const enriched=normalizeSessionDistances({...mergeGarminCalories(saved,activity),...(sessionKind(activity)==='strength'?{kind:'strength' as const,modality:'Musculação',...(!saved.avgHr&&activity.avgHr?{avgHr:activity.avgHr}:{}),...(!saved.time&&activity.time?{time:activity.time}:{})}:{}),...(sessionKind(saved)==='walk'&&saved.distance==null&&activity.distance?{distance:activity.distance}:{}),...(activity.garminDetails?{garminDetails:activity.garminDetails}:{}),...(activity.garminCaloriesCheckedAt?{garminCaloriesCheckedAt:activity.garminCaloriesCheckedAt}:{}),...(activity.garminDistanceCheckedAt?{garminDistanceCheckedAt:activity.garminDistanceCheckedAt}:{}),...(activity.garminCaloriesVersion?{garminCaloriesVersion:activity.garminCaloriesVersion}:{}),...(activity.garminMetricsCheckedAt?{garminMetricsCheckedAt:activity.garminMetricsCheckedAt}:{})});
    if(JSON.stringify(saved)!==JSON.stringify(enriched))changes.push(enriched);
   }
   continue;
  }
  const kind=sessionKind(activity);
  if(!activity.time||(kind==='run'&&!activity.distance)){review.push({session:activity,reason:kind==='run'?'Atividade sem distância ou tempo válidos.':'Atividade sem tempo válido.'});continue;}
  const day=activity.actualDate;
  const plans=existing.filter(s=>sessionKind(s)===kind&&s.hasPlan&&s.date===day);
  const others=existing.filter(s=>sessionKind(s)===kind&&isDone(s)&&s.actualDate===day);
  const onDay=unique.filter(s=>sessionKind(s)===kind&&s.actualDate===day);
  if(plans.length===1&&plans[0].status==='planned'&&onDay.length===1&&!others.length){
   changes.push(completeFromGarmin(plans[0],activity));completed++;
  }else if(!plans.length&&(kind==='run'?!others.length&&onDay.length===1:!others.some(s=>!s.sourceId))){
   changes.push(normalizeSessionDistances(activity));imported++;
  }else{
   review.push({session:activity,reason:others.length?'Já existe uma atividade desta modalidade registrada neste dia.':onDay.length>1?'Há mais de uma atividade desta modalidade no Garmin neste dia.':plans.length>1?'Há mais de um treino programado neste dia.':'O treino deste dia já foi encerrado ou marcado como não realizado.'});
  }
  seen.add(activity.sourceId);
 }
 return {changes,review,completed,imported};
}

import type {Session} from './runs.ts';
export type CalorieType='active'|'total'|'unspecified';
export type CalorieData={calories:number|null;calorieType?:CalorieType;calorieSource?:'garmin'|'manual';garminActiveCalories?:number|null};
const valid=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
// Activity-level values only. Keep total energy primary and active energy separate.
export function garminCalories(a:Record<string,any>):CalorieData{
 const values=[a.summaryDTO,a].filter(Boolean);
 let active:number|undefined;
 for(const v of values)if(valid(v.activeCalories)){active=v.activeCalories;break;}
 for(const v of values){
  if(!valid(v.calories))continue;
  if(active===undefined&&valid(v.bmrCalories)&&v.bmrCalories<=v.calories)active=v.calories-v.bmrCalories;
  return {calories:v.calories,calorieType:'total',calorieSource:'garmin',...(active===undefined?{}:{garminActiveCalories:active})};
 }
 // Never label active-only data as total or estimate resting energy.
 if(active!==undefined){
  const bmr=values.find(v=>valid(v.bmrCalories))?.bmrCalories;
  return {calories:bmr===undefined?active:active+bmr,calorieType:bmr===undefined?'active':'total',calorieSource:'garmin',garminActiveCalories:active};
 }
 return {calories:null};
}
export function mergeGarminCalories(saved:Session,incoming:Partial<Session>):Session{
 const enriched=incoming.garminActiveCalories!=null?{...saved,garminActiveCalories:incoming.garminActiveCalories}:saved;
 if(saved.calorieSource==='manual'||(saved.calories!=null&&saved.calorieSource!=='garmin')||incoming.calories==null)return enriched;
 // Incomplete responses cannot replace known totals with active-only energy.
 if(saved.calorieType==='total'&&incoming.calorieType!=='total')return enriched;
 return {...enriched,calories:incoming.calories,calorieType:incoming.calorieType,calorieSource:'garmin'};
}
export const calorieLabel=(s:Session)=>s.calorieType==='active'?'ativas':s.calorieType==='total'?'totais':'informadas';
export function calorieSummary(data:Session[]){
 const seen=new Set<string>();
 const done=data.filter(s=>['completed','adapted','light'].includes(s.status)).filter(s=>{const key=s.sourceId||s.id;if(seen.has(key))return false;seen.add(key);return true;});
 const known=done.filter(s=>valid(s.calories));
 return {calories:known.length?known.reduce((n,s)=>n+s.calories!,0):null,calorieCount:known.length,calorieMissing:done.length-known.length,calorieTotal:known.filter(s=>s.calorieType==='total').length};
}

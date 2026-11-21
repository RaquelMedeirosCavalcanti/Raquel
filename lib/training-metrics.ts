import {calorieSummary} from './calories.ts';
import {monday,addDays,isDone,type Session} from './runs.ts';
export type Period='day'|'week'|'month';
export function bounds(date:string,period:Period){if(period==='day')return [date,date];if(period==='week')return [monday(date),addDays(monday(date),6)];return [date.slice(0,7)+'-01',addDays(date.slice(0,7)+'-01',new Date(+date.slice(0,4),+date.slice(5,7),0).getDate()-1)]}
// A linked prescription and its Garmin import represent one activity in every total.
export function completedSessions(data:Session[]){
 const byActivity=new Map<string,Session>();
 for(const s of data){
  if(!isDone(s)||('deleted' in s&&s.deleted===true))continue;
  const key=s.sourceId||s.id,previous=byActivity.get(key);
  if(!previous||s.hasPlan&&!previous.hasPlan)byActivity.set(key,s);
 }
 return [...byActivity.values()];
}
export function completedInPeriod(data:Session[],date:string,period:Period){
 const [start,end]=bounds(date,period);
 return completedSessions(data).filter(s=>s.actualDate>=start&&s.actualDate<=end);
}
export function summarize(data:Session[]){const done=completedSessions(data);const seconds=done.reduce((a,s)=>a+(s.time||0),0);const hrs=done.filter(s=>s.avgHr!=null&&s.time);const hrTime=hrs.reduce((a,s)=>a+s.time!,0);return {...calorieSummary(done),count:done.length,seconds,hr:hrTime?hrs.reduce((a,s)=>a+s.time!*s.avgHr!,0)/hrTime:null};}

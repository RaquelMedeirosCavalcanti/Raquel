import {calorieSummary} from './calories.ts';
import {monday,addDays,isDone,type Session} from './runs.ts';
export type Period='day'|'week'|'month';
export function bounds(date:string,period:Period){if(period==='day')return [date,date];if(period==='week')return [monday(date),addDays(monday(date),6)];return [date.slice(0,7)+'-01',addDays(date.slice(0,7)+'-01',new Date(+date.slice(0,4),+date.slice(5,7),0).getDate()-1)]}
export function summarize(data:Session[]){const done=data.filter(isDone);const seconds=done.reduce((a,s)=>a+(s.time||0),0);const hrs=done.filter(s=>s.avgHr!=null&&s.time);const hrTime=hrs.reduce((a,s)=>a+s.time!,0);return {...calorieSummary(data),count:done.length,seconds,hr:hrTime?hrs.reduce((a,s)=>a+s.time!*s.avgHr!,0)/hrTime:null};}

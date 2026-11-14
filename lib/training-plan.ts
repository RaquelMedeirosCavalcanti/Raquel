import plan from './training-plan.json';
import {type Session} from './runs';
export const planWeeks=plan.weeks;
export const workouts=plan.workouts;
export type WorkoutKey=keyof typeof workouts;
export const importedSessions=plan.sessions as Session[];
export function defaultsForUser(userId:string):Session[]{return importedSessions.map(s=>({...s,id:`${userId}:${s.id}`}))}
export const isRun=(s:Session)=>!s.kind||s.kind==='run';

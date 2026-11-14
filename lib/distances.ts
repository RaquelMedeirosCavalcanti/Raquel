import type {Session} from './runs.ts';
export const roundDistance=(km:number|null):number|null=>km===null?null:Math.round((km+Number.EPSILON)*100)/100;
export const distanceText=(km:number)=>km.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
export function normalizeSessionDistances(s:Session):Session{
 return {...s,distance:roundDistance(s.distance),plannedDistance:roundDistance(s.plannedDistance)};
}

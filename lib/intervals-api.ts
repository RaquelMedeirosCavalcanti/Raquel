import type {IntervalsWorkout} from './intervals-workouts.ts';
export type Athlete={id:string;name:string};
export class IntervalsApiError extends Error {}
export async function intervalsRequest(key:string,path:string,body?:unknown,fetcher:typeof fetch=fetch):Promise<unknown>{
 let response:Response;
 // Workers supports manual/follow, but rejects redirect:error before any I/O.
 // Keep credentials on the intended endpoint; never follow an upstream redirect.
 try{response=await fetcher('https://intervals.icu/api/v1/athlete/0'+path,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{Authorization:'Basic '+btoa('API_KEY:'+key),Accept:'application/json',...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});}
 catch{throw new IntervalsApiError('O Intervals.icu não respondeu. Tente novamente; reenviar não cria cópias dos treinos.');}
 if(!response.ok){
  if(response.status>=300&&response.status<400)throw new IntervalsApiError('O Intervals.icu redirecionou a chamada. O envio foi interrompido para proteger sua chave.');
  if([401,403].includes(response.status))throw new IntervalsApiError('O Intervals.icu recusou o acesso. Confira sua chave de API.');
  if(response.status===429)throw new IntervalsApiError('O Intervals.icu atingiu o limite de consultas. Aguarde alguns minutos.');
  // Do not return upstream bodies: they may include account data or request fields.
  throw new IntervalsApiError('Não foi possível concluir no Intervals.icu. Confira a conexão e tente novamente.');
 }
 try{return await response.json()}catch{throw new IntervalsApiError('Resposta inválida do Intervals.icu. Tente novamente.');}
}
export async function checkIntervalsKey(key:string,fetcher:typeof fetch=fetch):Promise<Athlete>{
 const value=await intervalsRequest(key,'',undefined,fetcher) as {id?:unknown;name?:unknown};
 if(!value||!['number','string'].includes(typeof value.id))throw new IntervalsApiError('Não foi possível identificar sua conta Intervals.icu.');
 return {id:String(value.id),name:typeof value.name==='string'?value.name.slice(0,160):'Conta Intervals.icu'};
}
export async function uploadIntervalsWorkouts(key:string,workouts:IntervalsWorkout[],fetcher:typeof fetch=fetch){
 const value=await intervalsRequest(key,'/events/bulk?upsert=true',workouts,fetcher);
 if(!Array.isArray(value)||value.length!==workouts.length||value.some(v=>!v||!['number','string'].includes(typeof v.id)))throw new IntervalsApiError('O envio não foi confirmado por completo. Reenvie para conferir; os mesmos treinos serão atualizados.');
 return value as {id:number|string;external_id:string;workout_doc?:{steps?:unknown[]}}[];
}

export async function checkIntervalsRunSettings(key:string,fetcher:typeof fetch=fetch){
 const settings=await intervalsRequest(key,'/sport-settings/Run',undefined,fetcher) as {threshold_pace?:unknown;pace_zones?:unknown};
 if(!settings||typeof settings.threshold_pace!=='number'||!Number.isFinite(settings.threshold_pace)||settings.threshold_pace<=0||!Array.isArray(settings.pace_zones)||!settings.pace_zones.length){
  throw new IntervalsApiError('Antes de enviar: no Intervals.icu, abra Configurações > Corrida > Ritmo (Pace), configure seu Ritmo de limiar (Threshold Pace) e salve as zonas de ritmo. Depois volte ao Meu Ritmo e reenvie o treino. Essa configuração permite que o Garmin receba as etapas e metas de pace.');
 }
}

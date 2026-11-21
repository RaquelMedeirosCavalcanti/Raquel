import {assertWorkoutStructure} from './intervals-structure';
import {env} from 'cloudflare:workers';
import {addDays,today} from './runs';
import {sessionsForUser} from './session-store';
import {checkIntervalsKey,checkIntervalsRunSettings,uploadIntervalsWorkouts,type Athlete} from './intervals-api';
import {encryptIntervalsKey,decryptIntervalsKey} from './intervals-secret';
import {previewWorkouts,toIntervalsWorkout} from './intervals-workouts';

type Sent={hash:string;eventId:string;sentAt:string;structureVersion?:2};
type Connection={athlete:Athlete;automatic:boolean;connectedAt:string;lastAttempt?:string;lastSuccess?:string;lastCount?:number;error?:string;issues?:string[];sent:Record<string,Sent>};
type Row={user_id:string;key_cipher:string;data:string;lock_until:number};
export const intervalsReady=()=>!!env.INTERVALS_ENCRYPTION_KEY;
const read=(userId:string)=>env.DB!.prepare('SELECT * FROM intervals_connections WHERE user_id=?').bind(userId).first<Row>();
export async function intervalsStatus(userId:string){
 const row=await read(userId);
 if(!row)return {ready:intervalsReady(),connected:false,connection:null};
 const {sent,...connection}=JSON.parse(row.data) as Connection;
 return {ready:intervalsReady(),connected:true,connection:{...connection,sentCount:Object.keys(sent).length}};
}
export async function connectIntervals(userId:string,key:string,automatic:boolean){
 if(!intervalsReady())throw Error('A conexão ainda precisa ser habilitada no servidor.');
 if(key.length<8||key.length>4096||/[^\x21-\x7e]/.test(key))throw Error('Confira a chave de API do Intervals.icu.');
 const athlete=await checkIntervalsKey(key),previous=await read(userId);
 const before=previous?JSON.parse(previous.data) as Connection:null;
 if(before&&before.athlete.id!==athlete.id)throw Error('Esta chave pertence a outra conta. Desconecte a conta atual antes de trocar.');
 const state:Connection={...before,athlete,automatic,connectedAt:before?.connectedAt||new Date().toISOString(),sent:before?.sent||{},error:undefined};
 const cipher=await encryptIntervalsKey(key,userId,env.INTERVALS_ENCRYPTION_KEY!);
 const result=await env.DB!.prepare('INSERT INTO intervals_connections (user_id,key_cipher,data,lock_until) VALUES (?,?,?,0) ON CONFLICT(user_id) DO UPDATE SET key_cipher=excluded.key_cipher,data=excluded.data WHERE intervals_connections.lock_until < ?').bind(userId,cipher,JSON.stringify(state),Date.now()).run();
 if(!result.meta.changes)throw Error('O envio está em andamento. Aguarde terminar antes de alterar a conexão.');
 return intervalsStatus(userId);
}
async function locked(userId:string){
 const lease=Date.now()+180000;
 const result=await env.DB!.prepare('UPDATE intervals_connections SET lock_until=? WHERE user_id=? AND lock_until < ?').bind(lease,userId,Date.now()).run();
 if(!result.meta.changes)throw Error('A conexão não está disponível ou já existe um envio em andamento.');
 return {row:(await read(userId))!,lease};
}
async function release(userId:string,lease:number){await env.DB!.prepare('UPDATE intervals_connections SET lock_until=0 WHERE user_id=? AND lock_until=?').bind(userId,lease).run();}
async function persist(userId:string,state:Connection,lease:number){await env.DB!.prepare('UPDATE intervals_connections SET data=? WHERE user_id=? AND lock_until=?').bind(JSON.stringify(state),userId,lease).run();}
export async function setIntervalsAutomatic(userId:string,enabled:boolean){
 const {row,lease}=await locked(userId);
 try{const state=JSON.parse(row.data) as Connection;state.automatic=enabled;await persist(userId,state,lease);}finally{await release(userId,lease);}
 return intervalsStatus(userId);
}
export async function disconnectIntervals(userId:string){
 const {lease}=await locked(userId);
 try{await env.DB!.prepare('DELETE FROM intervals_connections WHERE user_id=? AND lock_until=?').bind(userId,lease).run();}finally{await release(userId,lease);}
 return intervalsStatus(userId);
}
export async function syncIntervals(userId:string,options:{automatic?:boolean;from?:string;to?:string;ids?:string[]}={}){
 if(!intervalsReady())return {sent:0,unchanged:0};
 const before=await read(userId);
 if(!before){if(options.automatic)return {sent:0,unchanged:0};throw Error('Conecte sua conta Intervals.icu antes de enviar.');}
 const initial=JSON.parse(before.data) as Connection;
 if(options.automatic&&(!initial.automatic||(initial.lastAttempt&&Date.now()-Date.parse(initial.lastAttempt)<15*60000)))return {sent:0,unchanged:0};
 const {row,lease}=await locked(userId),state=JSON.parse(row.data) as Connection;
 try{
  if(options.automatic&&!state.automatic)return {sent:0,unchanged:0};
  state.lastAttempt=new Date().toISOString();await persist(userId,state,lease);
  const sessions=await sessionsForUser(userId),from=options.from||today(),to=options.to||addDays(today(),365);
  const preview=previewWorkouts(sessions,from,to).filter(p=>!options.ids||options.ids.includes(p.id));
  if(options.ids&&preview.length!==options.ids.length)throw Error('Um treino mudou ou deixou de estar planejado. Atualize a prévia.');
  const invalid=preview.filter(p=>p.error);
  state.issues=invalid.map(p=>`${p.title}: ${p.error}`);
  if(invalid.length&&!options.automatic)throw Error('Há etapas que precisam de revisão. Selecione somente os treinos disponíveis na prévia.');
  const pending:{id:string;hash:string;workout:ReturnType<typeof toIntervalsWorkout>}[]=[];
  let unchanged=0;
  for(const p of preview.filter(p=>!p.error)){
   const workout=toIntervalsWorkout(sessions.find(s=>s.id===p.id)!);
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(workout)))),b=>b.toString(16).padStart(2,'0')).join('');
   if(state.sent[p.id]?.hash===hash&&state.sent[p.id]?.structureVersion===2)unchanged++;else pending.push({id:p.id,hash,workout});
  }
  // Keep one bounded request per batch. External IDs make retries idempotent.
  if(pending.length>100)throw Error('Selecione até 100 treinos por envio.');
  if(pending.length){
   const key=await decryptIntervalsKey(row.key_cipher,userId,env.INTERVALS_ENCRYPTION_KEY!);
   await checkIntervalsRunSettings(key);
   const returned=await uploadIntervalsWorkouts(key,pending.map(p=>p.workout));
   // Validate the entire batch before persisting any successful sends.
   for(const p of pending){
    const event=returned.find(v=>v.external_id===p.workout.external_id);
    if(!event)throw Error('O Intervals.icu não confirmou todos os treinos. Você pode reenviar sem criar cópias.');
    assertWorkoutStructure(p.workout,event.workout_doc);
   }
   for(const p of pending){
    const event=returned.find(v=>v.external_id===p.workout.external_id);
    if(!event)throw Error('O Intervals.icu não confirmou todos os treinos. Você pode reenviar sem criar cópias.');
    state.sent[p.id]={hash:p.hash,eventId:String(event.id),sentAt:new Date().toISOString(),structureVersion:2};
   }
  }
  state.lastCount=pending.length;state.lastSuccess=new Date().toISOString();state.error=undefined;await persist(userId,state,lease);
  return {sent:pending.length,unchanged};
 }catch(e){state.error=e instanceof Error?e.message:'O envio não foi concluído.';await persist(userId,state,lease);throw Error(state.error);}
 finally{await release(userId,lease);}
}

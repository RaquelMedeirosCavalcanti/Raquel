import {env} from 'cloudflare:workers';
import {eq} from 'drizzle-orm';
import {getDb} from '../db';
import {garminSync,sessions} from '../db/schema';
import {sessionsForUser} from './session-store';
import {today,addDays,type Session} from './runs';
import {fetchGarmin} from './garmin-api';
import {sessionKind} from './modalities';
import {completeFromGarmin,reconcileGarmin,type ReviewRun} from './garmin-reconcile';

export type SyncState={enabled:boolean;since:string;lastAttempt?:string;lastSuccess?:string;error?:string;completed:number;imported:number;review:ReviewRun[]};
export const garminConfigured=(email:string)=>!!env.GARMIN_PERSONAL_API_KEY&&!!env.GARMIN_OWNER_EMAIL&&email.toLowerCase()===env.GARMIN_OWNER_EMAIL.trim().toLowerCase();
export async function readSyncState(userId:string):Promise<SyncState>{
 const row=await getDb().select().from(garminSync).where(eq(garminSync.userId,userId));
 return row.length?JSON.parse(row[0].data):{enabled:true,since:today(),completed:0,imported:0,review:[]};
}
async function acquire(userId:string,state:SyncState){
 const now=Date.now();
 const result=await env.DB!.prepare('INSERT INTO garmin_sync (user_id,data,lock_until) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET lock_until=excluded.lock_until WHERE garmin_sync.lock_until < ?').bind(userId,JSON.stringify(state),now+300000,now).run();
 if(!result.meta.changes)throw Error('Uma sincronização já está em andamento. Aguarde alguns instantes.');
}
async function release(userId:string){await getDb().update(garminSync).set({lockUntil:0}).where(eq(garminSync.userId,userId));}
async function persist(userId:string,state:SyncState,changes:Session[]=[]){
 const db=getDb(),stamp=new Date().toISOString();
 const writes=changes.map(s=>db.insert(sessions).values({id:s.id,userId,data:JSON.stringify(s),updatedAt:stamp}).onConflictDoUpdate({target:sessions.id,set:{data:JSON.stringify(s),updatedAt:stamp}}));
 await db.batch([db.update(garminSync).set({data:JSON.stringify(state)}).where(eq(garminSync.userId,userId)),...writes]);
}
export async function syncGarmin(userId:string,email:string,force=false){
 if(!garminConfigured(email))throw Error('Configure uma chave Garmin válida para ativar a sincronização.');
 const before=await readSyncState(userId);
 if(!before.enabled||(!force&&before.lastAttempt&&Date.now()-Date.parse(before.lastAttempt)<15*60000))return {state:before,changed:0};
 await acquire(userId,before);
 const state=await readSyncState(userId);
 try{
  state.lastAttempt=new Date().toISOString();
  await persist(userId,state);
  const from=[state.since,addDays(today(),-30)].sort().at(-1)!;
  const existing=await sessionsForUser(userId);
  const rows=await getDb().select().from(sessions).where(eq(sessions.userId,userId));
  const deleted=rows.map(r=>JSON.parse(r.data)).filter(s=>s.deleted);
  const incoming=await fetchGarmin(env.GARMIN_PERSONAL_API_KEY!,userId,from,today(),false,[...existing,...deleted]);
  const result=reconcileGarmin([...existing,...deleted],incoming);
  const seen=new Set([...existing,...result.changes,...deleted].map(s=>s.sourceId));
  const pending=new Map(state.review.filter(r=>!seen.has(r.session.sourceId)).map(r=>[r.session.sourceId,r]));
  result.review.forEach(r=>pending.set(r.session.sourceId,r));
  state.review=[...pending.values()];state.completed=result.completed;state.imported=result.imported;
  state.error=undefined;state.lastSuccess=new Date().toISOString();
  await persist(userId,state,result.changes);
  return {state,changed:result.changes.length};
 }catch(e){state.error=e instanceof Error?e.message:'Falha na sincronização Garmin. Tentaremos novamente.';await persist(userId,state);throw Error(state.error);}
 finally{await release(userId);}
}
export async function setSyncEnabled(userId:string,enabled:boolean){
 await acquire(userId,await readSyncState(userId));
 try{const state=await readSyncState(userId);state.enabled=enabled;await persist(userId,state);return state;}finally{await release(userId);}
}
export async function resolveGarminReview(userId:string,sourceId:string,planId?:string,ignore=false){
 await acquire(userId,await readSyncState(userId));
 try{
  const state=await readSyncState(userId),item=state.review.find(r=>r.session.sourceId===sourceId);
  if(!item)throw Error('Atividade já resolvida. Atualize a página.');
  const existing=await sessionsForUser(userId);
  if(existing.some(s=>s.sourceId===sourceId))throw Error('Esta atividade já está registrada.');
  let changed:Session;
  if(ignore){
   const s=item.session;
   await getDb().insert(sessions).values({id:s.id,userId,data:JSON.stringify({id:s.id,sourceId,deleted:true}),updatedAt:new Date().toISOString()}).onConflictDoNothing();
   state.review=state.review.filter(r=>r.session.sourceId!==sourceId);await persist(userId,state);return state;
  }
  if(planId){const target=existing.find(s=>s.id===planId&&s.hasPlan&&sessionKind(s)===sessionKind(item.session)&&!s.sourceId);if(!target)throw Error('Este treino não está disponível para vinculação.');changed=completeFromGarmin(target,item.session);}
  else changed=item.session;
  if(!changed.time||(sessionKind(changed)==='run'&&!changed.distance))throw Error('Atividade sem os resultados necessários.');
  state.review=state.review.filter(r=>r.session.sourceId!==sourceId);await persist(userId,state,[changed]);return state;
 }finally{await release(userId);}
}
export class GarminSyncBusyError extends Error {
 readonly retryAfterSeconds:number;
 constructor(lockUntil:number){
  super('A sincronização com o Garmin está em andamento. Aguarde ela terminar e toque em Salvar treino novamente. Suas alterações continuam no formulário.');
  this.name='GarminSyncBusyError';
  this.retryAfterSeconds=Math.max(1,Math.ceil((lockUntil-Date.now())/1000));
 }
}
export async function assertNoGarminSync(userId:string){
 const rows=await getDb().select().from(garminSync).where(eq(garminSync.userId,userId));
 if(rows.length&&rows[0].lockUntil>Date.now())throw new GarminSyncBusyError(rows[0].lockUntil);
}

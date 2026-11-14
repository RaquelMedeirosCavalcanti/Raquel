import {env} from 'cloudflare:workers';
import {getAppUser} from '../../auth';
import {canManageTraining,sameOrigin} from '../../../lib/site-access';
import {today} from '../../../lib/runs';
import {fetchGarmin} from '../../../lib/garmin-api';
import {garminConfigured,readSyncState,syncGarmin,setSyncEnabled,resolveGarminReview} from '../../../lib/garmin-sync';
import {sessionsForUser} from '../../../lib/session-store';
export const dynamic='force-dynamic';
const json=(b:unknown,status=200)=>Response.json(b,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(){
 const user=await getAppUser();if(!user)return json({error:'Entre com sua conta para consultar sua conexão.'},401);
 if(!canManageTraining(user))return json({error:'Este acesso é somente leitura.'},403);
 try{return json({configured:garminConfigured(user.email),state:await readSyncState(user.userId)});}catch{return json({error:'Não foi possível consultar a conexão Garmin.'},503);}
}
export async function POST(req:Request){
 const user=await getAppUser();if(!user)return json({error:'Entre com sua conta para consultar suas atividades.'},401);
 if(!canManageTraining(user)||!sameOrigin(req))return json({error:'Acesso indisponível.'},403);
 try{
  const body=await req.json() as {action?:string;force?:boolean;enabled?:boolean;sourceId?:string;planId?:string;ignore?:boolean;from?:string;to?:string;key?:string};
  if(body.action==='sync'){
   const result=await syncGarmin(user.userId,user.email,body.force===true);
   return json({...result,sessions:await sessionsForUser(user.userId)});
  }
  if(body.action==='toggle'&&typeof body.enabled==='boolean')return json({state:await setSyncEnabled(user.userId,body.enabled)});
  if(body.action==='resolve'&&typeof body.sourceId==='string'&&(body.planId===undefined||typeof body.planId==='string'))return json({state:await resolveGarminReview(user.userId,body.sourceId,body.planId,body.ignore===true),sessions:await sessionsForUser(user.userId)});
  const {from,to}=body;
  const key=typeof body.key==='string'&&body.key.trim()?body.key.trim():garminConfigured(user.email)?env.GARMIN_PERSONAL_API_KEY:undefined;
  if(!key||key.length>4096||typeof from!=='string'||typeof to!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to||to>today())return json({error:'Confira a chave e o intervalo de datas.'},400);
  return json({sessions:await fetchGarmin(key,user.userId,from,to)});
 }catch(e){return json({error:e instanceof Error?e.message:'Não foi possível acessar a Garmin.'},502);}
}

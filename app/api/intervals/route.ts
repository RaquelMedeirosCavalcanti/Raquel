import {getAppUser} from '../../auth';
import {canManageTraining,sameOrigin} from '../../../lib/site-access';
import {today,addDays,dayKey} from '../../../lib/runs';
import {connectIntervals,disconnectIntervals,intervalsStatus,setIntervalsAutomatic,syncIntervals} from '../../../lib/intervals-connection';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const validDate=(s:unknown):s is string=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&dayKey(new Date(s+'T12:00:00Z'))===s;
export async function GET(){
 const user=await getAppUser();if(!canManageTraining(user))return json({error:'Este acesso não permite configurar conexões.'},user?403:401);
 try{return json(await intervalsStatus(user!.userId));}catch{return json({error:'Não foi possível consultar a conexão Intervals.icu.'},503);}
}
export async function POST(request:Request){
 const user=await getAppUser();if(!canManageTraining(user)||!sameOrigin(request))return json({error:'Acesso indisponível.'},user?403:401);
 if(Number(request.headers.get('content-length')||0)>20000)return json({error:'Solicitação muito grande.'},413);
 let body:{action?:string;key?:unknown;automatic?:unknown;from?:unknown;to?:unknown;ids?:unknown};
 try{const raw=await request.text();if(raw.length>20000)return json({error:'Solicitação muito grande.'},413);body=JSON.parse(raw);if(!body||typeof body!=='object')throw Error();}catch{return json({error:'Solicitação inválida.'},400);}
 try{
  if(body.action==='connect'&&typeof body.key==='string')return json(await connectIntervals(user!.userId,body.key.trim(),body.automatic===true));
  if(body.action==='disconnect')return json(await disconnectIntervals(user!.userId));
  if(body.action==='automatic'&&typeof body.automatic==='boolean')return json(await setIntervalsAutomatic(user!.userId,body.automatic));
  if(body.action==='sync'){
   if(body.automatic===true){const result=await syncIntervals(user!.userId,{automatic:true});return json({...await intervalsStatus(user!.userId),...result});}
   const {from,to,ids}=body;
   if(!validDate(from)||!validDate(to)||from<today()||to<from||to>addDays(today(),365)||!Array.isArray(ids)||ids.length<1||ids.length>100||ids.some(id=>typeof id!=='string'||id.length>150)||new Set(ids).size!==ids.length)return json({error:'Selecione os treinos futuros e confira o período de envio.'},400);
   const result=await syncIntervals(user!.userId,{from,to,ids});return json({...await intervalsStatus(user!.userId),...result});
  }
  return json({error:'Ação inválida.'},400);
 }catch(e){return json({error:e instanceof Error?e.message:'Não foi possível concluir a conexão.'},502);}
}

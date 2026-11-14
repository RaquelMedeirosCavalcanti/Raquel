import {getAppUser} from '../auth';
import {sessionsForUser} from '../../lib/session-store';
import {sessionKind} from '../../lib/modalities';
import {canManageTraining} from '../../lib/site-access';
import {readSyncState,syncGarmin,garminConfigured} from '../../lib/garmin-sync';
export const dynamic='force-dynamic';
const tools=[
 {name:'garmin_sync_status',description:'Consulta a conexão Garmin, última sincronização e atividades pendentes de revisão de Kel.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'sync_garmin_runs',description:'Sincroniza corridas, musculação, caminhadas e Pilates da API pessoal Garmin de Kel e dá baixa nos treinos programados do mesmo dia quando há correspondência única. Preserva o plano, os registros manuais e as situações ambíguas para revisão. Grava resultados sem republicar o site.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true}}
];
export async function POST(req:Request){
 let b:{id?:string|number;method?:string;params?:{name?:string;arguments?:unknown}};try{b=await req.json() as typeof b}catch{return Response.json({error:'JSON inválido'},{status:400})}
 const result=(r:unknown)=>Response.json({jsonrpc:'2.0',id:b.id,result:r},{headers:{'Cache-Control':'no-store'}});
 if(b.method==='server/discover')return result({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
 if(b.method==='initialize')return result({protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'meu-ritmo-kel',version:'1.0.0'}});
 if(b.method==='notifications/initialized')return new Response(null,{status:202});
 if(b.method==='tools/list')return result({tools});
 if(b.method!=='tools/call')return Response.json({jsonrpc:'2.0',id:b.id,error:{code:-32601,message:'Método desconhecido'}});
 const user=await getAppUser();
 if(!canManageTraining(user))return result({isError:true,content:[{type:'text',text:'Somente Kel pode acessar a integração Garmin.'}]});
 try{
  let data;
  if(b.params?.name==='garmin_sync_status')data={configured:garminConfigured(user!.email),state:await readSyncState(user!.userId),activities:(await sessionsForUser(user!.userId)).filter(s=>s.sourceId?.startsWith('garmin:')).map(s=>({date:s.actualDate,kind:sessionKind(s),status:s.status,calories:s.calories,calorieType:s.calorieType,activeCalories:s.garminActiveCalories,avgHr:s.avgHr,distanceKm:s.distance})),walks:(await sessionsForUser(user!.userId)).filter(s=>sessionKind(s)==='walk').map(s=>({date:s.actualDate,title:s.title,distanceKm:s.distance,timeSeconds:s.time,paceSecondsPerKm:s.distance&&s.time?s.time/s.distance:null,source:s.sourceId?'garmin':'manual'}))};
  else if(b.params?.name==='sync_garmin_runs')data=await syncGarmin(user!.userId,user!.email);
  else throw Error('Ferramenta desconhecida.');
  return result({content:[{type:'text',text:JSON.stringify(data)}]});
 }catch(e){return result({isError:true,content:[{type:'text',text:e instanceof Error?e.message:'Falha na sincronização.'}]});}
}

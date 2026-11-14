import {getAppUser} from '../../../auth';
import {canManageTraining,sameOrigin} from '../../../../lib/site-access';
import {sessionsForUser} from '../../../../lib/session-store';
import {getDb} from '../../../../db';
import {sessions} from '../../../../db/schema';
import {validateSession,type Session} from '../../../../lib/runs';
import {matchingSeriesSessions,withExerciseSets,type SeriesChange} from '../../../../lib/strength-series';

import {assertNoGarminSync,GarminSyncBusyError} from '../../../../lib/garmin-sync';
import {normalizeSessionDistances} from '../../../../lib/distances';

export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});

export async function POST(req:Request){
 const user=await getAppUser();
 if(!user)return json({error:'Entre com sua conta para salvar.'},401);
 if(!canManageTraining(user))return json({error:'Este acesso é somente leitura.'},403);
 if(!sameOrigin(req))return json({error:'Origem inválida.'},403);
 try{
  await assertNoGarminSync(user.userId);
  const {session:s,seriesChange:change}=await req.json() as {session:Session;seriesChange:SeriesChange};
  const error=validateSession(s);
  if(error)return json({error},400);
  if(!change||!Number.isInteger(change.sets)||change.sets<1||change.sets>30||s.kind!=='strength'||!s.hasPlan||change.workout!==s.workout){
   return json({error:'Revise as séries e o modelo de musculação.'},400);
  }
  const current=await sessionsForUser(user.userId);
  const original=current.find(x=>x.id===s.id);
  if(!original||original.kind!=='strength'||!original.hasPlan||original.workout!==s.workout){
   return json({error:'Salve este treino antes de aplicar as séries à sequência.'},409);
  }
  if(original.sourceId&&original.sourceId!==s.sourceId)return json({error:'O Garmin atualizou este treino. Reabra o registro para preservar a realização sincronizada.'},409);
  Object.assign(s,normalizeSessionDistances(s),{garminActiveCalories:original.garminActiveCalories??s.garminActiveCalories,garminCaloriesVersion:original.garminCaloriesVersion,garminCaloriesCheckedAt:original.garminCaloriesCheckedAt,garminMetricsCheckedAt:original.garminMetricsCheckedAt});
  if(original.garminDetails)s.garminDetails=original.garminDetails;
  if(s.calorieSource!=='manual'&&original.calories!=null){s.calories=original.calories;s.calorieType=original.calorieType;s.calorieSource=original.calorieSource;}
  // Other sessions keep their own exercises, loads, results and notes.
  const changed=[s,...matchingSeriesSessions(current,s).map(x=>withExerciseSets(x,change.sets))];
  for(const session of changed){const error=validateSession(session);if(error)return json({error},400);}
  const db=getDb(),updatedAt=new Date().toISOString();
  const writes=changed.map(session=>db.insert(sessions).values({id:session.id,userId:user.userId,data:JSON.stringify(session),updatedAt}).onConflictDoUpdate({target:sessions.id,set:{data:JSON.stringify(session),updatedAt}}));
  // D1 batches commit all changes atomically, avoiding partially saved sequences.
  await db.batch([writes[0],...writes.slice(1)]);
  return json({session:s,sessions:changed});
 }catch(e){if(e instanceof GarminSyncBusyError)return json({error:e.message,code:'GARMIN_SYNC_BUSY',retryAfterSeconds:e.retryAfterSeconds},409);return json({error:'Não foi possível salvar a sequência. Seus ajustes continuam no formulário.'},503);}
}

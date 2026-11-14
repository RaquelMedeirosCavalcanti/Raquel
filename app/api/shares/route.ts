import {getAppUser} from '../../auth';
import {canManageTraining,sameOrigin,newShareToken} from '../../../lib/site-access';
import {getDb} from '../../../db';
import {trainingShares} from '../../../db/schema';
import {eq} from 'drizzle-orm';
import {shortSharePath} from '../../../lib/share-links';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});

export async function GET(){
 const user=await getAppUser();
 if(!user)return json({error:'Entre com sua conta para gerenciar o compartilhamento.'},401);
 if(!canManageTraining(user))return json({error:'Somente Kel pode gerenciar o compartilhamento.'},403);
 try{const [link]=await getDb().select().from(trainingShares).where(eq(trainingShares.ownerId,user.userId));return json({path:link?shortSharePath(link.token):null});}
 catch{return json({error:'Não foi possível carregar o compartilhamento.'},503)}
}
export async function POST(req:Request){
 const user=await getAppUser();
 if(!user)return json({error:'Entre com sua conta para compartilhar.'},401);
 if(!canManageTraining(user))return json({error:'Somente Kel pode criar um link de consulta.'},403);
 if(!sameOrigin(req))return json({error:'Origem inválida.'},403);
 try{
  const db=getDb();
  await db.insert(trainingShares).values({ownerId:user.userId,token:newShareToken(),createdAt:new Date().toISOString()}).onConflictDoNothing({target:trainingShares.ownerId});
  const [link]=await db.select().from(trainingShares).where(eq(trainingShares.ownerId,user.userId));
  return json({path:shortSharePath(link.token)});
 }catch{return json({error:'Não foi possível criar o link. Tente novamente.'},503)}
}
export async function DELETE(req:Request){
 const user=await getAppUser();
 if(!user)return json({error:'Entre com sua conta para cancelar o link.'},401);
 if(!canManageTraining(user))return json({error:'Somente Kel pode cancelar o compartilhamento.'},403);
 if(!sameOrigin(req))return json({error:'Origem inválida.'},403);
 try{await getDb().delete(trainingShares).where(eq(trainingShares.ownerId,user.userId));return json({ok:true})}
 catch{return json({error:'Não foi possível cancelar o link. Tente novamente.'},503)}
}

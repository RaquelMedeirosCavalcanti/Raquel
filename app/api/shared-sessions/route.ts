import {validShareToken} from '../../../lib/site-access';
import {sessionsForUser} from '../../../lib/session-store';
import {getDb} from '../../../db';
import {trainingShares} from '../../../db/schema';
import {eq} from 'drizzle-orm';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
export async function GET(req:Request){
 const token=new URL(req.url).searchParams.get('chave')||'';
 if(!validShareToken(token))return json({error:'Este link de consulta é inválido ou foi cancelado.'},404);
 try{
  const [link]=await getDb().select().from(trainingShares).where(eq(trainingShares.token,token));
  if(!link)return json({error:'Este link de consulta é inválido ou foi cancelado.'},404);
  return json({sessions:await sessionsForUser(link.ownerId),readOnly:true});
 }catch{return json({error:'Não foi possível carregar a versão de consulta. Tente novamente.'},503)}
}

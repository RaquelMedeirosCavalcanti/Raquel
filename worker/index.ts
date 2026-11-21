import handler from 'vinext/server/fetch-handler';
import {verifyAccessToken} from '../lib/access-token';
import {syncGarmin} from '../lib/garmin-sync';
import {syncIntervals} from '../lib/intervals-connection';
import {SHARE_COOKIE,cookieValue,sharingPath,sharedOwner,privateResponse} from '../lib/share-access';
import {resolveShortShare} from '../lib/share-links';
type Certs={keys:(JsonWebKey&{kid?:string})[]};
let certCache:{issuer:string;expires:number;certs:Certs}|undefined;
async function certs(issuer:string){
 if(certCache?.issuer===issuer&&certCache.expires>Date.now())return certCache.certs;
 const r=await fetch(issuer+'/cdn-cgi/access/certs',{signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('Access unavailable');
 const body=await r.json() as Certs;
 if(!Array.isArray(body.keys))throw Error('Invalid signing keys');
 certCache={issuer,expires:Date.now()+300000,certs:body};return body;
}
export default {
 async fetch(request:Request,env:Cloudflare.Env,ctx:ExecutionContext){
  const url=new URL(request.url);
  if(url.pathname==='/health')return Response.json({status:'ok',app:'meu-ritmo-kel'});
  const h=new Headers(request.headers);
  for(const name of [...h.keys()])if(name.startsWith('oai-authenticated-')||name.startsWith('x-meu-ritmo-'))h.delete(name);
  if(url.pathname.startsWith('/v/')){
   if(!['GET','HEAD'].includes(request.method))return privateResponse(new Response('Somente leitura.',{status:405,headers:{Allow:'GET, HEAD'}}));
   let key:string|null;
   try{key=await resolveShortShare(env.DB!,url.pathname.slice(3))}catch{return privateResponse(new Response('Consulta temporariamente indisponível.',{status:503}))}
   return key?privateResponse(Response.redirect(new URL('/visualizar?chave='+key,url).href,302)):privateResponse(new Response('Link de consulta inválido ou cancelado.',{status:404}));
  }
  const sharing=sharingPath(url.pathname);
  if(sharing){
   if(!['GET','HEAD'].includes(request.method))return privateResponse(new Response('Somente leitura.',{status:405,headers:{Allow:'GET, HEAD'}}));
   const token=sharing==='asset'?cookieValue(request,SHARE_COOKIE):url.searchParams.get('chave')||'';
   let owner:string|null;
   try{owner=await sharedOwner(env.DB!,token)}catch{return privateResponse(new Response('Consulta temporariamente indisponível.',{status:503}))}
   if(owner){
    const response=sharing==='asset'?await env.ASSETS!.fetch(request):await handler.fetch(new Request(request,{headers:h}),env,ctx);
    return privateResponse(response,sharing==='page'?token:undefined);
   }
   if(sharing!=='asset')return privateResponse(new Response('Link de consulta inválido ou cancelado.',{status:404}));
  }
  const issuer=env.ACCESS_TEAM_DOMAIN||'',aud=env.ACCESS_AUD||'';
  try{
   const token=request.headers.get('cf-access-jwt-assertion')||cookieValue(request,'CF_Authorization');
   const claims=await verifyAccessToken(token,issuer,aud,(await certs(issuer)).keys);
   const email=claims.email!.toLowerCase();
   h.set('x-meu-ritmo-email',email);
   h.set('x-meu-ritmo-user-id',email===env.SITE_OWNER_EMAIL?.toLowerCase()?env.OWNER_USER_ID!:'viewer:'+claims.sub);
  }catch{return new Response('Entre no Meu Ritmo pelo endereço protegido da Cloudflare.',{status:401,headers:{'Cache-Control':'no-store'}})}
  if(sharing==='asset')return privateResponse(await env.ASSETS!.fetch(request));
  if(url.pathname==='/login'){
   const target=url.searchParams.get('return_to')||'/';
   return Response.redirect(url.origin+(target.startsWith('/')&&!target.startsWith('//')?target:'/'),302);
  }
  return handler.fetch(new Request(request,{headers:h}),env,ctx);
 },
 async scheduled(_event:ScheduledController,env:Cloudflare.Env,ctx:ExecutionContext){
  ctx.waitUntil(syncIntervals(env.OWNER_USER_ID!,{automatic:true}).then(r=>console.log(JSON.stringify({event:'intervals_sync',sent:r.sent}))).catch(()=>console.error(JSON.stringify({event:'intervals_sync_failed'}))));
  ctx.waitUntil(syncGarmin(env.OWNER_USER_ID!,env.SITE_OWNER_EMAIL!).then(r=>console.log(JSON.stringify({event:'garmin_sync',changed:r.changed}))).catch(()=>console.error(JSON.stringify({event:'garmin_sync_failed'}))));
 }
};

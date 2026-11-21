import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as sharing from '../lib/share-access.ts';
import * as shortLinks from '../lib/share-links.ts';
const token='a'.repeat(64),owner='test-owner';
function loadTs(file,imports){
 const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};new Function('exports','require',code)(exports,id=>{if(!(id in imports))throw Error('Unexpected import '+id);return imports[id]});return exports;
}
function harness(){
 let active=true,calls=[];
 const env={DB:{prepare:()=>({bind:key=>({first:async()=>active&&key===token?{owner_id:owner}:null,all:async()=>({results:active&&key===token.slice(0,32)?[{token}]:[]})})})},ASSETS:{fetch:async()=>new Response('private asset',{headers:{'Cache-Control':'public, max-age=31536000'}})}};
 const handler={fetch:async req=>{calls.push({url:req.url,owner:req.headers.get('x-meu-ritmo-user-id')});return new Response('read-only page')}};
 const worker=loadTs('../worker/index.ts',{'vinext/server/fetch-handler':{default:handler},'../lib/access-token':{verifyAccessToken:async()=>{throw Error('Not authenticated')}},'../lib/garmin-sync':{},'../lib/intervals-connection':{},'../lib/share-access':sharing,'../lib/share-links':shortLinks}).default;
 return {request:(path,options={})=>worker.fetch(new Request('https://site.test'+path,options),env,{}),revoke:()=>active=false,calls};
}
test('short share links redirect within the site, reject writes and stop after cancellation',async()=>{
 const h=harness(),path=shortLinks.shortSharePath(token);
 assert.equal(path.length,25);
 const r=await h.request(path);assert.equal(r.status,302);assert.equal(r.headers.get('location'),'https://site.test/visualizar?chave='+token);assert.equal(r.headers.get('cache-control'),'private, no-store');
 assert.equal((await h.request(path,{method:'POST'})).status,405);
 h.revoke();assert.equal((await h.request(path)).status,404);
 assert.equal((await h.request('/v/invalid')).status,404);
});
test('compact codes are canonical and ambiguous prefixes fail closed',async()=>{
 const code=shortLinks.shortSharePath(token).slice(3);
 assert.equal(shortLinks.shortPrefix(code),token.slice(0,32));
 for(const value of ['','bad',code+'=',code+'/extra'])assert.equal(shortLinks.shortPrefix(value),null);
 const db={prepare:()=>({bind:()=>({all:async()=>({results:[{token},{token:'another-token'}]})})})};
 assert.equal(await shortLinks.resolveShortShare(db,code),null);
});
test('anonymous sharing requires a live, valid link and strips forged owner headers',async()=>{
 const h=harness();
 for(const suffix of ['', '?chave=invalid','?chave='+'b'.repeat(64)])assert.equal((await h.request('/visualizar'+suffix)).status,404);
 assert.equal(h.calls.length,0);
 const r=await h.request('/visualizar?chave='+token,{headers:{'x-meu-ritmo-user-id':owner,'x-meu-ritmo-email':'owner@example.com'}});
 assert.equal(r.status,200);assert.equal(h.calls[0].owner,null);
 assert.match(r.headers.get('set-cookie'),/__Host-meu-ritmo-share=.*HttpOnly; Secure; SameSite=Lax/);
 assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('referrer-policy'),'no-referrer');
});
test('shared sessions and assets are read-only, and revocation blocks future reads',async()=>{
 const h=harness(),cookie=sharing.SHARE_COOKIE+'='+token;
 assert.equal((await h.request('/api/shared-sessions?chave='+token)).status,200);
 for(const path of ['/visualizar','/api/shared-sessions','/_next/static/app.js'])for(const method of ['POST','PUT','DELETE'])assert.equal((await h.request(path+'?chave='+token,{method,headers:{cookie}})).status,405);
 assert.equal((await h.request('/_next/static/app.js',{headers:{cookie}})).status,200);
 assert.equal((await h.request('/icons/kel-192-v3.png',{headers:{cookie}})).headers.get('cache-control'),'private, no-store');
 h.revoke();assert.equal((await h.request('/visualizar?chave='+token)).status,404);
 assert.equal((await h.request('/api/shared-sessions?chave='+token)).status,404);
});
test('share cookies never unlock owner APIs or unlinked static content',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({keys:[]});
 try{
  const h=harness(),headers={cookie:sharing.SHARE_COOKIE+'='+token,'x-meu-ritmo-user-id':owner};
  for(const path of ['/api/sessions','/api/shares','/api/garmin','/api/intervals','/api/sessions/series'])assert.equal((await h.request(path,{method:'POST',headers})).status,401);
  assert.equal((await h.request('/_next/static/app.js')).status,401);
  h.revoke();assert.equal((await h.request('/_next/static/app.js',{headers})).status,401);
 }finally{globalThis.fetch=original}
});
test('shared data endpoint checks link validity without requiring an account',async()=>{
 let active=true,reads=[];
 const route=loadTs('../app/api/shared-sessions/route.ts',{'../../../lib/site-access':{validShareToken:sharing.validToken},'../../../lib/session-store':{sessionsForUser:async id=>{reads.push(id);return [{id:'session',notes:'private'}]}},'../../../db':{getDb:()=>({select:()=>({from:()=>({where:async()=>active?[{ownerId:owner}]:[]})})})},'../../../db/schema':{trainingShares:{token:'token'}},'drizzle-orm':{eq:()=>true}});
 const request=()=>new Request('https://site.test/api/shared-sessions?chave='+token);
 const response=await route.GET(request());assert.equal(response.status,200);assert.equal((await response.json()).readOnly,true);assert.deepEqual(reads,[owner]);
 active=false;assert.equal((await route.GET(request())).status,404);
 assert.equal((await route.GET(new Request('https://site.test/api/shared-sessions'))).status,404);
 assert.equal(reads.length,1);
});

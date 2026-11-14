// Deploy the compiled application to a personal Cloudflare account.
// Credentials belong in the local environment, never in GitHub source.
import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('Defina CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_API_TOKEN no ambiente local.');
const root=process.cwd(),name='meu-ritmo',api='https://api.cloudflare.com/client/v4';
const config=JSON.parse(await readFile(path.join(root,'cloudflare-deploy.json'),'utf8'));
async function request(endpoint,body,method='POST',auth=token){
 const r=await fetch(api+endpoint,{method,headers:{Authorization:'Bearer '+auth,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:body===undefined?undefined:JSON.stringify(body)});
 const b=await r.json();if(!r.ok||!b.success)throw Error(JSON.stringify(b.errors));return b.result;
}
async function walk(dir){const files=[];for(const ent of await readdir(dir,{withFileTypes:true})){const f=path.join(dir,ent.name);if(ent.isDirectory())files.push(...await walk(f));else files.push(f)}return files;}
const types={'.js':'application/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.ico':'image/x-icon','.pdf':'application/pdf','.webmanifest':'application/manifest+json','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const manifest={},contents=new Map();
for(const f of await walk(path.join(root,'dist/client'))){const data=await readFile(f),hash=createHash('sha256').update(data).digest('hex').slice(0,32);manifest['/'+path.relative(path.join(root,'dist/client'),f).split(path.sep).join('/')]={hash,size:data.length};contents.set(hash,{data,type:types[path.extname(f)]||'application/octet-stream'});}
const session=await request(`/accounts/${account}/workers/scripts/${name}/assets-upload-session`,{manifest});
let completion=session.jwt;
for(const bucket of session.buckets){const form=new FormData();for(const hash of bucket){const f=contents.get(hash);form.append(hash,new Blob([f.data.toString('base64')],{type:f.type}),hash);}const result=await request(`/accounts/${account}/workers/assets/upload?base64=true`,form,'POST',session.jwt);if(result.jwt)completion=result.jwt;}
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({main_module:'index.js',compatibility_date:'2026-11-14',compatibility_flags:['nodejs_compat'],bindings:[{name:'DB',type:'d1',id:config.database_id}],keep_bindings:['secret_text','plain_text'],assets:{jwt:completion},observability:{enabled:true,traces:{enabled:true}}})],{type:'application/json'}));
for(const file of await walk(path.join(root,'dist/server'))){if(!file.endsWith('.js')&&!file.endsWith('.mjs'))continue;const relative=path.relative(path.join(root,'dist/server'),file).split(path.sep).join('/');form.append(relative,new Blob([await readFile(file)],{type:'application/javascript+module'}),relative);}
await request(`/accounts/${account}/workers/scripts/${name}`,form,'PUT');
await request(`/accounts/${account}/workers/scripts/${name}/subdomain`,{enabled:true,previews_enabled:false});
await request(`/accounts/${account}/workers/scripts/${name}/schedules`,[{cron:'0 * * * *'}],'PUT');
console.log('Publicado: '+config.url);

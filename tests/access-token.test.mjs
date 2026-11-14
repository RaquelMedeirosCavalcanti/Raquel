import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyAccessToken} from '../lib/access-token.ts';
const issuer='https://team.cloudflareaccess.com',audience='personal-app';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'test-key'};
const b64=v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url');
async function signed(changes={},header={alg:'RS256',kid:'test-key'}){
 const body={iss:issuer,aud:[audience],exp:2000,nbf:900,email:'owner@example.com',sub:'user',...changes};
 const value=b64(header)+'.'+b64(body);
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(value));
 return value+'.'+Buffer.from(signature).toString('base64url');
}
test('accepts the signed Access identity for the configured app',async()=>{
 const result=await verifyAccessToken(await signed(),issuer,audience,[jwk],1000);
 assert.equal(result.email,'owner@example.com');
});
test('rejects expired, future, wrong-app, wrong-issuer and identity-less tokens',async()=>{
 for(const body of [{exp:999},{nbf:1100},{aud:['other']},{iss:'https://attacker.example'},{email:undefined}])await assert.rejects(()=>signed(body).then(token=>verifyAccessToken(token,issuer,audience,[jwk],1000)));
});
test('rejects signature tampering, unsigned tokens and unknown signing keys',async()=>{
 const token=await signed();const parts=token.split('.');parts[1]=b64({email:'attacker@example.com'});
 await assert.rejects(()=>verifyAccessToken(parts.join('.'),issuer,audience,[jwk],1000));
 await assert.rejects(()=>verifyAccessToken(token,issuer,audience,[],1000));
 await assert.rejects(()=>signed({}, {alg:'none',kid:'test-key'}).then(t=>verifyAccessToken(t,issuer,audience,[jwk],1000)));
});

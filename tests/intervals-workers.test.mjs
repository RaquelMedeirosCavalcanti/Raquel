import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.resolve('wrangler/package.json'));
const {Miniflare}=require('miniflare');
test('personal account validation and workout uploads use request options accepted by the Workers runtime',async()=>{
 const source=ts.transpileModule(readFileSync(new URL('../lib/intervals-api.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const script=source+`
 export default {async fetch(){
  let oldModeRejected=false;
  try{new Request('https://intervals.icu/api/v1/athlete/0',{redirect:'error'});}catch(e){oldModeRejected=e instanceof TypeError;}
  const calls=[];
  const transport=async(url,options)=>{
   const request=new Request(url,options);
   calls.push({method:request.method,redirect:request.redirect});
   return Response.json(request.method==='GET'?{id:'test-athlete',name:'Test account'}:[{id:42,external_id:'test-plan'}]);
  };
  const athlete=await checkIntervalsKey('example-test-key',transport);
  const workouts=await uploadIntervalsWorkouts('example-test-key',[{external_id:'test-plan'}],transport);
  return Response.json({oldModeRejected,athlete,workouts,calls});
 }};`;
 // Exercise the workerd version bundled with this repository's pinned Wrangler.
 const runtime=new Miniflare({modules:true,compatibilityDate:'2026-05-15',script});
 try{
  const response=await runtime.dispatchFetch('http://localhost/');assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.oldModeRejected,true);assert.equal(body.athlete.id,'test-athlete');assert.equal(body.workouts[0].id,42);
  assert.deepEqual(body.calls,[{method:'GET',redirect:'manual'},{method:'POST',redirect:'manual'}]);
 }finally{await runtime.dispose();}
});

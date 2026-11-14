// Keep 128 random bits from the revocable share key for a compact first-party URL.
const encode=(bytes:Uint8Array)=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export function shortSharePath(token:string):string {
 if(!/^[a-f0-9]{64}$/.test(token))throw Error('Chave de consulta inválida.');
 return '/v/'+encode(Uint8Array.from(token.slice(0,32).match(/../g)!,h=>parseInt(h,16)));
}
export function shortPrefix(code:string):string|null {
 if(!/^[A-Za-z0-9_-]{22}$/.test(code))return null;
 try{
  const bytes=Uint8Array.from(atob(code.replace(/-/g,'+').replace(/_/g,'/')+'=='),c=>c.charCodeAt(0));
  return bytes.length===16&&encode(bytes)===code?Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''):null;
 }catch{return null}
}
export async function resolveShortShare(db:Pick<D1Database,'prepare'>,code:string):Promise<string|null>{
 const prefix=shortPrefix(code);if(!prefix)return null;
 const rows=await db.prepare('SELECT token FROM training_shares WHERE substr(token, 1, 32) = ? LIMIT 2').bind(prefix).all<{token:string}>();
 return rows.results.length===1?rows.results[0].token:null;
}

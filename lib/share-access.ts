export const SHARE_COOKIE='__Host-meu-ritmo-share';
export function cookieValue(request:Request,name:string):string {
 const values=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(name+'='));
 return values.length===1?values[0].slice(name.length+1):'';
}
export const validToken=(value:string)=>/^[a-f0-9]{64}$/.test(value);
export function sharingPath(path:string):'page'|'api'|'asset'|null {
 if(path==='/visualizar')return 'page';
 if(path==='/api/shared-sessions')return 'api';
 if(path.startsWith('/_next/static/')||path.startsWith('/icons/')||['/kel-logo.png','/favicon.ico','/manifest-kel-v3.webmanifest','/plano-original.pdf'].includes(path))return 'asset';
 return null;
}
export async function sharedOwner(db:Pick<D1Database,'prepare'>,token:string):Promise<string|null>{
 if(!validToken(token))return null;
 const row=await db.prepare('SELECT owner_id FROM training_shares WHERE token = ?').bind(token).first<{owner_id:string}>();
 return row?.owner_id||null;
}
export function privateResponse(response:Response,cookie?:string):Response {
 const headers=new Headers(response.headers);
 headers.set('Cache-Control','private, no-store');
 headers.set('Referrer-Policy','no-referrer');
 headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
 if(cookie)headers.append('Set-Cookie',`${SHARE_COOKIE}=${cookie}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`);
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

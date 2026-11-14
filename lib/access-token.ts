type AccessClaims={iss?:string;aud?:string|string[];exp?:number;nbf?:number;iat?:number;email?:string;sub?:string};
type SigningKey=JsonWebKey&{kid?:string};
const decode=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export async function verifyAccessToken(token:string,issuer:string,audience:string,keys:SigningKey[],now=Date.now()/1000):Promise<AccessClaims>{
 if(!issuer||!audience||token.length>16000)throw Error('Invalid token');
 const parts=token.split('.');if(parts.length!==3)throw Error('Invalid token');
 const header=JSON.parse(new TextDecoder().decode(decode(parts[0])));
 if(header.alg!=='RS256'||typeof header.kid!=='string')throw Error('Invalid algorithm');
 const jwk=keys.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)throw Error('Unknown key');
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw Error('Invalid signature');
 const claims:AccessClaims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
 if(claims.iss!==issuer||!claims.aud||!(Array.isArray(claims.aud)?claims.aud:[claims.aud]).includes(audience)||typeof claims.exp!=='number'||claims.exp<=now||(claims.nbf!==undefined&&claims.nbf>now+30)||typeof claims.email!=='string'||!claims.email.includes('@'))throw Error('Invalid claims');
 return claims;
}

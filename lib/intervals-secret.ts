const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const decode=(text:string)=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
async function encryptionKey(secret:string){return crypto.subtle.importKey('raw',decode(secret),'AES-GCM',false,['encrypt','decrypt']);}
export async function encryptIntervalsKey(value:string,userId:string,secret:string){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(userId)},await encryptionKey(secret),new TextEncoder().encode(value));
 return encode(iv)+'.'+encode(new Uint8Array(encrypted));
}
export async function decryptIntervalsKey(value:string,userId:string,secret:string){
 const [iv,encrypted]=value.split('.');
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv),additionalData:new TextEncoder().encode(userId)},await encryptionKey(secret),decode(encrypted));
 return new TextDecoder().decode(plain);
}

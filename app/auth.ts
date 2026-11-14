import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
export type AppUser={userId:string;displayName:string;email:string;fullName:string|null};
// These headers are replaced by worker/index.ts after signature validation.
export async function getAppUser():Promise<AppUser|null>{
 const h=await headers(),userId=h.get('x-meu-ritmo-user-id'),email=h.get('x-meu-ritmo-email');
 return userId&&email?{userId,email,displayName:email,fullName:null}:null;
}
export async function requireAppUser(returnTo:string):Promise<AppUser>{
 const user=await getAppUser();if(user)return user;
 redirect('/login?return_to='+encodeURIComponent(returnTo.startsWith('/')&&!returnTo.startsWith('//')?returnTo:'/'));
}

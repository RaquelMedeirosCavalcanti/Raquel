import {env} from 'cloudflare:workers';
import type {AppUser} from '../app/auth';

// Only the configured Site owner may change training data or sharing links.
// Cloudflare Access authenticates every visitor before the application.
export function canManageTraining(user:AppUser|null):boolean {
 return !!user && !!env.SITE_OWNER_EMAIL && user.email.toLowerCase()===env.SITE_OWNER_EMAIL.trim().toLowerCase();
}
export function sameOrigin(req:Request):boolean {
 return req.headers.get('origin')===new URL(req.url).origin;
}
export const validShareToken=(value:string)=>/^[a-f0-9]{64}$/.test(value);
export function newShareToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')}

import {eq} from 'drizzle-orm';
import {getDb} from '../db';
import {sessions} from '../db/schema';
import {defaultsForUser} from './training-plan';
import type {Session} from './runs';

import {normalizeSessionDistances} from './distances';

export async function sessionsForUser(userId:string):Promise<Session[]> {
 const rows=await getDb().select().from(sessions).where(eq(sessions.userId,userId));
 const stored=rows.map(r=>JSON.parse(r.data));
 const ids=new Set(stored.map(s=>s.id));
 return [...defaultsForUser(userId).filter(s=>!ids.has(s.id)),...stored.filter(s=>!s.deleted)].map(normalizeSessionDistances);
}

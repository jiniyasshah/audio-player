import { env } from 'cloudflare:workers';
export type Track = {id:string;owner:string;title:string;mime:string;size:number;duration:number;created:number;expires:number};
export function storage() {
 const bindings = env as unknown as {DB:D1Database;BUCKET:R2Bucket};
 if(!bindings.DB || !bindings.BUCKET) throw new Error('Storage unavailable');
 return {db:bindings.DB,bucket:bindings.BUCKET};
}
export const json = (data:unknown,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export function sameOrigin(r:Request) {const o=r.headers.get('origin');return !o || o===new URL(r.url).origin;}
export async function cleanup() {
 const {db,bucket}=storage();
 const {results}=await db.prepare('SELECT id FROM tracks WHERE expires <= ? LIMIT 20').bind(Date.now()).all<{id:string}>();
 for(const t of results) {await bucket.delete(t.id);await db.prepare('DELETE FROM tracks WHERE id = ? AND expires <= ?').bind(t.id,Date.now()).run();}
}
export async function getTrack(id:string) {
 if(!/^[a-f0-9]{64}$/.test(id))return null;
 return storage().db.prepare('SELECT * FROM tracks WHERE id = ?').bind(id).first<Track>();
}

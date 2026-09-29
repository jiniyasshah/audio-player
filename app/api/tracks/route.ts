import {browserOwner,withBrowserCookie} from '../../../lib/browser-owner';
import {storage,json,sameOrigin,cleanup,Track} from '../../../lib/storage';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
 try {const owner=await browserOwner(request,true);if(!owner)throw Error('Browser could not be initialized');
 // Preserve uploads from an already established platform session during this upgrade.
 const previousOwner=request.headers.get('oai-authenticated-user-id');
 if(previousOwner)await storage().db.prepare('UPDATE tracks SET owner = ? WHERE owner = ?').bind(owner.id,previousOwner).run();
 await cleanup();const {results}=await storage().db.prepare('SELECT * FROM tracks WHERE owner = ? AND expires > ? ORDER BY created DESC').bind(owner.id,Date.now()).all<Track>();
 return withBrowserCookie(json({tracks:results.map(({owner,...t})=>t)}),owner);
 }catch(e){console.error(e);return json({error:'Your tracks could not be loaded. Please retry.'},503);}
}
export async function POST(request:Request) {
 try {
 if(!sameOrigin(request))return json({error:'Invalid origin.'},403);
 const owner=await browserOwner(request,true);if(!owner)throw Error('Browser could not be initialized');
 const size=Number(request.headers.get('content-length'));
 const mime=request.headers.get('content-type')?.split(';')[0]||'';
 const allowed=['audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/ogg','audio/flac','audio/x-flac','audio/aac'];
 if(!allowed.includes(mime))return json({error:'Please choose an MP3, M4A, WAV, OGG, FLAC or AAC audio file.'},415);
 if(!Number.isSafeInteger(size)||size<1||size>50*1024*1024)return json({error:'Please choose a file smaller than 50 MB.'},413);
 const title=decodeURIComponent(request.headers.get('x-track-title')||'Untitled track').trim().slice(0,120);
 const duration=Number(request.headers.get('x-track-duration'));
 if(!title||!Number.isFinite(duration)||duration<=0||duration>14400||!request.body)return json({error:'This audio file could not be read.'},400);
 const {db,bucket}=storage();await cleanup();
 const count=await db.prepare('SELECT COUNT(*) AS total FROM tracks WHERE owner = ? AND expires > ?').bind(owner.id,Date.now()).first<{total:number}>();
 if((count?.total||0)>=10)return json({error:'You have 10 active tracks. End one link before uploading another.'},429);
 const id=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
 await bucket.put(id,request.body,{httpMetadata:{contentType:mime}});
 const created=Date.now(),expires=created+24*60*60*1000;
 try {await db.prepare('INSERT INTO tracks (id,owner,title,mime,size,duration,created,expires) VALUES (?,?,?,?,?,?,?,?)').bind(id,owner.id,title,mime,size,duration,created,expires).run();}
 catch(e){await bucket.delete(id);throw e;}
 return withBrowserCookie(json({track:{id,title,mime,size,duration,created,expires}},201),owner);
 }catch(e){console.error(e);return json({error:'Upload failed. Your file is still selected; please try again.'},503);}
}

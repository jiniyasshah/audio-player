import {browserOwner,withBrowserCookie} from '../browser-owner';
import {storage,json,sameOrigin,cleanup,getTrack,type Track} from '../storage';
import {audioRange} from '../audio-range';
export async function listTracks(request:Request) {
 try {const owner=await browserOwner(request,true);if(!owner)throw Error('Browser could not be initialized');
 // Preserve uploads from an already established platform session during this upgrade.
 const previousOwner=request.headers.get('oai-authenticated-user-id');
 if(previousOwner)await storage().db.prepare('UPDATE tracks SET owner = ? WHERE owner = ?').bind(owner.id,previousOwner).run();
 await cleanup();const {results}=await storage().db.prepare('SELECT * FROM tracks WHERE owner = ? AND expires > ? ORDER BY created DESC').bind(owner.id,Date.now()).all<Track>();
 return withBrowserCookie(json({tracks:results.map(({owner,...t})=>t)}),owner);
 }catch(e){console.error(e);return json({error:'Your tracks could not be loaded. Please retry.'},503);}
}
export async function uploadTrack(request:Request) {
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
type Context={params:Promise<{id:string}>};
export async function trackMetadata(_:Request,{params}:Context) {
 try{const t=await getTrack((await params).id);if(!t)return json({error:'This listening link is unavailable.'},404);
 if(t.expires<=Date.now())return json({error:'This listening link has expired.'},410);
 const {owner,...track}=t;return json({track});}catch(e){console.error(e);return json({error:'Unable to load this track. Please try again.'},503);}
}
export async function deleteTrack(r:Request,{params}:Context) {
 try{if(!sameOrigin(r))return json({error:'Invalid origin.'},403);
 const owner=await browserOwner(r);if(!owner)return json({error:'This track can only be deleted from the browser that uploaded it.'},403);
 const t=await getTrack((await params).id);if(!t||t.owner!==owner.id)return json({error:'Track not found.'},404);
 const {db,bucket}=storage();await db.prepare('UPDATE tracks SET expires = ? WHERE id = ?').bind(Date.now(),t.id).run();await bucket.delete(t.id);await db.prepare('DELETE FROM tracks WHERE id = ?').bind(t.id).run();return json({ok:true});
 }catch(e){console.error(e);return json({error:'Could not delete this track. Please retry.'},503);}
}
export async function streamTrack(r:Request,{params}:{params:Promise<{id:string}>}) {
 try{const t=await getTrack((await params).id);if(!t)return json({error:'Track unavailable.'},404);
 if(t.expires<=Date.now())return json({error:'This listening link has expired.'},410);
 const range=audioRange(r.headers.get('range'),t.size);
 const headers=new Headers({'Content-Type':t.mime,'Accept-Ranges':'bytes','Cache-Control':'private, no-store, max-age=0','Content-Disposition':'inline','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
 if(range==='invalid'){headers.set('Content-Range',`bytes */${t.size}`);return new Response(null,{status:416,headers});}
 const start=range?.start||0,end=range?.end??t.size-1,length=end-start+1;
 headers.set('Content-Length',String(length));if(range)headers.set('Content-Range',`bytes ${start}-${end}/${t.size}`);
 if(r.method==='HEAD')return new Response(null,{status:range?206:200,headers});
 const object=await storage().bucket.get(t.id,{range:{offset:start,length}});if(!object)return json({error:'Track unavailable.'},404);
 const reader=object.body.getReader();
 const stream=new ReadableStream({async pull(controller){if(Date.now()>=t.expires){await reader.cancel();controller.error(new Error('Link expired'));return;}const {value,done}=await reader.read();if(done)controller.close();else controller.enqueue(value);},cancel(){return reader.cancel();}});
 return new Response(stream,{status:range?206:200,headers});
 }catch(e){console.error(e);return json({error:'Playback is temporarily unavailable.'},503);}
}
export async function startUpload(_r:Request){return json({error:'Direct uploads are not enabled on this host.'},404);}
export async function completeUpload(_r:Request,_c:{params:Promise<{id:string}>}){return json({error:'Direct uploads are not enabled on this host.'},404);}

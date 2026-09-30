import {browserOwner} from '../../../../lib/browser-owner';
import {getTrack,storage,json,sameOrigin} from '../../../../lib/storage';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function GET(_:Request,{params}:Context) {
 try{const t=await getTrack((await params).id);if(!t)return json({error:'This listening link is unavailable.'},404);
 if(t.expires<=Date.now())return json({error:'This listening link has expired.'},410);
 const {owner,...track}=t;return json({track});}catch(e){console.error(e);return json({error:'Unable to load this track. Please try again.'},503);}
}
export async function DELETE(r:Request,{params}:Context) {
 try{if(!sameOrigin(r))return json({error:'Invalid origin.'},403);
 const owner=await browserOwner(r);if(!owner)return json({error:'This track can only be deleted from the browser that uploaded it.'},403);
 const t=await getTrack((await params).id);if(!t||t.owner!==owner.id)return json({error:'Track not found.'},404);
 const {db,bucket}=storage();await db.prepare('UPDATE tracks SET expires = ? WHERE id = ?').bind(Date.now(),t.id).run();await bucket.delete(t.id);await db.prepare('DELETE FROM tracks WHERE id = ?').bind(t.id).run();return json({ok:true});
 }catch(e){console.error(e);return json({error:'Could not delete this track. Please retry.'},503);}
}

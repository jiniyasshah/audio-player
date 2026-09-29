import {getTrack,storage,json} from '../../../../../lib/storage';
import {audioRange} from '../../../../../lib/audio-range';
export const dynamic='force-dynamic';
async function serve(r:Request,{params}:{params:Promise<{id:string}>}) {
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
export const GET=serve;export const HEAD=serve;

import * as blob from '@vercel/blob';
import {generateClientTokenFromReadWriteToken} from '@vercel/blob/client';
import {browserOwner,withBrowserCookie} from '../browser-owner';
import {audioRange} from '../audio-range';
import type {Track} from '../storage';

type RecordData=Track&{state:'pending'|'active'|'deleted';uploadExpires:number;purgeAfter:number};
type Context={params:Promise<{id:string}>};
type Store=Pick<typeof blob,'get'|'put'|'del'|'head'|'list'>;
const DAY=86400000,UPLOAD_WINDOW=15*60000,MAX_SIZE=50*1024*1024;
const TYPES=['audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/ogg','audio/flac','audio/x-flac','audio/aac'];
const validId=(id:string)=>/^[a-f0-9]{64}$/.test(id);
const metadataPath=(id:string)=>`afterhours/tracks/${id}.json`;
const audioPath=(id:string)=>`afterhours/audio/${id}`;
const ownerPrefix=(owner:string)=>`afterhours/owners/${owner.slice(8)}/`;
const indexPath=(r:RecordData)=>ownerPrefix(r.owner)+r.id;
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const publicTrack=(r:RecordData):Omit<Track,'owner'>=>({id:r.id,title:r.title,mime:r.mime,size:r.size,duration:r.duration,created:r.created,expires:r.expires});
class HttpError extends Error{constructor(message:string,public status:number){super(message);}}
function requireOrigin(r:Request){
 const origin=r.headers.get('origin');
 if(origin&&origin!==new URL(r.url).origin)throw new HttpError('Invalid origin.',403);
 if(r.headers.get('sec-fetch-site')==='cross-site')throw new HttpError('Invalid origin.',403);
}
async function smallJson(request:Request){
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new HttpError('Expected JSON.',415);
 const reader=request.body?.getReader();if(!reader)throw new HttpError('Missing request body.',400);
 let text='',size=0;const decoder=new TextDecoder();
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();throw new HttpError('Request too large.',413);}text+=decoder.decode(value,{stream:true});}
 try{return JSON.parse(text+decoder.decode());}catch{throw new HttpError('Invalid request.',400);}
}

// Injection makes ownership, expiry and concurrent deletion testable without a live store.
export function createVercelApi(store:Store=blob,sign=generateClientTokenFromReadWriteToken,now=Date.now){
 const options=()=>({token:process.env.BLOB_READ_WRITE_TOKEN});
 const ensureConfigured=()=>{if(!process.env.BLOB_READ_WRITE_TOKEN)throw new HttpError('Storage is not configured. Connect a private Vercel Blob store and redeploy.',503);};
 async function read(id:string){
  if(!validId(id))return null;
  const result=await store.get(metadataPath(id),{...options(),access:'private',useCache:false});
  if(!result||result.statusCode!==200)return null;
  const data=await new Response(result.stream).json() as RecordData;
  return {data,etag:result.blob.etag};
 }
 async function write(record:RecordData,etag?:string){
  return store.put(metadataPath(record.id),JSON.stringify(record),{...options(),access:'private',addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:60,...(etag?{allowOverwrite:true,ifMatch:etag}:{})});
 }
 async function owned(request:Request){
  requireOrigin(request);const owner=await browserOwner(request);
  if(!owner)throw new HttpError('Open the upload page in this browser first.',403);
  return owner;
 }
 async function ownedRecord(request:Request,context:Context){
  const owner=await owned(request),record=await read((await context.params).id);
  if(!record||record.data.owner!==owner.id)throw new HttpError('Track not found.',404);
  return record;
 }
 async function listOwner(owner:string){
  const records:RecordData[]=[];let cursor:string|undefined;
  do{
   const page=await store.list({...options(),prefix:ownerPrefix(owner),limit:1000,cursor});
   for(const entry of page.blobs){
    const id=entry.pathname.slice(ownerPrefix(owner).length);
    const record=await read(id);
    if(!record){await store.del(entry.url,options());continue;}
    if(record.data.purgeAfter<=now()){
     // Reads enforce expiry even when physical cleanup has not yet run.
     await store.del(audioPath(id),options());
     await store.del(metadataPath(id),options());
     await store.del(entry.url,options());
    }else records.push(record.data);
   }
   cursor=page.hasMore?page.cursor:undefined;
  }while(cursor);
  return records;
 }
 function safe<A extends unknown[]>(handler:(...args:A)=>Promise<Response>){return async(...args:A)=>{
  try{ensureConfigured();return await handler(...args);}catch(error){
   if(error instanceof HttpError)return json({error:error.message},error.status);
   if(error instanceof blob.BlobPreconditionFailedError)return json({error:'This track changed while processing. Refresh and try again.'},409);
   console.error('Afterhours storage request failed',error);
   return json({error:'Storage is temporarily unavailable. Please try again.'},503);
  }
 };}
 return {
  listTracks:safe(async(request:Request)=>{
   const owner=await browserOwner(request,true);if(!owner)throw new HttpError('Could not initialize your browser.',503);
   const records=await listOwner(owner.id);
   return withBrowserCookie(json({uploadMode:'direct',tracks:records.filter(r=>r.state==='active'&&r.expires>now()).sort((a,b)=>b.created-a.created).map(publicTrack)}),owner);
  }),
  uploadTrack:async(_request:Request)=>json({error:'Use the direct upload flow on Vercel.'},400),
  startUpload:safe(async(request:Request)=>{
   const owner=await owned(request),input=await smallJson(request);
   const {mime,size,duration}=input;const title=typeof input.title==='string'?input.title.trim():'';
   if(!TYPES.includes(mime))throw new HttpError('Please choose a supported audio file.',415);
   if(!Number.isSafeInteger(size)||size<1||size>MAX_SIZE)throw new HttpError('Please choose a file smaller than 50 MB.',413);
   if(!title||title.length>120||!Number.isFinite(duration)||duration<=0||duration>14400)throw new HttpError('This audio file could not be read.',400);
   const records=await listOwner(owner.id);
   if(records.filter(r=>r.state==='pending'?r.uploadExpires>now():r.state==='active'&&r.expires>now()).length>=10)throw new HttpError('You have 10 active or pending uploads. Delete a track or wait for unfinished uploads to expire.',429);
   const id=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
   const created=now();const record:RecordData={id,owner:owner.id,title,mime,size,duration,created,expires:created+DAY,state:'pending',uploadExpires:created+UPLOAD_WINDOW,purgeAfter:created+DAY};
   await write(record);
   await store.put(indexPath(record),JSON.stringify({id}),{...options(),access:'private',addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:60});
   const clientToken=await sign({...options(),pathname:audioPath(id),allowedContentTypes:[mime],maximumSizeInBytes:size,validUntil:record.uploadExpires,allowOverwrite:false,addRandomSuffix:false,cacheControlMaxAge:60});
   return json({id,pathname:audioPath(id),clientToken},201);
  }),
  completeUpload:safe(async(request:Request,context:Context)=>{
   const record=await ownedRecord(request,context),r=record.data;
   if(r.state==='deleted'||(r.state==='active'&&r.expires<=now()))throw new HttpError('This listening link is no longer available.',410);
   if(r.state==='active')return json({track:publicTrack(r)});
   if(r.uploadExpires<=now())throw new HttpError('Upload session expired. Please upload the track again.',410);
   const object=await store.head(audioPath(r.id),options());
   if(object.size!==r.size||object.contentType.split(';')[0]!==r.mime)throw new HttpError('Uploaded audio did not match the selected file.',400);
   // Conditional write prevents a late completion from undoing a deletion.
   const created=now(),active:RecordData={...r,state:'active',created,expires:created+DAY,purgeAfter:created+DAY};
   await write(active,record.etag);
   return json({track:publicTrack(active)},201);
  }),
  trackMetadata:safe(async(_request:Request,{params}:Context)=>{
   const record=await read((await params).id);
   if(!record||record.data.state==='pending')throw new HttpError('This listening link is unavailable.',404);
   if(record.data.state==='deleted'||record.data.expires<=now())throw new HttpError('This listening link has expired or was deleted.',410);
   return json({track:publicTrack(record.data)});
  }),
  deleteTrack:safe(async(request:Request,context:Context)=>{
   const record=await ownedRecord(request,context),r=record.data;
   if(r.state!=='deleted')await write({...r,state:'deleted',expires:now()},record.etag);
   // Keep the private tombstone until the original expiry, so a still-valid
   // upload token or repeated completion cannot restore the listening link.
   await store.del(audioPath(r.id),options());
   return json({ok:true});
  }),
  streamTrack:safe(async(request:Request,{params}:Context)=>{
   const record=await read((await params).id),r=record?.data;
   if(!r||r.state==='pending')throw new HttpError('Track unavailable.',404);
   if(r.state==='deleted'||r.expires<=now())throw new HttpError('This listening link has expired or was deleted.',410);
   const range=audioRange(request.headers.get('range'),r.size);
   const headers=new Headers({'Content-Type':r.mime,'Accept-Ranges':'bytes','Cache-Control':'private, no-store, max-age=0','Content-Disposition':'inline','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
   if(range==='invalid'){headers.set('Content-Range',`bytes */${r.size}`);return new Response(null,{status:416,headers});}
   const start=range?.start??0,end=range?.end??r.size-1,length=end-start+1;
   headers.set('Content-Length',String(length));
   if(range)headers.set('Content-Range',`bytes ${start}-${end}/${r.size}`);
   if(request.method==='HEAD')return new Response(null,{status:range?206:200,headers});
   const object=await store.get(audioPath(r.id),{...options(),access:'private',useCache:false,abortSignal:request.signal,headers:range?{Range:`bytes=${start}-${end}`}:{}});
   if(!object||object.statusCode!==200)throw new HttpError('Track unavailable.',404);
   if(range&&object.headers.get('content-range')!==headers.get('content-range')){await object.stream.cancel();throw new HttpError('Audio seeking is temporarily unavailable.',503);}
   const reader=object.stream.getReader();
   const stream=new ReadableStream({async pull(controller){
    if(now()>=r.expires){await reader.cancel();controller.error(new Error('Link expired'));return;}
    const {done,value}=await reader.read();if(done)controller.close();else controller.enqueue(value);
   },cancel(){return reader.cancel();}});
   return new Response(stream,{status:range?206:200,headers});
  }),
 };
}
export const {listTracks,uploadTrack,startUpload,completeUpload,trackMetadata,deleteTrack,streamTrack}=createVercelApi();

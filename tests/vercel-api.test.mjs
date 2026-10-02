import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {BlobPreconditionFailedError} from '@vercel/blob';

// Load the source with Node, without Next.js or a paid/live storage account.
let code=ts.transpileModule(fs.readFileSync(new URL('../lib/platform/vercel-api.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
for(const spec of ['@vercel/blob','@vercel/blob/client'])code=code.replaceAll(`'${spec}'`,JSON.stringify(import.meta.resolve(spec)));
for(const name of ['browser-owner','audio-range'])code=code.replaceAll(`'../${name}'`,JSON.stringify(new URL(`../lib/${name}.ts`,import.meta.url).href));
const {createVercelApi}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
process.env.BLOB_READ_WRITE_TOKEN='test-only-server-secret';
let clock=1_800_000_000_000,revision=0,competingWrite=null;
const objects=new Map(),signed=[];
const bytes=value=>typeof value==='string'?new TextEncoder().encode(value):value;
const pathname=value=>value.startsWith('https://')?new URL(value).pathname.slice(1):value;
const store={
 async put(path,value,options){
  assert.equal(options.access,'private');
  if(competingWrite&&path.startsWith('afterhours/tracks/')&&JSON.parse(value).state==='active'){const run=competingWrite;competingWrite=null;await run();}
  const previous=objects.get(path);
  if(options.ifMatch&&previous?.etag!==options.ifMatch)throw new BlobPreconditionFailedError();
  if(previous&&!options.allowOverwrite&&!options.ifMatch)throw new Error('Already exists');
  const object={pathname:path,url:'https://test.private.blob.vercel-storage.com/'+path,contentType:options.contentType||'application/octet-stream',data:bytes(value),etag:String(++revision)};
  objects.set(path,object);return object;
 },
 async get(path,options){
  assert.equal(options.access,'private');assert.equal(options.useCache,false);
  const object=objects.get(pathname(path));if(!object)return null;
  const range=options.headers?.Range;let data=object.data;
  const headers=new Headers();
  if(range){const [,start,end]=range.match(/bytes=(\d+)-(\d+)/);data=data.slice(+start,+end+1);headers.set('Content-Range',`bytes ${start}-${end}/${object.data.length}`);}
  return {statusCode:200,stream:new Response(data).body,headers,blob:{...object,size:data.length}};
 },
 async head(path){const o=objects.get(path);if(!o)throw new Error('Missing blob');return {...o,size:o.data.length};},
 async del(path){for(const p of Array.isArray(path)?path:[path])objects.delete(pathname(p));},
 async list({prefix}){return {blobs:[...objects.values()].filter(o=>o.pathname.startsWith(prefix)),hasMore:false,cursor:undefined};},
};
const api=createVercelApi(store,async options=>{signed.push(options);return 'restricted-upload-token';},()=>clock);
const request=(method='GET',cookie='',body,origin='https://audio.test')=>new Request('https://audio.test/api/tracks',{method,headers:{...(cookie?{cookie}:{}),origin,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
const ctx=id=>({params:Promise.resolve({id})});
const initial=await api.listTracks(request());
assert.equal(initial.status,200);
const cookie=initial.headers.get('set-cookie').split(';')[0];assert(cookie.startsWith('__Host-afterhours='));
assert.deepEqual(await initial.json(),{uploadMode:'direct',tracks:[]});
assert.equal((await api.startUpload(request('POST','',{title:'Song',mime:'audio/mpeg',size:10,duration:5}))).status,403);
assert.equal((await api.startUpload(request('POST',cookie,{title:'Song',mime:'audio/mpeg',size:60*1024*1024,duration:5}))).status,413);
const data=new Uint8Array([1,2,3,4,5,6,7,8,9,10]);
async function start(){const r=await api.startUpload(request('POST',cookie,{title:'Test song',mime:'audio/mpeg',size:data.length,duration:5}));assert.equal(r.status,201);return r.json();}
const session=await start();
assert.equal(session.clientToken,'restricted-upload-token');assert(!JSON.stringify(session).includes('test-only-server-secret'));
assert.equal(signed[0].maximumSizeInBytes,data.length);assert.deepEqual(signed[0].allowedContentTypes,['audio/mpeg']);assert.equal(signed[0].allowOverwrite,false);
assert.equal(signed[0].validUntil,clock+15*60000);
assert.equal((await api.trackMetadata(request(),ctx(session.id))).status,404);
await store.put(session.pathname,data,{access:'private',contentType:'audio/mpeg'});
const complete=await api.completeUpload(request('POST',cookie),ctx(session.id));assert.equal(complete.status,201);
const {track}=await complete.json();assert.equal(track.expires-track.created,86400000);assert(!('owner' in track));
assert.equal((await api.completeUpload(request('POST',cookie),ctx(session.id))).status,200);
assert.equal((await (await api.listTracks(request('GET',cookie))).json()).tracks.length,1);
const audio=await api.streamTrack(request(),ctx(session.id));assert.equal(audio.status,200);assert.deepEqual(new Uint8Array(await audio.arrayBuffer()),data);
const rangeRequest=new Request('https://audio.test/api/tracks/'+session.id+'/audio',{headers:{range:'bytes=2-5'}});
const partial=await api.streamTrack(rangeRequest,ctx(session.id));assert.equal(partial.status,206);assert.equal(partial.headers.get('content-range'),'bytes 2-5/10');assert.deepEqual(new Uint8Array(await partial.arrayBuffer()),data.slice(2,6));
const head=await api.streamTrack(request('HEAD'),ctx(session.id));assert.equal(head.headers.get('content-length'),'10');assert.equal(await head.text(),'');
const invalid=await api.streamTrack(new Request('https://audio.test',{headers:{range:'bytes=100-'}}),ctx(session.id));assert.equal(invalid.status,416);
const other=await api.listTracks(request());const otherCookie=other.headers.get('set-cookie').split(';')[0];
assert.equal((await api.deleteTrack(request('DELETE',otherCookie),ctx(session.id))).status,404);
assert.equal((await api.deleteTrack(request('DELETE',cookie,undefined,'https://evil.test'),ctx(session.id))).status,403);
assert.equal((await api.deleteTrack(request('DELETE',cookie),ctx(session.id))).status,200);
assert(!objects.has(session.pathname));assert.equal((await api.streamTrack(request(),ctx(session.id))).status,410);
assert.equal((await api.completeUpload(request('POST',cookie),ctx(session.id))).status,410);
const race=await start();await store.put(race.pathname,data,{access:'private',contentType:'audio/mpeg'});
competingWrite=()=>api.deleteTrack(request('DELETE',cookie),ctx(race.id));
assert.equal((await api.completeUpload(request('POST',cookie),ctx(race.id))).status,409);
assert.equal((await api.trackMetadata(request(),ctx(race.id))).status,410);
const expired=await start();await store.put(expired.pathname,data,{access:'private',contentType:'audio/mpeg'});await api.completeUpload(request('POST',cookie),ctx(expired.id));
clock+=86400001;assert.equal((await api.streamTrack(request(),ctx(expired.id))).status,410);
assert.equal((await (await api.listTracks(request('GET',cookie))).json()).tracks.length,0);assert.equal(objects.size,0);
delete process.env.BLOB_READ_WRITE_TOKEN;
assert.equal((await api.listTracks(request())).status,503);
console.log('PASS: Vercel private direct uploads, token limits, owner isolation, streaming ranges, expiry, deletion, and concurrent completion cannot restore deleted audio.');

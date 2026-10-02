import type {Track} from '../app/shared';

export async function directUpload(file:File,title:string,duration:number,mime:string,onProgress:(n:number)=>void):Promise<Track>{
 const start=await fetch('/api/tracks/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,duration,mime,size:file.size})});
 const session=await start.json() as {id:string;pathname:string;clientToken:string;error?:string};
 if(!start.ok)throw new Error(session.error||'Could not start upload.');
 const {put}=await import('@vercel/blob/client');
 // Audio goes straight to private storage, bypassing Vercel's function body limit.
 await put(session.pathname,file,{access:'private',token:session.clientToken,contentType:mime,multipart:true,onUploadProgress:({percentage})=>onProgress(Math.round(percentage))});
 onProgress(100);
 const complete=await fetch(`/api/tracks/${session.id}/complete`,{method:'POST'});
 const result=await complete.json() as {track:Track;error?:string};
 if(!complete.ok)throw new Error(result.error||'Could not finish upload.');
 return result.track;
}

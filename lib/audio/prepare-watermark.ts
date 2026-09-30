// SPDX-License-Identifier: GPL-3.0-or-later
import {MAX_WATERMARK_SECONDS,cleanSpeechText,type WatermarkOptions} from './watermark-core';
export type PreparedWatermark={file:File;times:number[];voiceDuration:number};
export async function prepareWatermark(file:File,options:WatermarkOptions,onProgress:(progress:number)=>void,signal:AbortSignal):Promise<PreparedWatermark>{
 cleanSpeechText(options.text);
 const aborted=()=>{if(signal.aborted)throw new DOMException('Preparation cancelled.','AbortError');};
 aborted();
 const context=new AudioContext({sampleRate:44100});
 let decoded:AudioBuffer;
 try{decoded=await context.decodeAudioData(await file.arrayBuffer());}catch{aborted();throw new Error('Your browser could not decode this file for watermarking. Try MP3 or WAV.');}finally{await context.close();}
 aborted();
 if(decoded.duration>MAX_WATERMARK_SECONDS)throw new Error('Voice watermarking supports tracks up to 10 minutes.');
 if(decoded.numberOfChannels>2)throw new Error('Watermarking supports mono or stereo audio. Please upload a stereo mix.');
 const sampleRate=decoded.sampleRate;
 const channels=Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i).slice());
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./watermark.worker.ts',import.meta.url),{type:'module'});
  const cleanup=()=>{worker.terminate();signal.removeEventListener('abort',cancel);};
  const cancel=()=>{cleanup();reject(new DOMException('Preparation cancelled.','AbortError'));};
  signal.addEventListener('abort',cancel,{once:true});if(signal.aborted){cancel();return;}
  worker.onerror=()=>{cleanup();reject(new Error('Audio processing failed. Try a shorter track or a desktop browser.'));};
  worker.onmessage=event=>{
   const data=event.data;
   if(data.type==='progress'){onProgress(data.progress);return;}
   cleanup();
   if(data.type==='error'){reject(new Error(data.error));return;}
   const result=new File([data.buffer],file.name.replace(/\.[^.]+$/,'')+'-watermarked.mp3',{type:'audio/mpeg'});
   if(result.size>50*1024*1024){reject(new Error('The prepared preview exceeds 50 MB. Try a shorter track.'));return;}
   resolve({file:result,times:data.times,voiceDuration:data.voiceDuration});
  };
  worker.postMessage({channels,sampleRate,options},channels.map(c=>c.buffer));
 });
}

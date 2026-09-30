// SPDX-License-Identifier: GPL-3.0-or-later
import {robotVoice} from './robot-voice';
import {Mp3Encoder} from '@breezystack/lamejs';
import {cleanSpeechText,watermarkTimes,mixWatermark,type WatermarkOptions} from './watermark-core';
type Job={channels:Float32Array[];sampleRate:number;options:WatermarkOptions};
const worker=self as unknown as {onmessage:((event:MessageEvent<Job>)=>void)|null;postMessage:(message:unknown,transfer?:Transferable[])=>void};
worker.onmessage=({data})=>{
 try{
  const {channels,sampleRate,options}=data;
  const {samples:voice,sampleRate:voiceRate}=robotVoice(cleanSpeechText(options.text));
  if(!voice||!voice.length)throw new Error('The robotic voice could not read this message. Try simpler English text.');
  const times=watermarkTimes(options,channels[0].length/sampleRate,voice.length/voiceRate);
  mixWatermark(channels,sampleRate,voice,voiceRate,times,options);
  const encoder=new Mp3Encoder(channels.length,sampleRate,192),blocks:Uint8Array[]=[];
  let lastProgress=-1;
  for(let offset=0;offset<channels[0].length;offset+=1152){
   const pcm=channels.map(channel=>{const n=Math.min(1152,channel.length-offset);const out=new Int16Array(n);for(let i=0;i<n;i++){const sample=Math.max(-1,Math.min(1,channel[offset+i]));out[i]=Math.round(sample*(sample<0?32768:32767));}return out;});
   const chunk=encoder.encodeBuffer(pcm[0],pcm[1]);if(chunk.length)blocks.push(new Uint8Array(chunk));
   const progress=Math.floor(offset/channels[0].length*100);if(progress!==lastProgress){lastProgress=progress;worker.postMessage({type:'progress',progress});}
  }
  const tail=encoder.flush();if(tail.length)blocks.push(new Uint8Array(tail));
  const output=new Uint8Array(blocks.reduce((n,b)=>n+b.length,0));let offset=0;for(const b of blocks){output.set(b,offset);offset+=b.length;}
  worker.postMessage({type:'complete',buffer:output.buffer,times,voiceDuration:voice.length/voiceRate},[output.buffer]);
 }catch(error){worker.postMessage({type:'error',error:error instanceof Error?error.message:'Could not prepare the watermarked audio.'});}
};

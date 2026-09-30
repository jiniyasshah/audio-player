// SPDX-License-Identifier: GPL-3.0-or-later
export type WatermarkOptions={text:string;mode:'auto'|'manual';timestamps:string;volume:number;duck:boolean};
export const MAX_WATERMARK_SECONDS=600;
export function cleanSpeechText(text:string){
 const cleaned=text.trim().replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,'-').replace(/\s+/g,' ');
 if(!cleaned||cleaned.length>120)throw new Error('Enter a watermark message between 1 and 120 characters.');
 if(!/^[a-zA-Z0-9 .,!?'-]+$/.test(cleaned))throw new Error('Use English letters, numbers, spaces, and simple punctuation for the robotic voice.');
 return cleaned;
}
export function watermarkTimes(options:WatermarkOptions,duration:number,voiceDuration:number):number[]{
 if(!Number.isFinite(duration)||duration<=0||duration>MAX_WATERMARK_SECONDS)throw new Error('Voice watermarking supports tracks up to 10 minutes.');
 if(!Number.isFinite(voiceDuration)||voiceDuration<=0||voiceDuration+0.3>duration)throw new Error('The voice message is longer than this track. Shorten the message.');
 if(!Number.isFinite(options.volume)||options.volume<.1||options.volume>1)throw new Error('Choose a watermark volume between 10% and 100%.');
 const latest=duration-voiceDuration-.2;
 if(options.mode==='auto'){
  const first=Math.min(10,Math.max(0,latest/2));const times=[first];const gap=Math.max(45,voiceDuration+8);
  for(let t=first+gap;t<=latest;t+=gap)times.push(t);
  return times;
 }
 const fields=options.timestamps.trim().split(',').map(t=>t.trim());
 if(!options.timestamps.trim()||fields.some(t=>!t))throw new Error('Enter timestamps separated by commas, for example 0:15, 1:10.');
 if(fields.length>30)throw new Error('Use up to 30 timestamps.');
 const times=fields.map(t=>{
  const match=/^(\d+):([0-5]\d)(?:\.(\d{1,3}))?$/.exec(t);
  if(!match)throw new Error(`Invalid timestamp “${t}”. Use minutes:seconds, for example 1:05.`);
  return Number(match[1])*60+Number(match[2])+Number('0.'+(match[3]||'0'));
 }).sort((a,b)=>a-b);
 for(let i=0;i<times.length;i++){
  if(times[i]>latest)throw new Error('A watermark starts too late to finish inside the track. Move it earlier.');
  if(i&&times[i]-times[i-1]<voiceDuration+.3)throw new Error('Watermarks overlap. Space the timestamps farther apart.');
 }
 return times;
}
// Mix directly into PCM before encoding. No separate voice track reaches listeners.
export function mixWatermark(channels:Float32Array[],sampleRate:number,voice:Float32Array,voiceRate:number,times:number[],options:WatermarkOptions){
 if(channels.length<1||channels.length>2||channels.some(c=>c.length!==channels[0].length))throw new Error('Unsupported audio channel layout.');
 let peakVoice=0;for(const v of voice)peakVoice=Math.max(peakVoice,Math.abs(v));
 if(!peakVoice)throw new Error('The voice could not be generated. Try a shorter message.');
 const voiceSamples=Math.ceil(voice.length*sampleRate/voiceRate),fadeIn=Math.round(.1*sampleRate),fadeOut=Math.round(.2*sampleRate);
 for(const time of times){
  const start=Math.round(time*sampleRate);
  for(let i=-fadeIn;i<voiceSamples+fadeOut;i++){
   const index=start+i;if(index<0||index>=channels[0].length)continue;
   const envelope=i<0?1+i/fadeIn:i>=voiceSamples?1-(i-voiceSamples)/fadeOut:1;
   const gain=options.duck?1-.6*envelope:1;
   const position=i*voiceRate/sampleRate,lo=Math.floor(position),fraction=position-lo;
   const spoken=i>=0&&i<voiceSamples?((voice[lo]||0)*(1-fraction)+(voice[lo+1]||0)*fraction)/peakVoice*.9*options.volume:0;
   for(const channel of channels)channel[index]=channel[index]*gain+spoken;
  }
 }
 let peak=1;for(const channel of channels)for(const value of channel)peak=Math.max(peak,Math.abs(value));
 const scale=.98/peak;for(const channel of channels)for(let i=0;i<channel.length;i++)channel[i]*=scale;
 return channels;
}

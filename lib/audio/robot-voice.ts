// SPDX-License-Identifier: GPL-3.0-or-later
import meSpeak from 'mespeak';
import config from 'mespeak/src/mespeak_config.json';
import voiceData from 'mespeak/voices/en/en-us.json';
let initialized=false;
export function robotVoice(text:string):{samples:Float32Array;sampleRate:number}{
 if(!initialized){meSpeak.loadConfig(config);meSpeak.loadVoice(voiceData);initialized=true;}
 const wav=meSpeak.speak(text,{rawdata:'array',speed:155,pitch:40,amplitude:100});
 if(!wav||wav.length<44)throw new Error('Could not generate the voice. Try simpler English text.');
 const bytes=Uint8Array.from(wav),view=new DataView(bytes.buffer);
 let sampleRate=22050,offset=12,dataOffset=-1,dataSize=0;
 while(offset+8<=bytes.length){
  const name=String.fromCharCode(...bytes.subarray(offset,offset+4)),size=view.getUint32(offset+4,true);
  if(name==='fmt '){if(view.getUint16(offset+8,true)!==1||view.getUint16(offset+10,true)!==1||view.getUint16(offset+22,true)!==16)throw new Error('Unsupported voice format.');sampleRate=view.getUint32(offset+12,true);}
  if(name==='data'){dataOffset=offset+8;dataSize=Math.min(size,bytes.length-dataOffset);break;}
  offset+=8+size+(size%2);
 }
 if(dataOffset<0||dataSize<2)throw new Error('Could not read the generated voice.');
 const samples=new Float32Array(Math.floor(dataSize/2));for(let i=0;i<samples.length;i++)samples[i]=view.getInt16(dataOffset+i*2,true)/32768;
 return {samples,sampleRate};
}

import {defineConfig} from 'vite';
import {readFileSync} from 'node:fs';

export default defineConfig({
 publicDir:false,
 plugins:[{name:'speech-source-encoding',enforce:'pre',load(id){
  if(id.replaceAll('\\','/').endsWith('/mespeak/src/ESpeak.js'))return readFileSync(id,'latin1');
 }}],
 build:{
  outDir:'public/generated',emptyOutDir:true,
  lib:{entry:'lib/audio/watermark.worker.ts',name:'AfterhoursWatermark',formats:['iife'],fileName:()=> 'watermark.worker.js'},
 },
});

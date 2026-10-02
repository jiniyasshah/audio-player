import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {watermarkTimes,cleanSpeechText,mixWatermark} from '../lib/audio/watermark-core.ts';
const options={text:'Preview only. Prepared for Alex.',mode:'manual',timestamps:'0:02',volume:.45,duck:true};
assert.equal(cleanSpeechText('  Preview   only  '),'Preview only');
assert.throws(()=>cleanSpeechText(''),/Enter/);
assert.throws(()=>cleanSpeechText('🎵'),/English/);
assert.deepEqual(watermarkTimes(options,10,3),[2]);
assert.deepEqual(watermarkTimes({...options,mode:'auto'},120,3),[10,55,100]);
assert.equal(watermarkTimes({...options,mode:'auto'},4,3).length,1);
for(const timestamps of ['0:99','1:00','0:01,0:02','0:02,0:02','0:02,'])assert.throws(()=>watermarkTimes({...options,timestamps},10,3));
assert.throws(()=>watermarkTimes(options,2,3));
assert.throws(()=>watermarkTimes(options,601,3));
const original=new Float32Array(1000).fill(.4);const left=original.slice(),right=original.slice();
mixWatermark([left,right],100,new Float32Array(100).fill(.5),100,[2],options);
assert(Math.abs(left[50]-.392)<1e-6);assert(left[220]>.392);assert.deepEqual(left,right);
assert(Math.abs(left[400]-.392)<1e-6);assert(original.every(x=>Math.abs(x-.4)<1e-6));
const artifact=new URL('../public/generated/watermark.worker.js',import.meta.url);
assert(fs.existsSync(artifact),'Run pnpm build:worker before this test.');
// Check the actual production client constructor, including native Next.js output.
let checkedWorkerUrl=false;
for(const directory of ['.next/static/chunks/','dist/client/']){
 const root=new URL('../'+directory,import.meta.url);if(!fs.existsSync(root))continue;
 for(const file of fs.readdirSync(root,{recursive:true}).filter(x=>x.endsWith('.js'))){
  const code=fs.readFileSync(new URL(file,root),'utf8');
  if(!code.includes('/generated/watermark.worker.js'))continue;
  const ast=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  function visit(node){
   if(ts.isNewExpression(node)&&node.expression.getText(ast)==='Worker'){
    const arg=node.arguments?.[0];
    if(arg&&(ts.isStringLiteral(arg)||ts.isNoSubstitutionTemplateLiteral(arg))&&arg.text.includes('watermark.worker')){
     const resolved=new URL(arg.text,'https://audio.example');
     assert.equal(resolved.origin,'https://audio.example');
     assert.equal(resolved.pathname,'/generated/watermark.worker.js');
     checkedWorkerUrl=true;
    }
   }
   ts.forEachChild(node,visit);
  }
  visit(ast);
 }
}
assert(checkedWorkerUrl,'Expected a same-origin worker constructor in a production client build.');
const messages=[];const scope={console,Uint8Array,Uint16Array,Uint32Array,Int8Array,Int16Array,Int32Array,Float32Array,Float64Array,ArrayBuffer,DataView,TextEncoder,TextDecoder,setTimeout,clearTimeout};
scope.self=scope;scope.postMessage=m=>messages.push(m);vm.createContext(scope);
vm.runInContext(fs.readFileSync(artifact,'utf8'),scope,{timeout:30000});
scope.onmessage({data:{channels:[new Float32Array(44100*10),new Float32Array(44100*10)],sampleRate:44100,options}});
const result=messages.find(m=>m.type==='complete');assert(result,JSON.stringify(messages.filter(m=>m.type==='error')));assert(result.buffer.byteLength>1000);assert.deepEqual(Array.from(result.times),[2]);assert(result.voiceDuration>1&&result.voiceDuration<8);
if(process.env.WATERMARK_TEST_MP3)fs.writeFileSync(process.env.WATERMARK_TEST_MP3,new Uint8Array(result.buffer));
messages.length=0;scope.onmessage({data:{channels:[new Float32Array(44100*10)],sampleRate:44100,options:{...options,timestamps:'0:09'}}});assert(messages.some(m=>m.type==='error'&&/too late/.test(m.error)));
console.log('PASS: custom robotic speech, real MP3 export, stereo mix, ducking, preview placements, overlap/invalid/late timestamps, auto placement, duration limits, original PCM unchanged.');

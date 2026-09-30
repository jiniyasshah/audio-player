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
const files=fs.readdirSync(new URL('../dist/client/',import.meta.url),{recursive:true});
const artifact=files.find(x=>/watermark\.worker-.*\.js$/.test(x));assert(artifact,'Run pnpm build before this test.');
// Exercise the actual emitted constructor argument; SSR must not turn it into file://.
let checkedWorkerUrl=false;
for(const file of files.filter(x=>x.endsWith('.js')&&!/watermark\.worker-/.test(x))){
 const code=fs.readFileSync(new URL('../dist/client/'+file,import.meta.url),'utf8');
 if(!code.includes('new Worker('))continue;
 const ast=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const bindings={URL};const constructors=[];
 function visit(node){
  if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer&&(ts.isStringLiteral(node.initializer)||ts.isNoSubstitutionTemplateLiteral(node.initializer))&&node.initializer.text.includes('watermark.worker-'))bindings[node.name.text]=node.initializer.text;
  if(ts.isNewExpression(node)&&node.expression.getText(ast)==='Worker')constructors.push(node.arguments[0]);
  ts.forEachChild(node,visit);
 }
 visit(ast);
 for(const arg of constructors){
  const workerUrl=vm.runInNewContext(arg.getText(ast),bindings);
  const resolved=new URL(workerUrl,'https://audio.example');
  assert.equal(resolved.origin,'https://audio.example','Worker must load from the website, not a build-machine file URL.');
  assert.equal(decodeURIComponent(resolved.pathname.slice(1)),artifact,'Worker URL must match the packaged JavaScript asset.');
  checkedWorkerUrl=true;
 }
}
assert(checkedWorkerUrl,'Expected a worker constructor in the production client bundle.');
const messages=[];const scope={console,Uint8Array,Uint16Array,Uint32Array,Int8Array,Int16Array,Int32Array,Float32Array,Float64Array,ArrayBuffer,DataView,TextEncoder,TextDecoder,setTimeout,clearTimeout};
scope.self=scope;scope.postMessage=m=>messages.push(m);vm.createContext(scope);
vm.runInContext(fs.readFileSync(new URL('../dist/client/'+artifact,import.meta.url),'utf8'),scope,{timeout:30000});
scope.onmessage({data:{channels:[new Float32Array(44100*10),new Float32Array(44100*10)],sampleRate:44100,options}});
const result=messages.find(m=>m.type==='complete');assert(result,JSON.stringify(messages.filter(m=>m.type==='error')));assert(result.buffer.byteLength>1000);assert.deepEqual(Array.from(result.times),[2]);assert(result.voiceDuration>1&&result.voiceDuration<8);
if(process.env.WATERMARK_TEST_MP3)fs.writeFileSync(process.env.WATERMARK_TEST_MP3,new Uint8Array(result.buffer));
messages.length=0;scope.onmessage({data:{channels:[new Float32Array(44100*10)],sampleRate:44100,options:{...options,timestamps:'0:09'}}});assert(messages.some(m=>m.type==='error'&&/too late/.test(m.error)));
console.log('PASS: custom robotic speech, real MP3 export, stereo mix, ducking, preview placements, overlap/invalid/late timestamps, auto placement, duration limits, original PCM unchanged.');

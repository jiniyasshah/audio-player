'use client';
import {useEffect,useRef,useState} from 'react';
import {AudioLines,Loader2,Check,Play} from 'lucide-react';
import {prepareWatermark} from '../lib/audio/prepare-watermark';
import type {WatermarkOptions} from '../lib/audio/watermark-core';
import {time} from './shared';
type Props={file:File|null;duration:number;enabled:boolean;onToggle:(enabled:boolean)=>void;onPrepared:(file:File|null)=>void;onBusy:(busy:boolean)=>void;disabled:boolean};
export default function WatermarkEditor({file,duration,enabled,onToggle,onPrepared,onBusy,disabled}:Props){
 const [options,setOptions]=useState<WatermarkOptions>({text:'Preview only',mode:'auto',timestamps:'0:15',volume:.45,duck:true});
 const [working,setWorking]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState(''),[url,setUrl]=useState(''),[times,setTimes]=useState<number[]>([]);
 const audio=useRef<HTMLAudioElement>(null),job=useRef<AbortController|null>(null),previewUrl=useRef('');
 function invalidate(){job.current?.abort();job.current=null;audio.current?.pause();if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);previewUrl.current='';setUrl('');setTimes([]);setError('');setWorking(false);onBusy(false);onPrepared(null);}
 useEffect(()=>{invalidate();return()=>{job.current?.abort();if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);};},[file,enabled]);
 function change(patch:Partial<WatermarkOptions>){invalidate();setOptions(o=>({...o,...patch}));}
 async function prepare(){
  if(!file||disabled)return;invalidate();const controller=new AbortController();job.current=controller;setWorking(true);onBusy(true);setProgress(0);
  try{const result=await prepareWatermark(file,options,setProgress,controller.signal);if(controller.signal.aborted)return;
   const nextUrl=URL.createObjectURL(result.file);previewUrl.current=nextUrl;setUrl(nextUrl);setTimes(result.times);onPrepared(result.file);
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Could not prepare your preview.');}
  finally{if(job.current===controller){job.current=null;setWorking(false);onBusy(false);}}
 }
 return <section className="watermark-settings" aria-label="Voice watermark settings"><div className="watermark-heading"><div><AudioLines size={19}/><div><strong>Robotic voice watermark</strong><p>Mix a spoken message into your track.</p></div></div><button className="toggle-switch" type="button" role="switch" aria-checked={enabled} aria-label="Enable voice watermark" disabled={disabled} onClick={()=>onToggle(!enabled)}><span/></button></div>
 {enabled&&<div className="watermark-fields"><label className="field-label" htmlFor="watermark-text">What should it say?<span>{options.text.length}/120</span></label><textarea id="watermark-text" className="title-input" rows={2} maxLength={120} value={options.text} disabled={disabled||working} onChange={e=>change({text:e.target.value})} placeholder="Preview only. Prepared for Alex."/><p className="field-hint">English text · Synthetic robotic voice</p>
 <fieldset disabled={disabled||working} className="timing-field"><legend>When should it speak?</legend><div className="timing-options"><label><input type="radio" name="watermark-mode" value="auto" checked={options.mode==='auto'} onChange={()=>change({mode:'auto'})}/>Auto placement</label><label><input type="radio" name="watermark-mode" value="manual" checked={options.mode==='manual'} onChange={()=>change({mode:'manual'})}/>My timestamps</label></div></fieldset>
 {options.mode==='manual'?<><label className="field-label" htmlFor="watermark-times">Timestamps</label><input id="watermark-times" className="title-input" value={options.timestamps} disabled={disabled||working} onChange={e=>change({timestamps:e.target.value})} placeholder="0:15, 1:10, 2:30"/><p className="field-hint">Minutes:seconds, separated by commas. Each message must finish before the track ends.</p></>:<p className="field-hint">Starts around 0:10, then repeats about every 45 seconds. Short tracks adapt automatically.</p>}
 <label className="field-label" htmlFor="watermark-volume">Voice volume<span>{Math.round(options.volume*100)}%</span></label><input id="watermark-volume" type="range" min="10" max="100" value={Math.round(options.volume*100)} disabled={disabled||working} onChange={e=>change({volume:Number(e.target.value)/100})}/><label className="duck-option"><input type="checkbox" checked={options.duck} disabled={disabled||working} onChange={e=>change({duck:e.target.checked})}/>Lower the music while the voice speaks</label>
 <div className="prepare-actions"><button type="button" className="secondary" disabled={!file||disabled||working||duration>600} onClick={prepare}>{working?<><Loader2 size={16} className="spin"/>{progress?`Mixing & encoding ${progress}%`:'Preparing audio…'}</>:url?<><Check size={16}/>Regenerate preview</>:<><Play size={16}/>Prepare watermarked preview</>}</button>{working&&<button type="button" className="text-link" onClick={invalidate}>Cancel</button>}</div>
 {working&&<progress aria-label="Watermark preparation progress" value={progress} max={100}/>}
 <p className="field-hint">Processed on your device. Watermarked tracks can be up to 10 minutes. Your original stays unchanged.</p>
 {duration>600&&<p className="error" role="alert">This track is over 10 minutes. Use a shorter preview or turn watermarking off.</p>}
 {error&&<p className="error" role="alert">{error}</p>}
 {url&&<div className="prepared-preview"><strong><Check size={15}/>Watermarked preview ready</strong><audio ref={audio} controls controlsList="nodownload" src={url} preload="metadata" aria-label="Preview the watermarked song"/><p>Jump to a watermark:</p><div className="timestamp-chips">{times.map((t,i)=><button type="button" key={i} onClick={()=>{if(audio.current){audio.current.currentTime=Math.max(0,t-.5);void audio.current.play().catch(()=>setError('Press play to listen to the preview.'));}}}>{time(t)}</button>)}</div><p>This exact version will be shared.</p></div>}
 </div>}
 </section>;
}

'use client';

import {AlertDialog} from 'radix-ui';
import {Loader2,Music2,Trash2} from 'lucide-react';
import type {Track} from './shared';

type Props={track:Track|null;busy:boolean;error:string;onClose:()=>void;onConfirm:()=>void;onRestoreFocus:()=>void};

export default function DeleteTrackDialog({track,busy,error,onClose,onConfirm,onRestoreFocus}:Props){
 return <AlertDialog.Root open={!!track} onOpenChange={open=>{if(!open&&!busy)onClose();}}>
  <AlertDialog.Portal>
   <AlertDialog.Overlay className="delete-dialog-overlay"/>
   <AlertDialog.Content className="delete-dialog" aria-busy={busy} onEscapeKeyDown={event=>{if(busy)event.preventDefault();}} onCloseAutoFocus={event=>{event.preventDefault();onRestoreFocus();}}>
    <div className="delete-dialog-icon"><Trash2 size={23} aria-hidden="true"/></div>
    <AlertDialog.Title className="delete-dialog-title">Delete this track?</AlertDialog.Title>
    <AlertDialog.Description className="delete-dialog-description">The audio will be permanently removed and its listening link will stop working. This cannot be undone.</AlertDialog.Description>
    <div className="delete-dialog-track"><Music2 size={19} aria-hidden="true"/><span>{track?.title}</span></div>
    {error&&<p className="delete-dialog-error" role="alert">{error}</p>}
    <div className="delete-dialog-actions">
     <AlertDialog.Cancel className="delete-dialog-cancel" disabled={busy}>Keep track</AlertDialog.Cancel>
     <button type="button" className="delete-dialog-confirm" disabled={busy} onClick={onConfirm}>{busy?<Loader2 size={17} className="spin" aria-hidden="true"/>:<Trash2 size={17} aria-hidden="true"/>}{busy?'Deleting…':'Delete track'}</button>
    </div>
   </AlertDialog.Content>
  </AlertDialog.Portal>
 </AlertDialog.Root>;
}

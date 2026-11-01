'use client';
import {sessionFetch as fetch} from '../../lib/renewing-session';

import {useEffect,useRef,useState} from 'react';
import {CheckCircle2} from 'lucide-react';
import {ConfiguredBookingConfirmationSchema} from '@dental/contracts';
function key(){const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]!&15)|64;bytes[8]=(bytes[8]!&63)|128;const h=Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
export function ConfiguredConfirmation({api,token,clinicId,id,revision,onClose,onConfirmed,onSessionExpired}:{api:string;token:string;clinicId:string;id:string;revision:number;onClose:()=>void;onConfirmed:()=>void;onSessionExpired:()=>void}){
  const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[rejected,setRejected]=useState(false),[error,setError]=useState('');
  const attempt=useRef<{key:string;body:{expected_revision:number}}|null>(null),active=useRef<AbortController|null>(null);
  useEffect(()=>()=>active.current?.abort(),[]);
  async function confirm(){
    if(active.current||rejected)return;
    const controller=new AbortController();active.current=controller;setBusy(true);setError('');
    attempt.current??={key:key(),body:{expected_revision:revision}};const command=attempt.current;
    try{
      const response=await fetch(`${api.replace(/\/$/,'')}/api/v1/booking-requests/configured/${id}/confirm`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'X-Clinic-Id':clinicId,'Idempotency-Key':command.key,'Content-Type':'application/json'},body:JSON.stringify(command.body),cache:'no-store',credentials:'omit',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
      if(controller.signal.aborted)return;
      if(response.status===401){onSessionExpired();return;}
      if([400,403,404,409].includes(response.status)){setUncertain(false);setRejected(true);attempt.current=null;setError(response.status===409?'Le créneau ou la demande a changé. Fermez et actualisez avant de réessayer.':'Cette confirmation n’est pas autorisée ou la demande est introuvable.');return;}
      if(!response.ok)throw Error('unavailable');
      const receipt=ConfiguredBookingConfirmationSchema.parse(await response.json());if(receipt.request_id!==id)throw Error('receipt');
      if(controller.signal.aborted)return;
      attempt.current=null;setUncertain(false);onConfirmed();
    }catch{if(!controller.signal.aborted){setUncertain(true);setError('Résultat à vérifier. Réessayez la même confirmation pour éviter un doublon.');}}
    finally{if(active.current===controller)active.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  return <form className="configured-confirmation" aria-label="Confirmer la demande" onSubmit={event=>{event.preventDefault();void confirm();}}>
    <strong>Réserver ce créneau ?</strong><p>Le praticien et le fauteuil seront attribués selon les disponibilités actuelles. Aucun dossier patient ne sera créé.</p>
    {error&&<p role="alert">{error}</p>}
    <div><button type="submit" disabled={busy||rejected}><CheckCircle2 size={17}/>{busy?'Confirmation…':uncertain?'Réessayer la même confirmation':'Confirmer le créneau'}</button><button type="button" disabled={busy||uncertain} onClick={onClose}>Retour</button></div>
  </form>;
}

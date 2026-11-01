'use client';
import {sessionFetch as fetch} from '../../lib/renewing-session';

import {useEffect,useRef,useState} from 'react';
import {ConfiguredAppointmentAvailabilitySchema,ConfiguredAppointmentReceiptSchema} from '@dental/contracts';
import { AppointmentContextSummary, appointmentLocalDate, type AppointmentContext } from "./appointment-context";
const zone='Africa/Casablanca';
function key(){const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]!&15)|64;b[8]=(b[8]!&63)|128;const h=Array.from(b,v=>v.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
export function ConfiguredReschedule({context,api,token,clinicId,id,version,onClose,onChanged,onSessionExpired}:{context:AppointmentContext;api:string;token:string;clinicId:string;id:string;version:number;onClose:()=>void;onChanged:()=>void;onSessionExpired:()=>void}){
  const [date,setDate]=useState(()=>appointmentLocalDate(context.startsAt));
  const [availability,setAvailability]=useState<ReturnType<typeof ConfiguredAppointmentAvailabilitySchema.parse>|null>(null),[selected,setSelected]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0);
  const operation=useRef<AbortController|null>(null),expire=useRef(onSessionExpired);expire.current=onSessionExpired;
  const attempt=useRef<{key:string;body:{action:'reschedule';expected_version:number;expected_revision:number;starts_at:string;ends_at:string}}|null>(null);
  useEffect(()=>()=>operation.current?.abort(),[]);
  useEffect(()=>{
    const controller=new AbortController();setAvailability(null);setSelected('');setError('');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){setLoading(false);return;}
    setLoading(true);
    void(async()=>{try{
      const response=await fetch(`${api.replace(/\/$/,'')}/api/v1/appointments/${id}/configured-availability?${new URLSearchParams({date})}`,{headers:{Authorization:`Bearer ${token}`,'X-Clinic-Id':clinicId},cache:'no-store',credentials:'omit',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
      if(controller.signal.aborted)return;if(response.status===401){expire.current();return;}
      if(!response.ok)throw Error('unavailable');const result=ConfiguredAppointmentAvailabilitySchema.parse(await response.json());
      if(result.appointment_id!==id||result.version!==version||result.date!==date)throw Error('stale');
      if(!controller.signal.aborted)setAvailability(result);
    }catch{if(!controller.signal.aborted)setError('Créneaux indisponibles ou rendez-vous modifié. Réessayez ou actualisez l’agenda.');}finally{if(!controller.signal.aborted)setLoading(false);}})();
    return()=>controller.abort();
  },[api,token,clinicId,id,version,date,reload]);
  async function save(){
    if(operation.current)return;
    if(!attempt.current){const slot=availability?.slots.find(slot=>slot.starts_at===selected);if(!slot||!availability)return;attempt.current={key:key(),body:{action:'reschedule',expected_version:version,expected_revision:availability.revision,...slot}};}
    const command=attempt.current,controller=new AbortController();operation.current=controller;setBusy(true);setError('');
    try{
      const response=await fetch(`${api.replace(/\/$/,'')}/api/v1/appointments/${id}/configured-commands`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'X-Clinic-Id':clinicId,'Content-Type':'application/json','Idempotency-Key':command.key},body:JSON.stringify(command.body),cache:'no-store',credentials:'omit',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
      if(controller.signal.aborted)return;if(response.status===401){onSessionExpired();return;}
      if([400,403,404,409].includes(response.status)){attempt.current=null;setUncertain(false);setAvailability(null);setSelected('');setError('Le rendez-vous ou le créneau a changé. Rechargez les disponibilités avant de réessayer.');return;}
      if(!response.ok)throw Error('unavailable');const receipt=ConfiguredAppointmentReceiptSchema.parse(await response.json());
      if(receipt.appointment_id!==id||receipt.version!==version+1||receipt.status!=='confirmed'||Date.parse(receipt.starts_at)!==Date.parse(command.body.starts_at)||Date.parse(receipt.ends_at)!==Date.parse(command.body.ends_at))throw Error('receipt');
      if(!controller.signal.aborted){attempt.current=null;setUncertain(false);onChanged();}
    }catch{if(!controller.signal.aborted){setUncertain(true);setError('Résultat à vérifier. Réessayez le même déplacement pour éviter un doublon.');}}
    finally{if(operation.current===controller)operation.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  return <form className="appointment-command configured-reschedule" aria-label="Déplacer le rendez-vous configurable" onSubmit={event=>{event.preventDefault();void save();}}>
    <strong>Choisir un autre créneau</strong><p>{availability?.visit_name??'Disponibilités du type de visite'} · heure de Casablanca</p>
    <AppointmentContextSummary context={context}/>
    <label>Nouvelle date<input type="date" required value={date} disabled={busy||uncertain} onChange={event=>setDate(event.target.value)}/></label>
    {loading&&<p role="status">Recherche des créneaux…</p>}{error&&<p role="alert">{error}</p>}
    {availability&&!availability.slots.length&&<p role="status">Aucun autre créneau disponible ce jour.</p>}
    <div className="configured-move-slots" aria-label="Créneaux disponibles">{availability?.slots.map(slot=><button key={slot.starts_at} type="button" aria-pressed={selected===slot.starts_at} disabled={busy||uncertain} onClick={()=>setSelected(slot.starts_at)}>{new Intl.DateTimeFormat('fr-MA',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(slot.starts_at))}</button>)}</div>
    <p>Les ressources seront attribuées selon les disponibilités. L’ancien créneau reste réservé jusqu’à validation du déplacement.</p>
    <div className="appointment-actions"><button type="submit" disabled={busy||(!uncertain&&!selected)}>{busy?'Enregistrement…':uncertain?'Réessayer le même déplacement':'Enregistrer le déplacement'}</button><button type="button" disabled={busy||uncertain||loading} onClick={()=>setReload(value=>value+1)}>Actualiser les créneaux</button><button type="button" disabled={busy||uncertain} onClick={onClose}>Retour</button></div>
  </form>;
}

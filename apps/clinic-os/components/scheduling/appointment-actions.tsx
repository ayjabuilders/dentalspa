'use client';
import {sessionFetch as fetch} from '../../lib/renewing-session';

import { useEffect, useRef, useState } from 'react';
import { CalendarClock, CircleX } from 'lucide-react';
import { ConfiguredAppointmentReceiptSchema, PatientAppointmentReceiptSchema } from '@dental/contracts';
import {ConfiguredReschedule} from './configured-reschedule';
import { PatientAssociation } from './patient-association';
import { AppointmentContextSummary, appointmentLocalDate, type AppointmentContext } from "./appointment-context";
type Props={context:AppointmentContext;api:string;token:string;clinicId:string;id:string;version:number;currentPatientId?:string;onChanged:()=>void;onSessionExpired:()=>void;disabled?:boolean;configured?:boolean;onEditingChange?:(editing:boolean)=>void};
function requestKey(){
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]!&15)|64;bytes[8]=(bytes[8]!&63)|128;
  const hex=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function AppointmentActions(props:Props){return <Actions key={`${props.token}:${props.clinicId}:${props.id}:${props.version}`} {...props}/>;}
function Actions({context,api,token,clinicId,id,version,currentPatientId,onChanged,onSessionExpired,disabled=false,configured=false,onEditingChange}:Props){
  const [action,setAction]=useState<'cancel'|'reschedule'|'associate'|null>(null),[date,setDate]=useState(()=>appointmentLocalDate(context.startsAt)),[time,setTime]=useState('09:00');
  const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState('');
  const operation=useRef<AbortController|null>(null);
  const attempt=useRef<{key:string;body:{action:'cancel'|'reschedule';expected_version:number;date?:string;time?:string}}|null>(null);
  useEffect(()=>()=>operation.current?.abort(),[]);
  async function save(){
    if(!action||action==='associate'||operation.current)return;
    const controller=new AbortController();operation.current=controller;setBusy(true);setError('');
    if(!attempt.current)attempt.current={key:requestKey(),body:action==='cancel'?{action,expected_version:version}:{action,expected_version:version,date,time}};
    const command=attempt.current;
    try{
      const response=await fetch(`${api.replace(/\/$/,'')}/api/v1/appointments/${id}/${configured?'configured-commands':'commands'}`,{
        method:'POST',headers:{Authorization:`Bearer ${token}`,'X-Clinic-Id':clinicId,'Idempotency-Key':command.key,'Content-Type':'application/json'},
        body:JSON.stringify(command.body),cache:'no-store',credentials:'omit',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]),
      });
      if(controller.signal.aborted)return;
      if(response.status===401){onSessionExpired();return;}
      if([400,403,404,409].includes(response.status)){
        attempt.current=null;setUncertain(false);
        setError(response.status===409?'Le rendez-vous a changé ou ce créneau est occupé. Actualisez l’agenda.':response.status===400?'Choisissez un créneau respectant les horaires fictifs.':'Cette modification n’est pas autorisée ou le rendez-vous est introuvable.');return;
      }
      if(!response.ok)throw new Error('unavailable');
      const receipt=(configured?ConfiguredAppointmentReceiptSchema:PatientAppointmentReceiptSchema).parse(await response.json());
      if(receipt.appointment_id!==id||receipt.version!==version+1||receipt.status!==(command.body.action==='cancel'?'cancelled':'confirmed'))throw new Error('receipt');
      if(controller.signal.aborted)return;
      attempt.current=null;setUncertain(false);setAction(null);onEditingChange?.(false);onChanged();
    }catch{if(!controller.signal.aborted){setUncertain(true);setError('Résultat à vérifier. Réessayez la même commande : elle ne sera enregistrée qu’une fois.');}}
    finally{if(operation.current===controller)operation.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  if(!action)return <div className="appointment-actions">{configured&&<button type="button" disabled={disabled} onClick={()=>{setAction('associate');onEditingChange?.(true);}}>{currentPatientId?'Modifier le dossier':'Associer un dossier'}</button>}<button type="button" disabled={disabled} onClick={()=>{setAction('reschedule');onEditingChange?.(true);}}><CalendarClock size={16}/>Déplacer</button><button type="button" disabled={disabled} onClick={()=>{setAction('cancel');onEditingChange?.(true);}}><CircleX size={16}/>Annuler</button></div>;
  if(action==='associate')return <PatientAssociation context={context} api={api} token={token} clinicId={clinicId} id={id} version={version} currentPatientId={currentPatientId} onSessionExpired={onSessionExpired} onClose={()=>{setAction(null);onEditingChange?.(false);}} onChanged={()=>{setAction(null);onEditingChange?.(false);onChanged();}}/>;
  if(configured&&action==='reschedule')return <ConfiguredReschedule context={context} api={api} token={token} clinicId={clinicId} id={id} version={version} onSessionExpired={onSessionExpired} onClose={()=>{setAction(null);onEditingChange?.(false);}} onChanged={()=>{setAction(null);onEditingChange?.(false);onChanged();}}/>;
  return <form className="appointment-command" aria-label={action==='cancel'?'Annuler le rendez-vous':'Déplacer le rendez-vous'} onSubmit={event=>{event.preventDefault();void save();}}>
    <strong>{action==='cancel'?'Annuler ce rendez-vous ?':'Choisir un autre créneau'}</strong>
    <AppointmentContextSummary context={context}/>
    {action==='reschedule'?<><div className="appointment-command-fields"><label>Nouvelle date<input type="date" required value={date} disabled={busy||uncertain} onChange={event=>setDate(event.target.value)}/></label><label>Heure de Casablanca<input type="time" required value={time} disabled={busy||uncertain} onChange={event=>setTime(event.target.value)}/></label></div><small>Horaires fictifs : lun–sam, 09–12 h et 14–18 h · 45 min · mêmes praticien et fauteuil.</small></>:<p>Le créneau sera libéré. Le rendez-vous restera visible comme annulé.</p>}
    {error&&<p role="alert">{error}</p>}
    <div className="appointment-actions"><button type="submit" disabled={busy}>{busy?'Enregistrement…':uncertain?'Réessayer la même commande':action==='cancel'?'Confirmer l’annulation':'Enregistrer le déplacement'}</button><button type="button" disabled={busy||uncertain} onClick={()=>{setAction(null);setError('');attempt.current=null;onEditingChange?.(false);}}>Retour</button></div>
  </form>;
}

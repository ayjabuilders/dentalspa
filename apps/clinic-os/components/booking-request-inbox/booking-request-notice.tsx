'use client';
import {useEffect,useRef,useState} from 'react';
import {Bell,ArrowUpRight} from 'lucide-react';
import {ConfiguredBookingPageSchema} from '@dental/contracts';
import {sessionFetch} from '../../lib/renewing-session';
import './booking-request-notice.css';

type Props={api:string;token:string;clinicId:string;locked:boolean;onOpen:()=>void;onSessionExpired:()=>void};
export function BookingRequestNotice(props:Props){return <Notice key={`${props.clinicId}:${props.token}`} {...props}/>;}
function Notice({api,token,clinicId,locked,onOpen,onSessionExpired}:Props){
  const [summary,setSummary]=useState<{pending:number}|null>(null);
  const [unavailable,setUnavailable]=useState(false);
  const expire=useRef(onSessionExpired);expire.current=onSessionExpired;
  useEffect(()=>{
    let stopped=false,flight:AbortController|null=null;
    async function refresh(){
      if(stopped||flight||document.visibilityState!=='visible'||!navigator.onLine)return;
      const controller=new AbortController();flight=controller;
      try{
        const response=await sessionFetch(`${api.replace(/\/$/,'')}/api/v1/booking-requests/configured/page?limit=1`,{headers:{Authorization:`Bearer ${token}`,'X-Clinic-Id':clinicId},cache:'no-store',credentials:'omit',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
        if(stopped)return;
        if(response.status===401){setSummary(null);expire.current();return;}
        if(!response.ok)throw Error('unavailable');
        const data=ConfiguredBookingPageSchema.parse(await response.json());
        if(!stopped){setSummary({pending:data.counts.request_received});setUnavailable(false);}
      }catch{if(!stopped){setSummary(null);setUnavailable(true);}}
      finally{if(flight===controller)flight=null;}
    }
    void refresh();
    const trigger=()=>{void refresh();};
    const timer=window.setInterval(trigger,30000);
    window.addEventListener('focus',trigger);window.addEventListener('online',trigger);
    window.addEventListener('booking-requests-changed',trigger);
    document.addEventListener('visibilitychange',trigger);
    return()=>{stopped=true;flight?.abort();clearInterval(timer);window.removeEventListener('focus',trigger);window.removeEventListener('online',trigger);window.removeEventListener('booking-requests-changed',trigger);document.removeEventListener('visibilitychange',trigger);};
  },[api,token,clinicId]);
  const label=unavailable?'Réservations · actualisation indisponible':summary?`${summary.pending} réservation${summary.pending===1?'':'s'} à examiner`:'Vérification des réservations…';
  return <div className="booking-request-notice"><button type="button" disabled={locked} onClick={()=>{onOpen();window.dispatchEvent(new Event('booking-requests-refresh'));}}><Bell size={17}/><span role="status" aria-live="polite">{label}</span><ArrowUpRight size={16}/></button></div>;
}

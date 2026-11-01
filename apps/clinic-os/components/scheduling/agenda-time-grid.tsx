'use client';
import type {PatientAppointmentList} from '@dental/contracts';
import type {CSSProperties} from 'react';
import './agenda-time-grid.css';
import {agendaServiceStyle} from './agenda-service-style';
type Item=PatientAppointmentList['items'][number];
const zone='Africa/Casablanca';
const dayOf=(iso:string)=>new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));
const clock=(iso:string)=>new Intl.DateTimeFormat('fr-MA',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(iso));
const minutes=(iso:string)=>{const [h=0,m=0]=clock(iso).split(':').map(Number);return h*60+m;};
export function AgendaTimeGrid({from,days,items,loading,onSelect}:{from:string;days:number;items:Item[];loading:boolean;onSelect:(id:string,opener:HTMLElement)=>void}){
 const epoch=Date.parse(from+'T12:00:00Z');if(!Number.isFinite(epoch))return null;
 const dates=Array.from({length:days},(_,i)=>new Date(epoch+i*86400000).toISOString().slice(0,10));
 const today=dayOf(new Date().toISOString());
 const start=Math.min(8*60,...items.map(i=>Math.floor(minutes(i.starts_at)/60)*60));
 const end=Math.max(19*60,...items.map(i=>dayOf(i.starts_at)!==dayOf(i.ends_at)?24*60:Math.ceil(minutes(i.ends_at)/60)*60));
 const height=(end-start)*2;
 return <div className="agenda-grid-scroll" tabIndex={0} aria-label="Calendrier horaire · faites défiler pour parcourir les heures" aria-busy={loading}><div className="agenda-time-grid" style={{'--agenda-days':days} as CSSProperties}>
  <div className="agenda-grid-corner">Casablanca</div>{dates.map(date=><div key={date} className="agenda-grid-date" data-today={date===today}><span>{new Intl.DateTimeFormat('fr-MA',{weekday:'short',timeZone:'UTC'}).format(new Date(date+'T12:00Z'))}</span><strong>{Number(date.slice(-2))}</strong></div>)}
  <div className="agenda-grid-hours" style={{height}}>{Array.from({length:(end-start)/60},(_,i)=><span key={i} style={{top:i*120}}>{String(start/60+i).padStart(2,'0')}:00</span>)}</div>
  {dates.map(date=>{
   const events=items.filter(i=>dayOf(i.starts_at)===date).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
   const laid: {item:Item;start:number;end:number;lane:number;group:number}[]=[];let group=-1,groupEnd=-1;const widths:number[]=[];
   for(const item of events){const s=minutes(item.starts_at),e=dayOf(item.ends_at)!==date?1440:minutes(item.ends_at);if(s>=groupEnd){group++;groupEnd=e;}else groupEnd=Math.max(groupEnd,e);const occupied=new Set(laid.filter(l=>l.group===group&&l.end>s).map(l=>l.lane));let lane=0;while(occupied.has(lane))lane++;widths[group]=Math.max(widths[group]??0,lane+1);laid.push({item,start:s,end:e,lane,group});}
   return <div className="agenda-grid-column" key={date} style={{height}} aria-label={date}>{laid.map(({item,start:s,end:e,lane,group:g})=>{const service=agendaServiceStyle(item.visit_name??'');return <button type="button" key={item.id} className="agenda-grid-event" data-status={item.status} data-appointment-id={item.id} style={{borderInlineStartColor:service.color,background:service.background,color:service.color,top:(s-start)*2,height:Math.max(30,(e-s)*2-3),left:`calc(${lane/(widths[g]??1)*100}% + 3px)`,width:`calc(${100/(widths[g]??1)}% - 6px)`}} onClick={event=>onSelect(item.id,event.currentTarget)} aria-label={`${clock(item.starts_at)} · ${item.patient?.display_name??item.contact_name??'Rendez-vous'} · ${item.visit_name??'Visite'} · ${item.status==='cancelled'?'Annulé':'Confirmé'}`}><span>{clock(item.starts_at)}–{clock(item.ends_at)}</span><strong>{item.patient?.display_name??item.contact_name??'Rendez-vous'}</strong><small><service.Icon size={12} aria-hidden="true"/>{item.visit_name??item.provider_name}</small></button>})}</div>;
  })}
 </div></div>;
}

'use client';
import {sessionFetch as fetch} from '../../lib/renewing-session';

import {useConnectedNavigationLock} from '../../lib/connected-navigation';
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronRight, ChevronLeft, RefreshCw, Settings2, Inbox, Search, CheckCircle2, CircleX, List, X, SlidersHorizontal } from 'lucide-react';
import { PatientAppointmentListSchema, type PatientAppointmentList } from '@dental/contracts';
import './recorded-appointments.css';
import {Modal} from '@dental/ui-clinic';
import {AgendaTimeGrid} from './agenda-time-grid';
import { AppointmentActions } from './appointment-actions';
import {agendaServiceStyle} from './agenda-service-style';
const zone='Africa/Casablanca';
const dateOf=(date:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export type AgendaViewPreferences={from:string;days:number;status:'all'|'confirmed'|'cancelled';query:string;presentation?:'calendar'|'list'|'timeline';selectedDate?:string};
export const createAgendaViewPreferences=():AgendaViewPreferences=>({from:dateOf(new Date()),days:7,status:'all',query:''});
export function RecordedAppointments({api,token,clinicId,view,onViewChange,canChange=false,onSessionExpired,onOpenPatient,onOpenSettings,onOpenRequests}:{api:string;token:string;clinicId:string;view:AgendaViewPreferences;onViewChange:(view:AgendaViewPreferences)=>void;canChange?:boolean;onSessionExpired:()=>void;onOpenPatient:(id:string)=>void;onOpenSettings?:()=>void;onOpenRequests?:()=>void}){
  const {from,days,status,query}=view;
  const setFrom=(from:string)=>onViewChange({...view,from,selectedDate:from});
  const setStatus=(status:AgendaViewPreferences['status'])=>onViewChange({...view,status});
  const setQuery=(query:string)=>onViewChange({...view,query});
  const [reload,setReload]=useState(0);
  const [mobile,setMobile]=useState(false),[optionsOpen,setOptionsOpen]=useState(false),[selectedId,setSelectedId]=useState<string|null>(null);
  // Responsive defaults never overwrite a deliberate view choice held by the parent.
  const presentation=view.presentation??(mobile?'timeline':'calendar');
  const setPresentation=(presentation:NonNullable<AgendaViewPreferences['presentation']>)=>onViewChange({...view,presentation,...(presentation!=='list'&&days>7?{days:7}:{})});
  useEffect(()=>{const media=window.matchMedia('(max-width: 700px)');const update=()=>setMobile(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  const eventOpener=useRef<HTMLElement|null>(null);
  const [result,setResult]=useState<PatientAppointmentList|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [editingId,setEditingId]=useState<string|null>(null);
  useConnectedNavigationLock(editingId!==null);
  const expire=useRef(onSessionExpired);expire.current=onSessionExpired;
  useEffect(()=>{
    const controller=new AbortController();setResult(null);setError('');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)){setBusy(false);return;}
    const until=new Date(Date.parse(`${from}T00:00:00Z`)+(days-1)*86400000).toISOString().slice(0,10);
    setBusy(true);
    void(async()=>{try{
      const response=await fetch(`${api.replace(/\/$/,'')}/api/v1/appointments?${new URLSearchParams({from,until})}`,{headers:{Authorization:`Bearer ${token}`,'X-Clinic-Id':clinicId},cache:'no-store',credentials:'omit',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
      if(response.status===401){if(!controller.signal.aborted)expire.current();return;}
      if(!response.ok)throw new Error('unavailable');
      const parsed=PatientAppointmentListSchema.safeParse(await response.json());
      if(!parsed.success||parsed.data.items.some(item=>{const date=dateOf(new Date(item.starts_at));return date<from||date>until;}))throw new Error('invalid');
      if(!controller.signal.aborted)setResult(parsed.data);
    }catch{if(!controller.signal.aborted)setError('Les rendez-vous ne sont pas accessibles. Réessayez.');}
    finally{if(!controller.signal.aborted)setBusy(false);}})();
    return()=>controller.abort();
  },[api,token,clinicId,from,days,reload]);
  const matches=(item:PatientAppointmentList['items'][number])=>(status==='all'||item.status===status)&&`${item.patient?.display_name??item.contact_name??''} ${item.visit_name??''} ${item.provider_name} ${item.chair_name}`.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr'));
  const visibleCount=result?.items.filter(matches).length??0;
  const shift=(direction:number)=>{const current=Date.parse(`${from}T12:00:00Z`);if(Number.isFinite(current))setFrom(new Date(current+direction*days*86400000).toISOString().slice(0,10));};
  const grouped=new Map<string,PatientAppointmentList['items']>();
  for(const item of [...(result?.items??[])].sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at)||a.id.localeCompare(b.id))){const date=dateOf(new Date(item.starts_at));grouped.set(date,[...(grouped.get(date)??[]),item]);}
  const periodStart=Date.parse(`${from}T12:00:00Z`);
  const periodFormat=new Intl.DateTimeFormat('fr-MA',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'});
  const periodLabel=Number.isFinite(periodStart)?`${periodFormat.format(periodStart)}${days>1?` — ${periodFormat.format(periodStart+(days-1)*86400000)}`:''}`:'Choisissez une date';
  const dates=Number.isFinite(periodStart)?Array.from({length:days},(_,index)=>new Date(periodStart+index*86400000).toISOString().slice(0,10)):[];
  const selectedDate=view.selectedDate&&dates.includes(view.selectedDate)?view.selectedDate:from;
  const timeline=presentation==='timeline';
  const dayAppointments=(grouped.get(selectedDate)??[]).filter(matches);
  const displayedCount=timeline?dayAppointments.length:visibleCount;
  const openAppointment=(id:string,opener:HTMLElement)=>{eventOpener.current=opener;setSelectedId(id);};
  const renderAppointment=(item:PatientAppointmentList['items'][number])=>(<li key={item.id} hidden={!matches(item)} data-appointment-id={item.id}><div className="recorded-calendar-time"><time dateTime={item.starts_at}>{new Intl.DateTimeFormat('fr-MA',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(item.starts_at))}</time><small>{Math.round((Date.parse(item.ends_at)-Date.parse(item.starts_at))/60000)} min</small></div><div className="recorded-calendar-person"><strong>{item.patient?.display_name??item.contact_name??'Demande sans patient lié'}</strong><span>{item.provider_name} · {item.chair_name}</span>{item.source==='configured'&&<span>{item.visit_name} · identité non vérifiée</span>}</div><span className="recorded-calendar-status" data-status={item.status}>{item.status==='cancelled'?'Annulé':'Confirmé'}</span>{item.patient&&<button type="button" disabled={!!editingId} onClick={()=>onOpenPatient(item.patient!.id)} aria-label={`Ouvrir le dossier de ${item.patient.display_name}`}>Dossier<ChevronRight size={17}/></button>}{canChange&&item.status==='confirmed'&&<AppointmentActions context={{name:item.patient?.display_name??item.contact_name??'Demande sans patient lié',startsAt:item.starts_at,endsAt:item.ends_at}} configured={item.source==='configured'} currentPatientId={item.patient?.id} disabled={!!editingId&&editingId!==item.id} onEditingChange={editing=>setEditingId(editing?item.id:null)} api={api} token={token} clinicId={clinicId} id={item.id} version={item.version} onSessionExpired={onSessionExpired} onChanged={()=>{setResult(null);setReload(value=>value+1);}}/>}</li>);
  const selected=result?.items.find(item=>item.id===selectedId);
  const calendar=presentation==='calendar'&&days<=7;
  const controls=<>
    <div className="recorded-agenda-toolbar" aria-label="Navigation dans l’agenda">
      <div className="recorded-date-navigation"><button type="button" className="recorded-icon-button" disabled={busy||!!editingId||!from} aria-label="Période précédente" onClick={()=>shift(-1)}><ChevronLeft size={18}/></button><button type="button" disabled={busy||!!editingId} onClick={()=>setFrom(dateOf(new Date()))}>Aujourd’hui</button><button type="button" className="recorded-icon-button" disabled={busy||!!editingId||!from} aria-label="Période suivante" onClick={()=>shift(1)}><ChevronRight size={18}/></button><input aria-label="À partir du" title="Premier jour affiché" type="date" disabled={!!editingId} value={from} onChange={event=>{setResult(null);setFrom(event.target.value);}}/></div>
      <div className="recorded-duration-switch" role="group" aria-label="Durée affichée">{([{days:1,label:'Jour'},{days:7,label:'Semaine'},{days:14,label:'14 jours'},{days:31,label:'31 jours'}] as const).map(period=><button type="button" key={period.days} aria-pressed={days===period.days} disabled={!!editingId} onClick={()=>{if(days!==period.days)setResult(null);onViewChange({...view,days:period.days,...(period.days>7?{presentation:'list' as const}:{})});}}>{period.label}</button>)}</div>
    </div>
    <div className="recorded-agenda-tools">
      <label className="recorded-calendar-search"><Search size={18}/><input aria-label="Rechercher un patient ou une ressource dans l’agenda" placeholder="Patient, praticien, fauteuil…" disabled={!!editingId} value={query} onChange={event=>setQuery(event.target.value)}/>{query&&<button type="button" className="recorded-icon-button" aria-label="Effacer la recherche dans l’agenda" disabled={!!editingId} onClick={()=>setQuery('')}><X size={15}/></button>}</label>
      <div className="recorded-calendar-summary" role="group" aria-label="Rendez-vous de la période chargée">{([
        {id:'all',label:'Tous',Icon:CalendarDays}, {id:'confirmed',label:'Confirmés',Icon:CheckCircle2}, {id:'cancelled',label:'Annulés',Icon:CircleX},
      ] as const).map(card=><button type="button" key={card.id} disabled={!!editingId} aria-pressed={status===card.id} onClick={()=>setStatus(card.id)}><card.Icon size={15}/><span>{card.label}</span><strong>{result?(card.id==='all'?result.items.length:result.items.filter(item=>item.status===card.id).length):'—'}</strong></button>)}</div>
      <div className="agenda-view-switch" role="group" aria-label="Présentation de l’agenda">{mobile&&<button type="button" disabled={!!editingId} aria-pressed={timeline} onClick={()=>setPresentation('timeline')}>Journée</button>}<button type="button" title="Calendrier" aria-label="Calendrier" disabled={!!editingId} aria-pressed={calendar} onClick={()=>{setPresentation('calendar');}}><CalendarDays size={17}/></button><button type="button" title="Liste" aria-label="Liste" disabled={!!editingId} aria-pressed={presentation==='list'} onClick={()=>setPresentation('list')}><List size={17}/></button></div>
    </div>
  </>;
  return <section className="recorded-appointments work-panel" aria-labelledby="recorded-appointments-title" aria-busy={busy}>
    <header className="recorded-agenda-heading">
      <div className="recorded-agenda-title"><span className="recorded-calendar-icon"><CalendarDays size={23}/></span><div><h1 id="recorded-appointments-title" tabIndex={-1}>Agenda des patients</h1><p>Casablanca · <span role="status">{busy?'Actualisation…':result?`${displayedCount} rendez-vous affiché${displayedCount===1?'':'s'}`:'Rendez-vous du cabinet'}</span></p></div></div>
      <button type="button" className="recorded-mobile-options" aria-label="Options de l’agenda" disabled={!!editingId} onClick={()=>setOptionsOpen(true)}><SlidersHorizontal size={19}/><span>Options</span></button><div className="recorded-agenda-actions"><button type="button" className="recorded-icon-button" aria-label="Actualiser" title="Actualiser les rendez-vous" disabled={busy||!!editingId} onClick={()=>setReload(value=>value+1)}><RefreshCw size={18} className={busy?'recorded-refreshing':undefined}/></button>{onOpenRequests&&<button type="button" disabled={!!editingId} onClick={onOpenRequests}><Inbox size={17}/>Demandes</button>}{onOpenSettings&&<button type="button" disabled={!!editingId} onClick={onOpenSettings}><Settings2 size={17}/>Paramètres</button>}</div>
    </header>
    {mobile?<>
      <div className="recorded-mobile-period"><button type="button" className="recorded-icon-button" disabled={busy||!!editingId||!from} aria-label="Période précédente" onClick={()=>shift(-1)}><ChevronLeft size={18}/></button><button type="button" className="recorded-mobile-today" disabled={busy||!!editingId} onClick={()=>setFrom(dateOf(new Date()))}>Aujourd’hui<span>{Number.isFinite(periodStart)?new Intl.DateTimeFormat('fr-MA',{timeZone:'UTC',month:'long',year:'numeric'}).format(periodStart):'Choisir une date'}</span></button><button type="button" className="recorded-icon-button" disabled={busy||!!editingId||!from} aria-label="Période suivante" onClick={()=>shift(1)}><ChevronRight size={18}/></button></div>
      {timeline&&<div className="recorded-day-pills" role="group" aria-label="Choisir un jour">{dates.map(date=><button type="button" key={date} aria-label={new Intl.DateTimeFormat('fr-MA',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(new Date(date+'T12:00:00Z'))} aria-pressed={selectedDate===date} disabled={!!editingId} onClick={()=>onViewChange({...view,selectedDate:date})}><span>{new Intl.DateTimeFormat('fr-MA',{timeZone:'UTC',weekday:'short'}).format(new Date(date+'T12:00:00Z'))}</span><strong>{Number(date.slice(-2))}</strong><i aria-hidden="true" data-has-appointments={(grouped.get(date)??[]).some(matches)}/></button>)}</div>}
      {(query||status!=='all')&&<button type="button" className="recorded-active-filters" onClick={()=>setOptionsOpen(true)}><SlidersHorizontal size={15}/>{query?'Recherche active':'Statut filtré'} · Modifier</button>}
    </>:controls}
    {!timeline&&<p className="recorded-calendar-period-label">{periodLabel}</p>}
    {editingId&&<p className="recorded-calendar-scope" role="status">Terminez la modification en cours avant de changer de période.</p>}
    {!timeline&&result&&result.items.length>0&&visibleCount===0&&<div className="recorded-calendar-empty"><Search/><h2>Aucun résultat pour ces filtres</h2><button type="button" onClick={()=>{onViewChange({...view,query:'',status:'all'});}}>Réinitialiser les filtres</button></div>}
    {busy&&<span className="recorded-loading-line" role="status" aria-label="Chargement des rendez-vous"/>}{error&&<div className="recorded-agenda-error" role="alert"><p>{error}</p><button type="button" disabled={busy||!!editingId} onClick={()=>setReload(value=>value+1)}>Réessayer</button></div>}
    {!timeline&&result&&!result.items.length&&<div className="recorded-calendar-empty"><CalendarDays/><h2>Aucun rendez-vous sur cette période</h2><p>Choisissez une autre date pour consulter les rendez-vous enregistrés.</p></div>}
    {result?.truncated&&<p role="status">Liste limitée à 500 rendez-vous. Réduisez la période.</p>}
    {calendar&&<AgendaTimeGrid from={from} days={days} items={(result?.items??[]).filter(matches)} loading={busy} onSelect={openAppointment}/>}
    {!calendar&&!timeline&&[...grouped].map(([date,appointments])=><section className="recorded-calendar-day" key={date} hidden={!appointments.some(matches)} aria-label={`Rendez-vous du ${date}`}><h2>{new Intl.DateTimeFormat('fr-MA',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(new Date(`${date}T12:00:00Z`))}</h2><ul>{appointments.map(item=>renderAppointment(item))}</ul></section>)}
    {timeline&&<section className="recorded-mobile-timeline" aria-label="Rendez-vous de la journée"><header><h2>{Number.isFinite(Date.parse(selectedDate+'T12:00:00Z'))?new Intl.DateTimeFormat('fr-MA',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(new Date(selectedDate+'T12:00:00Z')):'Choisissez une date'}</h2><span>{busy?'…':dayAppointments.length+' rendez-vous'}</span></header>{!busy&&result&&!dayAppointments.length&&<div className="recorded-calendar-empty"><CalendarDays size={28}/><h3>{query||status!=='all'?'Aucun résultat ce jour':'Aucun rendez-vous ce jour'}</h3><p>{query||status!=='all'?'Modifiez les filtres ou choisissez un autre jour.':'Aucun rendez-vous enregistré pour cette date.'}</p></div>}<ol>{dayAppointments.map(item=>{const service=agendaServiceStyle(item.visit_name??'');return <li key={item.id}><div className="recorded-timeline-time"><time dateTime={item.starts_at}>{new Intl.DateTimeFormat('fr-MA',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(item.starts_at))}</time><small>{Math.round((Date.parse(item.ends_at)-Date.parse(item.starts_at))/60000)} min</small></div><button type="button" className="recorded-timeline-card" data-appointment-id={item.id} disabled={!!editingId} onClick={event=>openAppointment(item.id,event.currentTarget)}><span className="recorded-timeline-service" style={{color:service.color,background:service.background}}><service.Icon size={17} aria-hidden="true"/><span>{item.visit_name??'Rendez-vous'}</span></span><strong>{item.patient?.display_name??item.contact_name??'Demande sans patient lié'}</strong><span className="recorded-timeline-resource">{item.provider_name} · {item.chair_name}</span><span className="recorded-calendar-status" data-status={item.status}>{item.status==='cancelled'?'Annulé':'Confirmé'}</span></button></li>})}</ol></section>}
    <Modal mobilePresentation="sheet" open={mobile&&optionsOpen} onOpenChange={setOptionsOpen} title="Options de l’agenda" description="Période, recherche et présentation" className="recorded-options-sheet"><div className="recorded-appointments">{controls}<div className="recorded-options-shortcuts"><button type="button" disabled={busy||!!editingId} onClick={()=>{setReload(value=>value+1);setOptionsOpen(false);}}><RefreshCw size={17}/>Actualiser</button>{onOpenRequests&&<button type="button" disabled={!!editingId} onClick={()=>{setOptionsOpen(false);onOpenRequests();}}><Inbox size={17}/>Demandes</button>}{onOpenSettings&&<button type="button" disabled={!!editingId} onClick={()=>{setOptionsOpen(false);onOpenSettings();}}><Settings2 size={17}/>Paramètres</button>}</div><button type="button" className="recorded-options-done" onClick={()=>setOptionsOpen(false)}>Afficher l’agenda</button></div></Modal>
    <Modal mobilePresentation="sheet" open={!!selected} onOpenChange={open=>{if(!open&&!editingId)setSelectedId(null);}} title="Détails du rendez-vous" description="Heure du cabinet · Casablanca" closeDisabled={!!editingId} returnFocus={eventOpener.current} className="agenda-event-drawer"><div className="recorded-appointments"><section className="recorded-calendar-day"><ul>{selected&&renderAppointment(selected)}</ul></section></div></Modal>
    <p className="recorded-calendar-note">Données fictives persistées · créneaux contrôlés à l’enregistrement.</p>
  </section>;
}

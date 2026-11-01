'use client';
import {sessionFetch as fetch} from '../../lib/renewing-session';

import {useConnectedNavigationLock,useConnectedNavigation} from '../../lib/connected-navigation';
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, FileCheck2, RefreshCw, Wallet, ArrowUpRight, MapPin, Phone, Mail } from 'lucide-react';
import { PatientHubSchema, type PatientHub as Hub } from '@dental/contracts';
import './patient-hub.css';
import { PatientQuote } from './patient-quote';
import { QuoteDraftForm } from './quote-draft-form';
import { PatientPayments } from './patient-payments';
import { PatientInstallments } from './patient-installments';
import { PatientInvoices } from './patient-invoices';
import { PatientDocumentLibrary } from './document-library';
import { PatientAppointmentList, PatientQuoteList, initialRecordListState } from './patient-record-lists';

const labels: Record<string,string> = { cnss:'CNSS',cnops:'CNOPS',not_applicable:'Non applicable',missing:'À fournir',received:'Reçu',needs_correction:'À corriger',completed_manually:'Vérifié manuellement' };
export function PatientHub({api,token,clinicId,patientId,onSessionExpired,canCreateQuote=false,clinicName='Cabinet connecté',initialAgreement}:{api:string;token:string;clinicId:string;patientId:string;onSessionExpired:()=>void;canCreateQuote?:boolean;clinicName?:string;initialAgreement?:{planId:string;version:number}|null}) {
  const [data,setData]=useState<Hub|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[reload,setReload]=useState(0),[tab,setTab]=useState(canCreateQuote&&initialAgreement?7:0);
  const {locked:navigationLocked}=useConnectedNavigation();
  const sections=['Synthèse','Rendez-vous','Dossier administratif','Dossier médical','Finances'];
  const financeSections=canCreateQuote?['Devis','Factures','Paiements','Échéanciers']:['Devis'];
  const [invoicePending,setInvoicePending]=useState(false);
  const [mobile,setMobile]=useState(false);
  const mobileButtons=useRef<Array<HTMLButtonElement|null>>([]);
  const financeTab=useRef(canCreateQuote&&initialAgreement?7:4);
  useEffect(()=>{if(canCreateQuote&&initialAgreement){financeTab.current=7;setTab(7);}},[canCreateQuote,initialAgreement?.planId,initialAgreement?.version]);
  const mobileSections=['Aperçu','RDV','Administratif','Médical','Finances'];
  const primaryTab=Math.min(tab,4);
  useEffect(()=>{const media=window.matchMedia('(max-width: 700px)');const update=()=>setMobile(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  const [appointmentList,setAppointmentList]=useState(initialRecordListState);
  const [quoteList,setQuoteList]=useState(initialRecordListState);
  const [observedAt]=useState(()=>Date.now());
  useConnectedNavigationLock(invoicePending);
  const expire=useRef(onSessionExpired); expire.current=onSessionExpired;
  const buttons=useRef<Array<HTMLButtonElement|null>>([]);
  useEffect(()=>{
    const active=buttons.current[Math.min(tab,4)],strip=active?.parentElement;
    if(!active||!strip)return;
    const reveal=()=>{const item=active.getBoundingClientRect(),frame=strip.getBoundingClientRect();if(item.left<frame.left)strip.scrollLeft+=item.left-frame.left-8;else if(item.right>frame.right)strip.scrollLeft+=item.right-frame.right+8;};
    reveal();const observer=new ResizeObserver(reveal);observer.observe(strip);
    return()=>observer.disconnect();
  },[tab,data]);
  useEffect(()=>{
    const controller=new AbortController(); setData(null);setError('');setLoading(true);
    void(async()=>{try{
      const response=await fetch(`${api.replace(/\/$/,'')}/api/v1/patients/${encodeURIComponent(patientId)}/hub`,{headers:{Authorization:`Bearer ${token}`,'X-Clinic-Id':clinicId},cache:'no-store',credentials:'omit',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
      if(response.status===401){if(!controller.signal.aborted)expire.current();return;}
      if(!response.ok)throw new Error('unavailable');
      const result=PatientHubSchema.safeParse(await response.json());
      if(!result.success||result.data.patient.id!==patientId||result.data.patient.clinic_id!==clinicId)throw new Error('invalid');
      if(!controller.signal.aborted)setData(result.data);
    }catch{if(!controller.signal.aborted)setError('Le dossier ne peut pas être chargé. Réessayez.');}
    finally{if(!controller.signal.aborted)setLoading(false);}})();
    return()=>controller.abort();
  },[api,token,clinicId,patientId,reload]);
  const go=(index:number,focus=false)=>{if(invoicePending||navigationLocked)return;if(index>=4)financeTab.current=index;setTab(index);if(focus)(mobile?mobileButtons.current[Math.min(index,4)]:buttons.current[Math.min(index,4)])?.focus();};
  const upcoming=data?.appointments.filter(item=>item.status!=='cancelled'&&Date.parse(item.starts_at)>=observedAt).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at))??[];
  const nextAppointment=upcoming[0];
  const formatDate=(value:string)=>new Intl.DateTimeFormat('fr-MA',{timeZone:'Africa/Casablanca',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
  const missingDocuments=data?.checklist.filter(item=>item.status==='missing'||item.status==='needs_correction')??[];
  return <section className="patient-hub" aria-label="Dossier patient enregistré" aria-busy={loading}>

    {loading&&<div className="patient-hub-loading" role="status"><RefreshCw size={22}/><p>Chargement du dossier…</p></div>}{error&&<div className="patient-hub-loading" role="alert"><p>{error}</p><button type="button" disabled={navigationLocked} onClick={()=>setReload(value=>value+1)}>Réessayer</button></div>}
    {data&&<><header className="patient-hub-identity"><span className="patient-hub-avatar">{data.patient.display_name.replace(/\(FICTIF\)/gi,'').trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase()}</span><div className="patient-hub-name"><span className="eyebrow">DOSSIER · {data.patient.reference}</span><h1>{data.patient.display_name}</h1><p><MapPin size={14}/>{data.profile?.city??'Ville non renseignée'}</p></div><div className="patient-hub-identity-actions"><button type="button" disabled={loading||invoicePending||navigationLocked} aria-label="Actualiser le dossier" title="Actualiser le dossier" onClick={()=>setReload(value=>value+1)}><RefreshCw size={17}/></button><button className="hub-primary-action" type="button" disabled={invoicePending||navigationLocked} onClick={()=>go(1,true)}><CalendarDays size={17}/>Rendez-vous<ArrowUpRight size={16}/></button></div></header>
      {mobile?<div className="patient-hub-tabs patient-hub-mobile-tabs" role="tablist" aria-label="Sections du dossier enregistré">{mobileSections.map((name,index)=><button key={name} ref={node=>{mobileButtons.current[index]=node;}} type="button" disabled={invoicePending||navigationLocked} role="tab" id={`hub-mobile-tab-${index}`} aria-controls="hub-mobile-panel" aria-selected={primaryTab===index} tabIndex={primaryTab===index?0:-1} onClick={()=>go(index===4?financeTab.current:index)} onKeyDown={event=>{const next=event.key==='ArrowRight'?(index+1)%5:event.key==='ArrowLeft'?(index+4)%5:event.key==='Home'?0:event.key==='End'?4:null;if(next!==null){event.preventDefault();go(next===4?financeTab.current:next,true);}}}>{name}</button>)}</div>:<div className="patient-hub-tabs" role="tablist" aria-label="Sections du dossier enregistré">{sections.map((name,index)=><button key={name} ref={node=>{buttons.current[index]=node;}} type="button" disabled={invoicePending||navigationLocked} role="tab" id={`hub-tab-${index}`} aria-controls={`hub-panel-${index}`} aria-selected={primaryTab===index} tabIndex={primaryTab===index?0:-1} onClick={()=>go(index===4?financeTab.current:index)} onKeyDown={event=>{const next=event.key==='ArrowRight'?(index+1)%sections.length:event.key==='ArrowLeft'?(index+sections.length-1)%sections.length:event.key==='Home'?0:event.key==='End'?sections.length-1:null;if(next!==null){event.preventDefault();go(next===4?financeTab.current:next,true);}}}>{name}</button>)}</div>}
      <div className="patient-section-panel" data-overview={tab===0} role="tabpanel" id={mobile?'hub-mobile-panel':`hub-panel-${primaryTab}`} aria-labelledby={mobile?`hub-mobile-tab-${primaryTab}`:`hub-tab-${primaryTab}`} tabIndex={0}>
        {tab>=4&&<div className="patient-hub-finance-nav" role="group" aria-label="Rubriques financières">{financeSections.map((name,index)=><button key={name} type="button" aria-pressed={tab===index+4} disabled={invoicePending||navigationLocked} onClick={()=>go(index+4)}>{name}</button>)}</div>}

        {tab===0&&<>
          {mobile&&<article className="patient-overview-next patient-mobile-next"><span className="hub-feature-icon"><CalendarDays size={22}/></span><span className="eyebrow">PROCHAIN RENDEZ-VOUS</span><h2>{nextAppointment?formatDate(nextAppointment.starts_at):'Aucun rendez-vous à venir'}</h2><p>{nextAppointment?Math.round((Date.parse(nextAppointment.ends_at)-Date.parse(nextAppointment.starts_at))/60000)+' min · Confirmé · Heure de Casablanca':'Consultez l’historique des rendez-vous de ce dossier.'}</p><button type="button" disabled={invoicePending||navigationLocked} onClick={()=>go(1,true)}>Voir les rendez-vous <ArrowUpRight size={16}/></button></article>}
          <div className="patient-hub-stats">
            <button type="button" disabled={invoicePending||navigationLocked} onClick={()=>go(1,true)}><CalendarDays/><strong>{data.appointments.length}</strong><span>Rendez-vous enregistrés</span><small>Voir l’agenda du patient <ArrowUpRight size={14}/></small></button>
            <button type="button" disabled={invoicePending||navigationLocked} onClick={()=>go(2,true)}><FileCheck2/><strong>{missingDocuments.length}</strong><span>Pièces à revoir</span><small>Consulter les documents <ArrowUpRight size={14}/></small></button>
            <button type="button" disabled={invoicePending||navigationLocked} onClick={()=>go(4,true)}><Wallet/><strong>{data.quotes.length}</strong><span>Devis brouillons</span><small>Ouvrir les devis <ArrowUpRight size={14}/></small></button>
          </div>
          <div className="patient-overview-grid">
            <article className="patient-overview-contact"><div className="hub-section-heading"><h2>Informations du patient</h2><span>Coordonnées</span></div><dl className="patient-hub-contact">{[['Téléphone',data.profile?.phone_display],['Courriel',data.profile?.email],['Ville',data.profile?.city],['Date de naissance',data.profile?.birth_date],['Langue',data.profile?.preferred_language?.toUpperCase()]].map(([label,value],index)=><div key={label}><dt>{index===0?<Phone size={14}/>:index===1?<Mail size={14}/>:null}{label}</dt><dd>{value??'Non renseigné'}</dd></div>)}</dl></article>
            {!mobile&&<article className="patient-overview-next"><span className="hub-feature-icon"><CalendarDays size={22}/></span><span className="eyebrow">PROCHAIN RENDEZ-VOUS</span><h2>{nextAppointment?formatDate(nextAppointment.starts_at):'Aucun rendez-vous à venir'}</h2><p>{nextAppointment?Math.round((Date.parse(nextAppointment.ends_at)-Date.parse(nextAppointment.starts_at))/60000)+' min · Confirmé · Heure de Casablanca':'Consultez l’historique des rendez-vous de ce dossier.'}</p><button type="button" disabled={invoicePending||navigationLocked} onClick={()=>go(1,true)}>Voir les rendez-vous <ArrowUpRight size={16}/></button></article>}
            <article className="patient-overview-documents"><div className="hub-section-heading"><h2>Suivi administratif</h2><FileCheck2 size={20}/></div>{data.checklist.length?<><p>{missingDocuments.length?missingDocuments.length+' pièce(s) à revoir dans le dossier.':'Aucune pièce à revoir parmi les éléments suivis.'}</p><div className="hub-document-chips">{data.checklist.map(item=><span key={item.kind} data-pending={item.status==='missing'||item.status==='needs_correction'}>{labels[item.kind]??item.kind}<small>{item.status?(labels[item.status]??'Non renseigné'):'Non renseigné'}</small></span>)}</div></>:<p>Aucune pièce administrative suivie.</p>}<button type="button" disabled={invoicePending||navigationLocked} onClick={()=>go(2,true)}>Ouvrir les documents <ArrowUpRight size={16}/></button></article>
          </div>
        </>}
        {tab===0&&<PatientDocumentLibrary compactTimeline api={api} token={token} clinicId={clinicId} patientId={patientId} onSessionExpired={onSessionExpired} onOpenDocuments={()=>go(3,true)}/> }
        {tab===1&&<PatientAppointmentList appointments={data.appointments} state={appointmentList} setState={setAppointmentList}/>}
        {tab===2&&<><PatientDocumentLibrary section="administrative" api={api} token={token} clinicId={clinicId} patientId={patientId} patientLabel={data.patient.display_name} patientReference={data.patient.reference} onSessionExpired={onSessionExpired}/><details><summary>Checklist administrative</summary>{!data.checklist.length?<p>Aucune pièce suivie.</p>:<ul>{data.checklist.map(item=><li key={item.kind}><FileCheck2/><div><strong>{labels[item.kind]??item.kind}</strong><span>{item.status?labels[item.status]:'Non renseigné'}</span></div></li>)}</ul>}<p className="patient-hub-note">Ajouter un fichier ne valide pas automatiquement une pièce administrative.</p></details></>}

        {tab===3&&<PatientDocumentLibrary section="clinical" api={api} token={token} clinicId={clinicId} patientId={patientId} patientLabel={data.patient.display_name} patientReference={data.patient.reference} onSessionExpired={onSessionExpired}/> }
        {tab===4&&<>{canCreateQuote&&<QuoteDraftForm api={api.replace(/\/$/,'')} token={token} clinicId={clinicId} patientId={patientId} onSessionExpired={onSessionExpired} onSaved={()=>setReload(value=>value+1)}/>}<PatientQuoteList quotes={data.quotes} state={quoteList} setState={setQuoteList} locked={navigationLocked} renderQuote={(item,index)=><PatientQuote key={`${item.id}:${item.version}`} quote={item} index={index} clinicName={clinicName} clinicId={clinicId} patient={data.patient}>{canCreateQuote&&<QuoteDraftForm api={api.replace(/\/$/,'')} token={token} clinicId={clinicId} patientId={patientId} revision={item} onSessionExpired={onSessionExpired} onSaved={()=>setReload(value=>value+1)}/>}</PatientQuote>}/><p className="patient-hub-note">Un devis n’est pas un paiement. Les paiements fictifs se gèrent dans l’onglet Paiements; les accords d’échelonnement se consultent dans Échéanciers.</p></>}
        {tab===7&&canCreateQuote&&<PatientInstallments initialSelection={initialAgreement?{id:initialAgreement.planId,version:initialAgreement.version}:null} api={api} token={token} clinicId={clinicId} patientId={patientId} onSessionExpired={onSessionExpired}/>}
        {tab===6&&canCreateQuote&&<PatientPayments api={api} token={token} clinicId={clinicId} patientId={patientId} onSessionExpired={onSessionExpired} onPendingChange={setInvoicePending}/>}
        {tab===5&&canCreateQuote&&<PatientInvoices api={api} token={token} clinicId={clinicId} patientId={patientId} quotes={data.quotes} onSessionExpired={onSessionExpired} onPendingChange={setInvoicePending}/>}
      </div>
    </>}
  </section>;
}

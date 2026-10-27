'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@dental/ui-clinic';
import { ArrowRight, ListTodo, LoaderCircle, RefreshCw } from 'lucide-react';
import type { Inquiry, InquiryPlannedActionWorklist } from '@dental/contracts';
import { IntakeError, type IntakeFailure, type IntakeTransport } from './transport';
import './planned-action-worklist.css';

const labels = { review_inquiry: 'Examiner la demande', review_follow_up: 'Examiner l’historique du suivi' };
const date = (value:string) => new Intl.DateTimeFormat('fr-MA',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
const messages: Record<IntakeFailure,string> = {
  offline:'Hors connexion. Les intentions affichées ont été effacées. Relisez-les après reconnexion.',
  denied:'Accès refusé. Les intentions privées ont été effacées.',
  expired:'Session expirée. Connectez-vous à nouveau.',
  missing:'Cette demande est absente ou inaccessible. Aucun détail actuel n’a été ouvert.',
  unavailable:'Intentions indisponibles. La réponse n’a pas pu être vérifiée.',
  disabled:'Intentions indisponibles. Cette lecture ne dépend pas de l’activation des écritures.',
  invalid:'La lecture des intentions n’a pas pu être vérifiée.',
  conflict:'La lecture des intentions n’a pas pu être vérifiée.',
};
type Props = { transport:IntakeTransport; selectionRevision:number; onSelectionStart:()=>void; onSelected:(inquiry:Inquiry)=>void; onReset:()=>void; onSessionExpired:()=>void };
export function PlannedActionWorklist({transport,selectionRevision,...callbacks}:Props){
  const [data,setData]=useState<InquiryPlannedActionWorklist|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState<IntakeFailure|null>(null);
  const [opening,setOpening]=useState<string|null>(null);const [opened,setOpened]=useState<string|null>(null);const [detailError,setDetailError]=useState<IntakeFailure|null>(null);const [retryId,setRetryId]=useState<string|null>(null);
  const [online,setOnline]=useState(true);const [zone,setZone]=useState('heure de cet appareil');
  const active=useRef(false);const listRequest=useRef<AbortController|null>(null);const detailRequest=useRef<AbortController|null>(null);const feedback=useRef<HTMLDivElement>(null);const current=useRef(callbacks);current.current=callbacks;
  function reset(){listRequest.current?.abort();detailRequest.current?.abort();setData(null);setLoading(false);setOpening(null);setOpened(null);setRetryId(null);setDetailError(null);current.current.onReset();}
  function fail(failure:unknown){const kind=failure instanceof IntakeError?failure.kind:'unavailable';if(['offline','denied','expired','missing'].includes(kind)){transport.clearPrivate(kind);if(kind==='expired')current.current.onSessionExpired();}return kind;}
  async function load(){
    reset();setError(null);if(!navigator.onLine){setError('offline');return;}
    const controller=new AbortController();listRequest.current=controller;setLoading(true);
    try{const result=await transport.ownerPlannedActions(controller.signal);if(active.current&&!controller.signal.aborted)setData(result);}
    catch(failure){if(active.current&&!controller.signal.aborted)setError(fail(failure));}
    finally{if(active.current&&listRequest.current===controller)setLoading(false);}
  }
  async function open(inquiryId:string){
    detailRequest.current?.abort();current.current.onSelectionStart();setOpened(null);setDetailError(null);setRetryId(inquiryId);
    if(!navigator.onLine){transport.clearPrivate('offline');return;}
    const controller=new AbortController();detailRequest.current=controller;setOpening(inquiryId);
    try{const result=await transport.inquiry(inquiryId,controller.signal);if(active.current&&!controller.signal.aborted){setOpened(inquiryId);setRetryId(null);current.current.onSelected(result);}}
    catch(failure){if(active.current&&!controller.signal.aborted){const kind=fail(failure);setDetailError(kind);}}
    finally{if(active.current&&detailRequest.current===controller)setOpening(null);}
  }
  useEffect(()=>{
    active.current=true;setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const off=transport.onPrivateClear(kind=>{reset();setError(kind);});
    const network=()=>{setOnline(navigator.onLine);if(!navigator.onLine)transport.clearPrivate('offline');};network();void load();
    window.addEventListener('online',network);window.addEventListener('offline',network);
    return()=>{active.current=false;listRequest.current?.abort();detailRequest.current?.abort();off();window.removeEventListener('online',network);window.removeEventListener('offline',network);};
  },[transport]);
  useEffect(()=>{detailRequest.current?.abort();setOpening(null);setOpened(null);setRetryId(null);setDetailError(null);},[selectionRevision]);
  useEffect(()=>{if(detailError)feedback.current?.focus();},[detailError]);
  return <div className="planned-worklist">
    <header className="planned-worklist-heading"><div><h3>Intentions mises à jour récemment</h3><p>Intention administrative, à revoir par le responsable actuel.</p></div><Button onClick={()=>void load()} disabled={loading||!online} aria-label="Actualiser les intentions enregistrées"><RefreshCw size={17}/><span>Actualiser</span></Button></header>
    <p className="planned-worklist-note">{transport.mode==='demo'?'Simulation synthétique · mémoire locale. ':'Vos demandes uniquement. '}Ordre de mise à jour, sans priorité ni échéance. Aucune action exécutée.</p>
    {loading?<p className="owner-worklist-state" role="status"><LoaderCircle className="intake-spin" size={18}/>Lecture des intentions…</p>:error?<div className="owner-worklist-state" role="status"><p>{messages[error]}</p>{!['denied','expired','missing'].includes(error)&&<Button onClick={()=>void load()} disabled={!online}>Réessayer les intentions</Button>}</div>:data&&<>
      {data.truncated&&<p className="owner-worklist-partial" role="status"><strong>50+</strong> · Liste partielle : 50 intentions affichées, au moins un résultat supplémentaire existe. Aucun total exact n’est disponible.</p>}
      {!data.items.length?<p className="owner-worklist-state" role="status">Aucune intention enregistrée visible à cette observation. Cela ne signifie pas qu’aucun travail n’est nécessaire.</p>:<ul className="planned-worklist-list">{data.items.map(item=><li key={item.inquiry_id}><button aria-label={`Ouvrir l’intention de ${item.display_name}`} aria-pressed={opened===item.inquiry_id} onClick={()=>void open(item.inquiry_id)}><ListTodo size={20} aria-hidden="true"/><span><strong>{item.display_name}</strong><span>Prévu : {labels[item.planned_action]}</span><small>Mis à jour le <time dateTime={item.updated_at}>{date(item.updated_at)}</time></small></span>{opening===item.inquiry_id?<LoaderCircle className="intake-spin" size={18}/>:<ArrowRight size={18}/>}</button></li>)}</ul>}
      <p className="owner-worklist-observed">Observé le <time dateTime={data.observed_at}>{date(data.observed_at)}</time> · {zone}. Instantané sans mise à jour automatique ; le détail relu fait foi.</p>
    </>}
    {opening&&<p className="owner-worklist-notice" role="status">Vérification de l’accès actuel à la demande…</p>}
    {detailError&&<div className="owner-worklist-notice" role="alert" tabIndex={-1} ref={feedback}><p>{messages[detailError]}</p>{retryId&&!['denied','expired','missing'].includes(detailError)&&<Button onClick={()=>void open(retryId)} disabled={!online}>Réessayer le détail de l’intention</Button>}</div>}
  </div>;
}

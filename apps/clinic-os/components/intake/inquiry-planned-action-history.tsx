'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {Button} from '@dental/ui-clinic';
import {ChevronDown,History,LoaderCircle,RefreshCw} from 'lucide-react';
import type {Inquiry,InquiryPlannedActionHistory as HistoryData,InquiryPlannedAction} from '@dental/contracts';
import {IntakeError,type IntakeFailure,type IntakeTransport} from './transport';
import './inquiry-planned-action-history.css';
const labels:Record<InquiryPlannedAction,string>={review_inquiry:'Examiner la demande',review_follow_up:'Examiner l’historique du suivi'};
const label=(value:InquiryPlannedAction|null)=>value===null?'Aucune intention consignée':labels[value];
const messages:Record<IntakeFailure,string>={offline:'Hors connexion. L’historique privé a été effacé.',denied:'Accès refusé. Le détail privé a été effacé.',expired:'Session expirée. Connectez-vous à nouveau.',missing:'Demande absente, réattribuée ou inaccessible. Le détail privé a été effacé.',unavailable:'Historique indisponible. Réessayez la lecture.',disabled:'Historique indisponible. Cette lecture ne dépend pas de l’activation des écritures.',invalid:'Historique indisponible pour cette demande.',conflict:'Historique indisponible. Relisez le détail autorisé.'};
const timestamp=(value:string)=>new Intl.DateTimeFormat('fr-MA',{dateStyle:'medium',timeStyle:'medium'}).format(new Date(value));
export function InquiryPlannedActionHistory({inquiry,transport,revision}:{inquiry:Inquiry|null;transport:IntakeTransport;revision:number}){
 const [open,setOpen]=useState(false),[data,setData]=useState<HistoryData|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState<IntakeFailure|null>(null),[zone,setZone]=useState('heure de cet appareil');
 const id=useId(),root=useRef<HTMLElement>(null),opener=useRef<HTMLButtonElement>(null),request=useRef<AbortController|null>(null),active=useRef(false),opened=useRef(false),target=useRef(inquiry);target.current=inquiry;
 const focusLease=useRef(false);
 const owned=inquiry?.owner_user_id===transport.currentUserId;
 function clear(){request.current?.abort();setData(null);setLoading(false);}
 function safeFocus(){if(root.current?.contains(document.activeElement)||(focusLease.current&&document.activeElement===document.body)){const safe=root.current?.closest('.intake-detail') as HTMLElement|null; if(safe)safe.focus();}}
 async function load(){
  focusLease.current=Boolean(root.current?.contains(document.activeElement));clear();setError(null);const item=target.current;if(!item||item.owner_user_id!==transport.currentUserId)return;
  if(!navigator.onLine){transport.clearPrivate('offline');return;}
  const controller=new AbortController();request.current=controller;setLoading(true);
  try{const result=await transport.plannedActionHistory(item.id,controller.signal);if(active.current&&!controller.signal.aborted&&opened.current&&target.current?.id===item.id)setData(result);}
  catch(failure){if(!active.current||controller.signal.aborted)return;const kind=failure instanceof IntakeError?failure.kind:'unavailable';setError(kind);if(['expired','denied','missing','offline'].includes(kind))transport.clearPrivate(kind);}
  finally{if(active.current&&request.current===controller&&!controller.signal.aborted){setLoading(false);if(focusLease.current&&document.activeElement===document.body&&opened.current&&target.current?.id===item.id)opener.current?.focus();focusLease.current=false;}}
 }
 useEffect(()=>{
  active.current=true;setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const off=transport.onPrivateClear(kind=>{safeFocus();clear();setError(kind);opened.current=false;setOpen(false);});
  const network=()=>{if(!navigator.onLine)transport.clearPrivate('offline');};window.addEventListener('offline',network);
  const moved=(event:FocusEvent)=>{if(event.target instanceof Node&&event.target!==document.body&&!root.current?.contains(event.target))focusLease.current=false;};document.addEventListener('focusin',moved);
  return()=>{safeFocus();active.current=false;request.current?.abort();off();window.removeEventListener('offline',network);document.removeEventListener('focusin',moved);};
 },[transport]);
 useEffect(()=>{clear();setError(null);opened.current=false;setOpen(false);},[inquiry?.id,inquiry?.owner_user_id,transport]);
 const previousRevision=useRef(revision);
 useEffect(()=>{if(previousRevision.current===revision)return;previousRevision.current=revision;if(opened.current)void load();},[revision]);
 function toggle(){if(opened.current){if(root.current?.contains(document.activeElement))opener.current?.focus();clear();opened.current=false;setOpen(false);}else{opened.current=true;setOpen(true);void load();}}
 const visible=data?.inquiry_id===inquiry?.id&&owned?data:null;
 if(!owned&&!error)return null;
 return <section ref={root} className="intention-history" aria-label="Historique personnel des intentions">
  {owned&&<button ref={opener} type="button" className="intention-history-disclosure" aria-expanded={open} aria-controls={id} onClick={toggle}><History size={17}/><span><strong>Historique des intentions</strong><small>Vos enregistrements récents uniquement</small></span><ChevronDown size={17} className={open?'expanded':''}/></button>}
  {!open&&error&&<p role="status">{messages[error]}</p>}
  {open&&<div id={id} className="intention-history-content">
   <p>Ces résultats historiques ne décrivent pas l’intention actuelle et ne prouvent aucune action effectuée. Effacer une intention ne termine pas le suivi.</p>
   <p className="intention-history-context">{transport.mode==='demo'?'Journal synthétique · mémoire temporaire':'Vos commandes pour cette demande actuellement à votre charge.'} Horaires : {zone}.</p>
   {loading?<p role="status"><LoaderCircle className="intake-spin" size={17}/> Lecture de vos intentions consignées…</p>:error?<div role="status"><p>{messages[error]}</p>{owned&&!['denied','expired','missing','offline'].includes(error)&&<Button onClick={()=>void load()}>Réessayer l’historique des intentions</Button>}</div>:visible&&<>
    <div className="intention-history-toolbar"><p role="status"><strong>{visible.truncated?'50+':visible.items.length}</strong> résultats personnels, sans changement inclus</p><Button aria-label="Actualiser l’historique des intentions" onClick={()=>void load()}><RefreshCw size={16}/></Button></div>
    {visible.truncated&&<p>Historique partiel : vos 50 résultats les plus récents sont affichés. Au moins un autre existe ; aucun total exact n’est disponible.</p>}
    {!visible.items.length?<p role="status">Aucun enregistrement de votre part dans cet historique. Cela ne signifie pas que l’intention n’a jamais changé.</p>:<ol>{visible.items.map((item,index)=><li key={index}><strong>{!item.changed?'Sans changement':item.planned_action===null?'Intention effacée':'Intention modifiée'}</strong><dl><div><dt>Avant cette commande</dt><dd>{label(item.previous_planned_action)}</dd></div><div><dt>Résultat de cette commande</dt><dd>{label(item.planned_action)}</dd></div></dl><p>Consignée le <time dateTime={item.recorded_at}>{timestamp(item.recorded_at)}</time></p></li>)}</ol>}
    <p>Horaires : {zone}. Journal personnel non exhaustif. Une soumission incertaine se vérifie uniquement avec sa commande exacte.</p>
   </>}
  </div>}
 </section>;
}

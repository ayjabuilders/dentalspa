'use client';
import { InquiryPlannedActionHistory } from './inquiry-planned-action-history';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button, Modal } from '@dental/ui-clinic';
import { LoaderCircle, ListTodo, RefreshCw, ShieldCheck } from 'lucide-react';
import { SetInquiryPlannedActionSchema, type Inquiry, type InquiryPlannedAction, type InquiryPlannedActionState } from '@dental/contracts';
import { IntakeError, type IntakeFailure, type IntakeTransport, type PlannedActionAttempt } from './transport';
import './inquiry-planned-action.css';
const labels: Record<InquiryPlannedAction,string> = { review_inquiry:'Examiner la demande', review_follow_up:'Examiner l’historique du suivi' };
const label = (value: InquiryPlannedAction | null) => value === null ? 'Aucune action consignée' : 'Prévu : ' + labels[value];
const boundary = 'Intention administrative uniquement, à revoir par le responsable actuel. Aucune action effectuée, échéance modifiée ou communication envoyée.';
const messages: Record<IntakeFailure,string> = {
  offline:'Hors connexion. Le détail privé et la tentative ont été effacés. Aucun envoi automatique.',
  denied:'Accès refusé. Le détail privé et la tentative ont été effacés.',
  expired:'Session expirée. Connectez-vous à nouveau.',
  missing:'Demande absente, réattribuée ou inaccessible. Le détail privé a été effacé.',
  unavailable:'Intention indisponible. Aucun état actuel vérifié ; réessayez la lecture.',
  disabled:'L’enregistrement est désactivé dans cet environnement.',
  invalid:'Choisissez une intention explicite ou l’action d’effacement.',
  conflict:'La modification ne peut pas être appliquée. Relisez l’état actuel avant une nouvelle décision.',
};
const timestamp = (value:string) => new Intl.DateTimeFormat('fr-MA',{dateStyle:'medium',timeStyle:'medium'}).format(new Date(value));
export function InquiryPlannedAction({ inquiry, transport, readRevision=0 }: { inquiry: Inquiry|null; transport: IntakeTransport; readRevision?: number }) {
  const [historyRevision,setHistoryRevision]=useState(0);
  const id = useId(); const [state,setState] = useState<InquiryPlannedActionState|null>(null); const [fresh,setFresh] = useState<InquiryPlannedActionState|null>(null);
  const [targetName,setTargetName] = useState(''); const [open,setOpen] = useState(false); const [choice,setChoice] = useState(''); const [clearing,setClearing] = useState(false);
  const [pending,setPending] = useState<PlannedActionAttempt|null>(transport.pendingPlannedAction.current); const [loading,setLoading] = useState(false); const [saving,setSaving] = useState(false);
  const [error,setError] = useState<IntakeFailure|null>(null); const [message,setMessage] = useState(''); const [conflict,setConflict] = useState(false); const [online,setOnline] = useState(true); const [zone,setZone] = useState('heure locale');
  const active = useRef(false); const busy = useRef(false); const request = useRef<AbortController|null>(null); const invalidated = useRef(false); const selected = useRef(inquiry); selected.current = inquiry;
  const feedback = useRef<HTMLParagraphElement>(null); const owned = inquiry?.owner_user_id === transport.currentUserId;
  function resetDraft() { setTargetName(''); setFresh(null); setChoice(''); setClearing(false); setMessage(''); setConflict(false); }
  function fail(failure: unknown) { const kind = failure instanceof IntakeError ? failure.kind : 'unavailable'; setError(kind); if (['offline','denied','expired','missing'].includes(kind)) transport.clearPrivate(kind); return kind; }
  async function read(target: Inquiry, editing: boolean) {
    request.current?.abort(); setState(null); setFresh(null); setError(null); setLoading(true);
    const controller = new AbortController(); request.current = controller;
    try { const result = await transport.plannedAction(target.id,controller.signal); if (active.current && !controller.signal.aborted && selected.current?.id === target.id) { setState(result); if(editing)setFresh(result); } }
    catch(failure) { if(active.current && !controller.signal.aborted && selected.current?.id === target.id) fail(failure); }
    finally { if(active.current && !controller.signal.aborted) setLoading(false); }
  }
  useEffect(()=>{
    active.current=true; setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const off=transport.onPrivateClear(kind=>{invalidated.current=true;request.current?.abort();busy.current=false;setSaving(false);setLoading(false);setOpen(false);setState(null);resetDraft();setPending(null);setError(kind);});
    const network=()=>{setOnline(navigator.onLine);if(!navigator.onLine)transport.clearPrivate('offline');};network();window.addEventListener('online',network);window.addEventListener('offline',network);
    return()=>{active.current=false;request.current?.abort();off();window.removeEventListener('online',network);window.removeEventListener('offline',network);};
  },[transport]);
  useEffect(()=>{
    request.current?.abort();busy.current=false;setSaving(false);setLoading(false);setOpen(false);setState(null);resetDraft();setPending(transport.pendingPlannedAction.current);
    if(invalidated.current && !inquiry)return; invalidated.current=false;setError(null);
    if(inquiry?.owner_user_id===transport.currentUserId && navigator.onLine)void read(inquiry,false);
  },[inquiry?.id,inquiry?.owner_user_id,transport,readRevision]);
  useEffect(()=>{if(open && message)feedback.current?.focus();},[open,message]);
  function close(){request.current?.abort();setLoading(false);setOpen(false);resetDraft();if(inquiry && owned && !transport.pendingPlannedAction.current && !state && navigator.onLine)void read(inquiry,false);}
  function start(){
    request.current?.abort();setLoading(false);resetDraft();setError(null);setOpen(true);const attempt=transport.pendingPlannedAction.current;setPending(attempt);setTargetName(attempt?.displayName ?? inquiry?.display_name ?? 'Demande initiale');
    if(attempt){setMessage('Résultat à vérifier pour la demande initiale. Seule la commande conservée peut être vérifiée.');return;}
    if(inquiry && owned)void read(inquiry,true);else setOpen(false);
  }
  async function submit(event:FormEvent){
    event.preventDefault();if(busy.current || !online)return;let command=transport.pendingPlannedAction.current;const verifying=command!==null;
    if(!command){if(!fresh || conflict)return;const parsed=SetInquiryPlannedActionSchema.safeParse({expected_revision:fresh.revision,planned_action:clearing?null:choice});if(!parsed.success){setMessage(messages.invalid);return;}command={id:fresh.inquiry_id,displayName:inquiry?.display_name,body:parsed.data,key:crypto.randomUUID()};transport.pendingPlannedAction.current=command;setPending(command);}
    busy.current=true;setSaving(true);setState(null);setError(null);setMessage('');request.current?.abort();const controller=new AbortController();request.current=controller;let received=false;
    try{
      const result=await transport.setPlannedAction(command.id,command.body,command.key,controller.signal);received=true;
      const current=await transport.plannedAction(command.id,controller.signal);
      if(current.revision<result.receipt.revision)throw new IntakeError('unavailable');
      if(!active.current || controller.signal.aborted)return;
      transport.pendingPlannedAction.current=null;setPending(null);setFresh(null);setChoice('');setClearing(false);
      if(selected.current?.id===command.id){setState(current);setHistoryRevision(value=>value+1);}
      setMessage(`${result.receipt.changed?'Intention enregistrée.':'Aucun changement nécessaire.'} État actuel relu : ${label(current.planned_action)}. ${transport.mode==='demo'?'Simulation locale uniquement.':''}`);
    }catch(failure){
      if(!active.current || controller.signal.aborted)return;const kind=failure instanceof IntakeError?failure.kind:'unavailable';
      if(['offline','denied','expired','missing'].includes(kind)){transport.clearPrivate(kind);return;}
      if(!received && (kind==='conflict' || (!verifying && ['disabled','invalid'].includes(kind)))){transport.pendingPlannedAction.current=null;setPending(null);setFresh(null);setConflict(kind==='conflict');setError(kind);setMessage(messages[kind]);}
      else setMessage(kind==='disabled'?'Vérification désactivée dans cet environnement. Le résultat initial reste incertain ; la commande exacte est conservée.':'Résultat à vérifier : aucune réussite annoncée. La même demande, la même valeur et la même clé seront reprises, puis l’état actuel sera relu.');
    }finally{if(active.current && request.current===controller){busy.current=false;setSaving(false);}}
  }
  const visible=state?.inquiry_id===inquiry?.id && owned?state:null;
  if(!owned && !pending && !error)return null;
  return <section className="planned-action" aria-label="Prochaine action prévue">
    <div className="planned-action-heading"><ListTodo size={20}/><h3>Prochaine action prévue</h3></div>
    <p className="planned-action-boundary">{boundary}</p>
    {loading && !open?<p role="status" className="planned-action-status"><LoaderCircle size={17} className="intake-spin"/>Lecture de l’intention…</p>:error && !open?<div role="status" className="planned-action-status"><p>{messages[error]}</p>{owned && !['offline','denied','expired','missing'].includes(error)&&<Button onClick={()=>inquiry && void read(inquiry,false)} disabled={!online}>Relire l’intention</Button>}</div>:visible?<div className="planned-action-value"><span>État actuellement lu</span><strong>{label(visible.planned_action)}</strong>{visible.updated_at&&<small>Mis à jour le <time dateTime={visible.updated_at}>{timestamp(visible.updated_at)}</time> · {zone}</small>}</div>:null}
    {(owned || pending)&&<Button onClick={start} disabled={!online || saving}><ListTodo size={17}/>{pending?'Vérifier l’action prévue':visible?.planned_action?'Modifier l’action prévue':'Renseigner l’action prévue'}</Button>}
    <InquiryPlannedActionHistory inquiry={inquiry} transport={transport} revision={historyRevision}/>
    <Modal open={open} onOpenChange={next=>{if(!busy.current && !next)close();}} title="Renseigner l’action prévue" description={boundary}>
      <form className="planned-action-form" onSubmit={submit} aria-busy={loading || saving}>
        <div className="planned-action-target"><ShieldCheck size={21}/><div><strong>{targetName}</strong><small>{transport.mode==='demo'?'Simulation synthétique · mémoire temporaire':'Responsable actuel · cabinet vérifié'}</small></div></div>
        {loading&&<p role="status"><LoaderCircle size={18} className="intake-spin"/>Lecture de la valeur actuelle…</p>}
        {message&&<p ref={feedback} tabIndex={-1} role="status" className="planned-action-feedback">{message}</p>}
        {error&&!message&&<p role="status" className="planned-action-feedback">{messages[error]}</p>}
        {pending?<div className="planned-action-value"><span>Commande initiale conservée en session</span><strong>{pending.body.planned_action===null?'Effacer l’action prévue':label(pending.body.planned_action)}</strong><small>Aucune modification possible avant vérification. Aucun envoi automatique.</small></div>:fresh&&<>
          <div className="planned-action-value"><span>Intention actuellement consignée</span><strong>{label(fresh.planned_action)}</strong></div>
          <fieldset disabled={saving || loading}>
            <label htmlFor={`${id}-choice`}>Action administrative prévue</label>
            <select id={`${id}-choice`} value={choice} disabled={clearing} onChange={event=>{setChoice(event.target.value);setMessage('');}}><option value="">Choisir une intention</option>{Object.entries(labels).map(([value,name])=><option key={value} value={value}>{name}</option>)}</select>
            {choice&&<p className="planned-action-help">Choix : {label(choice as InquiryPlannedAction)}.</p>}
            <p className="planned-action-help">Catalogue de démonstration limité. Choisissez une intention de revue interne. Aucun choix n’est déduit des coordonnées, des préférences ou du suivi.</p>
            <label className="planned-action-clear"><input type="checkbox" checked={clearing} onChange={event=>{setClearing(event.target.checked);setChoice('');setMessage('');}}/><span>Effacer l’action prévue</span></label>
            {clearing&&<p className="planned-action-help">Efface uniquement l’intention consignée. Cela ne signifie ni action accomplie, ni annulation externe, ni clôture.</p>}
            <p className="planned-action-help">Ce choix n’exécute aucune revue. Consigner ensuite un suivi ne termine pas et n’efface pas cette intention.</p>
          </fieldset>
        </>}
        <div className="planned-action-actions"><Button type="button" onClick={close} disabled={saving}>Fermer</Button>{!pending && (conflict || (error && !fresh))?<Button type="button" onClick={start} disabled={!online || loading}><RefreshCw size={17}/>Relire l’état actuel</Button>:<Button type="submit" variant="primary" disabled={saving || loading || !online || (!pending && (!fresh || (!choice && !clearing)))}>{saving?'Vérification en cours…':pending?'Vérifier l’enregistrement':'Enregistrer l’intention'}</Button>}</div>
      </form>
    </Modal>
  </section>;
}

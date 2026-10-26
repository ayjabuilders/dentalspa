'use client';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button, Modal } from '@dental/ui-clinic';
import { LoaderCircle, Globe2, RefreshCw, ShieldCheck } from 'lucide-react';
import { SetInquiryCommunicationTimeZoneSchema, type Inquiry, type InquiryCommunicationTimeZone, type InquiryCommunicationTimeZoneState } from '@dental/contracts';
import { IntakeError, type IntakeFailure, type IntakeTransport, type TimeZoneAttempt } from './transport';
import './inquiry-communication-time-zone.css';
const labels: Record<InquiryCommunicationTimeZone,string> = { 'Africa/Casablanca':'Fuseau Casablanca', 'Africa/Dakar':'Fuseau Dakar', 'America/New_York':'Fuseau New York', 'America/Sao_Paulo':'Fuseau São Paulo', 'America/Toronto':'Fuseau Toronto', 'Asia/Dubai':'Fuseau Dubaï', 'Asia/Riyadh':'Fuseau Riyad', 'Asia/Tokyo':'Fuseau Tokyo', 'Australia/Sydney':'Fuseau Sydney', 'Etc/UTC':'Temps universel coordonné', 'Europe/London':'Fuseau Londres', 'Europe/Paris':'Fuseau Paris' };
const label = (value: InquiryCommunicationTimeZone | null) => value === null ? 'Aucun fuseau consigné' : labels[value] + ' · ' + value;
const boundary = 'Indication déclarée pour le contact. Elle ne modifie aucune échéance, ne définit pas une heure d’appel et ne programme aucun envoi.';
const messages: Record<IntakeFailure,string> = {
  offline:'Hors connexion. Le détail privé et la tentative ont été effacés. Aucun envoi automatique.',
  denied:'Accès refusé. Le détail privé et la tentative ont été effacés.',
  expired:'Session expirée. Connectez-vous à nouveau.',
  missing:'Demande absente, réattribuée ou inaccessible. Le détail privé a été effacé.',
  unavailable:'Fuseau indisponible. Aucun état actuel vérifié ; réessayez la lecture.',
  disabled:'L’enregistrement est désactivé dans cet environnement.',
  invalid:'Choisissez un fuseau explicitement déclaré ou l’action d’effacement.',
  conflict:'La modification ne peut pas être appliquée. Relisez l’état actuel avant une nouvelle décision.',
};
const timestamp = (value:string) => new Intl.DateTimeFormat('fr-MA',{dateStyle:'medium',timeStyle:'medium'}).format(new Date(value));
export function InquiryCommunicationTimeZone({ inquiry, transport }: { inquiry: Inquiry|null; transport: IntakeTransport }) {
  const id = useId(); const [state,setState] = useState<InquiryCommunicationTimeZoneState|null>(null); const [fresh,setFresh] = useState<InquiryCommunicationTimeZoneState|null>(null);
  const [targetName,setTargetName] = useState(''); const [open,setOpen] = useState(false); const [choice,setChoice] = useState(''); const [clearing,setClearing] = useState(false);
  const [pending,setPending] = useState<TimeZoneAttempt|null>(transport.pendingTimeZone.current); const [loading,setLoading] = useState(false); const [saving,setSaving] = useState(false);
  const [error,setError] = useState<IntakeFailure|null>(null); const [message,setMessage] = useState(''); const [conflict,setConflict] = useState(false); const [online,setOnline] = useState(true); const [zone,setZone] = useState('heure locale');
  const active = useRef(false); const busy = useRef(false); const request = useRef<AbortController|null>(null); const invalidated = useRef(false); const selected = useRef(inquiry); selected.current = inquiry;
  const feedback = useRef<HTMLParagraphElement>(null); const owned = inquiry?.owner_user_id === transport.currentUserId;
  function resetDraft() { setTargetName(''); setFresh(null); setChoice(''); setClearing(false); setMessage(''); setConflict(false); }
  function fail(failure: unknown) { const kind = failure instanceof IntakeError ? failure.kind : 'unavailable'; setError(kind); if (['offline','denied','expired','missing'].includes(kind)) transport.clearPrivate(kind); return kind; }
  async function read(target: Inquiry, editing: boolean) {
    request.current?.abort(); setState(null); setFresh(null); setError(null); setLoading(true);
    const controller = new AbortController(); request.current = controller;
    try { const result = await transport.communicationTimeZone(target.id,controller.signal); if (active.current && !controller.signal.aborted && selected.current?.id === target.id) { setState(result); if(editing)setFresh(result); } }
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
    request.current?.abort();busy.current=false;setSaving(false);setLoading(false);setOpen(false);setState(null);resetDraft();setPending(transport.pendingTimeZone.current);
    if(invalidated.current && !inquiry)return; invalidated.current=false;setError(null);
    if(inquiry?.owner_user_id===transport.currentUserId && navigator.onLine)void read(inquiry,false);
  },[inquiry?.id,inquiry?.owner_user_id,transport]);
  useEffect(()=>{if(open && message)feedback.current?.focus();},[open,message]);
  function close(){request.current?.abort();setLoading(false);setOpen(false);resetDraft();if(inquiry && owned && !transport.pendingTimeZone.current && !state && navigator.onLine)void read(inquiry,false);}
  function start(){
    request.current?.abort();setLoading(false);resetDraft();setError(null);setOpen(true);const attempt=transport.pendingTimeZone.current;setPending(attempt);setTargetName(attempt?.displayName ?? inquiry?.display_name ?? 'Demande initiale');
    if(attempt){setMessage('Résultat à vérifier pour la demande initiale. Seule la commande conservée peut être vérifiée.');return;}
    if(inquiry && owned)void read(inquiry,true);else setOpen(false);
  }
  async function submit(event:FormEvent){
    event.preventDefault();if(busy.current || !online)return;let command=transport.pendingTimeZone.current;const verifying=command!==null;
    if(!command){if(!fresh || conflict)return;const parsed=SetInquiryCommunicationTimeZoneSchema.safeParse({expected_revision:fresh.revision,time_zone:clearing?null:choice});if(!parsed.success){setMessage(messages.invalid);return;}command={id:fresh.inquiry_id,displayName:inquiry?.display_name,body:parsed.data,key:crypto.randomUUID()};transport.pendingTimeZone.current=command;setPending(command);}
    busy.current=true;setSaving(true);setState(null);setError(null);setMessage('');request.current?.abort();const controller=new AbortController();request.current=controller;let received=false;
    try{
      const result=await transport.setCommunicationTimeZone(command.id,command.body,command.key,controller.signal);received=true;
      const current=await transport.communicationTimeZone(command.id,controller.signal);
      if(current.revision<result.receipt.revision)throw new IntakeError('unavailable');
      if(!active.current || controller.signal.aborted)return;
      transport.pendingTimeZone.current=null;setPending(null);setFresh(null);setChoice('');setClearing(false);
      if(selected.current?.id===command.id)setState(current);
      setMessage(`${result.receipt.changed?'Fuseau consigné.':'Aucun changement nécessaire.'} État actuel relu : ${label(current.time_zone)}. ${transport.mode==='demo'?'Simulation locale uniquement.':''}`);
    }catch(failure){
      if(!active.current || controller.signal.aborted)return;const kind=failure instanceof IntakeError?failure.kind:'unavailable';
      if(['offline','denied','expired','missing'].includes(kind)){transport.clearPrivate(kind);return;}
      if(!received && (kind==='conflict' || (!verifying && ['disabled','invalid'].includes(kind)))){transport.pendingTimeZone.current=null;setPending(null);setFresh(null);setConflict(kind==='conflict');setError(kind);setMessage(messages[kind]);}
      else setMessage(kind==='disabled'?'Vérification désactivée dans cet environnement. Le résultat initial reste incertain ; la commande exacte est conservée.':'Résultat à vérifier : aucune réussite annoncée. La même demande, la même valeur et la même clé seront reprises, puis l’état actuel sera relu.');
    }finally{if(active.current && request.current===controller){busy.current=false;setSaving(false);}}
  }
  const visible=state?.inquiry_id===inquiry?.id && owned?state:null;
  if(!owned && !pending && !error)return null;
  return <section className="communication-time-zone" aria-label="Fuseau horaire déclaré">
    <div className="communication-time-zone-heading"><Globe2 size={20}/><h3>Fuseau horaire</h3></div>
    <p className="communication-time-zone-boundary">{boundary}</p>
    {loading && !open?<p role="status" className="communication-time-zone-status"><LoaderCircle size={17} className="intake-spin"/>Lecture du fuseau…</p>:error && !open?<div role="status" className="communication-time-zone-status"><p>{messages[error]}</p>{owned && !['offline','denied','expired','missing'].includes(error)&&<Button onClick={()=>inquiry && void read(inquiry,false)} disabled={!online}>Relire le fuseau</Button>}</div>:visible?<div className="communication-time-zone-value"><span>État actuellement lu</span><strong>{label(visible.time_zone)}</strong>{visible.updated_at&&<small>Mis à jour le <time dateTime={visible.updated_at}>{timestamp(visible.updated_at)}</time> · {zone}</small>}</div>:null}
    {(owned || pending)&&<Button onClick={start} disabled={!online || saving}><Globe2 size={17}/>{pending?'Vérifier le fuseau':visible?.time_zone?'Modifier le fuseau':'Renseigner le fuseau'}</Button>}
    <Modal open={open} onOpenChange={next=>{if(!busy.current && !next)close();}} title="Renseigner le fuseau" description={boundary}>
      <form className="communication-time-zone-form" onSubmit={submit} aria-busy={loading || saving}>
        <div className="communication-time-zone-target"><ShieldCheck size={21}/><div><strong>{targetName}</strong><small>{transport.mode==='demo'?'Simulation synthétique · mémoire temporaire':'Responsable actuel · cabinet vérifié'}</small></div></div>
        {loading&&<p role="status"><LoaderCircle size={18} className="intake-spin"/>Lecture de la valeur actuelle…</p>}
        {message&&<p ref={feedback} tabIndex={-1} role="status" className="communication-time-zone-feedback">{message}</p>}
        {error&&!message&&<p role="status" className="communication-time-zone-feedback">{messages[error]}</p>}
        {pending?<div className="communication-time-zone-value"><span>Commande initiale conservée en session</span><strong>{pending.body.time_zone===null?'Effacer le fuseau consigné':label(pending.body.time_zone)}</strong><small>Aucune modification possible avant vérification. Aucun envoi automatique.</small></div>:fresh&&<>
          <div className="communication-time-zone-value"><span>Fuseau actuellement consigné</span><strong>{label(fresh.time_zone)}</strong></div>
          <fieldset disabled={saving || loading}>
            <label htmlFor={`${id}-choice`}>Fuseau explicitement indiqué par le contact</label>
            <select id={`${id}-choice`} value={choice} disabled={clearing} onChange={event=>{setChoice(event.target.value);setMessage('');}}><option value="">Choisir un fuseau</option>{Object.entries(labels).map(([value,name])=><option key={value} value={value}>{name} · {value}</option>)}</select>
            {choice&&<p className="communication-time-zone-help">Choix : {label(choice as InquiryCommunicationTimeZone)}.</p>}
            <p className="communication-time-zone-help">Catalogue de démonstration limité. Si le fuseau déclaré n’est pas proposé, ne choisissez pas de substitut. Aucun choix n’est déduit du navigateur, du téléphone ou de la langue.</p>
            <label className="communication-time-zone-clear"><input type="checkbox" checked={clearing} onChange={event=>{setClearing(event.target.checked);setChoice('');setMessage('');}}/><span>Effacer le fuseau consigné</span></label>
            {clearing&&<p className="communication-time-zone-help">Effacement administratif uniquement. Ce n’est ni un retrait de consentement ni une instruction de ne pas contacter.</p>}
            <p className="communication-time-zone-help">Ce fuseau ne décrit ni un lieu de résidence, ni une position actuelle, ni une disponibilité. Aucune conversion d’échéance.</p>
          </fieldset>
        </>}
        <div className="communication-time-zone-actions"><Button type="button" onClick={close} disabled={saving}>Fermer</Button>{!pending && (conflict || (error && !fresh))?<Button type="button" onClick={start} disabled={!online || loading}><RefreshCw size={17}/>Relire l’état actuel</Button>:<Button type="submit" variant="primary" disabled={saving || loading || !online || (!pending && (!fresh || (!choice && !clearing)))}>{saving?'Vérification en cours…':pending?'Vérifier l’enregistrement':'Consigner le fuseau'}</Button>}</div>
      </form>
    </Modal>
  </section>;
}

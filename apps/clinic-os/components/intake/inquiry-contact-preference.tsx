'use client';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button, Modal } from '@dental/ui-clinic';
import { LoaderCircle, MessageSquareText, RefreshCw, ShieldCheck } from 'lucide-react';
import { SetInquiryContactPreferenceSchema, type Inquiry, type InquiryContactPreference, type InquiryContactPreferenceState } from '@dental/contracts';
import { IntakeError, type IntakeFailure, type IntakeTransport, type PreferenceAttempt } from './transport';
import './inquiry-contact-preference.css';
const labels: Record<InquiryContactPreference,string> = { phone:'Téléphone', email:'E-mail', no_preference:'Sans préférence particulière — explicitement déclaré' };
const label = (value: InquiryContactPreference | null) => value === null ? 'Aucune préférence consignée' : labels[value];
const boundary = 'Déclaration manuelle. Elle ne vaut pas consentement, ne vérifie pas les coordonnées et n’envoie aucun message.';
const messages: Record<IntakeFailure,string> = {
  offline:'Hors connexion. Le détail privé et la tentative ont été effacés. Aucun envoi automatique.',
  denied:'Accès refusé. Le détail privé et la tentative ont été effacés.',
  expired:'Session expirée. Connectez-vous à nouveau.',
  missing:'Demande absente, réattribuée ou inaccessible. Le détail privé a été effacé.',
  unavailable:'Préférence indisponible. Aucun état actuel vérifié ; réessayez la lecture.',
  disabled:'L’enregistrement est désactivé dans cet environnement.',
  invalid:'Choisissez une préférence explicitement déclarée ou l’action d’effacement.',
  conflict:'La modification ne peut pas être appliquée. Relisez l’état actuel avant une nouvelle décision.',
};
const timestamp = (value:string) => new Intl.DateTimeFormat('fr-MA',{dateStyle:'medium',timeStyle:'medium'}).format(new Date(value));
export function InquiryContactPreference({ inquiry, transport }: { inquiry: Inquiry|null; transport: IntakeTransport }) {
  const id = useId(); const [state,setState] = useState<InquiryContactPreferenceState|null>(null); const [fresh,setFresh] = useState<InquiryContactPreferenceState|null>(null);
  const [targetName,setTargetName] = useState(''); const [open,setOpen] = useState(false); const [choice,setChoice] = useState(''); const [clearing,setClearing] = useState(false);
  const [pending,setPending] = useState<PreferenceAttempt|null>(transport.pendingPreference.current); const [loading,setLoading] = useState(false); const [saving,setSaving] = useState(false);
  const [error,setError] = useState<IntakeFailure|null>(null); const [message,setMessage] = useState(''); const [conflict,setConflict] = useState(false); const [online,setOnline] = useState(true); const [zone,setZone] = useState('heure locale');
  const active = useRef(false); const busy = useRef(false); const request = useRef<AbortController|null>(null); const invalidated = useRef(false); const selected = useRef(inquiry); selected.current = inquiry;
  const feedback = useRef<HTMLParagraphElement>(null); const owned = inquiry?.owner_user_id === transport.currentUserId;
  function resetDraft() { setTargetName(''); setFresh(null); setChoice(''); setClearing(false); setMessage(''); setConflict(false); }
  function fail(failure: unknown) { const kind = failure instanceof IntakeError ? failure.kind : 'unavailable'; setError(kind); if (['offline','denied','expired','missing'].includes(kind)) transport.clearPrivate(kind); return kind; }
  async function read(target: Inquiry, editing: boolean) {
    request.current?.abort(); setState(null); setFresh(null); setError(null); setLoading(true);
    const controller = new AbortController(); request.current = controller;
    try { const result = await transport.contactPreference(target.id,controller.signal); if (active.current && !controller.signal.aborted && selected.current?.id === target.id) { setState(result); if(editing)setFresh(result); } }
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
    request.current?.abort();busy.current=false;setSaving(false);setLoading(false);setOpen(false);setState(null);resetDraft();setPending(transport.pendingPreference.current);
    if(invalidated.current && !inquiry)return; invalidated.current=false;setError(null);
    if(inquiry?.owner_user_id===transport.currentUserId && navigator.onLine)void read(inquiry,false);
  },[inquiry?.id,inquiry?.owner_user_id,transport]);
  useEffect(()=>{if(open && message)feedback.current?.focus();},[open,message]);
  function close(){request.current?.abort();setLoading(false);setOpen(false);resetDraft();if(inquiry && owned && !transport.pendingPreference.current && !state && navigator.onLine)void read(inquiry,false);}
  function start(){
    request.current?.abort();resetDraft();setError(null);setOpen(true);const attempt=transport.pendingPreference.current;setPending(attempt);setTargetName(attempt?.displayName ?? inquiry?.display_name ?? 'Demande initiale');
    if(attempt){setMessage('Résultat à vérifier pour la demande initiale. Seule la commande conservée peut être vérifiée.');return;}
    if(inquiry && owned)void read(inquiry,true);else setOpen(false);
  }
  async function submit(event:FormEvent){
    event.preventDefault();if(busy.current || !online)return;let command=transport.pendingPreference.current;const verifying=command!==null;
    if(!command){if(!fresh || conflict)return;const parsed=SetInquiryContactPreferenceSchema.safeParse({expected_revision:fresh.revision,preference:clearing?null:choice});if(!parsed.success){setMessage(messages.invalid);return;}command={id:fresh.inquiry_id,displayName:inquiry?.display_name,body:parsed.data,key:crypto.randomUUID()};transport.pendingPreference.current=command;setPending(command);}
    busy.current=true;setSaving(true);setState(null);setError(null);setMessage('');request.current?.abort();const controller=new AbortController();request.current=controller;let received=false;
    try{
      const result=await transport.setContactPreference(command.id,command.body,command.key,controller.signal);received=true;
      const current=await transport.contactPreference(command.id,controller.signal);
      if(current.revision<result.receipt.revision)throw new IntakeError('unavailable');
      if(!active.current || controller.signal.aborted)return;
      transport.pendingPreference.current=null;setPending(null);setFresh(null);setChoice('');setClearing(false);
      if(selected.current?.id===command.id)setState(current);
      setMessage(`${result.receipt.changed?'Préférence consignée.':'Aucun changement nécessaire.'} État actuel relu : ${label(current.preference)}. ${transport.mode==='demo'?'Simulation locale uniquement.':''}`);
    }catch(failure){
      if(!active.current || controller.signal.aborted)return;const kind=failure instanceof IntakeError?failure.kind:'unavailable';
      if(['offline','denied','expired','missing'].includes(kind)){transport.clearPrivate(kind);return;}
      if(!received && (kind==='conflict' || (!verifying && ['disabled','invalid'].includes(kind)))){transport.pendingPreference.current=null;setPending(null);setFresh(null);setConflict(kind==='conflict');setError(kind);setMessage(messages[kind]);}
      else setMessage(kind==='disabled'?'Vérification désactivée dans cet environnement. Le résultat initial reste incertain ; la commande exacte est conservée.':'Résultat à vérifier : aucune réussite annoncée. La même demande, la même valeur et la même clé seront reprises, puis l’état actuel sera relu.');
    }finally{if(active.current && request.current===controller){busy.current=false;setSaving(false);}}
  }
  const visible=state?.inquiry_id===inquiry?.id && owned?state:null;
  if(!owned && !pending && !error)return null;
  return <section className="contact-preference" aria-label="Préférence de contact déclarée">
    <div className="contact-preference-heading"><MessageSquareText size={20}/><h3>Préférence de contact déclarée</h3></div>
    <p className="contact-preference-boundary">{boundary}</p>
    {loading && !open?<p role="status" className="contact-preference-status"><LoaderCircle size={17} className="intake-spin"/>Lecture de la préférence…</p>:error && !open?<div role="status" className="contact-preference-status"><p>{messages[error]}</p>{owned && !['offline','denied','expired','missing'].includes(error)&&<Button onClick={()=>inquiry && void read(inquiry,false)} disabled={!online}>Relire la préférence</Button>}</div>:visible?<div className="contact-preference-value"><span>État actuellement lu</span><strong>{label(visible.preference)}</strong>{visible.updated_at&&<small>Mis à jour le <time dateTime={visible.updated_at}>{timestamp(visible.updated_at)}</time> · {zone}</small>}</div>:null}
    {(owned || pending)&&<Button onClick={start} disabled={!online || saving}><MessageSquareText size={17}/>{pending?'Vérifier la préférence':'Consigner une préférence'}</Button>}
    <Modal open={open} onOpenChange={next=>{if(!busy.current && !next)close();}} title="Consigner une préférence" description={boundary}>
      <form className="contact-preference-form" onSubmit={submit} aria-busy={loading || saving}>
        <div className="contact-preference-target"><ShieldCheck size={21}/><div><strong>{targetName}</strong><small>{transport.mode==='demo'?'Simulation synthétique · mémoire temporaire':'Responsable actuel · cabinet vérifié'}</small></div></div>
        {loading&&<p role="status"><LoaderCircle size={18} className="intake-spin"/>Lecture de la valeur actuelle…</p>}
        {message&&<p ref={feedback} tabIndex={-1} role="status" className="contact-preference-feedback">{message}</p>}
        {error&&!message&&<p role="status" className="contact-preference-feedback">{messages[error]}</p>}
        {pending?<div className="contact-preference-value"><span>Commande initiale conservée en session</span><strong>{pending.body.preference===null?'Effacer la préférence consignée':label(pending.body.preference)}</strong><small>Aucune modification possible avant vérification. Aucun envoi automatique.</small></div>:fresh&&<>
          <div className="contact-preference-value"><span>Préférence actuellement consignée</span><strong>{label(fresh.preference)}</strong></div>
          <fieldset disabled={saving || loading}>
            <label htmlFor={`${id}-choice`}>Préférence explicitement indiquée par le contact</label>
            <select id={`${id}-choice`} value={choice} disabled={clearing} onChange={event=>{setChoice(event.target.value);setMessage('');}}><option value="">Choisir une préférence</option><option value="phone">Téléphone</option><option value="email">E-mail</option><option value="no_preference">Sans préférence particulière — explicitement déclaré</option></select>
            {choice==='no_preference'&&<p className="contact-preference-help">Choix : Sans préférence particulière — explicitement déclaré.</p>}
            <p className="contact-preference-help">La source et les coordonnées ne préremplissent pas ce choix.</p>
            <label className="contact-preference-clear"><input type="checkbox" checked={clearing} onChange={event=>{setClearing(event.target.checked);setChoice('');setMessage('');}}/><span>Effacer la préférence consignée</span></label>
            {clearing&&<p className="contact-preference-help">Effacement administratif uniquement. Ce n’est ni un retrait de consentement ni une instruction de ne pas contacter.</p>}
            <p className="contact-preference-help">Téléphone : {inquiry?.contact_phone?'renseigné, non vérifié':'non renseigné'}. E-mail : {inquiry?.contact_email?'renseigné, non vérifié':'non renseigné'}. Une coordonnée absente n’empêche pas de consigner une préférence.</p>
          </fieldset>
        </>}
        <div className="contact-preference-actions"><Button type="button" onClick={close} disabled={saving}>Fermer</Button>{!pending && (conflict || (error && !fresh))?<Button type="button" onClick={start} disabled={!online || loading}><RefreshCw size={17}/>Relire l’état actuel</Button>:<Button type="submit" variant="primary" disabled={saving || loading || !online || (!pending && (!fresh || (!choice && !clearing)))}>{saving?'Vérification en cours…':pending?'Vérifier l’enregistrement':'Consigner la préférence'}</Button>}</div>
      </form>
    </Modal>
  </section>;
}

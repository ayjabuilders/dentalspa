'use client';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button, Modal } from '@dental/ui-clinic';
import { LoaderCircle, MessageSquareText, RefreshCw, ShieldCheck } from 'lucide-react';
import { SetInquiryCommunicationLanguageSchema, type Inquiry, type InquiryCommunicationLanguage, type InquiryCommunicationLanguageState } from '@dental/contracts';
import { IntakeError, type IntakeFailure, type IntakeTransport, type LanguageAttempt } from './transport';
import './inquiry-communication-language.css';
const labels: Record<InquiryCommunicationLanguage,string> = { fr:'Français', ar:'Arabe', en:'Anglais', other:'Autre langue — sans détail enregistré', no_preference:'Sans préférence linguistique — explicitement déclaré' };
const label = (value: InquiryCommunicationLanguage | null) => value === null ? 'Aucune langue consignée' : labels[value];
const boundary = 'Déclaration administrative. Elle ne change pas la langue de l’application, ne vérifie pas la compréhension, ne garantit pas un interprète et n’envoie aucun message.';
const messages: Record<IntakeFailure,string> = {
  offline:'Hors connexion. Le détail privé et la tentative ont été effacés. Aucun envoi automatique.',
  denied:'Accès refusé. Le détail privé et la tentative ont été effacés.',
  expired:'Session expirée. Connectez-vous à nouveau.',
  missing:'Demande absente, réattribuée ou inaccessible. Le détail privé a été effacé.',
  unavailable:'Langue indisponible. Aucun état actuel vérifié ; réessayez la lecture.',
  disabled:'L’enregistrement est désactivé dans cet environnement.',
  invalid:'Choisissez une langue explicitement déclarée ou l’action d’effacement.',
  conflict:'La modification ne peut pas être appliquée. Relisez l’état actuel avant une nouvelle décision.',
};
const timestamp = (value:string) => new Intl.DateTimeFormat('fr-MA',{dateStyle:'medium',timeStyle:'medium'}).format(new Date(value));
export function InquiryCommunicationLanguage({ inquiry, transport }: { inquiry: Inquiry|null; transport: IntakeTransport }) {
  const id = useId(); const [state,setState] = useState<InquiryCommunicationLanguageState|null>(null); const [fresh,setFresh] = useState<InquiryCommunicationLanguageState|null>(null);
  const [targetName,setTargetName] = useState(''); const [open,setOpen] = useState(false); const [choice,setChoice] = useState(''); const [clearing,setClearing] = useState(false);
  const [pending,setPending] = useState<LanguageAttempt|null>(transport.pendingLanguage.current); const [loading,setLoading] = useState(false); const [saving,setSaving] = useState(false);
  const [error,setError] = useState<IntakeFailure|null>(null); const [message,setMessage] = useState(''); const [conflict,setConflict] = useState(false); const [online,setOnline] = useState(true); const [zone,setZone] = useState('heure locale');
  const active = useRef(false); const busy = useRef(false); const request = useRef<AbortController|null>(null); const invalidated = useRef(false); const selected = useRef(inquiry); selected.current = inquiry;
  const feedback = useRef<HTMLParagraphElement>(null); const owned = inquiry?.owner_user_id === transport.currentUserId;
  function resetDraft() { setTargetName(''); setFresh(null); setChoice(''); setClearing(false); setMessage(''); setConflict(false); }
  function fail(failure: unknown) { const kind = failure instanceof IntakeError ? failure.kind : 'unavailable'; setError(kind); if (['offline','denied','expired','missing'].includes(kind)) transport.clearPrivate(kind); return kind; }
  async function read(target: Inquiry, editing: boolean) {
    request.current?.abort(); setState(null); setFresh(null); setError(null); setLoading(true);
    const controller = new AbortController(); request.current = controller;
    try { const result = await transport.communicationLanguage(target.id,controller.signal); if (active.current && !controller.signal.aborted && selected.current?.id === target.id) { setState(result); if(editing)setFresh(result); } }
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
    request.current?.abort();busy.current=false;setSaving(false);setLoading(false);setOpen(false);setState(null);resetDraft();setPending(transport.pendingLanguage.current);
    if(invalidated.current && !inquiry)return; invalidated.current=false;setError(null);
    if(inquiry?.owner_user_id===transport.currentUserId && navigator.onLine)void read(inquiry,false);
  },[inquiry?.id,inquiry?.owner_user_id,transport]);
  useEffect(()=>{if(open && message)feedback.current?.focus();},[open,message]);
  function close(){request.current?.abort();setLoading(false);setOpen(false);resetDraft();if(inquiry && owned && !transport.pendingLanguage.current && !state && navigator.onLine)void read(inquiry,false);}
  function start(){
    request.current?.abort();resetDraft();setError(null);setOpen(true);const attempt=transport.pendingLanguage.current;setPending(attempt);setTargetName(attempt?.displayName ?? inquiry?.display_name ?? 'Demande initiale');
    if(attempt){setMessage('Résultat à vérifier pour la demande initiale. Seule la commande conservée peut être vérifiée.');return;}
    if(inquiry && owned)void read(inquiry,true);else setOpen(false);
  }
  async function submit(event:FormEvent){
    event.preventDefault();if(busy.current || !online)return;let command=transport.pendingLanguage.current;const verifying=command!==null;
    if(!command){if(!fresh || conflict)return;const parsed=SetInquiryCommunicationLanguageSchema.safeParse({expected_revision:fresh.revision,language:clearing?null:choice});if(!parsed.success){setMessage(messages.invalid);return;}command={id:fresh.inquiry_id,displayName:inquiry?.display_name,body:parsed.data,key:crypto.randomUUID()};transport.pendingLanguage.current=command;setPending(command);}
    busy.current=true;setSaving(true);setState(null);setError(null);setMessage('');request.current?.abort();const controller=new AbortController();request.current=controller;let received=false;
    try{
      const result=await transport.setCommunicationLanguage(command.id,command.body,command.key,controller.signal);received=true;
      const current=await transport.communicationLanguage(command.id,controller.signal);
      if(current.revision<result.receipt.revision)throw new IntakeError('unavailable');
      if(!active.current || controller.signal.aborted)return;
      transport.pendingLanguage.current=null;setPending(null);setFresh(null);setChoice('');setClearing(false);
      if(selected.current?.id===command.id)setState(current);
      setMessage(`${result.receipt.changed?'Langue consignée.':'Aucun changement nécessaire.'} État actuel relu : ${label(current.language)}. ${transport.mode==='demo'?'Simulation locale uniquement.':''}`);
    }catch(failure){
      if(!active.current || controller.signal.aborted)return;const kind=failure instanceof IntakeError?failure.kind:'unavailable';
      if(['offline','denied','expired','missing'].includes(kind)){transport.clearPrivate(kind);return;}
      if(!received && (kind==='conflict' || (!verifying && ['disabled','invalid'].includes(kind)))){transport.pendingLanguage.current=null;setPending(null);setFresh(null);setConflict(kind==='conflict');setError(kind);setMessage(messages[kind]);}
      else setMessage(kind==='disabled'?'Vérification désactivée dans cet environnement. Le résultat initial reste incertain ; la commande exacte est conservée.':'Résultat à vérifier : aucune réussite annoncée. La même demande, la même valeur et la même clé seront reprises, puis l’état actuel sera relu.');
    }finally{if(active.current && request.current===controller){busy.current=false;setSaving(false);}}
  }
  const visible=state?.inquiry_id===inquiry?.id && owned?state:null;
  if(!owned && !pending && !error)return null;
  return <section className="communication-language" aria-label="Langue de communication déclarée">
    <div className="communication-language-heading"><MessageSquareText size={20}/><h3>Langue</h3></div>
    <p className="communication-language-boundary">{boundary}</p>
    {loading && !open?<p role="status" className="communication-language-status"><LoaderCircle size={17} className="intake-spin"/>Lecture de la langue…</p>:error && !open?<div role="status" className="communication-language-status"><p>{messages[error]}</p>{owned && !['offline','denied','expired','missing'].includes(error)&&<Button onClick={()=>inquiry && void read(inquiry,false)} disabled={!online}>Relire la langue</Button>}</div>:visible?<div className="communication-language-value"><span>État actuellement lu</span><strong>{label(visible.language)}</strong>{visible.updated_at&&<small>Mis à jour le <time dateTime={visible.updated_at}>{timestamp(visible.updated_at)}</time> · {zone}</small>}</div>:null}
    {(owned || pending)&&<Button onClick={start} disabled={!online || saving}><MessageSquareText size={17}/>{pending?'Vérifier la langue':'Consigner une langue'}</Button>}
    <Modal open={open} onOpenChange={next=>{if(!busy.current && !next)close();}} title="Consigner une langue" description={boundary}>
      <form className="communication-language-form" onSubmit={submit} aria-busy={loading || saving}>
        <div className="communication-language-target"><ShieldCheck size={21}/><div><strong>{targetName}</strong><small>{transport.mode==='demo'?'Simulation synthétique · mémoire temporaire':'Responsable actuel · cabinet vérifié'}</small></div></div>
        {loading&&<p role="status"><LoaderCircle size={18} className="intake-spin"/>Lecture de la valeur actuelle…</p>}
        {message&&<p ref={feedback} tabIndex={-1} role="status" className="communication-language-feedback">{message}</p>}
        {error&&!message&&<p role="status" className="communication-language-feedback">{messages[error]}</p>}
        {pending?<div className="communication-language-value"><span>Commande initiale conservée en session</span><strong>{pending.body.language===null?'Effacer la langue consignée':label(pending.body.language)}</strong><small>Aucune modification possible avant vérification. Aucun envoi automatique.</small></div>:fresh&&<>
          <div className="communication-language-value"><span>Langue actuellement consignée</span><strong>{label(fresh.language)}</strong></div>
          <fieldset disabled={saving || loading}>
            <label htmlFor={`${id}-choice`}>Langue explicitement indiquée par le contact</label>
            <select id={`${id}-choice`} value={choice} disabled={clearing} onChange={event=>{setChoice(event.target.value);setMessage('');}}><option value="">Choisir une langue</option><option value="fr">Français</option><option value="ar">Arabe</option><option value="en">Anglais</option><option value="other">Autre langue — sans détail enregistré</option><option value="no_preference">Sans préférence linguistique — explicitement déclaré</option></select>
            {(choice==='no_preference'||choice==='other')&&<p className="communication-language-help">Choix : {labels[choice as InquiryCommunicationLanguage]}.</p>}
            <p className="communication-language-help">Ni le nom, ni le navigateur, ni la source ne préremplissent ce choix.</p>
            <label className="communication-language-clear"><input type="checkbox" checked={clearing} onChange={event=>{setClearing(event.target.checked);setChoice('');setMessage('');}}/><span>Effacer la langue consignée</span></label>
            {clearing&&<p className="communication-language-help">Effacement administratif uniquement. Ce n’est ni un retrait de consentement ni une instruction de ne pas contacter.</p>}
            <p className="communication-language-help">Aucune traduction, évaluation clinique ou disponibilité d’interprète n’est déduite de ce choix.</p>
          </fieldset>
        </>}
        <div className="communication-language-actions"><Button type="button" onClick={close} disabled={saving}>Fermer</Button>{!pending && (conflict || (error && !fresh))?<Button type="button" onClick={start} disabled={!online || loading}><RefreshCw size={17}/>Relire l’état actuel</Button>:<Button type="submit" variant="primary" disabled={saving || loading || !online || (!pending && (!fresh || (!choice && !clearing)))}>{saving?'Vérification en cours…':pending?'Vérifier l’enregistrement':'Consigner la langue'}</Button>}</div>
      </form>
    </Modal>
  </section>;
}

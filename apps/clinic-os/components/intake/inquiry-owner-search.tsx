'use client';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { InquiryOwnerSearchPageRequestSchema, type Inquiry, type InquiryOwnerSearchPageResult, type InquiryOwnerSearchPageRequest } from '@dental/contracts';
import { Button } from '@dental/ui-clinic';
import { ArrowUpRight, CalendarClock, LoaderCircle, Search, ShieldCheck, X } from 'lucide-react';
import { IntakeError, type IntakeFailure, type IntakeTransport } from './transport';
import './inquiry-owner-search.css';
const sources = { phone: 'Téléphone', website: 'Site web', whatsapp: 'WhatsApp', instagram: 'Instagram', email: 'E-mail', google_business: 'Google Business', walk_in: 'Sur place', other: 'Autre' };
const messages: Record<IntakeFailure,string> = {
  invalid: 'Saisissez un nom de 2 à 80 caractères, sans caractères de contrôle.',
  unavailable: 'La réponse n’a pas pu être vérifiée. Réessayez la recherche.',
  disabled: 'Recherche momentanément indisponible. Aucun résultat vérifié.',
  conflict: 'Lecture indisponible. Relancez une recherche.',
  denied: 'Accès refusé. La recherche et le détail privé ont été effacés.',
  expired: 'Session expirée. Connectez-vous à nouveau.',
  offline: 'Hors connexion. La recherche et le détail privé ont été effacés. Aucun envoi en arrière-plan.',
  missing: 'Demande absente, réattribuée ou inaccessible. Relancez une recherche autorisée.',
};
const date = (value: string) => new Intl.DateTimeFormat('fr-MA',{ dateStyle:'medium',timeStyle:'short' }).format(new Date(value));
export function InquiryOwnerSearch({ transport, resetRevision, onInvalidate, onSelected }: { transport: IntakeTransport; resetRevision: number; onInvalidate: () => void; onSelected: (item: Inquiry) => void }) {
  const id = useId(); const [name,setName] = useState(''); const [data,setData] = useState<InquiryOwnerSearchPageResult|null>(null);
  const [loading,setLoading] = useState(false); const [opening,setOpening] = useState(false); const [error,setError] = useState<IntakeFailure|null>(null); const [retryId,setRetryId] = useState<string|null>(null);
  const [online,setOnline] = useState(true); const [zone,setZone] = useState('heure locale');
  const active = useRef(false); const request = useRef<AbortController|null>(null); const callbacks = useRef({onInvalidate,onSelected}); callbacks.current = {onInvalidate,onSelected};
  const input = useRef<HTMLInputElement>(null); const root=useRef<HTMLElement>(null); const resultsHeading=useRef<HTMLHeadingElement>(null); const feedback=useRef<HTMLDivElement>(null);
  const [attempt,setAttempt]=useState<InquiryOwnerSearchPageRequest|null>(null);const focusWanted=useRef(false);const focusOrigin=useRef<Element|null>(null);
  useEffect(()=>{const moved=(event:FocusEvent)=>{if(event.target!==document.body&&event.target!==focusOrigin.current)focusWanted.current=false;};document.addEventListener('focusin',moved);return()=>document.removeEventListener('focusin',moved);},[]);
  useEffect(()=>{if(loading||opening||!focusWanted.current)return;const target=error?feedback.current:data?resultsHeading.current:null;if(target){focusWanted.current=false;target.focus();}},[loading,opening,error,data]);
  function reset() { request.current?.abort(); setData(null); setLoading(false); setOpening(false); setRetryId(null); setAttempt(null); }
  useEffect(() => {
    active.current = true; setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const off = transport.onPrivateClear(kind => { reset(); setName(''); setError(kind); });
    const network = () => { setOnline(navigator.onLine); if (!navigator.onLine) transport.clearPrivate('offline'); }; network();
    window.addEventListener('online',network); window.addEventListener('offline',network);
    return () => { active.current = false; request.current?.abort(); off(); window.removeEventListener('online',network); window.removeEventListener('offline',network); };
  },[transport]);
  useEffect(() => { reset(); setName(''); setError(navigator.onLine ? null : 'offline'); },[resetRevision,transport]);
  function edit(value: string) { reset(); setName(value); setError(null); callbacks.current.onInvalidate(); }
  function fail(failure: unknown) { const kind = failure instanceof IntakeError ? failure.kind : 'unavailable'; setError(kind); if (['offline','denied','expired','missing'].includes(kind)) transport.clearPrivate(kind); }
  async function search(event?: FormEvent) {
    event?.preventDefault();const parsed=InquiryOwnerSearchPageRequestSchema.safeParse({name:name.replace(/^ +| +$/gu,''),before:null});
    if(!parsed.success){reset();setError('invalid');input.current?.focus();return;}await readPage(parsed.data);
  }
  async function readPage(body:InquiryOwnerSearchPageRequest){
    focusOrigin.current=document.activeElement;focusWanted.current=Boolean(root.current?.contains(document.activeElement));
    reset();setError(null);callbacks.current.onInvalidate();setName(body.name);setAttempt(body);
    if(!navigator.onLine){transport.clearPrivate('offline');return;}
    const controller=new AbortController();request.current=controller;setLoading(true);
    try{const result=await transport.ownerSearchPage(body,controller.signal);if(active.current&&!controller.signal.aborted)setData(result);}
    catch(failure){if(active.current&&!controller.signal.aborted)fail(failure);}
    finally{if(active.current&&!controller.signal.aborted)setLoading(false);}
  }
  async function openDetail(inquiryId: string) {
    focusOrigin.current=document.activeElement;focusWanted.current=Boolean(root.current?.contains(document.activeElement));
    reset(); setError(null); callbacks.current.onInvalidate(); setRetryId(inquiryId);
    if (!navigator.onLine) { transport.clearPrivate('offline'); return; }
    const controller = new AbortController(); request.current = controller; setOpening(true);
    try { const result = await transport.inquiry(inquiryId,controller.signal); if (active.current && !controller.signal.aborted) { setRetryId(null); callbacks.current.onSelected(result); } }
    catch (failure) { if (active.current && !controller.signal.aborted) fail(failure); }
    finally { if (active.current && !controller.signal.aborted) setOpening(false); }
  }
  return <section ref={root} className="owner-search work-panel" aria-labelledby={`${id}-title`}>
    <header className="owner-search-heading"><span className="owner-search-emblem"><Search size={22}/></span><div><p className="eyebrow muted">RETROUVER LE FIL</p><h2 id={`${id}-title`}>Rechercher dans mes demandes</h2></div><span className="owner-search-scope"><ShieldCheck size={15}/>Vos demandes uniquement</span></header>
    <p className="owner-search-intro">Retrouvez aussi une ancienne demande par son nom, au-delà de la liste récente. {transport.mode === 'demo' ? 'Simulation synthétique en mémoire temporaire.' : 'Recherche dans le cabinet vérifié, pour le responsable connecté.'}</p>
    <form className="owner-search-form" onSubmit={search} noValidate aria-busy={loading}>
      <label htmlFor={`${id}-name`}>Nom de la demande</label><div className="owner-search-controls"><div className="owner-search-input"><Search size={18}/><input ref={input} id={`${id}-name`} value={name} onChange={event => edit(event.target.value)} aria-invalid={error === 'invalid'} aria-describedby={`${id}-help`} placeholder="Au moins 2 caractères…" autoComplete="off" spellCheck={false}/>{name && <button type="button" aria-label="Effacer le nom recherché" onClick={() => {edit('');input.current?.focus();}}><X size={17}/></button>}</div><Button type="submit" variant="primary" disabled={!online || loading || opening}>{loading ? <LoaderCircle size={17} className="intake-spin"/> : <Search size={17}/>}Rechercher mes demandes</Button></div>
      <p id={`${id}-help`} className="owner-search-help">2 à 80 caractères. Recherche littérale dans le nom uniquement ; les accents peuvent distinguer les résultats. Aucun rapprochement de patients.</p>
    </form>
    <p className="owner-search-help">Jusqu’à 50 demandes affichées. Les résultats sont relus à chaque étape et peuvent évoluer.</p>
    {loading || opening ? <p role="status" className="owner-search-state"><LoaderCircle size={19} className="intake-spin"/>{opening ? 'Vérification de l’accès actuel au détail…' : 'Recherche de vos demandes…'}</p> : error ? <div ref={feedback} tabIndex={-1} role="status" className="owner-search-state"><p>{error==='invalid'&&attempt?.before?'Continuation invalide. Recommencez la recherche.':messages[error]}</p>{online && ['unavailable','disabled','conflict'].includes(error) && <Button onClick={() => retryId ? void openDetail(retryId) : attempt ? void readPage(attempt) : void search()}>{retryId ? 'Réessayer le détail recherché' : 'Réessayer ma recherche'}</Button>}{online&&attempt&&<Button onClick={()=>void readPage({name:attempt.name,before:null})}>Recommencer la recherche</Button>}</div> : data && <div className="owner-search-results">
      <h3 ref={resultsHeading} tabIndex={-1} className="owner-search-page-heading">Résultats pour « {data.name} »</h3><p role="status" className="owner-search-count">{data.truncated ? '50+ correspondances dans vos demandes' : `${data.items.length} correspondance${data.items.length > 1 ? 's' : ''} dans cette observation`}</p>
      {data.truncated && <p className="owner-search-help">Liste partielle : 50 résultats affichés, au moins un autre correspond à cette observation. Aucun total exact n’est disponible.</p>}
      {!data.items.length ? <p className="owner-search-state">{data.before?'Aucun résultat supplémentaire retourné pour cette recherche.':'Aucune demande correspondante dans vos demandes. Ce résultat ne prouve ni une absence de patient ni une identité unique.'}</p> : <ul>{data.items.map(item => <li key={item.id}><button type="button" onClick={() => void openDetail(item.id)} aria-label={`Consulter le détail de ${item.display_name}`}><span className="owner-search-initial" aria-hidden="true">{[...item.display_name][0]}</span><span className="owner-search-name"><strong>{item.display_name}</strong><span>{sources[item.source]} · source déclarée</span><small>Créée le <time dateTime={item.created_at}>{date(item.created_at)}</time></small></span><span className="owner-search-date"><CalendarClock size={16}/><span>Échéance enregistrée<strong>{item.follow_up_at ? <time dateTime={item.follow_up_at}>{date(item.follow_up_at)}</time> : 'Sans date'}</strong></span></span><ArrowUpRight size={18}/></button></li>)}</ul>}
      <div className="owner-search-pagination">{data.next_before&&<Button onClick={()=>void readPage({name:data.name,before:data.next_before})}>Afficher les résultats suivants</Button>}{data.before&&<Button onClick={()=>void readPage({name:data.name,before:null})}>Revenir aux premiers résultats</Button>}</div>
      <p className="owner-search-help">Horaires : {zone}. Ouvrir une demande vérifie à nouveau votre accès actuel.</p>
    </div>}
  </section>;
}

'use client';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { InquiryOwnerSearchRequestSchema, type Inquiry, type InquiryOwnerSearchResult } from '@dental/contracts';
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
  const id = useId(); const [name,setName] = useState(''); const [data,setData] = useState<InquiryOwnerSearchResult|null>(null);
  const [loading,setLoading] = useState(false); const [opening,setOpening] = useState(false); const [error,setError] = useState<IntakeFailure|null>(null); const [retryId,setRetryId] = useState<string|null>(null);
  const [online,setOnline] = useState(true); const [zone,setZone] = useState('heure locale');
  const active = useRef(false); const request = useRef<AbortController|null>(null); const callbacks = useRef({onInvalidate,onSelected}); callbacks.current = {onInvalidate,onSelected};
  const input = useRef<HTMLInputElement>(null);
  function reset() { request.current?.abort(); setData(null); setLoading(false); setOpening(false); setRetryId(null); }
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
    event?.preventDefault(); reset(); setError(null); callbacks.current.onInvalidate();
    const body = InquiryOwnerSearchRequestSchema.safeParse({name:name.replace(/^ +| +$/gu,'')});
    if (!body.success) { setError('invalid'); input.current?.focus(); return; }
    setName(body.data.name); if (!navigator.onLine) { transport.clearPrivate('offline'); return; }
    const controller = new AbortController(); request.current = controller; setLoading(true);
    try { const result = await transport.ownerSearch(body.data,controller.signal); if (active.current && !controller.signal.aborted) setData(result); }
    catch (failure) { if (active.current && !controller.signal.aborted) fail(failure); }
    finally { if (active.current && !controller.signal.aborted) setLoading(false); }
  }
  async function openDetail(inquiryId: string) {
    reset(); setError(null); callbacks.current.onInvalidate(); setRetryId(inquiryId);
    if (!navigator.onLine) { transport.clearPrivate('offline'); return; }
    const controller = new AbortController(); request.current = controller; setOpening(true);
    try { const result = await transport.inquiry(inquiryId,controller.signal); if (active.current && !controller.signal.aborted) { setRetryId(null); callbacks.current.onSelected(result); } }
    catch (failure) { if (active.current && !controller.signal.aborted) fail(failure); }
    finally { if (active.current && !controller.signal.aborted) setOpening(false); }
  }
  return <section className="owner-search work-panel" aria-labelledby={`${id}-title`}>
    <header className="owner-search-heading"><span className="owner-search-emblem"><Search size={22}/></span><div><p className="eyebrow muted">RETROUVER LE FIL</p><h2 id={`${id}-title`}>Rechercher dans mes demandes</h2></div><span className="owner-search-scope"><ShieldCheck size={15}/>Vos demandes uniquement</span></header>
    <p className="owner-search-intro">Retrouvez aussi une ancienne demande par son nom, au-delà de la liste récente. {transport.mode === 'demo' ? 'Simulation synthétique en mémoire temporaire.' : 'Recherche dans le cabinet vérifié, pour le responsable connecté.'}</p>
    <form className="owner-search-form" onSubmit={search} noValidate aria-busy={loading}>
      <label htmlFor={`${id}-name`}>Nom de la demande</label><div className="owner-search-controls"><div className="owner-search-input"><Search size={18}/><input ref={input} id={`${id}-name`} value={name} onChange={event => edit(event.target.value)} aria-invalid={error === 'invalid'} aria-describedby={`${id}-help`} placeholder="Au moins 2 caractères…" autoComplete="off" spellCheck={false}/>{name && <button type="button" aria-label="Effacer le nom recherché" onClick={() => {edit('');input.current?.focus();}}><X size={17}/></button>}</div><Button type="submit" variant="primary" disabled={!online || loading || opening}>{loading ? <LoaderCircle size={17} className="intake-spin"/> : <Search size={17}/>}Rechercher mes demandes</Button></div>
      <p id={`${id}-help`} className="owner-search-help">2 à 80 caractères. Recherche littérale dans le nom uniquement ; les accents peuvent distinguer les résultats. Aucun rapprochement de patients.</p>
    </form>
    {loading || opening ? <p role="status" className="owner-search-state"><LoaderCircle size={19} className="intake-spin"/>{opening ? 'Vérification de l’accès actuel au détail…' : 'Recherche de vos demandes…'}</p> : error ? <div role="status" className="owner-search-state"><p>{messages[error]}</p>{online && ['unavailable','disabled','conflict'].includes(error) && <Button onClick={() => retryId ? void openDetail(retryId) : void search()}>{retryId ? 'Réessayer le détail recherché' : 'Réessayer ma recherche'}</Button>}</div> : data && <div className="owner-search-results">
      <p role="status" className="owner-search-count">{data.truncated ? '50+ correspondances dans vos demandes' : `${data.items.length} correspondance${data.items.length > 1 ? 's' : ''} dans vos demandes`}</p>
      {data.truncated && <p className="owner-search-help">Liste partielle : les 50 plus récentes sont affichées. Précisez le nom pour affiner ; aucun total exact n’est disponible.</p>}
      {!data.items.length ? <p className="owner-search-state">Aucune demande correspondante dans vos demandes. Ce résultat ne prouve ni une absence de patient ni une identité unique.</p> : <ul>{data.items.map(item => <li key={item.id}><button type="button" onClick={() => void openDetail(item.id)} aria-label={`Consulter le détail de ${item.display_name}`}><span className="owner-search-initial" aria-hidden="true">{[...item.display_name][0]}</span><span className="owner-search-name"><strong>{item.display_name}</strong><span>{sources[item.source]} · source déclarée</span><small>Créée le <time dateTime={item.created_at}>{date(item.created_at)}</time></small></span><span className="owner-search-date"><CalendarClock size={16}/><span>Échéance enregistrée<strong>{item.follow_up_at ? <time dateTime={item.follow_up_at}>{date(item.follow_up_at)}</time> : 'Sans date'}</strong></span></span><ArrowUpRight size={18}/></button></li>)}</ul>}
      <p className="owner-search-help">Horaires : {zone}. Ouvrir une demande vérifie à nouveau votre accès actuel.</p>
    </div>}
  </section>;
}

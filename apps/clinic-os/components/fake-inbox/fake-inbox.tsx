'use client';
import {sessionFetch as fetch} from '../../lib/renewing-session';


import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Inbox, MessageCircle, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { DemoFakeInboxListSchema, type DemoFakeInboxItem } from '@dental/contracts';
import './fake-inbox.css';

type Props = { api: string; token: string; clinicId: string; onSessionExpired: () => void };
function stamp(value: string) {
  return new Intl.DateTimeFormat('fr-MA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Casablanca' }).format(new Date(value));
}
const dayOf=(value:string)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));

export function FakeInbox({ api, token, clinicId, onSessionExpired }: Props) {
  const [items, setItems] = useState<DemoFakeInboxItem[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const messageList = useRef<HTMLOListElement>(null);
  const readingPositions = useRef(new Map<string, number>());
  const conversationOpener = useRef<HTMLButtonElement | null>(null);

  const conversations = useMemo(() => {
    const grouped = new Map<string, DemoFakeInboxItem[]>();
    for (const item of items) grouped.set(item.conversation_ref, [...(grouped.get(item.conversation_ref) ?? []), item]);
    return [...grouped.entries()].map(([ref, messages]) => ({
      ref,
      messages: messages.sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at) || a.sequence - b.sequence),
      latestAt: Math.max(...messages.map(message => Date.parse(message.received_at))),
    })).sort((a, b) => b.latestAt - a.latestAt);
  }, [items]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('fr');
    return conversations.filter(conversation => !needle || `${conversation.ref} ${conversation.messages.map(message => `${message.message_ref} ${message.text}`).join(' ')}`.toLocaleLowerCase('fr').includes(needle));
  }, [conversations, query]);
  const selected = filtered.find(conversation => conversation.ref === selectedRef) ?? filtered[0] ?? null;

  useLayoutEffect(() => {
    const list = messageList.current;
    if (!list || !selected || list.clientHeight === 0) return;
    // Open at the latest event; returning to an older reading position preserves it.
    list.scrollTop = readingPositions.current.get(selected.ref) ?? list.scrollHeight;
  }, [selected?.ref, mobileDetail]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${api}/api/v1/communications/demo-inbox`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Clinic-Id': clinicId },
        cache: 'no-store',
        ...(signal ? { signal } : { signal: AbortSignal.timeout(15000) }),
      });
      if (response.status === 401) { setItems([]); onSessionExpired(); return; }
      if (!response.ok) throw new Error('request-failed');
      const parsed = DemoFakeInboxListSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error('invalid-response');
      setItems(parsed.data.items);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError('La boîte locale est momentanément indisponible. Réessayez sans perdre votre sélection de cabinet.');
      setItems([]);
    } finally { setBusy(false); }
  }, [api, token, clinicId, onSessionExpired]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  return <section className="fake-inbox" aria-labelledby="fake-inbox-title" aria-busy={busy}>
    <header className="fake-inbox-heading">
      <div className="fake-inbox-title"><span className="fake-inbox-title-icon"><MessageCircle size={23}/></span><div><h2 id="fake-inbox-title">Boîte de réception</h2><p>{conversations.length} conversation{conversations.length===1?'':'s'} · historique du cabinet</p></div></div>
      <div className="fake-inbox-heading-actions"><details className="fake-inbox-provenance"><summary><ShieldCheck size={14}/>Simulation · lecture seule</summary><p>Messages fictifs conservés dans la base locale du cabinet. Aucun canal réel, envoi, état de lecture ou dossier patient associé.</p></details><button type="button" onClick={() => void refresh()} disabled={busy} aria-label="Actualiser les messages" title="Actualiser les messages"><RefreshCw size={17} className={busy?'fake-inbox-refreshing':undefined}/></button></div>
    </header>

    {error && <p className="fake-inbox-error" role="alert">{error}<button type="button" onClick={() => void refresh()} disabled={busy}>Réessayer</button></p>}
    {!error && busy && items.length===0 && <div className="fake-inbox-state" role="status"><span className="fake-inbox-spinner"/><span>Chargement des événements locaux…</span></div>}
    {!error && !busy && items.length === 0 && <div className="fake-inbox-empty"><span className="fake-inbox-empty-icon"><Inbox size={22}/></span><div><strong>Aucun message de simulation pour ce cabinet</strong><p>Les prochains événements synthétiques apparaîtront ici après leur réception.</p></div></div>}

    {!error && items.length > 0 && <div className="fake-inbox-layout" data-mobile-detail={mobileDetail&&!!selected}>
        <section className="fake-inbox-directory" aria-label="Répertoire des conversations">
        <header><h3>Conversations</h3><span aria-live="polite">{filtered.length}</span></header>
        <label className="fake-inbox-search"><Search size={17}/><input aria-label="Rechercher dans les conversations locales" value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher un message…"/>{query&&<button type="button" aria-label="Effacer la recherche" onClick={()=>setQuery('')}><X size={15}/></button>}</label>
        <nav className="fake-inbox-list" aria-label="Conversations de simulation">
          {filtered.map(conversation => <button key={conversation.ref} type="button" aria-pressed={selected?.ref === conversation.ref} onClick={event => {conversationOpener.current=event.currentTarget;setSelectedRef(conversation.ref);setMobileDetail(true);requestAnimationFrame(()=>detailHeading.current?.focus({preventScroll:true}));}}>
            <span className="fake-inbox-conversation-icon"><MessageCircle size={18}/></span>
            <span className="fake-inbox-conversation-copy"><strong>{conversation.ref.replace('DEMO-CHAT-', 'Conversation ')}</strong><span>{conversation.messages.at(-1)?.text}</span><small>{conversation.messages.length} {conversation.messages.length === 1 ? 'événement' : 'événements'} · {stamp(new Date(conversation.latestAt).toISOString())}</small></span>
          </button>)}
          {filtered.length === 0 && <div className="fake-inbox-no-results"><Search size={19}/><strong>Aucun résultat</strong><span>Essayez une autre référence ou expression.</span><button type="button" onClick={() => setQuery('')}>Effacer la recherche</button></div>}
        </nav>
        <footer>{items.length} événements conservés</footer>
        </section>
        <section className="fake-inbox-detail" aria-label="Détail de la conversation sélectionnée">
          {selected ? <>
            <header><button className="fake-inbox-mobile-back" type="button" aria-label="Retour aux conversations" onClick={()=>{setMobileDetail(false);requestAnimationFrame(()=>conversationOpener.current?.focus({preventScroll:true}));}}><ArrowLeft size={18}/></button><span className="fake-inbox-conversation-icon"><MessageCircle size={20}/></span><div><h3 tabIndex={-1} ref={detailHeading}>{selected.ref.replace('DEMO-CHAT-', 'Conversation ')}</h3><span>{selected.messages.length} {selected.messages.length === 1 ? 'événement entrant' : 'événements entrants'} · Casablanca</span></div></header>
            <ol key={selected.ref} ref={messageList} onScroll={event=>readingPositions.current.set(selected.ref,event.currentTarget.scrollTop)} tabIndex={0} aria-label="Historique des messages">{selected.messages.map((message,index) => <li key={message.id}>
              {(index===0||dayOf(selected.messages[index-1]!.received_at)!==dayOf(message.received_at))&&<div className="fake-inbox-day-marker"><time dateTime={message.received_at}>{new Intl.DateTimeFormat('fr-MA',{dateStyle:'long',timeZone:'Africa/Casablanca'}).format(new Date(message.received_at))}</time></div>}
              <article className="fake-inbox-message-bubble">
              <div className="fake-inbox-message-meta"><span><ArrowDownLeft size={14}/>Événement entrant</span><time dateTime={message.occurred_at}>{stamp(message.occurred_at)}</time></div>
              <p>{message.text}</p>
              <details className="fake-inbox-message-reference"><summary>Détails de réception</summary><small>Reçu localement le {stamp(message.received_at)} · {message.message_ref}</small></details>
              </article>
            </li>)}</ol>
            <footer><ShieldCheck size={15}/><span>Historique de simulation · aucun envoi disponible</span></footer>
          </> : <div className="fake-inbox-no-results"><ArrowUpRight size={20}/><strong>Sélectionnez une conversation</strong><span>Les événements correspondants s’afficheront ici.</span></div>}
        </section>
      </div>}
  </section>;
}

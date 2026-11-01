'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, CheckCheck, Inbox, MessageCircle, Search, ShieldCheck, Sparkles, X } from 'lucide-react';
import { Button } from '@dental/ui-clinic';
import { demoConversations } from './demo-fixtures';
import './inbox-demo.css';

export function InboxDemo() {
  const [selectedId, setSelectedId] = useState(demoConversations[0]!.id);
  const [unreadIds, setUnreadIds] = useState(() => new Set(demoConversations.filter(item => item.unread).map(item => item.id)));
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [threadOpen, setThreadOpen] = useState(false);
  const threadHeading = useRef<HTMLHeadingElement>(null);
  const selected = demoConversations.find(item => item.id === selectedId)!;
  const filtered = useMemo(() => demoConversations.filter(item => (!unreadOnly || unreadIds.has(item.id)) && `${item.name} ${item.preview}`.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr'))), [query, unreadIds, unreadOnly]);
  const unreadCount = unreadIds.size;
  const hasSelection = filtered.some(item => item.id === selectedId);
  const selectConversation = (id: string) => { setSelectedId(id); setDraft(''); setThreadOpen(true); requestAnimationFrame(() => threadHeading.current?.focus()); };
  const markRead = () => { setUnreadIds(current => { const next = new Set(current); next.delete(selectedId); return next; }); if (unreadOnly) setThreadOpen(false); };

  return <section className="inbox-demo" aria-labelledby="inbox-title">
    <div className="page-heading inbox-heading"><div><p className="eyebrow muted">ÉCHANGES ADMINISTRATIFS</p><h1 id="inbox-title">Boîte de réception</h1><p>Des exemples de conversations pour préparer le suivi du cabinet.</p></div><span className="pill inbox-demo-pill"><Sparkles size={14}/>Simulation locale</span></div>
    <div className="inbox-connected-invite"><div><strong>Messagerie du cabinet</strong><span>Historique local · accès réservé à l’équipe</span></div><Button asChild variant="primary"><Link href="/connection?view=inbox">Ouvrir la boîte connectée</Link></Button></div>
    <div className="inbox-boundary"><ShieldCheck size={19}/><p><strong>Canal fictif · non connecté</strong><span>Exemples uniquement · aucun message reçu ou envoyé.</span></p><details><summary>À savoir</summary><p>Aucun compte WhatsApp relié, aucun contact réel. Les exemples ne sont pas liés à des dossiers patients et sont réinitialisés au rechargement.</p></details></div>
    <div className={`inbox-layout ${threadOpen && hasSelection ? 'inbox-show-thread' : ''}`}>
      <section className="work-panel inbox-list-panel" aria-label="Conversations fictives">
        <div className="inbox-list-header"><div><Inbox size={19}/><h2>Conversations d’exemple</h2></div><span className="inbox-count" aria-label={`${unreadCount} non lues dans la simulation`}>{unreadCount}</span></div>
        <label className="search-field inbox-search"><Search size={17}/><input aria-label="Rechercher dans les conversations fictives" placeholder="Nom ou message…" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button type="button" aria-label="Effacer la recherche" onClick={() => setQuery('')}><X size={15}/></button>}</label>
        <div className="inbox-filter"><button type="button" aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>Toutes <span>{demoConversations.length}</span></button><button type="button" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(value => !value)}>Non lues <span>{unreadCount}</span></button></div>
        {filtered.length ? <div className="inbox-conversation-list">{filtered.map(item => <button key={item.id} type="button" className="inbox-conversation" aria-pressed={selectedId === item.id} onClick={() => selectConversation(item.id)}><span className="inbox-avatar" aria-hidden="true">{item.name.slice(0, 1)}</span><span className="inbox-conversation-copy"><span className="inbox-person"><strong>{item.name}</strong><small>{item.time}</small></span><span className="inbox-preview">{item.preview}</span><small className="inbox-reference">{item.reference}</small></span>{unreadIds.has(item.id) && <span className="inbox-unread-dot" aria-label="Non lue dans la simulation"/>}</button>)}</div> : <div className="inbox-empty"><Inbox size={21}/><strong>Aucun exemple trouvé</strong><span>Modifiez votre recherche ou le filtre.</span><Button variant="ghost" onClick={() => { setQuery(''); setUnreadOnly(false); }}>Réinitialiser</Button></div>}
      </section>
      <section className="work-panel inbox-thread-panel" aria-label="Détail de la conversation fictive">
        {hasSelection ? <>
          <button type="button" className="inbox-back" onClick={() => { setThreadOpen(false); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.inbox-conversation[aria-pressed="true"]')?.focus()); }}><ArrowLeft size={17}/>Conversations</button>
          <header className="inbox-thread-header"><span className="inbox-avatar large" aria-hidden="true">{selected.name.slice(0, 1)}</span><div><h2 ref={threadHeading} tabIndex={-1}>{selected.name}</h2><p>{selected.reference}</p></div><span className="inbox-thread-tag">Exemple</span></header>
          <div className="inbox-thread-notice"><MessageCircle size={16}/><span>Conversation inventée · statuts opérateur indisponibles</span></div>
          <div className="inbox-messages" aria-label="Messages d’exemple">{selected.messages.map(message => <article key={message.id} className={`inbox-message ${message.direction}`}><span>{message.direction === 'incoming' ? 'Exemple entrant' : 'Réponse illustrative · non envoyée'}</span><p>{message.text}</p><time>{message.time}</time></article>)}</div>
          {unreadIds.has(selectedId) && <Button className="inbox-read-button" variant="ghost" onClick={markRead}><CheckCheck size={16}/>Marquer comme lu · simulation</Button>}
          <div className="inbox-composer"><label htmlFor="inbox-draft">Brouillon administratif</label><textarea id="inbox-draft" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Rédiger un exemple de réponse…" rows={3}/><div className="inbox-composer-footer"><span>{draft ? 'Brouillon conservé en mémoire pour cette session.' : 'Rien n’est enregistré ni transmis.'}</span>{draft && <button type="button" onClick={() => setDraft('')}><X size={14}/>Effacer</button>}</div><div className="inbox-send-boundary"><Check size={15}/><span>Envoi désactivé dans la démo. Vérifiez le contenu avant tout usage réel.</span></div></div>
        </> : <div className="inbox-empty thread-empty"><MessageCircle size={24}/><strong>Sélectionnez un exemple</strong><span>La conversation s’affichera ici sans être reliée à un patient.</span></div>}
      </section>
    </div>
    <p className="inbox-footnote">Cette simulation ne stocke ni coordonnées, ni texte de conversation. Recharger la page restaure les exemples initiaux.</p>
  </section>;
}

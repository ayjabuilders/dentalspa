'use client';

import { useState } from 'react';
import { Check, HeartHandshake, MessageSquareText, RotateCcw, Search, ShieldCheck, Clock3, CheckCircle2 } from 'lucide-react';
import './aftercare-demo.css';

type FollowUpStatus = 'pending' | 'attempted' | 'response' | 'escalated' | 'completed';
type Scenario = { id: string; name: string; purpose: string; due: string; initial: FollowUpStatus; privateFeedback: string };

const scenarios: Scenario[] = [
  { id: 'DEMO-001', name: 'Salma Alaoui', purpose: 'Rappel administratif demandé', due: 'Aujourd’hui · 14:00', initial: 'pending', privateFeedback: 'Retour privé fictif · 2/5' },
  { id: 'DEMO-002', name: 'Youssef Benali', purpose: 'Vérifier si le patient souhaite être recontacté', due: 'Demain · 10:30', initial: 'attempted', privateFeedback: 'Retour privé fictif · 5/5' },
  { id: 'DEMO-003', name: 'Imane El Idrissi', purpose: 'Réponse reçue · transmission à vérifier', due: 'Aujourd’hui · 16:15', initial: 'response', privateFeedback: 'Aucun retour fourni dans cet exemple' },
  { id: 'DEMO-004', name: 'Mehdi Amrani', purpose: 'Demande à transmettre à l’équipe autorisée', due: 'À revoir · sans échéance clinique', initial: 'escalated', privateFeedback: 'Retour privé fictif · 3/5' },
];

const statusLabels: Record<FollowUpStatus, string> = {
  pending: 'À faire', attempted: 'Contact simulé', response: 'Réponse reçue · démo', escalated: 'À transmettre · démo', completed: 'Terminé · démo',
};

export function DemoAftercareWorkspace() {
  const [statuses, setStatuses] = useState(() => Object.fromEntries(scenarios.map(item => [item.id, item.initial])) as Record<string, FollowUpStatus>);
  const [showInvitation, setShowInvitation] = useState(false);
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState<'all'|'open'|'completed'>('all');
  const completed=scenarios.filter(item=>statuses[item.id]==='completed').length;
  const visible=scenarios.filter(item=>(filter==='all'||(filter==='completed'?statuses[item.id]==='completed':statuses[item.id]!=='completed'))&&`${item.name} ${item.purpose}`.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr')));

  function reset() {
    setStatuses(Object.fromEntries(scenarios.map(item => [item.id, item.initial])) as Record<string, FollowUpStatus>);
    setShowInvitation(false);
    setQuery('');setFilter('all');
  }

  return <div className="aftercare-demo">
    <header className="aftercare-demo-heading">
      <div><p className="eyebrow muted">CONTINUITÉ · SUIVI FICTIF</p><h1>Suivi & retours</h1><p>Visualisez des exemples de suivi administratif, sans protocole clinique.</p></div>
      <button type="button" className="aftercare-demo-reset" onClick={reset}><RotateCcw size={15}/>Réinitialiser la démo</button>
    </header>

    <div className="aftercare-demo-banner" role="note"><strong>Parcours entièrement fictif</strong><span>Aucun appel, rappel, avis ou message n’est envoyé. Ces changements restent en mémoire et disparaissent au rechargement.</span></div>

    <div className="aftercare-overview" role="group" aria-label="Filtrer les suivis"><button type="button" aria-pressed={filter==='all'} onClick={()=>setFilter('all')}><HeartHandshake size={20}/><span>Tous les suivis<strong>{scenarios.length}</strong></span></button><button type="button" aria-pressed={filter==='open'} onClick={()=>setFilter('open')}><Clock3 size={20}/><span>À poursuivre<strong>{scenarios.length-completed}</strong></span></button><button type="button" aria-pressed={filter==='completed'} onClick={()=>setFilter('completed')}><CheckCircle2 size={20}/><span>Terminés · démo<strong>{completed}</strong></span></button></div>
    <div className="aftercare-workspace">
    <section className="aftercare-demo-panel" aria-labelledby="aftercare-follow-ups-title">
      <div className="aftercare-demo-section-heading"><span className="aftercare-demo-icon"><HeartHandshake size={19}/></span><div><p className="eyebrow muted">FILE ADMINISTRATIVE DE DÉMONSTRATION</p><h2 id="aftercare-follow-ups-title">Suivis de quatre scénarios marocains</h2></div></div>
      <label className="aftercare-search"><Search size={18}/><input aria-label="Rechercher un suivi" placeholder="Nom ou objet du suivi…" value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <div className="aftercare-demo-list">{visible.map(item => <article className="aftercare-demo-card" key={item.id}>
        <div className="aftercare-demo-card-main"><div><p className="aftercare-demo-name">{item.name}<small>{item.id} · profil synthétique</small></p><p className="aftercare-demo-purpose">{item.purpose}</p></div><span className="aftercare-demo-due">{item.due}</span></div>
        <label htmlFor={`aftercare-status-${item.id}`}>État illustratif</label>
        <select id={`aftercare-status-${item.id}`} value={statuses[item.id]} onChange={event => setStatuses(current => ({ ...current, [item.id]: event.target.value as FollowUpStatus }))}>
          {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <div className="aftercare-demo-feedback"><MessageSquareText size={15}/><span>{item.privateFeedback}</span></div>
      </article>)}</div>
      {visible.length===0&&<div className="empty-state"><Search/><h3>Aucun suivi dans cette vue</h3><button className="aftercare-demo-reset" onClick={()=>{setQuery('');setFilter('all');}}>Réinitialiser les filtres</button></div>}
      <p className="panel-note">{visible.length} suivi(s) affiché(s) · état conservé pendant cette visite.</p>
    </section>
    <section className="aftercare-demo-review" aria-labelledby="aftercare-review-title">
      <div className="aftercare-demo-section-heading"><span className="aftercare-demo-icon"><ShieldCheck size={19}/></span><div><p className="eyebrow muted">INVITATION VOLONTAIRE · APERÇU NEUTRE</p><h2 id="aftercare-review-title">Même invitation, quel que soit le retour privé</h2></div></div>
      <p>Les exemples affichent des retours privés différents. Le texte d’invitation reste identique; aucune note ne déclenche ni ne bloque une invitation.</p>
      <button type="button" className="aftercare-demo-invite" onClick={() => setShowInvitation(value => !value)}><Check size={16}/>{showInvitation ? 'Masquer l’aperçu neutre' : 'Voir l’aperçu neutre'}</button>
      {showInvitation && <div className="aftercare-demo-invitation" role="status"><strong>Invitation fictive · non envoyée</strong><span>« Si vous le souhaitez, vous pouvez partager votre expérience. Votre avis est libre et facultatif. »</span><small>Texte d’exemple non validé par la clinique; aucun lien externe ni envoi n’est actif.</small></div>}
    </section>

    </div>
    <p className="aftercare-demo-footnote">Aucune instruction clinique, urgence, diagnostic ou décision de soin n’est généré. Les statuts d’un vrai suivi devront refléter une action confirmée par un membre autorisé.</p>
  </div>;
}

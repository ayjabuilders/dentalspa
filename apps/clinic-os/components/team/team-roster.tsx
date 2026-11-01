'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@dental/ui-clinic';
import {Badge,Pagination} from '@dental/ui-clinic/pearl';
import { Users, ShieldCheck, Search, X, RefreshCw, LoaderCircle, LockKeyhole, ListFilter, History } from 'lucide-react';
import type { TeamRoster } from '@dental/contracts';
import { createDemoTeamTransport, TeamError, type TeamTransport, type TeamFailure } from './transport';
import './team-roster.css';
import { TeamActivityPanel } from './team-activity';
import { TeamAssignmentPreview } from './team-assignment-preview';
import { TeamApprovalPreview } from './team-approval-preview';
import { TeamDelegationPreview } from './team-delegation-preview';
import { TeamAccessDecisionPreview } from './team-access-decision-preview';
const roles: Record<string, string> = { assistant: 'Assistant', dentist: 'Dentiste', manager: 'Gestionnaire', reception: 'Accueil' };
const failures: Record<TeamFailure, { title: string; detail: string }> = {
  denied: { title: 'Annuaire non autorisé', detail: 'Cet annuaire nécessite un accès actif Gestionnaire ou Dentiste dans ce cabinet.' },
  expired: { title: 'Session expirée', detail: 'Connectez-vous à nouveau pour consulter les membres du cabinet.' },
  offline: { title: 'Vous êtes hors connexion', detail: 'Les membres ont été retirés de cet écran. Retrouvez le réseau puis réessayez.' },
  unavailable: { title: 'Annuaire indisponible', detail: 'La réponse du cabinet n’a pas pu être vérifiée. Réessayez dans un instant.' },
};
export function DemoTeamRoster() { const [transport] = useState(createDemoTeamTransport); return <TeamRosterView transport={transport}/>; }
export function TeamRosterView({ transport, onSessionExpired }: { transport: TeamTransport; onSessionExpired?: () => void }) {
  const [rosterAuthorityDenied, setRosterAuthorityDenied] = useState(false);
  const [roster, setRoster] = useState<TeamRoster | null>(null); const [loading, setLoading] = useState(true);
  const [error, setError] = useState<TeamFailure | null>(null); const [query, setQuery] = useState(''); const [role, setRole] = useState('all');
  const [view,setView]=useState<'members'|'activity'>('members'),[page,setPage]=useState(1);
  const [online, setOnline] = useState(true); const [zone, setZone] = useState('heure de cet appareil');
  const active = useRef(true); const request = useRef<AbortController | null>(null); const disposed = useRef(false);
  const expires = useRef(onSessionExpired); expires.current = onSessionExpired; const heading = useRef<HTMLHeadingElement>(null);
  function clear() { setRoster(null); setQuery(''); setRole('all'); setPage(1); }
  async function load() {
    request.current?.abort(); clear(); setError(null);
    if (disposed.current) { setLoading(false); setError('expired'); return; }
    if (!navigator.onLine) { setLoading(false); setError('offline'); return; }
    const controller = new AbortController(); request.current = controller; setLoading(true);
    try {
      const result = await transport.roster(controller.signal);
      if (active.current && !controller.signal.aborted && !disposed.current) { setRoster(result); setRosterAuthorityDenied(false); }
    } catch (error) {
      if (!active.current || controller.signal.aborted || disposed.current) return;
      const kind = error instanceof TeamError ? error.kind : 'unavailable'; clear(); setError(kind);
      if (kind === 'denied') setRosterAuthorityDenied(true);
      if (kind === 'expired') expires.current?.();
    } finally { if (active.current && !controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => {
    active.current = true; disposed.current = false; setRosterAuthorityDenied(false);
    const offDispose = transport.onDispose(() => { disposed.current = true; request.current?.abort(); if (active.current) { clear(); setLoading(false); setError('expired'); } });
    const network = () => { setOnline(navigator.onLine); if (!navigator.onLine) { request.current?.abort(); clear(); setLoading(false); setError('offline'); } };
    network(); setZone(Intl.DateTimeFormat().resolvedOptions().timeZone); void load();
    if (transport.mode === 'connected') heading.current?.focus();
    window.addEventListener('offline', network); window.addEventListener('online', network);
    return () => { active.current = false; request.current?.abort(); offDispose(); window.removeEventListener('offline', network); window.removeEventListener('online', network); };
  }, [transport]);
  const visible = roster?.members.filter(member => member.display_name.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr')) && (role === 'all' || member.roles.includes(role as typeof member.roles[number]))) ?? [];
  const pages=Math.max(1,Math.ceil(visible.length/10)),currentPage=Math.min(page,pages);
  const observed = roster ? new Intl.DateTimeFormat('fr-MA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(roster.observed_at)) : '';
  return <section className="team-roster" aria-labelledby="team-roster-title">

    <header className="team-roster-heading"><div><p className="eyebrow">LE CABINET · ÉQUIPE</p><h1 id="team-roster-title" ref={heading} tabIndex={-1}>Membres du cabinet</h1><p>Retrouvez votre équipe et ses rôles d’accès.</p></div><Button onClick={()=>void load()} disabled={loading||!online||disposed.current} aria-label="Actualiser les membres"><RefreshCw className={loading?'team-roster-spin':''} size={17}/><span className="team-refresh-label">Actualiser</span></Button></header>
    <div className="team-workspace-tabs" role="group" aria-label="Vue de l’équipe"><button type="button" aria-pressed={view==='members'} onClick={()=>setView('members')}><Users size={17}/>Membres {roster&&<span>{roster.members.length}</span>}</button><button type="button" aria-pressed={view==='activity'} onClick={()=>setView('activity')}><History size={17}/>Activité du cabinet</button></div>
    <div hidden={view!=='members'}><div className="team-role-shortcuts" role="group" aria-label="Filtrer l’équipe par rôle"><button type="button" aria-pressed={role==='all'} disabled={!roster} onClick={()=>{setRole('all');setPage(1);}}>Tous les membres <strong>{roster?.members.length??'—'}</strong></button>{Object.entries(roles).map(([value,label])=><button type="button" key={value} disabled={!roster} aria-pressed={role===value} onClick={()=>{setRole(value);setPage(1);}}>{label}<strong>{roster?.members.filter(member=>member.roles.includes(value as typeof member.roles[number])).length??'—'}</strong></button>)}</div>
    <section className="team-roster-directory" aria-label="Annuaire des membres">
      <div className="team-roster-toolbar"><h2>Annuaire de l’équipe</h2><Badge>Lecture seule</Badge></div>
      <div className="team-roster-filters"><label className="team-roster-search"><Search size={18}/><input aria-label="Rechercher parmi les membres chargés" placeholder="Rechercher un membre…" value={query} onChange={event=>{setQuery(event.target.value);setPage(1);}} disabled={!roster} autoComplete="off"/>{query&&<button aria-label="Effacer la recherche des membres" onClick={()=>{setQuery('');setPage(1);}}><X size={17}/></button>}</label><label className="team-roster-role"><ListFilter size={16}/><select aria-label="Filtrer les rôles d’accès chargés" value={role} onChange={event=>{setRole(event.target.value);setPage(1);}} disabled={!roster}><option value="all">Tous les rôles</option>{Object.entries(roles).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>
      {loading ? <div className="team-roster-empty" role="status"><LoaderCircle className="team-roster-spin" size={29}/><h3>Lecture de l’annuaire…</h3><p>Vérification des membres accessibles dans ce cabinet.</p></div> : error ? <div className="team-roster-empty" role="status"><LockKeyhole size={28}/><h3>{failures[error].title}</h3><p>{failures[error].detail}</p>{error !== 'expired' && <Button disabled={!online} onClick={() => void load()}>Réessayer l’annuaire</Button>}</div> : roster && <>
        {roster.truncated && <p className="team-roster-partial" role="status">Annuaire partiel : 100 membres chargés, au moins un autre existe. Le filtre ne parcourt pas les membres non chargés.</p>}
        {!roster.members.length ? <div className="team-roster-empty" role="status"><Users size={28}/><h3>Aucun membre retourné</h3><p>Aucun membre ne figure dans cette observation autorisée.</p></div> : !visible.length ? <div className="team-roster-empty" role="status"><Search size={28}/><h3>Aucun résultat dans la liste chargée</h3><p>Ce filtre ne permet pas de conclure à l’absence d’un membre dans le cabinet.</p><Button onClick={() => { setQuery(''); setRole('all'); }}>Réinitialiser les filtres</Button></div> : <div className="team-roster-list-region" role="region" aria-label="Membres et rôles d’accès" tabIndex={0}><ul className="team-roster-list">{visible.slice((currentPage-1)*10,currentPage*10).map(member => <li key={member.user_id}><span className="team-roster-avatar" aria-hidden="true">{member.display_name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => [...part][0]).join('').toLocaleUpperCase('fr')}</span><div className="team-roster-name"><strong>{member.display_name}</strong><small>Compte du cabinet</small></div><div className="team-roster-roles"><ul aria-label={`Rôles d’accès de ${member.display_name}`}>{member.roles.map(value => <li key={value}><Badge tone={value==='dentist'?'success':value==='manager'?'accent':'neutral'}>{roles[value]}</Badge></li>)}</ul></div></li>)}</ul></div>}

        <div className="team-roster-pagination"><span>{visible.length} résultat(s) · 10 par page</span><Pagination page={currentPage} totalPages={pages} onPageChange={setPage}/></div>
        <p className="team-roster-observation">{roster.members.length} membres chargés · Actualisé le <time dateTime={roster.observed_at}>{observed}</time> · {zone}</p>
      </>}
    </section>
    <details className="team-roster-context"><summary><ShieldCheck size={15}/>{transport.mode==='demo'?'Démonstration synthétique':'À propos des rôles et des accès'}</summary><p>Recherche et compteurs limités aux membres chargés. Un membre peut avoir plusieurs rôles. Les rôles d’accès ne prouvent ni qualification, ni présence, ni éligibilité à une tâche. Le rôle Gestionnaire ne donne aucun droit de signature clinique.</p></details></div>
    <div hidden={view!=='activity'} className="team-activity-workspace"><TeamActivityPanel transport={transport} onSessionExpired={onSessionExpired} rosterAuthorityDenied={rosterAuthorityDenied}/></div>
    {transport.mode === 'demo' && <TeamAccessDecisionPreview/>}
    {transport.mode === 'demo' && roster && !error && <TeamAssignmentPreview members={roster.members}/>}
    {transport.mode === 'demo' && roster && !error && <TeamApprovalPreview/>}
    {transport.mode === 'demo' && roster && !error && <TeamDelegationPreview members={roster.members}/>}
  </section>;
}

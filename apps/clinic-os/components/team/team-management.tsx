'use client';
import { createRequestKey } from '../../lib/request-key';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Modal } from '@dental/ui-clinic';
import { ChevronLeft, ChevronRight, Pencil, Plus, RefreshCw, Search, ShieldCheck, Users, X } from 'lucide-react';
import { CreateTeamAccessMemberSchema, UpdateTeamAccessMemberSchema, type CreateTeamAccessMember, type UpdateTeamAccessMember, type TeamAccessMember } from '@dental/contracts';
import { useConnectedNavigationLock } from '../../lib/connected-navigation';
import { createTeamManagementTransport, sameTeamRoles, validTemporaryTeamPassword, TeamManagementError, teamManagementMessages, type TeamManagementList, type TeamManagementTransport } from './team-management-transport';
import './team-management.css';

type Role = TeamAccessMember['roles'][number];
const roles: Array<{ value: Role; label: string; description: string }> = [
  { value: 'reception', label: 'Accueil', description: 'Accueil des patients, rendez-vous et documents administratifs selon les accès du cabinet.' },
  { value: 'assistant', label: 'Assistant', description: 'Dossier médical, imports et brouillons de comptes rendus. Aucune validation clinique.' },
  { value: 'dentist', label: 'Dentiste', description: 'Accès clinique, rédaction d’ordonnances et validation des documents autorisés.' },
  { value: 'manager', label: 'Gestionnaire', description: 'Gestion administrative, équipe et finances. Ce rôle seul ne donne aucun droit de validation clinique.' },
];
export type TeamManagementProps = { api: string; token: string; clinicId: string; currentUserId?: string; onSessionExpired: () => void; activity?: ReactNode };
export function TeamManagement(props: TeamManagementProps) { return <ManagementWorkspace key={props.clinicId + ':' + props.token} {...props}/>; }
function ManagementWorkspace({ api, token, clinicId, currentUserId, onSessionExpired, activity }: TeamManagementProps) {
  const [view, setView] = useState<'members' | 'activity'>('members');
  const [query, setQuery] = useState(''), [submitted, setSubmitted] = useState(''), [page, setPage] = useState(0), [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [data, setData] = useState<TeamManagementList | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [reload, setReload] = useState(0), [online, setOnline] = useState(true);
  const [editor, setEditor] = useState<{ member?: TeamAccessMember } | null>(null);
  const restoreMember = useRef<string | null>(null);
  const opener = useRef<HTMLElement | null>(null), input = useRef<HTMLInputElement>(null), expire = useRef(onSessionExpired), clear = useRef(() => {});
  expire.current = onSessionExpired; clear.current = () => { setData(null); setEditor(null); setQuery(''); setSubmitted(''); setNotice(''); setError(teamManagementMessages.denied); };
  const transport = useMemo(() => createTeamManagementTransport({ api, token, clinicId, currentUserId, onSessionExpired: () => { clear.current(); expire.current(); }, onAccessDenied: () => clear.current() }), [api, token, clinicId, currentUserId]);
  useConnectedNavigationLock(!!editor);
  const cursor = cursors[page] ?? null;
  useEffect(() => {
    const network = () => { setOnline(navigator.onLine); if (!navigator.onLine) { setData(null); setError(teamManagementMessages.offline); } };
    network(); window.addEventListener('online', network); window.addEventListener('offline', network);
    return () => { window.removeEventListener('online', network); window.removeEventListener('offline', network); };
  }, []);
  useEffect(() => {
    const controller = new AbortController(); let active = true; setData(null); setLoading(online); setError(online ? '' : teamManagementMessages.offline);
    if (online) void transport.list(submitted, cursor, controller.signal).then(result => { if (active) setData(result); }).catch(failure => { if (active) { setData(null); setError(teamManagementMessages[failure instanceof TeamManagementError ? failure.kind : 'unavailable']); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [transport, submitted, cursor, reload, online]);
  useEffect(() => { if (!loading && !editor && restoreMember.current) { const target = document.querySelector<HTMLElement>('[data-team-member="' + restoreMember.current + '"] button:not(:disabled)'); (target ?? document.getElementById('team-management-title'))?.focus({ preventScroll: true }); restoreMember.current = null; } }, [loading, editor, data]);
  function resetPage() { setPage(0); setCursors([null]); }
  function search(event: FormEvent) { event.preventDefault(); setSubmitted(query.trim()); resetPage(); setReload(value => value + 1); }
  function open(member?: TeamAccessMember) { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setEditor({ member }); }
  return <section className="team-management" aria-labelledby="team-management-title">
    <header className="tm-heading"><span className="tm-emblem"><Users size={23}/></span><div><p>LE CABINET · ÉQUIPE</p><h1 id="team-management-title" tabIndex={-1}>Équipe et accès</h1><span>Les comptes du cabinet et leurs rôles.</span></div><button className="tm-icon" aria-label="Actualiser l’équipe" title="Actualiser l’équipe" disabled={loading || !online} onClick={() => setReload(value => value + 1)}><RefreshCw size={18}/></button><button className="tm-primary tm-add" hidden={view !== 'members'} disabled={!data || !online} onClick={() => open()}><Plus size={18}/><span>Ajouter un membre</span></button></header>
    {activity && <div className="tm-view-tabs" role="group" aria-label="Vue de l’équipe"><button aria-pressed={view === 'members'} disabled={!!editor} onClick={() => setView('members')}>Membres et accès</button><button aria-pressed={view === 'activity'} disabled={!!editor} onClick={() => setView('activity')}>Activité du cabinet</button></div>}
    <div hidden={view !== 'members'}><section className="tm-directory" aria-label="Gestion des membres"><div className="tm-directory-heading"><div><h2>Membres du cabinet</h2><p>Comptes actifs et désactivés</p></div><ShieldCheck size={22}/></div>
      <form className="tm-search" onSubmit={search}><label>Rechercher un membre<span><Search size={18}/><input ref={input} value={query} onChange={event => setQuery(event.target.value)} maxLength={100} autoComplete="off" placeholder="Nom ou adresse e-mail…"/>{query && <button className="tm-icon" type="button" aria-label="Effacer la recherche des membres" onClick={() => { setQuery(''); setSubmitted(''); resetPage(); input.current?.focus(); }}><X size={16}/></button>}</span></label><button type="submit" disabled={!online}>Rechercher</button></form>
      <div className="tm-status" role="status" aria-live="polite">{loading ? <p>Lecture de l’équipe autorisée…</p> : error ? <div className="tm-empty"><h3>Équipe indisponible</h3><p>{error}</p>{online && <button onClick={() => setReload(value => value + 1)}>Réessayer</button>}</div> : !data?.items.length ? <div className="tm-empty"><Users size={28}/><h3>{submitted ? 'Aucun membre pour cette recherche' : 'Aucun membre sur cette page'}</h3><p>{submitted ? 'Essayez un autre nom ou une autre adresse e-mail.' : 'Les membres du cabinet apparaîtront ici.'}</p>{page > 0 && <button onClick={resetPage}>Revenir à la première page</button>}</div> : null}{notice && <p>{notice}</p>}</div>
      <ul className="tm-members">{data?.items.map(member => <li key={member.user_id} data-team-member={member.user_id}><span className="tm-avatar" aria-hidden="true">{member.display_name.trim().split(/\s+/u).slice(0, 2).map(word => [...word][0]).join('').toLocaleUpperCase('fr')}</span><div className="tm-member-name"><h3>{member.display_name}{member.user_id === data.current_user_id && <span>Vous</span>}</h3><p>{member.email}</p></div><div className="tm-member-roles">{member.roles.map(role => <span key={role}>{roles.find(item => item.value === role)?.label ?? role}</span>)}</div><span className="tm-active" data-active={member.active}>{member.active ? 'Actif' : 'Désactivé'}</span><button aria-label={'Modifier les accès de ' + member.display_name} disabled={member.user_id === data.current_user_id} title={member.user_id === data.current_user_id ? 'Un autre gestionnaire doit modifier vos accès.' : 'Modifier les rôles et le statut'} onClick={() => open(member)}><Pencil size={16}/><span>Modifier les accès</span></button></li>)}</ul>
      <footer className="tm-pagination"><span>{data ? data.items.length + ' membre(s) sur cette page' : '10 membres maximum par page'}</span><nav aria-label="Pages de l’équipe"><button className="tm-icon" aria-label="Page précédente de l’équipe" disabled={loading || !online || page === 0} onClick={() => setPage(value => value - 1)}><ChevronLeft size={18}/></button><span>Page {page + 1}</span><button className="tm-icon" aria-label="Page suivante de l’équipe" disabled={loading || !online || !data?.next_cursor} onClick={() => { if (data?.next_cursor) { setCursors(previous => [...previous.slice(0, page + 1), data.next_cursor]); setPage(value => value + 1); } }}><ChevronRight size={18}/></button></nav></footer>
    </section>
    <details className="tm-boundary"><summary>Comprendre les rôles d’accès</summary><p>Un rôle donne des accès dans l’application. Il ne prouve ni qualification professionnelle ni habilitation à réaliser un acte. Le rôle Gestionnaire seul ne permet aucune validation clinique. Vos propres accès doivent être modifiés par un autre gestionnaire.</p></details></div>
    {activity && <div hidden={view !== 'activity'}>{activity}</div>}
    {editor && <TeamMemberEditor transport={transport} member={editor.member} returnFocus={opener.current} onClose={() => setEditor(null)} onRefresh={() => { setEditor(null); setReload(value => value + 1); }} onSaved={member => { restoreMember.current = member.user_id; setLoading(true); setEditor(null); resetPage(); setReload(value => value + 1); setNotice('Accès de ' + member.display_name + ' enregistrés.'); }}/>}
  </section>;
}

type Attempt = { key: string } & ({ kind: 'create'; body: CreateTeamAccessMember } | { kind: 'update'; userId: string; body: UpdateTeamAccessMember });
function TeamMemberEditor({ transport, member, returnFocus, onClose, onRefresh, onSaved }: { transport: TeamManagementTransport; member?: TeamAccessMember; returnFocus: HTMLElement | null; onClose: () => void; onRefresh: () => void; onSaved: (member: TeamAccessMember) => void }) {
  const [name, setName] = useState(member?.display_name ?? ''), [email, setEmail] = useState(member?.email ?? ''), [password, setPassword] = useState(''), [selectedRoles, setSelectedRoles] = useState<Role[]>(member?.roles ?? []), [enabled, setEnabled] = useState(member?.active ?? true);
  const [acknowledged, setAcknowledged] = useState(false), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [conflict, setConflict] = useState(false), [error, setError] = useState(''), [discard, setDiscard] = useState(false), [deactivateConfirm, setDeactivateConfirm] = useState(false);
  const attempt = useRef<Attempt | null>(null), operation = useRef<AbortController | null>(null), alive = useRef(true), passwordInput = useRef<HTMLInputElement>(null);
  const locked = busy || uncertain;
  const grantingClinical = selectedRoles.includes('dentist') && (!member?.roles.includes('dentist') || (!member.active && enabled));
  const dirty = member ? !sameTeamRoles(selectedRoles, member.roles) || enabled !== member.active : !!(name || email || password || selectedRoles.length);
  useEffect(() => { alive.current = true; return () => { alive.current = false; operation.current?.abort(); if (passwordInput.current) passwordInput.current.value = ''; if (attempt.current?.kind === 'create') attempt.current.body.temporary_password = ''; attempt.current = null; }; }, []);
  function clearSecret() { if (passwordInput.current) passwordInput.current.value = ''; setPassword(''); if (attempt.current?.kind === 'create') attempt.current.body.temporary_password = ''; attempt.current = null; }
  function close() { if (locked) return; if (dirty) setDiscard(true); else { clearSecret(); onClose(); } }
  async function execute() {
    if (!attempt.current || busy || operation.current) return; const sent = attempt.current, controller = new AbortController(); operation.current = controller; setBusy(true); setError('');
    try { const result = sent.kind === 'create' ? await transport.create(sent.body, sent.key, controller.signal) : await transport.update(sent.userId, sent.body, sent.key, controller.signal); if (alive.current) { clearSecret(); setUncertain(false); onSaved(result); } }
    catch (failure) { if (alive.current) { const kind = failure instanceof TeamManagementError ? failure.kind : 'uncertain'; setError(teamManagementMessages[kind]); const unresolved = kind === 'uncertain' || (uncertain && (kind === 'offline' || kind === 'unavailable')); setUncertain(unresolved); setConflict(kind === 'conflict' && !!member); if (!unresolved) { setDeactivateConfirm(false); if (attempt.current?.kind === 'create') attempt.current.body.temporary_password = ''; attempt.current = null; } } }
    finally { if (operation.current === controller) operation.current = null; if (alive.current) setBusy(false); }
  }
  function prepare() {
    if (grantingClinical && !acknowledged) { setError('Confirmez avoir pris connaissance de la portée du rôle Dentiste.'); return false; }
    if (member) { const parsed = UpdateTeamAccessMemberSchema.safeParse({ expected_version: member.version, roles: [...selectedRoles].sort(), active: enabled }); if (!parsed.success) { setError('Sélectionnez au moins un rôle.'); return false; } attempt.current = { key: createRequestKey(), kind: 'update', userId: member.user_id, body: parsed.data }; }
    else { const parsed = CreateTeamAccessMemberSchema.safeParse({ display_name: name.trim(), email: email.trim(), temporary_password: password, roles: [...selectedRoles].sort() }); if (!parsed.success || !validTemporaryTeamPassword(password)) { setError('Renseignez un nom, une adresse e-mail valide, au moins un rôle et un mot de passe de 12 à 72 caractères (72 octets maximum).'); return false; } attempt.current = { key: createRequestKey(), kind: 'create', body: parsed.data }; }
    return true;
  }
  function submit(event: FormEvent) { event.preventDefault(); if (busy || operation.current) return; if (uncertain) { void execute(); return; } setError(''); if (!prepare()) return; if (member?.active && !enabled) { setDeactivateConfirm(true); return; } void execute(); }
  return <Modal open wide mobilePresentation="sheet" className="team-management-modal" returnFocus={returnFocus} title={member ? 'Modifier les accès' : 'Ajouter un membre'} description={member ? member.display_name + ' · version ' + member.version : 'Compte local du cabinet. Aucun e-mail ni invitation ne sera envoyé.'} closeDisabled={locked} onOpenChange={open => { if (!open) close(); }}><form className="tm-member-form" onSubmit={submit} noValidate>
    {error && <div className="tm-error" role="alert"><p>{error}</p>{conflict && member && <button type="button" onClick={() => { clearSecret(); onRefresh(); }}>Fermer et actualiser les accès</button>}</div>}
    <fieldset disabled={locked || conflict || deactivateConfirm}>{!member ? <><label>Nom complet<input value={name} maxLength={120} autoComplete="name" required onChange={event => setName(event.target.value)}/></label><label>Adresse e-mail<input type="email" value={email} maxLength={254} autoComplete="off" required onChange={event => setEmail(event.target.value)}/></label><label>Mot de passe temporaire<input ref={passwordInput} aria-label="Mot de passe temporaire" type="password" value={password} minLength={12} maxLength={72} autoComplete="new-password" required onChange={event => setPassword(event.target.value)}/><small>12 à 72 caractères, dans la limite de 72 octets. Communiquez-le directement à la personne.</small></label></> : <p className="tm-member-identity">{member.email}</p>}
      <fieldset className="tm-role-options"><legend>Rôles d’accès</legend>{roles.map(role => <label key={role.value}><input type="checkbox" aria-label={role.label} checked={selectedRoles.includes(role.value)} onChange={event => { setSelectedRoles(previous => event.target.checked ? [...previous, role.value] : previous.filter(value => value !== role.value)); setAcknowledged(false); }}/><span><strong>{role.label}</strong><small>{role.description}</small></span></label>)}</fieldset>
      {grantingClinical && <label className="tm-clinical-ack"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}/><span>Je comprends que le rôle Dentiste ne prouve pas la qualification professionnelle.</span></label>}
      {member && <label className="tm-account-status"><input type="checkbox" aria-label="Compte actif dans ce cabinet" checked={enabled} onChange={event => { setEnabled(event.target.checked); setAcknowledged(false); }}/><span><strong>Compte actif dans ce cabinet</strong><small>Un compte désactivé perd ses accès à ce cabinet ; son historique est conservé.</small></span></label>}
    </fieldset>
    {busy && <p className="tm-progress" role="status">Enregistrement des accès…</p>}
    <div className="tm-form-actions"><button type="button" disabled={locked} onClick={close}>Annuler</button><button type="submit" className="tm-primary" disabled={busy || (!uncertain && (conflict || deactivateConfirm || (!!member && !dirty)))}>{uncertain ? 'Réessayer la même opération' : member ? 'Enregistrer les accès' : 'Créer le compte local'}</button></div>
    {deactivateConfirm && <div className="tm-confirm" role="alert"><h3>Désactiver l’accès au cabinet ?</h3><p>{member?.display_name} ne pourra plus accéder aux données de ce cabinet.</p><div className="tm-form-actions"><button type="button" disabled={locked} onClick={() => { setDeactivateConfirm(false); attempt.current = null; }}>Continuer la modification</button><button type="button" className="tm-primary" disabled={locked} onClick={() => void execute()}>Confirmer la désactivation</button></div></div>}
    {discard && <div className="tm-confirm" role="alert"><p>Abandonner les modifications non enregistrées ?</p><div className="tm-form-actions"><button type="button" onClick={() => setDiscard(false)}>Continuer la modification</button><button type="button" onClick={() => { clearSecret(); onClose(); }}>Abandonner les modifications</button></div></div>}
  </form></Modal>;
}

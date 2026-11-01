'use client';

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, CalendarClock, ChevronLeft, ChevronRight, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { createInstallmentReminderReader, initialInstallmentReminderView, InstallmentReminderError, nextInstallmentReminderView, searchInstallmentReminderView, type InstallmentReminderFailure, type InstallmentReminderQueue, type InstallmentReminderViewState } from './installment-reminders-transport';
import './installment-reminders.css';

export { initialInstallmentReminderView as createInstallmentReminderViewState } from './installment-reminders-transport';
export type { InstallmentReminderViewState } from './installment-reminders-transport';
export type InstallmentRemindersProps = {
  api: string; token: string; clinicId: string; onSessionExpired: () => void;
  onOpenAgreement: (target: { patientId: string; planId: string; version: number }) => void;
  initialViewState?: InstallmentReminderViewState;
  onViewStateChange?: (state: InstallmentReminderViewState) => void;
};
const money = (minor: number) => new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD' }).format(minor / 100);
const date = (value: string) => new Intl.DateTimeFormat('fr-MA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z'));
const failures: Record<InstallmentReminderFailure, { title: string; detail: string }> = {
  denied: { title: 'Accès non autorisé', detail: 'Cette file est réservée aux responsables autorisés du cabinet.' },
  expired: { title: 'Session expirée', detail: 'Reconnectez-vous pour consulter les échéances.' },
  unavailable: { title: 'Échéances indisponibles', detail: 'La réponse n’a pas pu être vérifiée. Actualisez pour réessayer.' },
  offline: { title: 'Vous êtes hors connexion', detail: 'Les échéances privées ont été retirées. Reconnectez-vous pour les consulter.' },
};

export function InstallmentReminders(props: InstallmentRemindersProps) {
  return <ReminderWorkspace key={props.clinicId + ':' + props.token} {...props}/>;
}
function ReminderWorkspace({ api, token, clinicId, onSessionExpired, onOpenAgreement, initialViewState, onViewStateChange }: InstallmentRemindersProps) {
  const id = useId(), input = useRef<HTMLInputElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const callbacks = useRef({ onSessionExpired, onViewStateChange }); callbacks.current = { onSessionExpired, onViewStateChange };
  const [view, setView] = useState(initialViewState ?? initialInstallmentReminderView);
  const [data, setData] = useState<InstallmentReminderQueue | null>(null), [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<InstallmentReminderFailure | null>(null), [validation, setValidation] = useState('');
  const [reload, setReload] = useState(0), [online, setOnline] = useState(true);
  const focusResults = useRef(false);
  const reader = useMemo(() => createInstallmentReminderReader({ api, token, clinicId, onSessionExpired: () => callbacks.current.onSessionExpired() }), [api, token, clinicId]);
  const cursor = view.cursors[view.page] ?? null;
  useEffect(() => {
    const network = () => { setOnline(navigator.onLine); if (!navigator.onLine) { reader.cancel(); setData(null); setLoading(false); setFailure('offline'); } };
    network(); window.addEventListener('online', network); window.addEventListener('offline', network);
    return () => { reader.cancel(); window.removeEventListener('online', network); window.removeEventListener('offline', network); };
  }, [reader]);
  useEffect(() => {
    let active = true;
    setData(null); setFailure(online ? null : 'offline'); setLoading(online);
    if (online) void reader.load(view.query, cursor).then(result => {
      if (active && result) setData(result);
    }).catch(error => {
      if (active) { setData(null); setFailure(error instanceof InstallmentReminderError ? error.kind : 'unavailable'); }
    }).finally(() => {
      if (active) { setLoading(false); if (focusResults.current) { focusResults.current = false; heading.current?.focus({ preventScroll: true }); } }
    });
    return () => { active = false; reader.cancel(); };
  }, [reader, view.query, cursor, reload, online]);
  function update(next: InstallmentReminderViewState) { setView(next); callbacks.current.onViewStateChange?.(next); }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (Array.from(view.draft.trim()).length > 100 || Array.from(view.draft).some(character => character.codePointAt(0)! < 32 || character.codePointAt(0) === 127)) { setValidation('Saisissez au maximum 100 caractères, sans caractères de contrôle.'); input.current?.focus(); return; }
    setValidation(''); focusResults.current = true; update(searchInstallmentReminderView(view)); setReload(value => value + 1);
  }
  function move(next: InstallmentReminderViewState) { focusResults.current = true; update(next); }
  const remaining = data?.items.reduce((total, item) => total + BigInt(item.remaining_minor), 0n) ?? 0n;
  const pageMoney = new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(remaining) / 100);
  return <section className="installment-reminders" aria-labelledby="installment-reminders-title">
    <header className="reminder-heading"><span className="reminder-emblem"><CalendarClock size={23}/></span><div><p>FINANCE · SUIVI ADMINISTRATIF</p><h1 id="installment-reminders-title" tabIndex={-1}>Échéances à suivre</h1><span>Les montants restant dus, accord par accord.</span></div><button className="reminder-icon" aria-label="Actualiser les échéances" title="Actualiser les échéances" disabled={loading || !online} onClick={() => setReload(value => value + 1)}><RefreshCw size={19}/></button></header>
    <form className="reminder-search" onSubmit={submit} noValidate><label htmlFor={id + '-search'}>Rechercher un patient</label><div><div className="reminder-search-input"><Search size={18}/><input ref={input} id={id + '-search'} value={view.draft} maxLength={100} aria-invalid={!!validation} aria-describedby={id + '-search-help'} placeholder="Nom ou référence du patient…" autoComplete="off" onChange={event => { setValidation(''); update({ ...view, draft: event.target.value }); }}/>{view.draft && <button type="button" aria-label="Effacer la recherche" onClick={() => { setValidation(''); update(initialInstallmentReminderView()); input.current?.focus(); }}><X size={17}/></button>}</div><button className="reminder-primary" type="submit" disabled={!online}>Rechercher</button></div><p id={id + '-search-help'}>{validation || 'Recherche dans toutes les échéances autorisées, par nom ou référence.'}</p></form>
    <section className="reminder-queue" aria-busy={loading} aria-labelledby={id + '-results'}>
      <header className="reminder-queue-heading"><div><h2 ref={heading} tabIndex={-1} id={id + '-results'}>{view.query ? 'Résultats de recherche' : 'Échéances dues'}</h2>{data && <p>Au {date(data.as_of_date)} · Casablanca{view.query && <> · « {view.query} »</>}</p>}</div>{data && data.items.length > 0 && <div className="reminder-page-total"><span>Reste dû · cette page</span><strong>{pageMoney} MAD</strong></div>}</header>
      <div className="reminder-status" role="status" aria-live="polite">{loading ? <p>Lecture des échéances autorisées…</p> : failure ? <div className="reminder-error"><h3>{failures[failure].title}</h3><p>{failures[failure].detail}</p>{failure === 'unavailable' && <button onClick={() => setReload(value => value + 1)}>Réessayer</button>}</div> : data && !data.items.length ? <div className="reminder-empty"><CalendarClock size={28}/><h3>{view.query ? 'Aucune échéance pour cette recherche' : 'Aucune échéance à suivre sur cette page'}</h3><p>{view.query ? 'Essayez un autre nom ou une autre référence.' : 'Les échéances réglées ou à venir ne figurent pas dans cette file.'}</p>{view.page > 0 && <button onClick={() => move({ ...view, page: 0, cursors: [null] })}>Revenir à la première page</button>}</div> : null}</div>
      {data && <ul className="reminder-list">{data.items.map(item => <li key={item.line_id}>
        <div className="reminder-patient"><span className="reminder-avatar" aria-hidden="true">{Array.from(item.patient_name)[0]}</span><div><h3>{item.patient_name}</h3><p>{item.patient_reference} <span>· Accord v{item.version}</span></p></div></div>
        <div className="reminder-due"><span>Échéance</span><strong><time dateTime={item.due_on}>{date(item.due_on)}</time></strong><span className={'reminder-badge ' + (item.overdue ? 'is-overdue' : 'is-today')}>{item.overdue ? 'En retard' : 'Due aujourd’hui'}</span></div>
        <div className="reminder-amount"><span>Reste dû</span><strong>{money(item.remaining_minor)}</strong><small>{money(item.paid_minor)} affectés sur {money(item.amount_minor)}</small></div>
        <div className="reminder-row-actions"><div className="reminder-flags">{item.paid_minor > 0 && <span className="reminder-badge is-partial">Partiellement réglée</span>}{item.requires_revision && <span className="reminder-badge is-revision">Accord à réviser</span>}</div><button onClick={() => onOpenAgreement({ patientId: item.patient_id, planId: item.plan_id, version: item.version })} aria-label={'Ouvrir l’accord version ' + item.version + ' de ' + item.patient_name}><span>Ouvrir l’accord</span><ArrowUpRight size={17}/></button></div>
        {item.requires_revision && <p className="reminder-revision-note">Le solde de facture et l’échéancier diffèrent. Vérifiez l’accord avant tout suivi.</p>}
      </li>)}</ul>}
      <footer className="reminder-pagination"><span>{data ? `${data.items.length} échéance${data.items.length > 1 ? 's' : ''} sur cette page` : '10 échéances maximum par page'}</span><nav aria-label="Pages des échéances"><button aria-label="Page précédente" disabled={loading || !online || view.page === 0 || !!failure} onClick={() => move({ ...view, page: view.page - 1 })}><ChevronLeft size={18}/></button><span>Page {view.page + 1}</span><button aria-label="Page suivante" disabled={loading || !online || !data?.next_cursor} onClick={() => { if (data?.next_cursor) move(nextInstallmentReminderView(view, data.next_cursor)); }}><ChevronRight size={18}/></button></nav></footer>
    </section>
    <p className="reminder-boundary"><ShieldCheck size={16}/><span>Suivi administratif local sur données fictives. Aucun message envoyé ni règlement enregistré ici.</span></p>
  </section>;
}

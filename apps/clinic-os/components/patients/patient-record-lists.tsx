'use client';

import type { ReactNode, Dispatch, SetStateAction } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { PatientHub } from '@dental/contracts';
import './patient-record-lists.css';

export type RecordListState = { query: string; page: number; status: string };
export const initialRecordListState: RecordListState = { query: '', page: 1, status: 'all' };
type ListControls = { state: RecordListState; setState: Dispatch<SetStateAction<RecordListState>> };
const pageSize = 10;
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
const appointmentDate = (value: string) => new Intl.DateTimeFormat('fr-MA', { timeZone: 'Africa/Casablanca', dateStyle: 'long', timeStyle: 'short' }).format(new Date(value));
const appointmentSearchDate = (value: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));

function RecordPages({ count, page, onChange, label, disabled = false }: { count: number; page: number; onChange: (page: number) => void; label: string; disabled?: boolean }) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  return <nav className="patient-record-pages" aria-label={label}>
    <span role="status">{count ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, count)}` : '0'} sur {count}</span>
    <div><button type="button" aria-label={`${label} · page précédente`} disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={17}/></button><span>{page} / {pages}</span><button type="button" aria-label={`${label} · page suivante`} disabled={disabled || page >= pages} onClick={() => onChange(page + 1)}><ChevronRight size={17}/></button></div>
  </nav>;
}

export function PatientAppointmentList({ appointments, state, setState }: { appointments: PatientHub['appointments'] } & ListControls) {
  const query = normalize(state.query.trim());
  const filtered = appointments.filter(item => (state.status === 'all' || item.status === state.status) && normalize(`${appointmentDate(item.starts_at)} ${appointmentSearchDate(item.starts_at)}`).includes(query));
  const page = Math.min(state.page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  return <section className="patient-record-list" aria-label="Historique des rendez-vous">
    <header><h3>Rendez-vous enregistrés</h3><span>Heure de Casablanca</span></header>
    {!!appointments.length && <div className="patient-record-tools"><label className="patient-record-search"><Search size={17}/><input type="search" aria-label="Rechercher un rendez-vous par date" placeholder="Rechercher une date…" value={state.query} onChange={event => setState(current => ({ ...current, query: event.target.value, page: 1 }))}/></label><select aria-label="État des rendez-vous du patient" value={state.status} onChange={event => setState(current => ({ ...current, status: event.target.value, page: 1 }))}><option value="all">Tous les rendez-vous</option><option value="confirmed">Confirmés</option><option value="cancelled">Annulés</option></select></div>}
    {!appointments.length ? <p className="patient-record-empty">Aucun rendez-vous lié à ce patient.</p> : !filtered.length ? <div className="patient-record-empty"><p>Aucun rendez-vous pour ces filtres.</p><button type="button" onClick={() => setState(initialRecordListState)}>Réinitialiser les filtres</button></div> : <ul aria-label="Rendez-vous du patient">{filtered.slice((page - 1) * pageSize, page * pageSize).map(item => <li key={item.id}><CalendarDays size={20}/><div><strong>{appointmentDate(item.starts_at)}</strong><span>{Math.round((Date.parse(item.ends_at) - Date.parse(item.starts_at)) / 60000)} min</span></div><span className="patient-record-status" data-cancelled={item.status === 'cancelled'}>{item.status === 'cancelled' ? 'Annulé' : 'Confirmé'}</span></li>)}</ul>}
    {!!appointments.length && <RecordPages count={filtered.length} page={page} label="Rendez-vous" onChange={page => setState(current => ({ ...current, page }))}/>}
  </section>;
}

export function PatientQuoteList({ quotes, locked, renderQuote, state, setState }: { quotes: PatientHub['quotes']; locked: boolean; renderQuote: (quote: PatientHub['quotes'][number], index: number) => ReactNode } & ListControls) {
  const query = normalize(state.query.trim());
  const filtered = quotes.map((quote, index) => ({ quote, index })).filter(({ quote, index }) => normalize(`Devis ${index + 1} ${quote.total_minor / 100} ${quote.currency_code} ${quote.details?.lines.map(line => line.label).join(' ') ?? ''}`).includes(query));
  const page = Math.min(state.page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  return <section className="patient-record-list" aria-label="Historique des devis">
    <header><h3>Devis enregistrés</h3><span>{quotes.length} brouillon{quotes.length > 1 ? 's' : ''}</span></header>
    {!!quotes.length && <div className="patient-record-tools"><label className="patient-record-search"><Search size={17}/><input type="search" aria-label="Rechercher un devis" placeholder="Prestation, devis ou montant…" disabled={locked} value={state.query} onChange={event => setState(current => ({ ...current, query: event.target.value, page: 1 }))}/></label></div>}
    {!quotes.length ? <p className="patient-record-empty">Aucun devis associé.</p> : !filtered.length ? <div className="patient-record-empty"><p>Aucun devis pour cette recherche.</p><button type="button" disabled={locked} onClick={() => setState(initialRecordListState)}>Effacer la recherche</button></div> : <div className="patient-quotes">{filtered.slice((page - 1) * pageSize, page * pageSize).map(({ quote, index }) => renderQuote(quote, index))}</div>}
    {!!quotes.length && <RecordPages count={filtered.length} page={page} label="Devis" disabled={locked} onChange={page => setState(current => ({ ...current, page }))}/>}
  </section>;
}

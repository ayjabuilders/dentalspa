'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, RefreshCw, Sparkles } from 'lucide-react';
import { PublicAgendaAvailabilitySchema } from '@dental/contracts';
import './configured-availability.css';
import { ConfiguredBookingForm, type BookingContact } from './configured-booking-form';

type Availability = ReturnType<typeof PublicAgendaAvailabilitySchema.parse>;
const time = (value: string) => new Intl.DateTimeFormat('fr-MA', { timeZone: 'Africa/Casablanca', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
const dateLabel = (value: string) => new Intl.DateTimeFormat('fr-MA', { timeZone: 'Africa/Casablanca', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(value + 'T12:00:00Z'));
function addDays(value: string, amount: number) { const next = new Date(value + 'T12:00:00Z'); next.setUTCDate(next.getUTCDate() + amount); return next.toISOString().slice(0, 10); }

export function ConfiguredAvailability() {
  const stageHeading = useRef<HTMLHeadingElement>(null);
  const [today, setToday] = useState('');
  const [date, setDate] = useState('');
  const [visit, setVisit] = useState('');
  const [phase, setPhase] = useState(0);
  const [slot, setSlot] = useState<Availability['slots'][number] | null>(null);
  const [types, setTypes] = useState<Availability['visit_types']>([]);
  const [result, setResult] = useState<Availability | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [contact, setContact] = useState<BookingContact>({ name: '', email: '', consent: false });
  useEffect(() => { if (!slot) { stageHeading.current?.focus({ preventScroll: true }); if (phase > 0 && window.matchMedia('(max-width: 760px)').matches) document.getElementById('availability')?.scrollIntoView({block:'start'}); } }, [phase, slot]);
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4300').replace(/\/$/, '');
  useEffect(() => { const current = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); setToday(current); setDate(current); }, []);
  useEffect(() => {
    if (!date) { setBusy(false); return; }
    const controller = new AbortController();
    setBusy(true); setError(''); setResult(null);
    void (async () => {
      try {
        const query = new URLSearchParams({ date, ...(visit ? { visit_type_id: visit } : {}) });
        const response = await fetch(`${api}/api/v1/booking-requests/configured-availability?${query}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]), cache: 'no-store', credentials: 'omit' });
        if (!response.ok) throw new Error('unavailable');
        const parsed = PublicAgendaAvailabilitySchema.safeParse(await response.json());
        if (!parsed.success || parsed.data.date !== date || (parsed.data.selected_visit_type_id !== null && parsed.data.selected_visit_type_id !== visit)) throw new Error('invalid_response');
        const type = parsed.data.visit_types.find(item => item.id === parsed.data.selected_visit_type_id);
        const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' });
        if (parsed.data.slots.some(item => !type || formatter.format(new Date(item.starts_at)) !== date || Date.parse(item.ends_at) - Date.parse(item.starts_at) !== type.duration_minutes * 60000)) throw new Error('invalid_slots');
        if (!controller.signal.aborted) { setResult(parsed.data); setTypes(parsed.data.visit_types); }
      } catch { if (!controller.signal.aborted) setError('Les disponibilités ne sont pas accessibles pour le moment. Réessayez dans un instant.'); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    })();
    return () => controller.abort();
  }, [api, date, visit, retry]);
  const selected = result?.visit_types.find(type => type.id === visit);
  const chooseDate = (value: string) => { setResult(null); setError(''); setDate(value); };
  const backToSlots = () => { setSlot(null); setPhase(1); setRetry(value => value + 1); };
  return <section id="availability" className="configured-availability" data-phase={phase} aria-labelledby="configured-availability-title">
    <header className="booking-flow-heading"><div><span className="booking-eyebrow">RÉSERVATION EN LIGNE</span><h2 id="configured-availability-title">Votre prochaine visite</h2></div><span className="booking-flow-mark"><Sparkles size={20}/></span></header>
    <p className="booking-mobile-progress" aria-hidden="true"><span>{phase===4?'Parcours terminé':`Étape ${phase+1} sur 4`}</span><strong>{['Votre visite','Votre créneau','Vos coordonnées','Vérification','Récapitulatif'][phase]}</strong></p>
    <ol className="booking-steps" aria-label="Étapes de réservation">{['Visite', 'Créneau', 'Coordonnées', 'Vérification'].map((label, index) => <li key={label} aria-label={`Étape ${index+1} : ${label}`} aria-current={phase === index ? 'step' : undefined} data-complete={phase > index}><span className="booking-step-number">{phase > index ? <Check size={14}/> : index + 1}</span><span className="booking-step-label">{label}</span></li>)}</ol>
    {!slot && <div className="booking-stage">
      {phase === 0 ? <><div className="booking-stage-title"><h3 ref={stageHeading} tabIndex={-1}>Quelle visite souhaitez-vous ?</h3><p>Les visites proposées par le cabinet, avec leur durée.</p></div>
        <div className="booking-service-grid" aria-busy={busy}>{types.map((type, index) => <button key={type.id} className="booking-service" data-tone={index % 3} disabled={busy || !!error} onClick={() => { setVisit(type.id); setResult(null); setRetry(value => value + 1); setPhase(1); }}><span className="booking-service-icon"><CalendarDays size={22}/></span><strong>{type.name}</strong><span><Clock3 size={14}/>{type.duration_minutes} min<ArrowRight size={16}/></span></button>)}</div>
        {result && !types.length && <div className="booking-empty"><CalendarDays/><h3>Aucune visite en ligne</h3><p>Le cabinet n’a pas encore ouvert de type de visite à la réservation.</p></div>}
      </> : <><button className="booking-text-button" onClick={() => setPhase(0)}><ArrowLeft size={16}/>Changer de visite</button><div className="booking-stage-title"><h3 ref={stageHeading} tabIndex={-1}>{types.find(type => type.id === visit)?.name || 'Choisissez un créneau'}</h3><p>Horaires du cabinet · Casablanca</p></div>
        <div className="booking-date-toolbar"><button aria-label="Jour précédent" className="booking-icon-button" disabled={!date || date <= today} onClick={() => chooseDate(addDays(date, -1))}><ChevronLeft size={18}/></button><label><span>Date de visite</span><input type="date" required min={today || undefined} value={date} onChange={event => chooseDate(event.target.value)}/></label><button className="booking-icon-button" aria-label="Jour suivant" disabled={!date} onClick={() => chooseDate(addDays(date, 1))}><ChevronRight size={18}/></button></div>
        <div className="availability-results" aria-live="polite" aria-busy={busy}>
          {!date && <p>Choisissez une date pour voir les horaires.</p>}
          {result && selected && <><div className="availability-result-heading"><h4>{dateLabel(date)}</h4><span>{result.slots.length} créneaux · {selected.duration_minutes} min</span></div>
            {result.slots.length ? <ul aria-label="Horaires disponibles">{result.slots.map(item => <li key={item.starts_at}><button disabled={!result.request_enabled} onClick={() => { setSlot(item); setPhase(2); }} aria-label={`${result.confirmation_mode === 'automatic' ? 'Réserver' : 'Demander'} le créneau de ${time(item.starts_at)}`}><time dateTime={item.starts_at}>{time(item.starts_at)}</time><span>{time(item.ends_at)}</span></button></li>)}</ul> : <div className="booking-empty"><CalendarDays/><h3>Pas de créneau ce jour-là</h3><p>Essayez une autre date pour cette visite.</p><button className="booking-secondary" onClick={() => chooseDate(addDays(date, 1))}>Voir le jour suivant<ArrowRight size={16}/></button></div>}</>}
          {result && !selected && <div className="booking-empty"><p>Cette visite n’est plus proposée. Choisissez une autre visite.</p><button className="booking-secondary" onClick={() => setPhase(0)}>Choisir une visite</button></div>}
        </div>
      </>}
      {busy && <div className="booking-loading" role="status"><RefreshCw size={17}/>Recherche des disponibilités…<div className="booking-skeletons" aria-hidden="true"><span/><span/><span/></div></div>}
      {error && <div className="booking-error" role="alert"><p>{error}</p><button className="booking-secondary" onClick={() => setRetry(value => value + 1)}><RefreshCw size={16}/>Réessayer</button></div>}
    </div>}
    {slot && result && selected && <ConfiguredBookingForm mode={result.confirmation_mode} api={api} visitId={selected.id} visitName={selected.name} revision={result.revision} slot={slot} contact={contact} onContactChange={setContact} onStageChange={setPhase} onClose={backToSlots}/>}
    {phase<4&&<p className="availability-boundary">{result?.request_enabled ? (result.confirmation_mode === 'automatic' ? 'Le créneau sera confirmé après vérification de sa disponibilité.' : 'L’équipe du cabinet validera votre demande avant confirmation.') : result ? 'La réservation en ligne n’est pas ouverte pour le moment.' : 'Les disponibilités sont vérifiées auprès du cabinet.'}</p>}
  </section>;
}

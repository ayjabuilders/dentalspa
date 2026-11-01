'use client';
import { createRequestKey } from '../../lib/request-key';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CalendarDays, Clock3, ArrowRight, ShieldCheck, RefreshCw, Layers, Check, CircleDashed } from 'lucide-react';
import { Button } from '@dental/ui-clinic';
import type { CreateSchedulingHold, SchedulingAvailabilityResponse, SchedulingHoldResponse, SchedulingResourceListResponse } from '@dental/contracts';
import { patientDirectory } from '../fixtures';
import { createDemoSchedulingTransport, SchedulingError, type DemoAppointment, type SchedulingTransport } from './transport';
import { localDemoUrl } from '../../lib/local-demo-url';
import './scheduling.css';
const planningConnectHref = '/connection?view=planning';
type Attempt = { kind: 'create'; key: string; body: CreateSchedulingHold } | { kind: 'release'; key: string; id: string };
const zone = 'Africa/Casablanca';
const format = (instant: string) => new Intl.DateTimeFormat('fr-MA', { timeZone: zone, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset' }).format(new Date(instant));
function casablancaDate(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function casablancaInstant(day: string, time: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const clock = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || !clock) throw new SchedulingError('invalid');
  const target = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(clock[1]), Number(clock[2]));
  if (!Number.isFinite(target)) throw new SchedulingError('invalid');
  let candidate = target;
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = formatter.formatToParts(new Date(candidate));
    const part = (type: string) => Number(parts.find(item => item.type === type)?.value);
    const projected = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'));
    const delta = target - projected;
    if (!delta) break;
    candidate += delta;
  }
  const check = formatter.formatToParts(new Date(candidate));
  const part = (type: string) => Number(check.find(item => item.type === type)?.value);
  if (Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute')) !== target) throw new SchedulingError('invalid');
  return new Date(candidate).toISOString();
}
const messages = { expired: 'La session a expiré.', denied: 'Vous ne disposez pas des droits de planification.', disabled: 'La planification de développement n’est pas activée.', conflict: 'Les ressources ont changé ou la commande est en conflit. Vérifiez les disponibilités.', hold_expired: 'Cette option a expiré. Vérifiez son état actuel.', invalid: 'La plage demandée ne respecte pas la configuration du serveur.', unavailable: 'Le service est indisponible. Réessayez.' };
export function DemoSchedulingWorkspace() {
  const [transport] = useState(createDemoSchedulingTransport);
  return <><section className="schedule-connected-entry work-panel"><div><p className="eyebrow">AGENDA CONNECTÉ · DONNÉES FICTIVES</p><h2>Votre agenda de cabinet</h2><p>Consultez les rendez-vous enregistrés, ouvrez les dossiers patients et gérez les déplacements ou annulations depuis votre espace.</p></div><a className="schedule-entry-link" href={planningConnectHref}>Ouvrir l’agenda connecté <ArrowRight size={17}/></a><small>Connexion du personnel requise · données locales fictives</small></section><details className="connected-resource-options"><summary>Explorer la simulation de ressources</summary><SchedulingWorkspace transport={transport}/></details></>;
}
export function SchedulingWorkspace({ transport, onSessionExpired }: { transport: SchedulingTransport; onSessionExpired?: () => void }) {
  const [resources, setResources] = useState<SchedulingResourceListResponse | null>(null);
  const [provider, setProvider] = useState(''); const [chair, setChair] = useState('');
  const [day, setDay] = useState(() => casablancaDate(new Date(Date.now() + 86400000)));
  const [from, setFrom] = useState('09:00'); const [until, setUntil] = useState('18:00');
  const [availability, setAvailability] = useState<SchedulingAvailabilityResponse | null>(null);
  const [proposal, setProposal] = useState<CreateSchedulingHold | null>(null);
  const [duration, setDuration] = useState('');
  const [hold, setHold] = useState<SchedulingHoldResponse | null>(null);
  const [demoAppointment, setDemoAppointment] = useState<DemoAppointment | null>(null);
  const [selectedDemoPatient, setSelectedDemoPatient] = useState(patientDirectory[0]!.id);
  const [rescheduling, setRescheduling] = useState(false);
  const [pending, setPending] = useState(''); const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false); const [online, setOnline] = useState(true);
  const attempt = useRef<Attempt | null>(null); const request = useRef<AbortController | null>(null);
  const live = useRef(true); const busy = useRef(false); const sequence = useRef(0);
  const review = useRef<HTMLHeadingElement>(null);
  const currentHold = useRef(hold); currentHold.current = hold;
  const maximumMinutes = proposal ? (Date.parse(proposal.ends_at) - Date.parse(proposal.starts_at)) / 60000 : 0;
  const validDuration = Number.isFinite(Number(duration)) && Number(duration) > 0 && Number(duration) <= maximumMinutes;
  const requestedProposal = proposal && validDuration ? { ...proposal, ends_at: new Date(Date.parse(proposal.starts_at) + Number(duration) * 60000).toISOString() } : null;
  const locked = Boolean(hold?.item.status === 'held' || (demoAppointment?.status === 'confirmed' && !rescheduling) || uncertain || pending);
  function failure(error: unknown) {
    const kind = error instanceof SchedulingError ? error.kind : 'unavailable';
    setError(messages[kind]);
    if (kind === 'expired') { setHold(null); setAvailability(null); setResources(null); setProposal(null); setDemoAppointment(null); setUncertain(false); attempt.current = null; onSessionExpired?.(); }
    return kind;
  }
  async function run(label: string, work: (signal: AbortSignal, valid: () => boolean) => Promise<void>) {
    if (busy.current) return;
    busy.current = true; setPending(label); setError('');
    const controller = new AbortController(); request.current = controller; const ticket = ++sequence.current;
    const valid = () => live.current && ticket === sequence.current && !controller.signal.aborted;
    try { await work(controller.signal, valid); } catch (error) { if (valid()) failure(error); }
    finally { if (live.current && ticket === sequence.current) { busy.current = false; setPending(''); } }
  }
  const loadResources = () => run('Chargement des ressources…', async (signal, valid) => { const result = await transport.resources(signal); if (valid()) setResources(result); });
  useEffect(() => {
    live.current = true;
    const network = () => { setOnline(navigator.onLine); if (!navigator.onLine) { request.current?.abort(); sequence.current++; busy.current = false; setPending(''); setAvailability(null); setProposal(null); setUncertain(value => value || attempt.current !== null || currentHold.current?.item.status === 'held'); } };
    network(); window.addEventListener('online', network); window.addEventListener('offline', network);
    return () => { live.current = false; sequence.current++; request.current?.abort(); attempt.current = null; window.removeEventListener('online', network); window.removeEventListener('offline', network); };
  }, []);
  useEffect(() => {
    if (transport.mode !== 'demo') return;
    const latest = [...(transport.demoAppointments?.() ?? [])].sort((a, b) => b.changed_at.localeCompare(a.changed_at))[0];
    if (!latest) return;
    setDemoAppointment(latest);
    setProvider(latest.provider_resource_id);
    setChair(latest.chair_resource_id);
    void transport.resources().then(result => { if (live.current) setResources(result); }).catch(() => {});
  }, [transport]);
  // The server's observation anchors this advisory deadline; the timer never declares a terminal state.
  useEffect(() => {
    if (!hold || hold.item.status !== 'held' || uncertain) return;
    const remaining = Math.max(0, Date.parse(hold.item.expires_at) - Date.parse(hold.observed_at));
    const timer = setTimeout(() => { setUncertain(true); setError('Échéance atteinte : vérifiez l’état auprès du serveur.'); }, remaining);
    return () => clearTimeout(timer);
  }, [hold, uncertain]);
  function edit() { setAvailability(null); setProposal(null); setError(''); if (!hold || hold.item.status !== 'held') { setHold(null); attempt.current = null; } }
  async function search(event: FormEvent) {
    event.preventDefault(); if (busy.current || !online || locked) return; setProposal(null); setAvailability(null); setHold(null); setDemoAppointment(null); setRescheduling(false); attempt.current = null;
    await run('Vérification des disponibilités…', async (signal, valid) => {
      const start = casablancaInstant(day, from); const end = casablancaInstant(day, until);
      if (Date.parse(start) >= Date.parse(end)) throw new SchedulingError('invalid');
      const result = await transport.availability({ provider_resource_id: provider, chair_resource_id: chair, window_starts_at: start, window_ends_at: end, display_timezone: zone }, signal);
      if (valid()) setAvailability(result);
    });
  }
  async function mutate(command: Attempt) {
    if (busy.current || !online) return;
    attempt.current = command;
    await run(command.kind === 'create' ? 'Pose de l’option…' : 'Libération en cours…', async (signal, valid) => {
      let receiptReceived = false;
      try {
        const receipt = command.kind === 'create' ? await transport.create(command.body, command.key, signal) : await transport.release(command.id, command.key, signal);
        receiptReceived = true;
        // A command receipt is immutable history. Always read current state, including on replay.
        const current = await transport.read(receipt.item.id, signal);
        if (!valid()) return;
        setHold(current); setUncertain(false); setAvailability(null); setProposal(null); attempt.current = null;
        review.current?.focus();
      } catch (error) {
        if (!valid()) return;
        const kind = failure(error);
        if (kind !== 'expired' && (receiptReceived || uncertain || kind === 'unavailable' || !(error instanceof SchedulingError))) { setUncertain(true); setError('Résultat à vérifier. Reprenez exactement cette commande avant toute nouvelle action.'); }
        else { attempt.current = null; setUncertain(kind === 'hold_expired'); if (kind === 'conflict') { setProposal(null); setAvailability(null); } }
      }
    });
  }
  const reconcile = () => {
    if (attempt.current) return mutate(attempt.current);
    if (hold) return run('Vérification de l’option…', async (signal, valid) => { const current = await transport.read(hold.item.id, signal); if (valid()) { setHold(current); setUncertain(false); } });
  };
  async function confirmDemo() {
    if (transport.mode !== 'demo' || !hold || hold.item.status !== 'held' || !transport.confirmDemoAppointment) return;
    await run('Confirmation fictive…', async (signal, valid) => {
      const appointment = await transport.confirmDemoAppointment!(hold.item.id, selectedDemoPatient, signal);
      const current = await transport.read(hold.item.id, signal);
      if (valid()) { setDemoAppointment(appointment); setHold(current); setAvailability(null); setProposal(null); setUncertain(false); review.current?.focus(); }
    });
  }
  async function cancelDemo() {
    if (!demoAppointment || !transport.cancelDemoAppointment) return;
    await run('Annulation fictive…', async (signal, valid) => { const appointment = await transport.cancelDemoAppointment!(demoAppointment.id, signal); if (valid()) { setDemoAppointment(appointment); setAvailability(null); setProposal(null); setRescheduling(false); } });
  }
  function resetDemo() {
    transport.resetDemo?.();
    setDemoAppointment(null); setHold(null); setAvailability(null); setProposal(null); setRescheduling(false); setUncertain(false); setError(''); attempt.current = null;
  }
  async function beginDemoReschedule() {
    if (!demoAppointment || demoAppointment.status !== 'confirmed' || !transport.rescheduleDemoAppointment) return;
    const nextDay = new Date(Date.parse(demoAppointment.starts_at) + 86400000).toISOString().slice(0, 10);
    setDay(nextDay); setFrom('08:00'); setUntil('18:00'); setProposal(null); setAvailability(null); setRescheduling(true);
    await run('Recherche d’un nouvel horaire fictif…', async (signal, valid) => {
      const body = { provider_resource_id: demoAppointment.provider_resource_id, chair_resource_id: demoAppointment.chair_resource_id, window_starts_at: `${nextDay}T08:00:00Z`, window_ends_at: `${nextDay}T18:00:00Z`, display_timezone: zone };
      const result = await transport.availability(body, signal); if (valid()) { setProvider(body.provider_resource_id); setChair(body.chair_resource_id); setAvailability(result); }
    });
  }
  async function chooseSlot(interval: { starts_at: string; ends_at: string }) {
    if (rescheduling && demoAppointment && transport.mode === 'demo' && transport.rescheduleDemoAppointment) {
      await run('Déplacement fictif…', async (signal, valid) => {
        const result = await transport.rescheduleDemoAppointment!(demoAppointment.id, { provider_resource_id: demoAppointment.provider_resource_id, chair_resource_id: demoAppointment.chair_resource_id, ...interval, display_timezone: zone }, signal);
        if (valid()) { setDemoAppointment(result); setAvailability(null); setProposal(null); setRescheduling(false); setDay(interval.starts_at.slice(0, 10)); review.current?.focus(); }
      });
      return;
    }
    setDuration(transport.mode === 'connected' ? '45' : String((Date.parse(interval.ends_at) - Date.parse(interval.starts_at)) / 60000)); setProposal({ provider_resource_id: provider, chair_resource_id: chair, ...interval, display_timezone: zone }); setHold(null); review.current?.focus();
  }
  const label = (id: string) => resources?.items.find(item => item.id === id)?.display_name ?? 'Ressource du cabinet';
  function patientPassDemoHref(appointment: DemoAppointment) {
    if (typeof window === 'undefined') return null;
    const patient = patientDirectory.find(item => item.id === appointment.patient_demo_id && item.name === appointment.patient_display_name);
    if (!patient) return null;
    const base = localDemoUrl('http://localhost:4205/', window.location.hostname);
    if (!base) return null;
    const url = new URL(base);
    url.searchParams.set('demoPatientId', patient.id);
    url.searchParams.set('demoPatientName', patient.name);
    url.searchParams.set('demoAppointmentStartsAt', appointment.starts_at);
    url.searchParams.set('demoAppointmentAction', appointment.last_action);
    return url.toString();
  }
  const patientPassHref = transport.mode === 'demo' && demoAppointment ? patientPassDemoHref(demoAppointment) : null;
  const status = uncertain ? 'Résultat à vérifier' : demoAppointment?.status === 'confirmed' ? (demoAppointment.last_action === 'rescheduled' ? 'Horaire déplacé · démo' : 'Rendez-vous confirmé · démo') : demoAppointment?.status === 'cancelled' ? 'Rendez-vous annulé · démo' : hold?.item.status === 'held' ? 'Option temporaire active' : hold?.item.status === 'released' ? 'Option libérée' : hold?.item.status === 'expired' ? 'Option expirée' : proposal ? 'Horaire proposé' : 'À votre rythme';
  return <section className="scheduling-workspace" aria-label="Planification des ressources">
    <header className="schedule-heading"><div><p className="eyebrow">LE TEMPS, EN HARMONIE</p><h1 tabIndex={-1}>Votre agenda de ressources</h1><p>Explorer une disponibilité. Poser une option. Garder la main.</p></div><span className="schedule-emblem"><CalendarDays size={28}/></span></header>
     <div className="schedule-scope"><ShieldCheck size={20}/><p><strong>{transport.mode === 'demo' ? 'Simulation synthétique · mémoire locale uniquement' : 'Session vérifiée · ressources synthétiques du cabinet'}</strong><span>{transport.mode === 'demo' ? 'Si le navigateur autorise le stockage de session, les rendez-vous fictifs restent disponibles après rechargement dans cet onglet. Le lien Patient Pass transmet seulement le scénario fictif sélectionné; aucune base, API, notification ou réservation réelle n’est utilisée. Réinitialisez la démo pour effacer son état.' : 'Les horaires affichés sont fictifs pour le test local : lundi–samedi, 09:00–12:00 et 14:00–18:00 (Africa/Casablanca), sur 45 jours. Ils ne représentent pas les horaires du cabinet. Les options sont enregistrées dans la base locale, expirent après quelques minutes et peuvent être libérées. Aucun patient associé, rendez-vous confirmé ou notification envoyée.'}</span></p></div>
     {transport.mode === 'demo' && demoAppointment && <div className="schedule-reset"><Button onClick={resetDemo} disabled={!!pending}><RefreshCw size={16}/>Réinitialiser la démo</Button></div>}
    {!online && <p className="schedule-notice" role="status">Hors connexion. Les disponibilités ne sont plus affichées. Retrouvez le réseau pour vérifier une option.</p>}
    <div className="schedule-feedback" role="status" aria-live="polite">{pending || error}</div>
    <div className="schedule-layout"><div className="schedule-main">
      <section className="work-panel schedule-controls"><div className="schedule-section-title"><h2>01 <span>Choisir les ressources</span></h2><Layers size={18}/></div>
        {!resources ? <div className="schedule-empty"><p>Chargez les ressources autorisées pour commencer.</p><Button onClick={loadResources} disabled={!!pending || !online}>Charger les ressources<ArrowRight size={17}/></Button></div> : <>
          {resources.truncated && <p className="schedule-notice">Liste partielle des ressources. Certains choix ne sont pas affichés.</p>}
          {resources.items.length === 0 ? <div className="schedule-empty"><p>Aucune ressource active accessible.</p><Button onClick={loadResources} disabled={!!pending || !online}>Réessayer</Button></div> : <form onSubmit={search}>
            <div className="schedule-fields"><label>Praticien<select aria-label="Praticien" value={provider} disabled={locked || rescheduling} required onChange={event => { edit(); setProvider(event.target.value); }}><option value="">Choisir un praticien</option>{resources.items.filter(item => item.kind === 'provider').map(item => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label><label>Fauteuil<select aria-label="Fauteuil" value={chair} disabled={locked || rescheduling} required onChange={event => { edit(); setChair(event.target.value); }}><option value="">Choisir un fauteuil</option>{resources.items.filter(item => item.kind === 'chair').map(item => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label><label>Journée à Casablanca<input aria-label="Journée à Casablanca" type="date" required value={day} disabled={locked && !rescheduling} onChange={event => { edit(); setDay(event.target.value); }}/></label><label>Début · heure locale<input aria-label="Début · heure locale" type="time" required value={from} disabled={locked && !rescheduling} onChange={event => { edit(); setFrom(event.target.value); }}/></label><label>Fin · heure locale<input aria-label="Fin · heure locale" type="time" required value={until} disabled={locked && !rescheduling} onChange={event => { edit(); setUntil(event.target.value); }}/></label></div>
            <div className="schedule-search"><p>Saisissez les heures de Casablanca.<br/>Les options sont horodatées côté serveur.</p><Button variant="primary" type="submit" disabled={locked || !online || !provider || !chair}>Vérifier les disponibilités<ArrowRight size={17}/></Button></div>
          </form>}
        </>}
      </section>
      <section className="work-panel schedule-agenda" aria-label="Disponibilités observées"><div className="schedule-section-title"><h2>02 <span>Explorer les horaires</span></h2><Clock3 size={18}/></div>
      {availability ? <><div className="schedule-observed">Vérifié le {format(availability.observed_at)}<strong>{rescheduling ? 'Nouvel horaire disponible · simulation uniquement' : 'Disponible au dernier contrôle · non réservé'}</strong></div>{availability.truncated && <p className="schedule-notice">Résultats partiels : ne déduisez pas l’absence de créneaux ultérieurs. Réduisez la fenêtre de recherche.</p>}<ol className="schedule-slots">{availability.intervals.map(interval => <li key={interval.starts_at}><div className="schedule-time"><Clock3 size={17}/><span>{format(interval.starts_at)}<small>jusqu’au {format(interval.ends_at)}</small></span></div><div className="schedule-resource-pair"><span>{label(provider)}</span><span>{label(chair)}</span></div><button disabled={(locked && !rescheduling) || !online} aria-pressed={proposal?.starts_at === interval.starts_at} onClick={() => chooseSlot(interval)}>{rescheduling ? <RefreshCw size={17}/> : proposal?.starts_at === interval.starts_at ? <Check size={17}/> : <ArrowRight size={17}/>}<span>{rescheduling ? 'Déplacer ici' : 'Proposer'}</span></button></li>)}</ol>{availability.intervals.length === 0 && <div className="schedule-empty"><CalendarDays/><h3>Aucune plage libre retournée</h3><p>Essayez une autre journée ou une autre paire de ressources.</p></div>}{rescheduling && <Button onClick={() => { setRescheduling(false); setAvailability(null); }}>Annuler le déplacement</Button>}</> : <div className="schedule-empty"><CircleDashed size={32}/><h3>De la place pour chaque attention.</h3><p>Les horaires apparaîtront après votre vérification. Ils ne constituent pas une réservation.</p></div>}
      </section>
    </div><aside className="work-panel schedule-review" aria-label="Revue de l’option"><p className="eyebrow">VOTRE OPTION</p><h2 ref={review} tabIndex={-1}>{status}</h2><div className={`schedule-state-mark ${hold?.item.status ?? ''}`}><Clock3 size={30}/></div>
    {demoAppointment ? <><dl><div><dt>Patient fictif</dt><dd>{demoAppointment.patient_display_name} · {demoAppointment.patient_demo_id}</dd></div><div><dt>Praticien</dt><dd>{label(demoAppointment.provider_resource_id)}</dd></div><div><dt>Fauteuil</dt><dd>{label(demoAppointment.chair_resource_id)}</dd></div><div><dt>Début · {zone}</dt><dd>{format(demoAppointment.starts_at)}</dd></div><div><dt>Fin</dt><dd>{format(demoAppointment.ends_at)}</dd></div><div><dt>Action simulée</dt><dd>{demoAppointment.last_action === 'confirmed' ? 'Confirmation' : demoAppointment.last_action === 'rescheduled' ? 'Déplacement' : 'Annulation'}</dd></div></dl><p className="schedule-notice">Fiction locale uniquement · aucun rendez-vous réel, compte patient, notification ou partage de données réelles créé.</p>{patientPassHref && <Button asChild><a href={patientPassHref} target="_blank" rel="noreferrer">Voir ce scénario dans Patient Pass<ArrowRight size={17}/></a></Button>}{demoAppointment.status === 'confirmed' && !rescheduling && <div className="schedule-demo-actions"><Button disabled={!!pending || !online} onClick={beginDemoReschedule}><RefreshCw size={17}/>Déplacer dans la simulation</Button><Button disabled={!!pending || !online} onClick={cancelDemo}>Annuler ce rendez-vous fictif</Button></div>}</> : (proposal || hold) ? <><dl><div><dt>Praticien</dt><dd>{label((hold?.item ?? proposal)!.provider_resource_id)}</dd></div><div><dt>Fauteuil</dt><dd>{label((hold?.item ?? proposal)!.chair_resource_id)}</dd></div><div><dt>Début · {zone}</dt><dd>{format((hold?.item ?? proposal)!.starts_at)}</dd></div><div><dt>Fin</dt><dd>{format((hold?.item ?? requestedProposal ?? proposal)!.ends_at)}</dd></div>{hold && <div><dt>Échéance de l’option</dt><dd>{format(hold.item.expires_at)}</dd></div>}</dl>
        {proposal && !uncertain && <label className="schedule-duration">Durée souhaitée (minutes)<input type="number" aria-label="Durée souhaitée (minutes)" min="0.001" step="any" max={maximumMinutes} value={duration} disabled={!!pending || !online} onChange={event => setDuration(event.target.value)}/><small>Dans la plage observée : jusqu’à {maximumMinutes} min. Les limites du serveur restent applicables.</small>{!validDuration && <span>Indiquez une durée positive dans cette plage.</span>}</label>}
        {proposal && !uncertain && <Button variant="primary" disabled={!!pending || !online || !requestedProposal} onClick={() => requestedProposal && mutate({ kind: 'create', body: requestedProposal, key: createRequestKey() })}>Poser une option temporaire<ArrowRight size={17}/></Button>}
        {hold?.item.status === 'held' && !uncertain && <Button disabled={!!pending || !online} onClick={() => mutate({ kind: 'release', id: hold.item.id, key: createRequestKey() })}>Libérer l’option</Button>}
        {transport.mode === 'demo' && hold?.item.status === 'held' && !uncertain && <div className="schedule-demo-confirm"><label>Patient fictif<select aria-label="Patient fictif" value={selectedDemoPatient} disabled={!!pending || !online} onChange={event => setSelectedDemoPatient(event.target.value)}>{patientDirectory.map(patient => <option key={patient.id} value={patient.id}>{patient.name} · {patient.id}</option>)}</select></label><Button variant="primary" disabled={!!pending || !online} onClick={confirmDemo}>Confirmer dans la simulation locale<Check size={17}/></Button><small>Aucun compte ni enregistrement patient réel n’est créé.</small></div>}
      </> : !demoAppointment ? <p className="schedule-review-intro">Choisissez une plage observée pour examiner les deux ressources et leur horaire avant toute action.</p> : null}
      {uncertain && <Button variant="primary" disabled={!!pending || !online} onClick={reconcile}><RefreshCw size={17}/>Vérifier le résultat</Button>}
      {hold && <p className="schedule-observed">État observé le {format(hold.observed_at)}. L’échéance affichée est indicative jusqu’à revalidation.</p>}
      <p className="schedule-footnote"><ShieldCheck size={16}/>Une option bloque temporairement des ressources. Elle ne confirme aucun rendez-vous.</p>
    </aside></div>
  </section>;
}

'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight, CalendarDays, LockKeyhole } from 'lucide-react';
import { casablancaDateOffset, casablancaNextDemoOpenDate, casablancaNextDemoSundayDate, demoAvailableTimes, demoProviders, demoResourceBundle, demoTimeWindows, demoVisitOptions, isDemoWaitlistAlternativeDateAllowed } from './demo-booking-catalog';
import { localReceptionPreviewHref } from './local-preview-handoff';

const fictionalScenarios = [
  { id: 'salma', label: 'Salma Alaoui · créneau exemple', name: 'Salma Alaoui (FICTIF)', visitId: 'standard-demo', providerId: 'provider-demo-b', date: () => casablancaNextDemoOpenDate(3), timeWindow: 'morning' },
  { id: 'youssef', label: 'Youssef El Mansouri · après-midi', name: 'Youssef El Mansouri (FICTIF)', visitId: 'short-demo', providerId: 'provider-demo-a', date: () => casablancaNextDemoOpenDate(1), timeWindow: 'afternoon' },
  { id: 'imane', label: 'Imane Berrada · aucun créneau', name: 'Imane Berrada (FICTIF)', visitId: 'standard-demo', providerId: 'provider-demo-b', date: casablancaNextDemoSundayDate, timeWindow: 'morning' },
] as const;

export function BookingRequestDemo() {
  const [name, setName] = useState('');
  const [scenarioId, setScenarioId] = useState('');
  const [visitId, setVisitId] = useState<string>(demoVisitOptions[0].id);
  const [providerId, setProviderId] = useState<string>(demoProviders[0].id);
  const [date, setDate] = useState('');
  const [timeWindow, setTimeWindow] = useState<string>(demoTimeWindows[2].id);
  const [selectedTime, setSelectedTime] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [receptionPreviewHref, setReceptionPreviewHref] = useState<string | null>(null);
  const [waitlistPreview, setWaitlistPreview] = useState(false);
  const [alternativeDate, setAlternativeDate] = useState('');
  const [savingRequest, setSavingRequest] = useState(false);
  const [savedRequest, setSavedRequest] = useState(false);
  const [saveError, setSaveError] = useState('');
  const selectedVisit = demoVisitOptions.find(visit => visit.id === visitId)!;
  const selectedProvider = demoProviders.find(provider => provider.id === providerId)!;
  const selectedResources = demoResourceBundle(providerId);
  const selectedWindow = demoTimeWindows.find(window => window.id === timeWindow)!;
  const availableTimes = demoAvailableTimes(date, providerId, selectedVisit.durationMinutes)
    .filter(time => timeWindow === 'any' || (timeWindow === 'morning' ? time < '12:00' : time >= '12:00'));
  const selectedTimeIsAvailable = availableTimes.includes(selectedTime);
  const alternativeDateAllowed = isDemoWaitlistAlternativeDateAllowed(alternativeDate, date);

  function loadScenario(id: string) {
    if (!id) {
      setScenarioId('');
      return;
    }
    const scenario = fictionalScenarios.find(item => item.id === id);
    if (!scenario) return;
    setScenarioId(id);
    setName(scenario.name);
    setVisitId(scenario.visitId);
    setProviderId(scenario.providerId);
    setDate(scenario.date());
    setTimeWindow(scenario.timeWindow);
    setSelectedTime('');
    setSubmitted(false);
    setReceptionPreviewHref(null);
    setWaitlistPreview(false);
    setAlternativeDate('');
    setSavedRequest(false);
    setSaveError('');
  }

  async function saveLocalRequest() {
    if (process.env.NEXT_PUBLIC_DEMO_BOOKING_REQUESTS !== 'true' || !scenarioId || !selectedTimeIsAvailable || savingRequest) return;
    const host = window.location.hostname.toLowerCase();
    if (host !== 'localhost' && host !== '127.0.0.1') {
      setSaveError('Cette demande fictive persistée est disponible uniquement sur localhost.');
      return;
    }
    const api = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4300';
    setSavingRequest(true);
    setSaveError('');
    try {
      const response = await fetch(`${api.replace(/\/$/, '')}/api/v1/booking-requests/demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ scenario_id: scenarioId, requested_date: date, requested_time: selectedTime }),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('not-available');
      const result: unknown = await response.json();
      if (typeof result !== 'object' || result === null || !('status' in result) || result.status !== 'request_received') throw new Error('invalid-response');
      setSavedRequest(true);
    } catch {
      setSaveError('La demande fictive n’a pas été enregistrée. Le cabinet ne l’a pas reçue.');
    } finally {
      setSavingRequest(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReceptionPreviewHref(scenarioId ? localReceptionPreviewHref(window.location.hostname, {
      scenario: scenarioId,
      date,
      time: selectedTime,
      visit: visitId,
      provider: providerId,
    }) : null);
    setSubmitted(true);
  }

  return <section className="booking-request-demo" aria-labelledby="booking-request-title">
    <p className="demo-notice"><LockKeyhole size={14} aria-hidden="true"/> Démo locale · options et durées fictives, non validées par le cabinet. Rien n’est envoyé ni conservé.</p>
    <h2 id="booking-request-title">Demande de rendez-vous fictive</h2>
    <ol className="booking-request-steps" aria-label="Étapes de la demande fictive">
      <li aria-current={!submitted ? 'step' : undefined}><span>1</span><strong>Préparer l’exemple</strong></li>
      <li aria-current={submitted ? 'step' : undefined}><span>2</span><strong>Vérifier · enregistrer en option</strong></li>
    </ol>
    {submitted ? <div className="booking-request-result" role="status" aria-live="polite">
      <strong>Demande fictive de {name} préparée pour la démonstration.</strong>
      <p>{selectedVisit.label} · {selectedVisit.durationMinutes} min · {selectedProvider.label}</p>
      <p><CalendarDays size={15} aria-hidden="true"/> Exemple souhaité : {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Africa/Casablanca' }).format(new Date(`${date}T12:00:00Z`))} à {selectedTime} · {selectedWindow.label}</p>
      <p className="booking-request-warning">Le cabinet ne l’a pas reçue. Ce créneau n’existe que dans le scénario fictif; aucune vraie disponibilité ni réservation n’a été vérifiée.</p>
      {receptionPreviewHref ? <a className="booking-reception-preview-link" href={receptionPreviewHref} target="_blank" rel="noopener noreferrer">Ouvrir l’aperçu fictif côté réception<ArrowRight size={16}/></a> : <p className="booking-request-warning">Pour parcourir la réception, choisissez un des scénarios marocains fictifs prédéfinis.</p>}
      {process.env.NEXT_PUBLIC_DEMO_BOOKING_REQUESTS === 'true' && scenarioId && selectedTimeIsAvailable && <div className="booking-request-persist-demo">
        <p>Option locale séparée : enregistrer uniquement le scénario fictif et l’horaire souhaité pour que l’équipe puisse le revoir. Ce n’est pas une réservation.</p>
        {savedRequest ? <p className="booking-request-saved" role="status">Demande reçue pour la démonstration locale. Elle attend une revue; aucun rendez-vous n’est confirmé.</p> : <button type="button" onClick={() => void saveLocalRequest()} disabled={savingRequest}>{savingRequest ? 'Enregistrement…' : 'Enregistrer la demande fictive locale'}</button>}
        {saveError && <p className="booking-request-save-error" role="alert">{saveError}</p>}
      </div>}
      <button type="button" className="secondary-action" onClick={() => setSubmitted(false)}>Modifier la demande</button>
    </div> : <form onSubmit={submit}>
      <label>Scénario de demande fictive
        <select value={scenarioId} onChange={event => loadScenario(event.target.value)}>
          <option value="">Saisir un exemple manuellement</option>
          {fictionalScenarios.map(scenario => <option key={scenario.id} value={scenario.id}>{scenario.label}</option>)}
        </select>
      </label>
      <label>Nom fictif
        <input autoComplete="off" required value={name} onChange={event => { setName(event.target.value); setScenarioId(''); setReceptionPreviewHref(null); setWaitlistPreview(false); }} />
      </label>
      <label>Format de démonstration
        <select value={visitId} onChange={event => { setVisitId(event.target.value); setSelectedTime(''); setWaitlistPreview(false); }}>{demoVisitOptions.map(visit => <option key={visit.id} value={visit.id}>{visit.label} · {visit.durationMinutes} min</option>)}</select>
      </label>
      <label>Praticien·ne de démonstration
        <select value={providerId} onChange={event => { setProviderId(event.target.value); setSelectedTime(''); setWaitlistPreview(false); }}>{demoProviders.map(provider => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select>
      </label>
      <div className="booking-resource-bundle" aria-label="Ressources fictives associées">
        <strong>Ressources fictives associées</strong>
        <p>Simulation illustrative uniquement · ces ressources ne représentent pas la capacité réelle du cabinet.</p>
        <ul>{selectedResources.map(resource => <li key={resource.id}><span>{resource.kind}</span>{resource.label}</li>)}</ul>
      </div>
      <label>Date souhaitée · préférence uniquement
        <input type="date" required min={casablancaDateOffset(0)} value={date} onChange={event => { setDate(event.target.value); setSelectedTime(''); setSubmitted(false); setWaitlistPreview(false); }} />
      </label>
      <label>Moment souhaité · préférence uniquement
        <select value={timeWindow} onChange={event => { setTimeWindow(event.target.value); setSelectedTime(''); setWaitlistPreview(false); }}>{demoTimeWindows.map(window => <option key={window.id} value={window.id}>{window.label}</option>)}</select>
      </label>
      <label>Créneau proposé · calendrier fictif uniquement
        <select required value={selectedTime} onChange={event => setSelectedTime(event.target.value)} disabled={!availableTimes.length}>
          <option value="">{date ? 'Choisir un créneau exemple' : 'Choisir d’abord une date'}</option>
          {availableTimes.map(time => <option key={time} value={time}>{time} · proposé dans la démo</option>)}
        </select>
      </label>
      {date && !availableTimes.length && <>
        <p className="booking-request-warning" role="status">Aucun créneau fictif pour ces choix. Essayez un autre jour, format, praticien ou moment.</p>
        <section className="booking-waitlist-demo" aria-label="Aperçu de préférence d’attente">
          <strong>Une autre préférence d’horaire ?</strong>
          <p>Choisissez un autre jour et un moment préféré pour l’aperçu. Les règles d’attente du cabinet ne sont pas configurées ici.</p>
          <label>Date alternative souhaitée · aperçu fictif
            <input type="date" min={casablancaDateOffset(0)} max={casablancaDateOffset(30)} value={alternativeDate} onChange={event => { setAlternativeDate(event.target.value); setWaitlistPreview(false); }} />
          </label>
          <small className="booking-request-warning">La démo ferme le dimanche. Choisissez un jour différent de la date indisponible, dans les 30 prochains jours.</small>
          {alternativeDate && !alternativeDateAllowed && <small className="booking-waitlist-validation" role="status">Choisissez un autre jour d’ouverture dans la période de démonstration.</small>}
          <button type="button" className="secondary-action" disabled={!name.trim() || !alternativeDateAllowed} onClick={() => setWaitlistPreview(true)}>Préparer une préférence d’attente fictive</button>
          {waitlistPreview && <div className="booking-waitlist-result" role="status" aria-live="polite">
            <strong>Préférence alternative fictive préparée · non transmise</strong>
            <p>{name} · {selectedVisit.label} · {selectedProvider.label}</p>
            <p>Date initiale indisponible : {date} · autre jour souhaité : {alternativeDate} · {selectedWindow.label}</p>
            <p>Le cabinet ne l’a pas reçue. Vous n’êtes inscrit à aucune liste d’attente réelle; aucun créneau, aucune priorité et aucune notification ne sont créés.</p>
          </div>}
        </section>
      </>}
      <button type="submit" disabled={!selectedTimeIsAvailable}>Prévisualiser la demande fictive<ArrowRight size={16}/></button>
      <small className="booking-request-warning">Horaires d’exemple : lundi à samedi, 09:00–12:00 et 14:00–17:00, fuseau Casablanca. Les options et durées sont fictives, non validées par le cabinet.</small>
    </form>}
  </section>;
}

'use client';
import { createRequestKey } from '../../lib/request-key';
import {sessionFetch as fetch} from '../../lib/renewing-session';


import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, RefreshCw } from 'lucide-react';
import { ConfirmDemoBookingResponseSchema, DemoBookingRequestListSchema, DemoBookingServiceStatusSchema } from '@dental/contracts';
import './booking-request-inbox.css';

type Props = { api: string; token: string; clinicId: string; onSessionExpired: () => void };

export function BookingRequestInbox(props: Props) {
  return <BookingRequestInboxSession key={`${props.api}:${props.clinicId}:${props.token}`} {...props}/>;
}

type Attempt = { id: string; key: string; scenario: string; body: { provider_resource_id: string; chair_resource_id: string } };

function BookingRequestInboxSession({ api, token, clinicId, onSessionExpired }: Props) {
  const attempt = useRef<Attempt | null>(null);
  const operation = useRef<AbortController | null>(null);
  const expire = useRef(onSessionExpired);
  expire.current = onSessionExpired;
  const [uncertain, setUncertain] = useState(false);
  const [items, setItems] = useState<ReturnType<typeof DemoBookingRequestListSchema.parse>['items']>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmationEnabled, setConfirmationEnabled] = useState(false);
  const [resourcePairs, setResourcePairs] = useState<Record<string, 'a' | 'b'>>({});
  const names: Record<string, string> = { salma: 'Salma Alaoui', youssef: 'Youssef El Mansouri', imane: 'Imane Berrada' };
  const pairs = {
    a: { provider_resource_id: '73000000-0000-4000-8000-000000000001', chair_resource_id: '73000000-0000-4000-8000-000000000003', label: 'Équipe démo A · fauteuil A' },
    b: { provider_resource_id: '73000000-0000-4000-8000-000000000002', chair_resource_id: '73000000-0000-4000-8000-000000000004', label: 'Équipe démo B · fauteuil B' },
  } as const;

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    const requestSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000), ...(signal ? [signal] : [])]);
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${api}/api/v1/booking-requests`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Clinic-Id': clinicId },
        cache: 'no-store',
        signal: requestSignal,
      });
      if (requestSignal.aborted) return;
      if (response.status === 401) { setItems([]); attempt.current = null; expire.current(); return; }
      if (!response.ok) throw new Error('request-failed');
      const parsed = DemoBookingRequestListSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error('invalid-response');
      if (requestSignal.aborted) return;
      setItems(parsed.data.items);
      if (attempt.current && parsed.data.items.some(item => item.id === attempt.current?.id && item.status !== 'request_received')) {
        attempt.current = null;
        setUncertain(false);
        setConfirmError('');
      }
      const statusResponse = await fetch(`${api}/api/v1/booking-requests/demo-status`, { cache: 'no-store', signal: requestSignal });
      if (!statusResponse.ok) throw new Error('status-failed');
      const status = DemoBookingServiceStatusSchema.safeParse(await statusResponse.json());
      if (!status.success) throw new Error('invalid-status');
      if (!requestSignal.aborted) setConfirmationEnabled(status.data.confirmation_enabled);
    } catch {
      if (controller.signal.aborted || signal?.aborted) return;
      setError('Les demandes fictives ne peuvent pas être chargées. Vérifiez votre session et réessayez.');
      setItems([]);
    } finally {
      if (operation.current === controller) operation.current = null;
      if (!controller.signal.aborted && !signal?.aborted) setBusy(false);
    }
  }, [api, token, clinicId]);

  async function confirm(itemId: string, resourcePair: 'a' | 'b', retry = false) {
    if (operation.current || (attempt.current && !retry)) return;
    const item = items.find(value => value.id === itemId);
    const command = retry ? attempt.current : item && {
      id: itemId, key: createRequestKey(), scenario: item.scenario_id,
      body: { provider_resource_id: pairs[resourcePair].provider_resource_id, chair_resource_id: pairs[resourcePair].chair_resource_id },
    };
    if (!command) return;
    attempt.current = command;
    const controller = new AbortController();
    operation.current = controller;
    let definitive = false;
    setConfirmError('');
    setConfirmingId(itemId);
    try {
      const response = await fetch(`${api}/api/v1/booking-requests/${encodeURIComponent(itemId)}/confirm-demo`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Clinic-Id': clinicId,
          'Content-Type': 'application/json',
          'Idempotency-Key': command.key,
        },
        body: JSON.stringify(command.body),
        cache: 'no-store',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      });
      if (controller.signal.aborted) return;
      if (response.status === 401) { attempt.current = null; setItems([]); setUncertain(false); expire.current(); return; }
      definitive = !retry && [400, 403, 404, 409].includes(response.status);
      if (response.status === 409) throw new Error('slot-conflict');
      if (response.status === 400) throw new Error('sample-rules');
      if (!response.ok) throw new Error('confirm-failed');
      const receipt = ConfirmDemoBookingResponseSchema.parse(await response.json());
      if (controller.signal.aborted) return;
      if (receipt.booking_request_id !== command.id || receipt.scenario_id !== command.scenario
        || receipt.provider_resource_id !== command.body.provider_resource_id
        || receipt.chair_resource_id !== command.body.chair_resource_id
        || Date.parse(receipt.ends_at) - Date.parse(receipt.starts_at) !== 45 * 60000) throw new Error('invalid-receipt');
      operation.current = null;
      await refresh(controller.signal);
      attempt.current = null;
      setUncertain(false);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (!definitive) {
        setUncertain(true);
        setConfirmError('Résultat à vérifier : la confirmation peut déjà être enregistrée. Reprenez la même commande ou actualisez pour retrouver son état.');
        return;
      }
      attempt.current = null;
      setConfirmError(cause instanceof Error && cause.message === 'slot-conflict'
        ? 'Cette ressource démo est déjà occupée ou la demande a déjà été confirmée. Actualisez la liste.'
        : cause instanceof Error && cause.message === 'sample-rules'
          ? 'La date ou l’heure ne respecte pas les horaires fictifs affichés.'
          : 'La confirmation fictive a échoué. Actualisez la liste puis réessayez.');
    } finally {
      if (operation.current === controller) operation.current = null;
      if (!controller.signal.aborted) setConfirmingId(null);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => { controller.abort(); operation.current?.abort(); operation.current = null; attempt.current = null; };
  }, [refresh]);

  return <section className="booking-request-inbox" aria-labelledby="booking-request-inbox-title" aria-busy={busy}>
    <header><div><p className="eyebrow">APERÇU LOCAL · DONNÉES SYNTHÉTIQUES</p><h2 id="booking-request-inbox-title">Demandes de rendez-vous fictives</h2><p>Une demande reste en attente jusqu’à une confirmation explicite de la réception.</p></div><button type="button" onClick={() => void refresh()} disabled={busy || confirmingId !== null}><RefreshCw size={16}/>Actualiser</button></header>
    <p className="booking-request-sample-rules">Règles de démo uniquement : visite de 45 min, lundi–samedi, 09:00–12:00 et 14:00–18:00 · aucun horaire du cabinet.</p>
    {error && <p className="booking-request-inbox-error" role="alert">{error}</p>}
    {confirmError && <p className="booking-request-inbox-error" role="alert">{confirmError}</p>}
    {uncertain && <div className="booking-request-recovery" role="status">
      <strong>Confirmation en attente de vérification</strong>
      <p>Les ressources choisies sont conservées. Vérifiez cette confirmation avant d’en lancer une autre.</p>
      <button type="button" disabled={busy || confirmingId !== null} onClick={() => { if (attempt.current) void confirm(attempt.current.id, 'a', true); }}>Reprendre la même confirmation</button>
    </div>}
    {!error && busy && <p role="status">Chargement des demandes locales…</p>}
    {!error && !busy && !items.length && <p className="booking-request-inbox-empty">Aucune demande fictive enregistrée.</p>}
    {!error && !busy && items.length > 0 && <ul>{items.map(item => <li key={item.id} data-request-id={item.id}>
      <div><strong>{names[item.scenario_id]} <span>· FICTIF</span></strong><p><CalendarDays size={15}/>{item.requested_date} · {item.requested_time}</p></div>
      <div className="booking-request-controls">
        {item.status === 'confirmed' && item.appointment
          ? <span className="booking-request-state booking-request-confirmed"><Check size={14}/>Rendez-vous fictif confirmé · 45 min</span>
          : item.status === 'cancelled' ? <span className="booking-request-state">Rendez-vous annulé</span> : <span className="booking-request-state">{uncertain && attempt.current?.id === item.id ? 'Résultat à vérifier' : 'Demande reçue · non confirmée'}</span>}
        {item.status === 'request_received' && confirmationEnabled && !uncertain && <div className="booking-request-confirm-action">
          <label>Ressources de démonstration<select value={resourcePairs[item.id] ?? 'a'} onChange={event => setResourcePairs(current => ({ ...current, [item.id]: event.target.value as 'a' | 'b' }))} disabled={confirmingId !== null}>
            <option value="a">{pairs.a.label}</option><option value="b">{pairs.b.label}</option>
          </select></label>
          <button type="button" onClick={() => void confirm(item.id, resourcePairs[item.id] ?? 'a')} disabled={confirmingId !== null} aria-label={`Confirmer le rendez-vous fictif pour ${names[item.scenario_id]}`}>
            {confirmingId === item.id ? 'Confirmation…' : 'Confirmer le rendez-vous fictif'}
          </button>
        </div>}
        {item.appointment && <p className="booking-request-confirmed-time">{new Intl.DateTimeFormat('fr-MA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Casablanca' }).format(new Date(item.appointment.starts_at))} · {item.appointment.provider_resource_id === pairs.a.provider_resource_id ? pairs.a.label : pairs.b.label}</p>}
      </div>
    </li>)}</ul>}
    <small>Le nom affiché est dérivé du scénario fictif; aucune fiche patient ni donnée clinique n’est créée. Cette démonstration n’utilise pas le calendrier réel du cabinet.</small>
  </section>;
}

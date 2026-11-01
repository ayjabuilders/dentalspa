'use client';
import { useEffect, useRef, useState } from 'react';
import type { PatientLookupItem } from '@dental/contracts';
import { createPatientLookupTransport, PatientLookupError } from '../patient-lookup/transport';
import { AssociationError, associationRequestKey, savePatientAssociation } from './patient-association-transport';
import { AppointmentContextSummary, type AppointmentContext } from './appointment-context';

type Props = { context: AppointmentContext; api: string; token: string; clinicId: string; id: string; version: number; currentPatientId?: string; onClose: () => void; onChanged: () => void; onSessionExpired: () => void };
export function PatientAssociation(props: Props) {
  const [query, setQuery] = useState(''), [mode, setMode] = useState<'name_prefix' | 'reference_exact'>('name_prefix');
  const [items, setItems] = useState<PatientLookupItem[]>([]), [selection, setSelection] = useState<PatientLookupItem | null>(null);
  const [searched, setSearched] = useState(false), [truncated, setTruncated] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false), [conflict, setConflict] = useState(false);
  const active = useRef<AbortController | null>(null);
  const attempt = useRef<{ key: string; patientId: string | null } | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  async function search() {
    if (active.current || uncertain) return;
    const controller = new AbortController(); active.current = controller;
    const transport = createPatientLookupTransport(props);
    setBusy(true); setError(''); setSelection(null); setItems([]); setSearched(false);
    try {
      const result = await transport.lookup({ mode, query }, controller.signal);
      if (!controller.signal.aborted) { setItems(result.items); setTruncated(result.truncated); setSearched(true); }
    } catch (cause) {
      if (!controller.signal.aborted) {
        if (cause instanceof PatientLookupError && cause.kind === 'expired') props.onSessionExpired();
        else setError('Recherche indisponible. Vérifiez la saisie puis réessayez.');
      }
    } finally { transport.dispose(); if (active.current === controller) active.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  async function save(patientId: string | null) {
    if (active.current || conflict) return;
    if (!attempt.current) attempt.current = { key: associationRequestKey(), patientId };
    const command = attempt.current;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    try {
      await savePatientAssociation({ ...props, patientId: command.patientId, key: command.key, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      if (!controller.signal.aborted) { attempt.current = null; props.onChanged(); }
    } catch (cause) {
      if (!controller.signal.aborted) {
        if (cause instanceof AssociationError && cause.status === 401) { props.onSessionExpired(); return; }
        if (cause instanceof AssociationError && [400, 403, 404, 409].includes(cause.status)) {
          attempt.current = null; setUncertain(false); setConflict(true);
          setError(cause.status === 409 ? 'Le rendez-vous a changé. Rechargez avant de modifier le dossier.' : 'Cette association est indisponible ou non autorisée.');
        } else { setUncertain(true); setError('Résultat à vérifier. Réessayez la même demande sans doublon.'); }
      }
    } finally { if (active.current === controller) active.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  const locked = busy || uncertain || conflict;
  return <section className="appointment-command" aria-label="Associer un dossier patient">
    <strong>Associer un dossier</strong><AppointmentContextSummary context={props.context}/>
    <p>Rapprochement possible · identité non vérifiée. Aucun accès Patient Pass n’est accordé.</p>
    <form onSubmit={event => { event.preventDefault(); void search(); }} className="appointment-command-fields">
      <label>Rechercher par<select disabled={locked} value={mode} onChange={event => { setMode(event.target.value as typeof mode); setSelection(null); setItems([]); setSearched(false); }}><option value="name_prefix">Nom</option><option value="reference_exact">Référence exacte</option></select></label>
      <label>{mode === 'name_prefix' ? 'Début du nom' : 'Référence du dossier'}<input required minLength={mode === 'name_prefix' ? 2 : 1} maxLength={120} value={query} disabled={locked} onChange={event => { setQuery(event.target.value); setSelection(null); setItems([]); setSearched(false); }}/></label>
      <button type="submit" disabled={locked}>{busy ? 'Chargement…' : 'Rechercher'}</button>
    </form>
    {searched && !items.length && <p role="status">Aucun dossier trouvé.</p>}
    {items.length > 0 && <fieldset disabled={locked}><legend>Choisir le dossier à rapprocher</legend>{items.map(item => <label key={item.id} className="appointment-patient-choice"><input type="radio" name={`association-${props.id}`} checked={selection?.id === item.id} onChange={() => setSelection(item)}/><span><strong>{item.display_name}</strong><small>{item.reference}</small></span></label>)}</fieldset>}
    {truncated && <small>Affinez la recherche pour voir les autres dossiers.</small>}
    {error && <p role="alert">{error}</p>}
    <div className="appointment-actions">
      {uncertain ? <button disabled={busy} onClick={() => void save(attempt.current!.patientId)}>Réessayer la même demande</button> : conflict ? <button onClick={props.onChanged}>Recharger le rendez-vous</button> : <>
        <button disabled={busy || !selection || selection.id === props.currentPatientId} onClick={() => selection && void save(selection.id)}>Enregistrer le rapprochement</button>
        {props.currentPatientId && <button disabled={busy} onClick={() => void save(null)}>Retirer le rapprochement</button>}
      </>}
      <button disabled={busy || uncertain} onClick={props.onClose}>Retour</button>
    </div>
  </section>;
}

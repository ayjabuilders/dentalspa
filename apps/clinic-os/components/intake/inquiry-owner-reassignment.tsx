'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRightLeft, AlertCircle, Check, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import {useConnectedNavigationLock} from '../../lib/connected-navigation';
import { Button } from '@dental/ui-clinic';
import type { Inquiry } from '@dental/contracts';
import type { TeamRosterMember } from '@dental/contracts';
import { IntakeError, ownerAssignmentAttempt, type IntakeFailure, type IntakeTransport } from './transport';

const errors: Record<IntakeFailure, string> = {
  missing: 'Cette demande n’est plus accessible.',
  offline: 'Connexion interrompue. Réessayez avec la même demande.',
  denied: 'Votre rôle ou le membre choisi ne permet pas cette réattribution.',
  expired: 'Votre session a expiré. Reconnectez-vous pour continuer.',
  disabled: 'La réattribution n’est pas activée dans cet environnement.',
  conflict: 'Le responsable a changé depuis l’ouverture. Les informations ont été actualisées.',
  invalid: 'Vérifiez le membre sélectionné puis réessayez.',
  unavailable: 'Le cabinet n’a pas confirmé le résultat. Réessayez : la même demande sera vérifiée sans doublon.',
};

export function InquiryOwnerReassignment({ inquiry, transport, onAssigned, onConflict }: {
  inquiry: Inquiry;
  transport: IntakeTransport;
  onAssigned: (inquiryId: string, ownerUserId: string) => void;
  onConflict: () => void;
}) {
  const [candidates, setCandidates] = useState<TeamRosterMember[] | null>(null);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<IntakeFailure | null>(null);
  const [success, setSuccess] = useState('');
  const [uncertain,setUncertain]=useState(false);
  const [transferOpen,setTransferOpen]=useState(false);
  const controller = useRef<AbortController | null>(null);
  const busy=useRef(false);
  useConnectedNavigationLock(saving||uncertain);
  const candidateById = useMemo(() => new Map((candidates ?? []).map(candidate => [candidate.user_id.toLowerCase(), candidate])), [candidates]);

  const loadCandidates = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try {
      const members = await transport.ownerCandidates(signal);
      const valid = members.filter(member => member.clinic_id.toLowerCase() === inquiry.clinic_id.toLowerCase() && member.roles.some(role => role === 'reception' || role === 'manager' || role === 'dentist'));
      setCandidates(valid);
      setSelected(valid.find(member => member.user_id.toLowerCase() !== inquiry.owner_user_id.toLowerCase())?.user_id ?? '');
    } catch (failure) {
      if (signal?.aborted) return;
      setCandidates(null); setError(failure instanceof IntakeError ? failure.kind : 'unavailable');
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [transport, inquiry.clinic_id, inquiry.owner_user_id]);

  useEffect(() => {
    if (!transport.canReassignOwner) return;
    const request = new AbortController(); controller.current = request;
    void loadCandidates(request.signal);
    return () => { request.abort(); if (controller.current === request) controller.current = null; };
  }, [transport.canReassignOwner, inquiry.id, loadCandidates]);

  if (!transport.canReassignOwner) return null;

  async function assign(target=selected) {
    if (busy.current || !target) return;
    busy.current=true;
    setSaving(true); setError(null); setSuccess('');
    const body = { expected_owner_user_id: inquiry.owner_user_id, owner_user_id: target };
    const attempt = ownerAssignmentAttempt(transport.pendingOwner.current, inquiry.id, body);
    transport.pendingOwner.current = attempt;
    const request = new AbortController(); controller.current?.abort(); controller.current = request;
    try {
      const result = await transport.reassignOwner(inquiry.id, attempt.body, attempt.key, request.signal);
      if (request.signal.aborted) return;
      transport.pendingOwner.current = null; setUncertain(false); setTransferOpen(false);
      const newOwner = candidateById.get(result.receipt.owner_user_id.toLowerCase());
      setSuccess(transport.mode === 'demo'
        ? `Aperçu seulement : ${newOwner?.display_name ?? 'le membre choisi'} est maintenant responsable. Cette modification disparaîtra au rechargement.`
        : result.replayed ? 'La réattribution précédente a été confirmée par le cabinet.' : 'Le cabinet a confirmé le nouveau responsable.');
      onAssigned(inquiry.id, result.receipt.owner_user_id);
    } catch (failure) {
      if (request.signal.aborted) return;
      const kind = failure instanceof IntakeError ? failure.kind : 'unavailable';
      setError(kind);setUncertain(kind==='unavailable'||kind==='offline');
      if (kind === 'conflict' || kind === 'missing' || kind === 'denied' || kind === 'invalid' || kind === 'disabled') {
        transport.pendingOwner.current = null;
        if (kind === 'conflict' || kind === 'missing') onConflict();
      }
    } finally {
      if (controller.current === request) controller.current = null;
      busy.current=false;
      if (!request.signal.aborted) setSaving(false);
    }
  }

  const currentOwner = candidateById.get(inquiry.owner_user_id.toLowerCase());
  const choices = (candidates ?? []).filter(member => member.user_id.toLowerCase() !== inquiry.owner_user_id.toLowerCase());
  return <section className="inquiry-owner-reassignment" aria-labelledby={`owner-change-${inquiry.id}`}>
    <div className="inquiry-owner-reassignment-heading"><span className="intake-detail-icon"><ShieldCheck size={18}/></span><div><h3 id={`owner-change-${inquiry.id}`}>Responsable de la demande</h3><p className="inquiry-owner-name">{currentOwner?.display_name ?? (inquiry.owner_user_id.toLowerCase() === transport.currentUserId.toLowerCase() ? 'Vous' : 'Membre du cabinet')}</p></div></div>
    {success && <p className="inquiry-owner-message positive" role="status"><Check size={16}/>{success}</p>}
    {error && <p className="inquiry-owner-message" role="alert"><AlertCircle size={16}/>{!candidates && error==='unavailable'?'Impossible de charger les responsables. Vérifiez que chaque membre actif possède un profil dans Équipe, puis réessayez.':errors[error]}</p>}
    {loading ? <p className="panel-note" role="status"><LoaderCircle className="intake-spin" size={16}/>Vérification des membres autorisés…</p> : error && !candidates ? <Button type="button" variant="secondary" onClick={() => void loadCandidates()}><RefreshCw size={16}/>Réessayer</Button> : !choices.length ? <p className="panel-note">Aucun autre membre actif autorisé n’est disponible dans la liste du cabinet.</p> : <form onSubmit={event=>{event.preventDefault();void assign();}} className="inquiry-owner-form">
      {!uncertain && choices.some(member=>member.user_id.toLowerCase()===transport.currentUserId.toLowerCase())&&<Button type="button" variant="primary" disabled={saving} onClick={()=>{setSelected(transport.currentUserId);void assign(transport.currentUserId);}}>M’attribuer la demande</Button>}
      <Button type="button" variant="secondary" disabled={saving||uncertain} aria-expanded={transferOpen||uncertain} aria-controls={`owner-transfer-${inquiry.id}`} onClick={()=>setTransferOpen(value=>!value)}><ArrowRightLeft size={16}/>{transferOpen?'Fermer le transfert':'Changer de responsable'}</Button>
      <div id={`owner-transfer-${inquiry.id}`} className="inquiry-owner-transfer" hidden={!transferOpen&&!uncertain}>
      <label htmlFor={`owner-target-${inquiry.id}`}>Transférer à un membre actif</label>
      <select id={`owner-target-${inquiry.id}`} value={selected} onChange={event => { setSelected(event.target.value); setSuccess(''); }} disabled={saving || loading || uncertain}>
        {choices.map(member => <option key={member.user_id} value={member.user_id}>{member.display_name} · {member.roles.filter(role => role !== 'assistant').map(role => role === 'reception' ? 'accueil' : role === 'manager' ? 'gestion' : 'praticien').join(', ')}</option>)}
      </select>
      <p className="panel-note">L’attribution ne contacte pas le patient et ne confirme aucun rendez-vous. Après transfert, seuls les droits de gestion du cabinet restent disponibles sur cette demande.</p>
      <Button type="submit" variant="secondary" disabled={saving || !selected}>{saving ? <><LoaderCircle className="intake-spin" size={17}/>Vérification…</> : <>{uncertain?'Vérifier le résultat':'Confirmer le responsable'}<ArrowRightLeft size={16}/></>}</Button>
      </div>
    </form>}
  </section>;
}

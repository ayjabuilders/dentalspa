'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Modal } from '@dental/ui-clinic';
import { FollowUpChannelSchema, FollowUpKindSchema, RecordFollowUpSchema, type FollowUpList, type Inquiry, type RecordFollowUp } from '@dental/contracts';
import { AlertCircle, Check, Clock3, History, LoaderCircle, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { IntakeError, type IntakeFailure, type IntakeTransport, type FollowUpAttempt } from './transport';
import './inquiry-follow-up.css';
const kinds: Record<RecordFollowUp['kind'], string> = { contact_attempt: 'Tentative de contact', two_way_exchange: 'Échange à deux sens' };
const channels: Record<RecordFollowUp['channel'], string> = { phone: 'Téléphone', email: 'E-mail', in_person: 'En personne', other_manual: 'Autre canal manuel' };
const errors: Record<IntakeFailure, string> = {
  offline: 'Hors connexion. Aucune soumission n’est mise en attente hors ligne.',
  denied: 'Ce suivi est réservé au responsable autorisé de la demande.',
  expired: 'La session a expiré. Les données de suivi ont été effacées.',
  missing: 'Cette demande n’est pas accessible.',
  disabled: 'L’enregistrement du suivi n’est pas activé dans cet environnement.',
  conflict: 'Cette clé correspond à une autre soumission. Aucun nouveau suivi n’a été confirmé.',
  invalid: 'L’action ou le canal a été refusé. Vérifiez vos choix.',
  unavailable: 'L’historique est indisponible. Réessayez.',
};
const stamp = (value: string) => new Intl.DateTimeFormat('fr-MA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
export function InquiryFollowUp({ inquiry, transport, onSessionExpired }: { inquiry: Inquiry | null; transport: IntakeTransport; onSessionExpired?: () => void }) {
  const [history, setHistory] = useState<FollowUpList | null>(null);
  const historyFor = useRef<string | null>(null);
  const [loading, setLoading] = useState(false); const [historyError, setHistoryError] = useState('');
  const [target, setTarget] = useState<Inquiry | null>(transport.pendingFollowUp.current?.inquiry ?? null); const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string>(transport.pendingFollowUp.current?.body.kind ?? ''); const [channel, setChannel] = useState<string>(transport.pendingFollowUp.current?.body.channel ?? '');
  const [saving, setSaving] = useState(false); const [unknown, setUnknown] = useState(transport.pendingFollowUp.current !== null);
  const [message, setMessage] = useState(''); const [success, setSuccess] = useState('');
  const [online, setOnline] = useState(true); const [timezone, setTimezone] = useState('heure de cet appareil');
  const mounted = useRef(true); const busy = useRef(false); const attempt = useRef<FollowUpAttempt | null>(transport.pendingFollowUp.current);
  const historyRequest = useRef<AbortController | null>(null); const writeRequest = useRef<AbortController | null>(null);
  const selected = useRef(inquiry); selected.current = inquiry;
  const expiredCallback = useRef(onSessionExpired); expiredCallback.current = onSessionExpired;
  const feedback = useRef<HTMLDivElement>(null);
  const visibleHistory = historyFor.current === inquiry?.id ? history : null;
  const owned = inquiry?.owner_user_id === transport.currentUserId;
  function expire() { setHistory(null); setTarget(null); setOpen(false); setKind(''); setChannel(''); setUnknown(false); setSuccess(''); attempt.current = null; transport.pendingFollowUp.current = null; expiredCallback.current?.(); }
  async function load(current = selected.current) {
    historyRequest.current?.abort();
    setHistory(null); setHistoryError('');
    if (!current || current.owner_user_id !== transport.currentUserId) { setLoading(false); return; }
    if (!navigator.onLine) { setLoading(false); setHistoryError(errors.offline); return; }
    const controller = new AbortController(); historyRequest.current = controller; setLoading(true);
    try {
      const result = await transport.followUps(current.id, controller.signal);
      if (mounted.current && !controller.signal.aborted && selected.current?.id === current.id) { historyFor.current = current.id; setHistory(result); }
    } catch (error) {
      if (!mounted.current || controller.signal.aborted || selected.current?.id !== current.id) return;
      const failure = error instanceof IntakeError ? error.kind : 'unavailable'; setHistoryError(errors[failure]);
      if (failure === 'expired') expire();
    } finally { if (mounted.current && !controller.signal.aborted && selected.current?.id === current.id) setLoading(false); }
  }
  useEffect(() => {
    mounted.current = true;
    const network = () => { setOnline(navigator.onLine); if (!navigator.onLine) { historyRequest.current?.abort(); setHistory(null); setLoading(false); setHistoryError(errors.offline); } };
    network(); setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    window.addEventListener('online', network); window.addEventListener('offline', network);
    return () => { mounted.current = false; historyRequest.current?.abort(); writeRequest.current?.abort(); window.removeEventListener('online', network); window.removeEventListener('offline', network); };
  }, []);
  useEffect(() => { void load(); return () => historyRequest.current?.abort(); }, [inquiry?.id, inquiry?.owner_user_id, transport]); // The selected inquiry owns the history, never the open dialog.
  useEffect(() => { if (message && open) feedback.current?.focus(); }, [message, open]);
  function start() {
    setSuccess('');
    if (attempt.current) { setTarget(attempt.current.inquiry); setMessage('Résultat à vérifier. Reprenez exactement la soumission conservée pour cette demande.'); setOpen(true); return; }
    if (!inquiry || !owned) return;
    setTarget(inquiry); setKind(''); setChannel(''); setMessage(''); setUnknown(false); setOpen(true);
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy.current || !navigator.onLine || !target) return;
    const parsed = RecordFollowUpSchema.safeParse({ kind, channel });
    if (!parsed.success && !attempt.current) { setMessage('Choisissez explicitement l’action constatée et son canal.'); return; }
    const command = attempt.current ?? { inquiry: target, body: parsed.data!, key: crypto.randomUUID() };
    attempt.current = command; transport.pendingFollowUp.current = command; busy.current = true; setSaving(true); setMessage('');
    const controller = new AbortController(); writeRequest.current = controller;
    let received = false;
    try {
      const result = await transport.recordFollowUp(command.inquiry.id, command.body, command.key, controller.signal);
      received = true;
      const latest = await transport.followUps(command.inquiry.id, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      if (navigator.onLine && selected.current?.id === command.inquiry.id) { historyRequest.current?.abort(); setLoading(false); historyFor.current = command.inquiry.id; setHistory(latest); setHistoryError(''); }
      attempt.current = null; transport.pendingFollowUp.current = null; setUnknown(false); setOpen(false); setTarget(null); setKind(''); setChannel('');
      setSuccess(`${result.replayed ? 'Suivi retrouvé, sans doublon' : 'Suivi enregistré'} pour ${command.inquiry.display_name}. ${transport.mode === 'demo' ? 'Simulation locale uniquement.' : 'Aucun message envoyé par Dental Spa.'}`);
    } catch (error) {
      if (!mounted.current || controller.signal.aborted) return;
      const failure = error instanceof IntakeError ? error.kind : 'unavailable';
      if (failure === 'expired') { expire(); return; }
      if (failure === 'denied' || failure === 'missing') { setHistory(null); setHistoryError(errors[failure]); }
      if (received || unknown || failure === 'unavailable' || failure === 'offline') {
        setUnknown(true); setMessage(`${received ? 'Réponse reçue, historique à vérifier.' : 'Résultat à vérifier.'} Reprenez exactement cette soumission avant d’en créer une autre. ${failure === 'denied' || failure === 'missing' ? errors[failure] : ''}`);
      } else { attempt.current = null; transport.pendingFollowUp.current = null; setMessage(errors[failure]); }
    } finally { busy.current = false; if (mounted.current) setSaving(false); }
  }
  return <section className="follow-up" aria-label="Suivi de la demande">
    <div className="follow-up-heading"><History size={18}/><h3>Historique du suivi</h3></div>
    <p className="follow-up-caption">Actions externes consignées manuellement. La demande, son responsable et son échéance restent inchangés.</p>
    {success && <p className="follow-up-success" role="status"><Check size={17}/>{success}</p>}
    {(owned || attempt.current) && <Button type="button" onClick={start} disabled={saving || (!online && !attempt.current)}><Plus size={16}/>{unknown ? 'Reprendre le suivi à vérifier' : 'Consigner un suivi'}</Button>}
    {!inquiry ? <p className="follow-up-muted">Choisissez une demande pour consulter son suivi.</p> : !owned ? <p className="follow-up-muted">Seul le responsable autorisé peut consulter ou consigner le suivi.</p> : loading ? <p className="follow-up-muted" role="status"><LoaderCircle className="intake-spin" size={17}/>Chargement de l’historique…</p> : historyError ? <div className="follow-up-feedback" role="status"><p>{historyError}</p><Button onClick={() => void load()} disabled={!online || saving}><RefreshCw size={15}/>Réessayer l’historique</Button></div> : visibleHistory && <>
      {visibleHistory.truncated && <p className="follow-up-feedback" role="status">Historique partiel : les 50 entrées les plus récentes sont affichées.</p>}
      {!visibleHistory.items.length ? <div className="follow-up-empty"><Clock3 size={23}/><p>Aucun suivi consigné.</p><small>Cela ne signifie pas qu’aucun contact externe n’a eu lieu.</small></div> : <ol className="follow-up-history">{visibleHistory.items.map(item => <li key={item.id}><span className="follow-up-dot"/><div><strong>{kinds[item.kind]}</strong><span>{channels[item.channel]} · déclaration manuelle</span><time dateTime={item.recorded_at}>Consigné le {stamp(item.recorded_at)}</time><small>{item.actor_user_id === transport.currentUserId ? 'Par vous' : 'Par un autre membre du cabinet'} · version {item.event_version}</small></div></li>)}</ol>}
      <p className="follow-up-caption">Heure d’enregistrement : {timezone}. Ce n’est pas l’heure de l’action externe. Les entrées ne sont pas modifiables dans cette version.</p>
    </>}
    <Modal open={open} onOpenChange={value => { if (!busy.current) setOpen(value); }} title="Consigner un suivi" description="Déclaration d’une action déjà effectuée hors de cette application. Aucun message ne sera envoyé.">
      <form className="follow-up-form" onSubmit={submit} aria-busy={saving}>
        <div className="follow-up-target"><ShieldCheck size={20}/><div><strong>{target?.display_name}</strong><small>{target ? `Demande du ${stamp(target.created_at)}` : 'Demande sélectionnée'}</small><small>{transport.mode === 'demo' ? 'Simulation synthétique · mémoire temporaire' : 'Cabinet vérifié · saisie synthétique uniquement'}</small></div></div>
        {message && <div className="follow-up-feedback" ref={feedback} tabIndex={-1} role="alert"><AlertCircle size={17}/><p>{message}</p></div>}
        {!online && <p className="follow-up-feedback" role="status">{errors.offline}</p>}
        <fieldset disabled={saving || unknown}><label htmlFor="follow-up-kind">Action constatée<select id="follow-up-kind" required value={kind} onChange={event => { setKind(event.target.value); setMessage(''); }}><option value="">Choisir une action</option>{FollowUpKindSchema.options.map(value => <option key={value} value={value}>{kinds[value]}</option>)}</select></label><p>Une tentative ne prouve ni réception ni échange. Un échange déclaré ne vérifie pas l’identité.</p><label htmlFor="follow-up-channel">Canal observé<select id="follow-up-channel" required value={channel} onChange={event => { setChannel(event.target.value); setMessage(''); }}><option value="">Choisir un canal</option>{FollowUpChannelSchema.options.map(value => <option key={value} value={value}>{channels[value]}</option>)}</select></label></fieldset>
        <p className="follow-up-caption">L’auteur et l’heure d’enregistrement proviennent du serveur en mode connecté. Aucun horaire passé, contenu médical ou nouveau statut n’est enregistré.</p>
        <div className="follow-up-actions"><Button type="button" onClick={() => setOpen(false)} disabled={saving}>Fermer</Button><Button type="submit" variant="primary" disabled={saving || !online || (!unknown && (!kind || !channel))}>{saving ? <><LoaderCircle className="intake-spin" size={17}/>Vérification…</> : unknown ? 'Vérifier le résultat' : 'Enregistrer le suivi'}</Button></div>
      </form>
    </Modal>
  </section>;
}

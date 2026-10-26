'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Modal } from '@dental/ui-clinic';
import { CalendarClock, LoaderCircle, ShieldCheck } from 'lucide-react';
import { SetInquiryScheduleSchema, type Inquiry, type InquiryList, type InquiryOwnerWorklist } from '@dental/contracts';
import { IntakeError, type IntakeFailure, type IntakeTransport, type ScheduleAttempt } from './transport';
import './inquiry-schedule.css';
const stamp = (value: string | null) => value ? new Intl.DateTimeFormat('fr-MA', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value)) : 'Sans date';
function local(value: string | null) { if (!value) return ''; const date = new Date(value); return `${String(date.getFullYear()).padStart(4,'0')}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`; }
export function InquirySchedule({ inquiry, transport, onFresh }: { inquiry: Inquiry | null; transport: IntakeTransport; onFresh: (item: Inquiry, list: InquiryList, worklist: InquiryOwnerWorklist) => void }) {
  const [open, setOpen] = useState(false); const [fresh, setFresh] = useState<Inquiry | null>(null);
  const [value, setValue] = useState(''); const [undated, setUndated] = useState(false); const [edited, setEdited] = useState(false);
  const [pending, setPending] = useState<ScheduleAttempt | null>(transport.pendingSchedule.current);
  const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false); const [message, setMessage] = useState(''); const [conflict, setConflict] = useState(false);
  const [zone, setZone] = useState('heure locale'); const [online, setOnline] = useState(true);
  const active = useRef(false); const busy = useRef(false); const request = useRef<AbortController | null>(null); const feedback = useRef<HTMLParagraphElement>(null);
  const callbacks = useRef(onFresh); callbacks.current = onFresh;
  useEffect(() => {
    active.current = true; setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const clear = () => { request.current?.abort(); busy.current = false; setSaving(false); setLoading(false); setOpen(false); setFresh(null); setValue(''); setPending(null); setMessage(''); setConflict(false); };
    const unsubscribe = transport.onPrivateClear(clear);
    const network = () => { setOnline(navigator.onLine); if (!navigator.onLine) transport.clearPrivate('offline'); };
    network(); window.addEventListener('offline', network); window.addEventListener('online', network);
    return () => { active.current = false; request.current?.abort(); transport.scheduleActive.current = transport.pendingSchedule.current !== null; unsubscribe(); window.removeEventListener('offline', network); window.removeEventListener('online', network); };
  }, [transport]);
  useEffect(() => { if (message && open) feedback.current?.focus(); }, [message, open]);
  async function start() {
    transport.scheduleActive.current = true;
    setMessage(''); setConflict(false); setFresh(null); setValue(''); setEdited(false); setOpen(true);
    const saved = transport.pendingSchedule.current; setPending(saved);
    if (saved) { setMessage('Résultat à vérifier. Seule la vérification de la commande conservée est disponible.'); return; }
    if (!inquiry || inquiry.owner_user_id !== transport.currentUserId) { transport.scheduleActive.current = false; setOpen(false); return; }
    request.current?.abort(); const controller = new AbortController(); request.current = controller; setLoading(true);
    try { const item = await transport.inquiry(inquiry.id, controller.signal); if (active.current && !controller.signal.aborted) { setFresh(item); setValue(local(item.follow_up_at)); setUndated(item.follow_up_at === null); } }
    catch (error) { if (active.current && !controller.signal.aborted) setMessage(error instanceof IntakeError && error.kind === 'missing' ? 'Demande inaccessible ou réattribuée.' : 'Le détail actuel est indisponible. Fermez et réessayez.'); }
    finally { if (active.current && !controller.signal.aborted) setLoading(false); }
  }
  function close() { request.current?.abort(); setLoading(false); setOpen(false); setFresh(null); setValue(''); setMessage(''); transport.scheduleActive.current = transport.pendingSchedule.current !== null; }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy.current || !online) return;
    let command = transport.pendingSchedule.current;
    if (!command) {
      if (!fresh || conflict) return;
      const date = value ? new Date(value) : null;
      if (!undated && (!date || !Number.isFinite(date.getTime()))) { setMessage('Choisissez une date et une heure valides, ou Sans date.'); return; }
      const parsed = SetInquiryScheduleSchema.safeParse({ expected_follow_up_at: fresh.follow_up_at, follow_up_at: !edited ? fresh.follow_up_at : undated ? null : date!.toISOString() });
      if (!parsed.success) { setMessage('Cette date dépasse la plage prise en charge.'); return; }
      command = { id: fresh.id, displayName: fresh.display_name, body: parsed.data, key: crypto.randomUUID() }; transport.pendingSchedule.current = command; setPending(command);
    }
    busy.current = true; setSaving(true); setMessage(''); request.current?.abort(); const controller = new AbortController(); request.current = controller;
    let received = false;
    try {
      const result = await transport.setSchedule(command.id, command.body, command.key, controller.signal);
      received = true;
      const [item, list, worklist] = await Promise.all([transport.inquiry(command.id, controller.signal), transport.list(controller.signal), transport.ownerWorklist(controller.signal)]);
      if (!active.current || controller.signal.aborted) return;
      transport.pendingSchedule.current = null; setPending(null); setFresh(item); setValue(local(item.follow_up_at)); setUndated(item.follow_up_at === null); setEdited(false); callbacks.current(item,list,worklist);
      setMessage(`${result.receipt.changed ? 'Replanification enregistrée.' : 'Aucun changement nécessaire.'} État actuel relu : ${stamp(item.follow_up_at)}. ${transport.mode === 'demo' ? 'Simulation locale uniquement.' : 'Aucun message ni rendez-vous créé.'}`);
    } catch (error) {
      if (!active.current || controller.signal.aborted) return;
      const kind = error instanceof IntakeError ? error.kind : 'unavailable';
      if (['offline','denied','expired','missing'].includes(kind)) { transport.clearPrivate(kind as IntakeFailure); return; }
      if (!received && kind === 'conflict') { transport.pendingSchedule.current = null; setPending(null); setFresh(null); setConflict(true); setMessage('La date a changé ou cette clé correspond à une autre commande. Rechargez le détail actuel avant une nouvelle décision.'); }
      else if (!received && (kind === 'disabled' || kind === 'invalid')) { transport.pendingSchedule.current = null; setPending(null); setMessage(kind === 'disabled' ? 'La replanification est désactivée dans cet environnement.' : 'La replanification a été refusée. Vérifiez la date.'); }
      else setMessage('Résultat à vérifier : aucune réussite n’est annoncée. La vérification reprendra exactement la même demande, la même date et la même clé.');
    } finally { busy.current = false; if (active.current) setSaving(false); }
  }
  return <section className="inquiry-schedule" aria-label="Replanification administrative">
    {(inquiry?.owner_user_id === transport.currentUserId || pending) && <Button onClick={() => void start()} disabled={!online || saving}><CalendarClock size={17}/>{pending ? 'Vérifier la replanification' : 'Replanifier le suivi'}</Button>}
    <Modal open={open} onOpenChange={next => { if (!busy.current && !next) close(); }} title="Replanifier le suivi" description="Une échéance administrative uniquement. Aucun message ni rendez-vous n’est créé.">
      <form className="inquiry-schedule-form" onSubmit={submit} aria-busy={loading || saving}>
        <div className="inquiry-schedule-context"><ShieldCheck size={22}/><div><strong>{fresh?.display_name ?? (pending ? `Vérification : ${pending.displayName ?? 'demande initiale'}` : 'Vérification du détail actuel')}</strong><p>Responsable actuel uniquement · {transport.mode === 'demo' ? 'démonstration synthétique' : 'cabinet vérifié'}</p></div></div>
        {loading && <p role="status"><LoaderCircle size={18} className="intake-spin"/>Lecture de l’échéance actuelle…</p>}
        {message && <p className="inquiry-schedule-message" role="status" ref={feedback} tabIndex={-1}>{message}</p>}
        {(fresh || pending) && <>
          <div className="inquiry-schedule-observed"><span>Échéance observée</span><strong>{stamp(pending ? pending.body.expected_follow_up_at : fresh!.follow_up_at)}</strong><small>Heure de cet appareil : {zone}</small></div>
          {pending ? <p className="inquiry-schedule-observed">Date demandée : <strong>{stamp(pending.body.follow_up_at)}</strong>La commande reste en mémoire tant que cette session est ouverte. Aucun nouvel envoi automatique.</p> : <fieldset disabled={saving || loading || conflict}>
            <label className="inquiry-schedule-undated"><input type="checkbox" checked={undated} onChange={event => { setUndated(event.target.checked); setEdited(true); setMessage(''); }}/>Sans date</label>
            <label htmlFor="reschedule-date">Nouvelle échéance locale<input id="reschedule-date" type="datetime-local" disabled={undated} value={value} onChange={event => { setValue(event.target.value); setEdited(true); setMessage(''); }} aria-describedby="reschedule-help"/></label>
            <p id="reschedule-help">Sans modification, la précision de la date observée est conservée. Une date passée ne signifie pas une urgence clinique.</p>
          </fieldset>}
        </>}
        <div className="inquiry-schedule-actions"><Button type="button" onClick={close} disabled={saving}>Fermer</Button>{conflict ? <Button onClick={() => void start()} type="button">Relire le détail actuel</Button> : <Button type="submit" variant="primary" disabled={saving || loading || !online || (!fresh && !pending)}>{saving ? 'Vérification en cours…' : pending ? 'Vérifier le résultat exact' : 'Enregistrer l’échéance'}</Button>}</div>
      </form>
    </Modal>
  </section>;
}

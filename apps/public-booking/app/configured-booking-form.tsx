'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Clock3, Mail, Pencil, RefreshCw, UserRound } from 'lucide-react';
import { ConfiguredBookingReceiptSchema, ConfiguredBookingRequestSchema } from '@dental/contracts';
export type BookingContact = { name: string; email: string; consent: boolean };
type Props = { mode?: 'staff_review' | 'automatic'; api: string; visitId: string; visitName: string; revision: number; slot: { starts_at: string; ends_at: string }; contact: BookingContact; onContactChange: (value: BookingContact) => void; onStageChange: (stage: number) => void; onClose: () => void };
function key() { const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6]! & 15) | 64; bytes[8] = (bytes[8]! & 63) | 128; const h = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; }
export function ConfiguredBookingForm({ mode = 'staff_review', api, visitId, visitName, revision, slot, contact, onContactChange, onStageChange, onClose }: Props) {
  const [review, setReview] = useState(false);
  const [conflict,setConflict] = useState(false);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState(''), [receipt, setReceipt] = useState<ReturnType<typeof ConfiguredBookingReceiptSchema.parse> | null>(null);
  const operation = useRef<AbortController | null>(null), attempt = useRef<{ key: string; payload: ReturnType<typeof ConfiguredBookingRequestSchema.parse> } | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus({preventScroll:true}); if(window.matchMedia('(max-width: 760px)').matches) document.getElementById('availability')?.scrollIntoView({block:'start'}); }, [review, receipt]);
  useEffect(() => () => operation.current?.abort(), []);
  const visitDate = new Intl.DateTimeFormat('fr-MA', { timeZone: 'Africa/Casablanca', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(slot.starts_at));
  const visitTime = new Intl.DateTimeFormat('fr-MA', { timeZone: 'Africa/Casablanca', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(slot.starts_at));
  const minutes = (Date.parse(slot.ends_at) - Date.parse(slot.starts_at)) / 60000;
  function payload() { return ConfiguredBookingRequestSchema.safeParse({ visit_type_id: visitId, configuration_revision: revision, ...slot, contact_name: contact.name, contact_email: contact.email, administrative_consent_version: contact.consent ? 'local-demo-v1' : null }); }
  function goToReview() { if (!payload().success) { setError('Utilisez un nom fictif, une adresse @example.test et cochez l’accord de test.'); return; } setError(''); setReview(true); onStageChange(3); }
  async function submit() {
    if (operation.current || receipt) return;
    const parsed = payload();
    if (!parsed.success) { setError('Vérifiez vos coordonnées fictives et votre accord de test.'); return; }
    const command = attempt.current ?? { key: key(), payload: parsed.data }; attempt.current = command;
    const controller = new AbortController(); operation.current = controller; setBusy(true); setError('');
    try {
      const response = await fetch(`${api}/api/v1/booking-requests/configured`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': command.key }, body: JSON.stringify(command.payload), credentials: 'omit', cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      if (controller.signal.aborted) return;
      if ([400, 409].includes(response.status)) { attempt.current = null; setUncertain(false); setConflict(response.status === 409); setError(response.status === 409 ? 'Ce créneau ou ses paramètres ont changé. Revenez aux disponibilités pour choisir de nouveau.' : 'Vérifiez les coordonnées fictives et votre accord de test.'); return; }
      if (!response.ok) throw Error('unavailable');
      const result = ConfiguredBookingReceiptSchema.parse(await response.json());
      if (controller.signal.aborted) return;
      setReceipt(result); onStageChange(4); attempt.current = null; setUncertain(false);
    } catch { if (!controller.signal.aborted) { setUncertain(true); setError('Le résultat reste à vérifier. Reprenez la même demande : elle sera vérifiée sans créer de doublon.'); } }
    finally { if (operation.current === controller) operation.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  const summary = <div className="booking-selection"><span className="booking-selection-icon"><CalendarDays size={22}/></span><div><strong>{visitName}</strong><span>{visitDate} · {visitTime}</span><small><Clock3 size={13}/>{minutes} min · heure de Casablanca</small></div>{!receipt && <button className="booking-icon-button" aria-label="Changer de créneau" disabled={busy || uncertain} type="button" onClick={onClose}><Pencil size={16}/></button>}</div>;
  if (receipt) return <div className="configured-booking-form booking-receipt"><span className="booking-receipt-icon"><CheckCircle2 size={34}/></span><h3 ref={title} tabIndex={-1}>{receipt.status === 'confirmed' ? 'Votre rendez-vous est confirmé' : 'Votre demande est reçue'}</h3><p role="status">{receipt.status === 'confirmed' ? 'Ce créneau a été réservé dans le cabinet de test.' : 'L’équipe doit encore valider votre demande. Aucun créneau n’est réservé pour le moment.'}</p>{summary}<div className="booking-receipt-reference"><span>Référence de votre demande</span><strong>{receipt.request_id}</strong></div><p>Aucun e-mail n’est envoyé dans cet environnement de démonstration.</p><button type="button" className="booking-primary" onClick={onClose}>Revenir aux disponibilités<ArrowRight size={17}/></button></div>;
  return <form className="configured-booking-form" onSubmit={event => { event.preventDefault(); if (review) void submit(); else goToReview(); }} aria-busy={busy}>
    <button className="booking-text-button booking-context-back" type="button" disabled={busy||uncertain} onClick={review?()=>{setReview(false);setError('');onStageChange(2);}:onClose}><ArrowLeft size={16}/>{review?'Revenir aux coordonnées':'Revenir au créneau'}</button>
    <div className="booking-stage-title"><h3 ref={title} tabIndex={-1}>{review ? 'Tout est correct ?' : 'Comment vous contacter ?'}</h3><p>{review ? 'Vérifiez votre visite et vos coordonnées avant de continuer.' : 'Deux informations pour préparer votre demande.'}</p></div>
    {summary}
    {!review ? <fieldset disabled={busy || uncertain}><legend className="sr-only">Coordonnées fictives uniquement</legend><label htmlFor="booking-name">Nom complet<input id="booking-name" required minLength={2} maxLength={100} autoComplete="off" value={contact.name} onChange={event => onContactChange({ ...contact, name: event.target.value })} placeholder="Salma Alaoui" aria-describedby="booking-test-hint"/></label><label htmlFor="booking-email">Adresse e-mail de test<input id="booking-email" type="email" required maxLength={254} autoComplete="off" value={contact.email} onChange={event => onContactChange({ ...contact, email: event.target.value })} placeholder="salma@example.test" aria-describedby="booking-test-hint"/></label><p id="booking-test-hint" className="booking-field-hint">Démonstration : nom fictif et adresse se terminant par @example.test uniquement.</p><label className="configured-booking-consent"><input type="checkbox" required checked={contact.consent} onChange={event => onContactChange({ ...contact, consent: event.target.checked })}/>J’accepte l’enregistrement local de cette demande fictive.</label></fieldset> : <><div className="booking-contact-review"><div><UserRound size={18}/><span><small>Nom complet</small><strong>{contact.name}</strong></span></div><div><Mail size={18}/><span><small>E-mail de test</small><strong>{contact.email}</strong></span></div><button className="booking-text-button" type="button" disabled={busy || uncertain} onClick={() => { setReview(false); setError(''); onStageChange(2); }}><Pencil size={15}/>Modifier mes coordonnées</button></div><p className="booking-mode-note">{mode === 'automatic' ? 'La confirmation dépend de la disponibilité du créneau au moment de l’enregistrement.' : 'Vous envoyez une demande. Le cabinet devra la valider avant que le rendez-vous soit confirmé.'}</p></>}
    {error && <div className="booking-error" role="alert"><p>{error}</p>{conflict&&<button type="button" className="booking-secondary" onClick={onClose}>Choisir un autre créneau<ArrowRight size={16}/></button>}</div>}
    <div className="configured-booking-actions"><button className="booking-secondary" type="button" disabled={busy || uncertain} onClick={review ? () => { setReview(false); setError(''); onStageChange(2); } : onClose}><ArrowLeft size={16}/>Retour</button><button className="booking-primary" type="submit" disabled={busy}>{busy && <RefreshCw className="booking-spin" size={16}/>} {busy ? 'Enregistrement…' : uncertain ? 'Vérifier la même demande' : !review ? 'Vérifier ma visite' : mode === 'automatic' ? 'Confirmer la réservation' : 'Envoyer ma demande'}{!busy && <ArrowRight size={16}/>}</button></div>
  </form>;
}

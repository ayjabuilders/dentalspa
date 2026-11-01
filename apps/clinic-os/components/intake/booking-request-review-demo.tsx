'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, CircleAlert, ClipboardCheck, Clock3, Info, LockKeyhole, UserRound } from 'lucide-react';
import type { BookingRequestPreview } from './booking-request-preview';
import './booking-request-review-demo.css';

export function BookingRequestReviewDemo({ preview }: { preview: BookingRequestPreview | null }) {
  const [reviewed, setReviewed] = useState(false);
  const date = preview ? new Intl.DateTimeFormat('fr-MA', { dateStyle: 'long', timeZone: 'Africa/Casablanca' }).format(new Date(`${preview.date}T12:00:00.000Z`)) : '';

  return <section className="booking-review-demo" aria-labelledby="booking-review-title">
    <div className="booking-review-heading"><div><p className="booking-review-label">ACCUEIL · SCÉNARIO FICTIF</p><h1 id="booking-review-title">Aperçu de réception</h1><p>Les préférences de visite, réunies pour un examen rapide.</p></div><Link className="booking-review-back" href="/intake?preview=1"><ArrowLeft size={16}/>Demandes d’exemple</Link></div>
    <div className="booking-review-notice"><LockKeyhole size={17} aria-hidden="true"/><p><strong>Simulation locale uniquement</strong><span>Aucun formulaire n’a été reçu par le cabinet.</span></p></div>
    {!preview ? <div className="booking-review-invalid" role="alert"><span className="booking-review-empty-icon"><CircleAlert size={25}/></span><div><h2>Aucun scénario reconnu</h2><p>Ce lien est incomplet ou contient des valeurs inconnues. Aucune donnée patient n’a été chargée.</p></div><Link href="/intake?preview=1">Ouvrir les demandes fictives<ArrowRight size={16}/></Link></div> : <article className="booking-review-card" aria-label={`Demande fictive de ${preview.displayName}`}>
      <div className="booking-review-overview">
        <section className="booking-review-summary" aria-label="Préférences de visite">
          <header className="booking-review-card-header"><span className="booking-review-avatar"><UserRound size={25}/></span><div><span className="booking-review-label">PRÉFÉRENCES DU SCÉNARIO</span><h2>{preview.displayName}</h2></div></header>
          <span className="booking-review-state"><Clock3 size={14}/>Préférence · non confirmée</span>
          <div className="booking-review-appointment"><span className="booking-review-calendar"><CalendarDays size={25}/></span><div><span>Date demandée</span><strong>{date}</strong><p>{preview.time} · heure souhaitée · Casablanca</p></div></div>
          <dl className="booking-review-details"><div><dt>Format fictif</dt><dd>{preview.visitLabel}</dd></div><div><dt>Ressource de démo</dt><dd>{preview.providerLabel}</dd></div></dl>
          <p className="booking-review-identity"><Info size={15}/><span>Préférence uniquement : aucun dossier patient n’est associé.</span></p>
        </section>
        <section className="booking-review-next" aria-labelledby="booking-review-next-title">
          <span className="booking-review-next-icon">{reviewed ? <Check size={23}/> : <ClipboardCheck size={23}/>}</span><span className="booking-review-label">PROCHAINE ACTION · SIMULATION</span><h3 id="booking-review-next-title">{reviewed ? 'Examen fictif effectué' : 'Examiner les préférences'}</h3><p>Vérifiez la date, l’heure et le format de cette visite d’exemple.</p>
          <div className="booking-review-actions"><button type="button" onClick={() => setReviewed(value => !value)} aria-pressed={reviewed}>{reviewed ? <ArrowLeft size={16}/> : <Check size={16}/>}<span>{reviewed ? 'Réinitialiser l’examen fictif' : 'Simuler l’examen administratif'}</span></button><Link href="/intake?preview=1">Voir les demandes d’exemple<ArrowRight size={16}/></Link></div>
          <div className="booking-review-feedback">{reviewed ? <p className="booking-review-confirmation" role="status">Examen simulé dans cet onglet. Aucun résultat, dossier, rendez-vous ou événement n’a été enregistré.</p> : <p>Cette action reste dans cet onglet. Elle ne confirme aucun rendez-vous.</p>}</div>
        </section>
      </div>
      <details className="booking-review-disclosure"><summary><Info size={16}/><span>À propos de ce scénario</span><ChevronDown size={17}/></summary><div><p>Le lien transfère des choix d’exemple dans l’adresse de cette page. Rien n’est envoyé au cabinet ni conservé.</p><ul><li><strong>Identité :</strong> une ressemblance de nom ne vérifie pas l’identité.</li><li><strong>Rendez-vous :</strong> l’horaire souhaité n’est pas une réservation confirmée.</li><li><strong>Configuration :</strong> les horaires, ressources et durées sont des exemples.</li></ul></div></details>
    </article>}
  </section>;
}

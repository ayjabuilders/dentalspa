'use client';

import { useState } from 'react';
import { ArrowRight, Heart, ShieldCheck, Sparkles } from 'lucide-react';
import '../request-demo.css';
import { BookingRequestDemo } from '../booking-request-demo';


type DemoRequest = { name: string; email: string; language: string };

const emptyRequest: DemoRequest = { name: '', email: '', language: 'fr' };

export default function PublicBooking() {
  const [details, setDetails] = useState(false);
  const [request, setRequest] = useState(emptyRequest);
  const [submitted, setSubmitted] = useState(false);

  const loadFictionalExample = () => {
    setRequest({
      name: 'Salma Alaoui (FICTIF)',
      email: 'salma.alaoui@example.test',
      language: 'fr',
    });
    setSubmitted(false);
  };

  const reset = () => {
    setRequest(emptyRequest);
    setSubmitted(false);
  };

  return (
    <div className="public-page">
      <a className="skip-link" href="#main">Aller au contenu</a>
      <header>
        <a className="public-brand" href="/">
          <img src="/assets/favicon.svg" width="32" height="38" alt="" />
          <span>Dental Spa<small>CASABLANCA</small></span>
        </a>
        <span className="preview-tag">Aperçu de votre futur accueil</span>
        <a href="/#availability">Voir les disponibilités<ArrowRight size={15} /></a>
      </header>

      <main id="main">
        <section className="public-hero">
          <div>
            <p className="eyebrow">DENTAL SPA · CASABLANCA</p>
            <h1>Un sourire.<br />Une rencontre.<br /><em>Votre histoire.</em></h1>
            <p>Un espace imaginé autour de vous.<br />De l’accueil au suivi, une attention qui fait la différence.</p>
            <button onClick={() => setDetails(!details)} aria-expanded={details} aria-controls="request-details">
              Préparer ma première visite<ArrowRight size={18} />
            </button>
            {details && (
              <section id="request-details" className="request-details" aria-label="Démo locale de demande de contact">
                <div className="request-content">
                  <p className="demo-notice">
                    Démo locale · utilisez uniquement l’exemple fictif. N’entrez aucune donnée réelle ou de santé.
                    Rien n’est envoyé ni conservé.
                  </p>
                  {submitted ? (
                    <div role="status" aria-live="polite">
                      <strong>Demande fictive préparée.</strong>
                      <p>Le cabinet ne l’a pas reçue et aucun créneau n’est réservé.</p>
                      <button type="button" className="secondary-action" onClick={reset}>Recommencer</button>
                    </div>
                  ) : (
                    <form onSubmit={event => { event.preventDefault(); setSubmitted(true); }}>
                      <button type="button" className="secondary-action" onClick={loadFictionalExample}>
                        Charger l’exemple fictif
                      </button>
                      <label>
                        Nom fictif
                        <input
                          autoComplete="off"
                          required
                          value={request.name}
                          onChange={event => setRequest({ ...request, name: event.target.value })}
                        />
                      </label>
                      <label>
                        Courriel fictif
                        <input
                          type="email"
                          autoComplete="off"
                          required
                          value={request.email}
                          onChange={event => setRequest({ ...request, email: event.target.value })}
                        />
                      </label>
                      <label>
                        Langue déclarée
                        <select
                          value={request.language}
                          onChange={event => setRequest({ ...request, language: event.target.value })}
                        >
                          <option value="fr">Français</option>
                          <option value="ar">العربية</option>
                        </select>
                      </label>
                      <button type="submit">Préparer la demande fictive<ArrowRight size={16} /></button>
                    </form>
                  )}
                </div>
                <BookingRequestDemo />
              </section>
            )}
            <small>Présentation uniquement · aucune réservation réelle</small>
          </div>
          <div className="public-photo">
            <img src="/assets/patients.webp" width="512" height="512" alt="Portrait illustratif d’un sourire" />
            <div className="photo-message">L’attention change tout.<span>LE SOIN COMMENCE DÈS L’ACCUEIL</span></div>
          </div>
        </section>


        <section id="experience" className="public-values">
          <div><Heart /><h2>Une relation humaine</h2><p>Un parcours lisible et une équipe à vos côtés.</p></div>
          <div><ShieldCheck /><h2>Votre espace personnel</h2><p>Des informations partagées avec vous après validation.</p></div>
          <div><Sparkles /><h2>À votre rythme</h2><p>Une expérience pensée pour votre confort, à chaque étape.</p></div>
        </section>
      </main>

      <footer>
        <span>Dental Spa · Une attention particulière.</span>
        <small>Fondation M01 · illustration et données de démonstration</small>
      </footer>
    </div>
  );
}

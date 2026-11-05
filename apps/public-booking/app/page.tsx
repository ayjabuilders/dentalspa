'use client';
import { useState } from 'react';
import { ArrowDown, ArrowRight, Heart, ShieldCheck, Sparkles } from 'lucide-react';
import { InstallControl } from './pwa-controls';

const values = [
  { label: 'Votre accueil', title: 'Une relation humaine', text: 'Un parcours lisible et une équipe à vos côtés.', icon: Heart, tone: 'warm' },
  { label: 'Votre espace', title: 'Des échanges clairs', text: 'Des informations partagées avec vous après validation.', icon: ShieldCheck, tone: 'blue' },
  { label: 'Votre tempo', title: 'À votre rythme', text: 'Une expérience pensée pour votre confort, à chaque étape.', icon: Sparkles, tone: 'green' },
] as const;

export default function PublicBooking() {
  const [details, setDetails] = useState(false);
  return <div className="public-page">
    <a className="skip-link" href="#main">Aller au contenu</a>
    <header className="public-header">
      <a className="public-brand" href="/" aria-label="Dental Spa, accueil"><img src="/assets/favicon.svg" width="32" height="38" alt=""/><span>Dental Spa<small>CASABLANCA</small></span></a>
      <span className="preview-tag"><i aria-hidden="true"/>Aperçu de votre futur accueil</span>
      <nav aria-label="Navigation principale"><a href="#experience">Notre approche<ArrowDown size={15}/></a><InstallControl/></nav>
    </header>
    <main id="main">
      <section className="public-hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">DENTAL SPA <span aria-hidden="true">·</span> CASABLANCA</p>
          <h1 id="hero-title">Un sourire.<br/>Une rencontre.<br/><em>Votre histoire.</em></h1>
          <p className="hero-description">Un espace imaginé autour de vous.<br className="desktop-break"/> De l’accueil au suivi, une attention qui fait la différence.</p>
          <button className="primary-action" onClick={() => setDetails(!details)} aria-expanded={details} aria-controls="request-details">Préparer ma première visite<ArrowRight size={18}/></button>
          <div id="request-details" className="request-details" role="status" hidden={!details}>
            <span className="notice-mark" aria-hidden="true">i</span><div><strong>Votre premier pas, en toute clarté.</strong><p>La demande de rendez-vous sera disponible prochainement. Cet aperçu ne collecte aucune information et ne réserve aucun créneau.</p></div>
          </div>
          <small className="preview-caption">Présentation uniquement <span aria-hidden="true">·</span> Réservation non activée</small>
        </div>
        <figure className="public-photo">
          <img src="/assets/patients.webp" width="512" height="512" alt="Portrait illustratif, image de présentation" fetchPriority="high"/>
          <figcaption><span>L’attention change tout.</span><small>LE SOIN COMMENCE DÈS L’ACCUEIL</small></figcaption>
          <span className="photo-stamp" aria-hidden="true"><Heart size={17}/></span>
        </figure>
      </section>
      <section id="experience" className="public-values" aria-labelledby="values-title">
        <div className="section-intro"><p className="eyebrow">UNE ATTENTION PARTICULIÈRE</p><h2 id="values-title">Chaque étape commence<br/>par une belle attention.</h2><p>Les repères qui inspirent l’expérience Dental Spa.</p></div>
        <div className="value-grid">{values.map(({ label, title, text, icon: Icon, tone }, index) => <article key={label} className={`value-card ${tone}`} style={{ '--card-index': index } as React.CSSProperties}>
          <div className="value-card-top"><span className="value-label">{label}</span><span className="value-icon"><Icon size={20}/></span></div>
          <span className="value-number" aria-hidden="true">0{index + 1}</span><h3>{title}</h3><p>{text}</p><span className="value-rule" aria-hidden="true"/>
        </article>)}</div>
      </section>
    </main>
    <footer><span>Dental Spa <span aria-hidden="true">·</span> Une attention particulière.</span><small>Fondation M01 <span aria-hidden="true">·</span> Illustration et données de démonstration</small></footer>
  </div>;
}

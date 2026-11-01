'use client';
import { useState } from 'react';
import Image from 'next/image';
import { ArrowDown, MapPin, ShieldCheck } from 'lucide-react';
import { ConfiguredAvailability } from './configured-availability';
import './booking-page.css';
export default function PublicBooking() {
  const [started, setStarted] = useState(false);
  return <div className="booking-page" data-started={started}>
    {started && <a className="skip-link" href="#availability">Aller à la réservation</a>}
    <header className="booking-topbar"><a className="booking-brand" href="/" aria-label="Dental Spa — By New Smile, accueil"><svg className="booking-logo" viewBox="450 225 690 180" role="img" aria-label="Dental Spa — By New Smile"><defs><filter id="booking-logo-ink" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 1 1 0 -0.3"/><feFlood floodColor="currentColor"/><feComposite in2="SourceGraphic" operator="in"/></filter><filter id="booking-logo-alpha" colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0.79 0 0 0 0 0.66 0 0 0 0 0.40 1 1 1 0 -0.3"/></filter></defs><image href="/assets/dental-spa-logo-reference.png" width="1600" height="1160" filter="url(#booking-logo-alpha)"/></svg></a><span className="booking-demo-tag">Version de validation</span></header>
    <main className="booking-layout"><aside className="booking-intro">
      <div className="booking-portrait"><Image src="/assets/dr-amina.jpeg" fill sizes="(max-width:760px) 100vw, 440px" alt="Dr Amina El Omrani au cabinet Dental Spa" priority/><div className="booking-portrait-copy"><span>DENTAL SPA · CASABLANCA</span><h1>Prenez rendez-vous<br/><em>en toute sérénité.</em></h1><ul className="booking-promises"><li>Une écoute attentive</li><li>Un accompagnement personnalisé</li><li>Votre sourire, au cœur de nos soins</li></ul><button type="button" className="booking-start" onClick={() => setStarted(true)}>Commencer<ArrowDown size={17}/></button><div className="booking-social-proof"><span className="booking-avatar-stack" aria-hidden="true">{[0,1,2,3].map(index => <img key={index} src={"/assets/portrait-" + index + ".webp"} width="32" height="32" alt=""/>)}</span><span><strong>Plus de 1 000 personnes</strong><small>nous font confiance</small></span></div></div></div>
      <div className="booking-practitioner"><strong>Dr Amina El Omrani</strong><span>Dental Spa · By New Smile</span><span><MapPin size={14}/>Casablanca</span></div>
      <div className="booking-assurance"><ShieldCheck size={18}/><p>Version de validation : coordonnées fictives uniquement. Aucun message externe n’est envoyé.</p></div>
    </aside><div className="booking-workspace">{started && <ConfiguredAvailability onReturn={() => setStarted(false)}/>}</div></main>
    <footer className="booking-footer"><span>Dental Spa · By New Smile</span><span>Votre visite commence par une attention.</span></footer>
  </div>;
}



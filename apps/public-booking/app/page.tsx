import { MapPin, ShieldCheck, Sparkles } from 'lucide-react';
import { ConfiguredAvailability } from './configured-availability';
import './booking-page.css';
export default function PublicBooking() {
  return <div className="booking-page">
    <a className="skip-link" href="#availability">Aller à la réservation</a>
    <header className="booking-topbar"><a className="public-brand" href="/" aria-label="Dental Spa, accueil"><img src="/assets/favicon.svg" width="28" height="34" alt=""/><span>Dental Spa<small>CASABLANCA</small></span></a><span className="booking-demo-tag"><span/><span className="booking-demo-label">Démonstration locale</span><span className="booking-demo-short">Démo locale</span></span></header>
    <main className="booking-layout"><aside className="booking-intro"><div className="booking-intro-copy"><span className="booking-welcome"><Sparkles size={15}/>Un moment pour votre sourire</span><h1>Votre visite.<br/><em>À votre rythme.</em></h1><p>Choisissez votre visite, trouvez un créneau et vérifiez votre demande. Tout simplement.</p><div className="booking-location"><MapPin size={17}/><span>Casablanca · heure locale du cabinet</span></div></div><div className="booking-portrait"><img src="/assets/patients.webp" width="512" height="512" alt="Accueil dentaire, photographie illustrative"/><div><span>DENTAL SPA</span><strong>Le soin commence<br/>dès l’accueil.</strong></div></div><div className="booking-assurance"><ShieldCheck size={20}/><div><strong>Un espace pour tester le parcours</strong><p>Utilisez uniquement des coordonnées fictives. Aucun message externe n’est envoyé.</p></div></div></aside><div className="booking-workspace"><ConfiguredAvailability/></div></main>
    <footer className="booking-footer"><span>Dental Spa · Cabinet de démonstration</span><span>Un parcours simple, du choix à la confirmation.</span></footer>
  </div>;
}

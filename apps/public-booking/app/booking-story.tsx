import Image from 'next/image';
import { ArrowLeft, ArrowRight, Heart, MapPin, ShieldCheck, Sparkles } from 'lucide-react';

export function BookingStory({ screen, onNext, onBack }: { screen: 'cabinet' | 'smiles' | 'care' | 'contact'; onNext: () => void; onBack: () => void }) {
  const titles = { cabinet: 'Bienvenue chez Dental Spa', smiles: 'Un sourire qui vous ressemble.', care: 'À vos côtés, à chaque étape.', contact: 'Retrouvez votre cabinet.' };
  return <div className="booking-story">
    <button type="button" className="booking-text-button" onClick={onBack}><ArrowLeft size={16}/>Retour</button>
    <p className="booking-eyebrow">DENTAL SPA · BY NEW SMILE</p>
    <h3 tabIndex={-1}>{titles[screen]}</h3>
    {screen === 'cabinet' && <><div className="booking-story-photo"><Image src="/assets/dr-amina.jpeg" fill sizes="(max-width:760px) 100vw, 520px" alt="Dr Amina El Omrani"/><div><strong>Dr Amina El Omrani</strong><span>Dental Spa · Casablanca</span></div></div><p>Votre première visite est un temps d’échange pour parler de vos attentes avec le cabinet.</p></>}
    {screen === 'smiles' && <><div className="booking-story-smile"><Image src="/assets/smile.jpg" fill sizes="(max-width:760px) 100vw, 520px" alt="Illustration d’un sourire"/></div><p>Chaque sourire est singulier. La consultation permet de discuter de ce qui compte pour vous.</p><div className="booking-story-confidence"><Sparkles size={20}/><span><strong>Plus de 1 000 personnes</strong><small>nous font confiance</small></span></div></>}
    {screen === 'care' && <div className="booking-story-values"><div><Heart/><span><strong>Une écoute attentive</strong><p>Un échange autour de vos attentes.</p></span></div><div><Sparkles/><span><strong>Un accompagnement personnalisé</strong><p>Des explications à chaque étape de votre parcours.</p></span></div><div><ShieldCheck/><span><strong>Vos informations restent privées</strong><p>Votre demande est accessible à l’équipe autorisée du cabinet.</p></span></div></div>}
    {screen === 'contact' && <><div className="booking-story-values"><div><MapPin/><span><strong>Dental Spa · Casablanca</strong><p>7, rue Sebta, résidence Rami<br/>N° 5, 2ᵉ étage</p></span></div></div><p>Conservez la référence affichée sur votre récapitulatif pour retrouver votre demande avec l’équipe du cabinet.</p></>}
    <button type="button" className="booking-primary booking-story-next" onClick={onNext}>{screen === 'smiles' ? 'Choisir mon créneau' : screen === 'contact' ? 'Revoir ma demande' : 'Continuer'}<ArrowRight size={17}/></button>
  </div>;
}

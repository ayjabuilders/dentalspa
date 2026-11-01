import { useState } from 'react';
import { CalendarDays, FileText, LockKeyhole, Sparkles } from 'lucide-react';
import type { PatientDemoScenario } from './demo-scenarios';
import './visit-preparation-demo.css';

type DemoVisit = NonNullable<PatientDemoScenario['visit']>;

export function VisitPreparationDemo({ visit }: { visit: DemoVisit }) {
  const [reminderPreview, setReminderPreview] = useState(false);
  const cancelled = visit.demoState === 'simulated-cancellation';

  return <section className="visit-preparation-demo" aria-labelledby="visit-preparation-title">
    <div className="visit-preparation-heading">
      <span><Sparkles size={17} aria-hidden="true"/> PRÉPARATION D’EXEMPLE</span>
      <LockKeyhole size={16} aria-label="Démonstration fictive"/>
    </div>
    <h2 id="visit-preparation-title">Préparer cette visite</h2>
    <p className="visit-preparation-intro">Informations de démonstration uniquement. Elles ne décrivent pas un rendez-vous réel.</p>
    <ul className="visit-preparation-list">
      <li><CalendarDays size={18} aria-hidden="true"/><span><strong>Date et heure</strong><small>Repérez l’horaire d’exemple affiché ci-dessus, selon le fuseau de Casablanca.</small></span></li>
      <li><FileText size={18} aria-hidden="true"/><span><strong>Documents et consignes</strong><small>Aucun document approuvé ni aucune consigne de santé n’est partagé dans ce scénario.</small></span></li>
    </ul>
    {!cancelled && <div className="visit-reminder-preview">
      <strong>Rappel de démonstration</strong>
      <p>Consultez un exemple de texte administratif, sans programmer ni envoyer de notification.</p>
      <button type="button" aria-expanded={reminderPreview} onClick={() => setReminderPreview(value => !value)}>
        {reminderPreview ? 'Masquer l’aperçu du rappel' : 'Prévisualiser un texte de rappel fictif'}
      </button>
      {reminderPreview && <div className="visit-reminder-copy" role="status" aria-live="polite">
        <strong>Texte fictif · non envoyé</strong>
        <p>Votre exemple de rendez-vous est prévu le {visit.day} {visit.month} {visit.year} à {visit.time} · Casablanca. Consultez les informations que le cabinet vous a directement communiquées pour cet horaire.</p>
        <small>Le délai et les règles de rappel ne sont pas configurés. Rien n’est programmé, transmis ou enregistré.</small>
      </div>}
    </div>}
    <div className="visit-preparation-next" role="note">
      <strong>Prochaine étape</strong>
      <p>{cancelled ? 'Cette annulation est simulée. Aucun rendez-vous réel ni aucune action de suivi n’existent.' : 'Aucune action réelle n’est demandée par cet exemple. Seules des informations validées et partagées par le cabinet seraient présentées ici.'}</p>
    </div>
  </section>;
}

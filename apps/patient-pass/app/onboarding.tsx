'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Compass, Type } from 'lucide-react';

type PatientOnboardingProps = {
  largeText: boolean;
  onClose: () => void;
  onLargeTextChange: (enabled: boolean) => void;
};

const steps = [
  { title: 'Bienvenue sur Patient Pass', eyebrow: 'UN GUIDE EN TROIS ÉTAPES' },
  { title: 'Choisissez votre confort de lecture', eyebrow: 'VOTRE PRÉFÉRENCE D’AFFICHAGE' },
  { title: 'Votre aperçu est prêt', eyebrow: 'VOUS GARDEZ LE CONTRÔLE' },
];

export function PatientOnboarding({ largeText, onClose, onLargeTextChange }: PatientOnboardingProps) {
  const [step, setStep] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const currentStep = steps[step]!;

  return (
    <section className="pass-onboarding" aria-labelledby="onboarding-title">
      <div className="onboarding-topline">
        <span><Compass size={17} aria-hidden="true" /> GUIDE D’ACCUEIL</span>
        <span className="onboarding-demo-tag">Démonstration locale</span>
      </div>

      <div className="onboarding-progress-track" role="progressbar" aria-label="Progression du guide" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={step + 1}>
        <span style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
      </div>
      <p className="onboarding-step-count" role="status" aria-live="polite">Étape {step + 1} sur {steps.length}</p>

      <div className="onboarding-content">
        <p className="onboarding-eyebrow">{currentStep.eyebrow}</p>
        <h1 id="onboarding-title" ref={headingRef} tabIndex={-1}>{currentStep.title}</h1>

        {step === 0 && (
          <div className="onboarding-panel">
            <span className="onboarding-icon"><Compass size={27} aria-hidden="true" /></span>
            <p>Découvrez les principales rubriques de votre espace, à votre rythme.</p>
            <p className="onboarding-privacy">Cet aperçu est fictif. Ce guide ne crée pas de compte et ne demande aucun renseignement personnel ou médical.</p>
          </div>
        )}

        {step === 1 && (
          <div className="onboarding-panel">
            <span className="onboarding-icon"><Type size={27} aria-hidden="true" /></span>
            <p>Vous pouvez agrandir les textes de l’aperçu si cela vous aide à lire.</p>
            <button
              className="onboarding-toggle"
              type="button"
              aria-pressed={largeText}
              onClick={() => onLargeTextChange(!largeText)}
            >
              <span className="onboarding-toggle-mark" aria-hidden="true">{largeText ? <Check size={16} /> : null}</span>
              Agrandir les textes
            </button>
            <p className="onboarding-privacy">Cette préférence reste en mémoire pendant cette visite et n’est pas envoyée ni enregistrée.</p>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-panel">
            <span className="onboarding-icon"><Check size={27} aria-hidden="true" /></span>
            <p>Vous pouvez parcourir l’exemple de rendez-vous, le dossier sans document partagé et un aperçu de message administratif en français ou en arabe.</p>
            <p className="onboarding-privacy">Aucune donnée réelle n’est utilisée. Aucun rendez-vous n’est confirmé, aucun message n’est envoyé et aucun dossier médical n’est affiché.</p>
          </div>
        )}
      </div>

      <div className="onboarding-actions">
        <button className="onboarding-exit" type="button" onClick={onClose}>Quitter le guide</button>
        <div className="onboarding-step-actions">
          {step > 0 && (
            <button className="onboarding-back" type="button" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={17} aria-hidden="true" /> Précédent
            </button>
          )}
          {step < steps.length - 1 ? (
            <button className="pass-primary onboarding-next" type="button" onClick={() => setStep(step + 1)}>
              Continuer <ArrowRight size={17} aria-hidden="true" />
            </button>
          ) : (
            <button className="pass-primary onboarding-next" type="button" onClick={onClose}>
              Terminer <Check size={17} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

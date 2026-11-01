'use client';

import { useState } from 'react';
import { Button } from '@dental/ui-clinic';
import { RotateCcw, Sparkles } from 'lucide-react';
import type { Inquiry } from '@dental/contracts';
import type { IntakeTransport } from './transport';
import './demo-contact-outcome.css';

const outcomes = [
  { value: 'attempted_no_answer', label: 'Tenté sans réponse' },
  { value: 'reached', label: 'Joint' },
  { value: 'requested_callback', label: 'A demandé un rappel' },
  { value: 'declined', label: 'A refusé' },
  { value: 'unable_to_proceed', label: 'Impossible à poursuivre' },
] as const;

type Outcome = typeof outcomes[number]['value'];

export function DemoContactOutcome({ inquiry, transport }: { inquiry: Inquiry | null; transport: IntakeTransport }) {
  const [selected, setSelected] = useState<Outcome | ''>('');
  const [events, setEvents] = useState<Outcome[]>([]);

  if (transport.mode !== 'demo' || !inquiry) return null;

  const selectedLabel = outcomes.find(outcome => outcome.value === selected)?.label;
  function simulate() {
    if (!selected) return;
    setEvents(current => [...current, selected]);
    setSelected('');
  }

  return <section className="demo-contact-outcome" aria-labelledby="demo-contact-outcome-title">
    <header className="demo-contact-outcome-heading">
      <span aria-hidden="true"><Sparkles size={18}/></span>
      <div>
        <p className="eyebrow">M01 · DÉMO LOCALE</p>
        <h3 id="demo-contact-outcome-title">Résultat de contact</h3>
      </div>
      <span className="demo-contact-outcome-badge">Non enregistré</span>
    </header>
    <p className="demo-contact-outcome-intro">Vocabulaire opérationnel approuvé pour cet aperçu. Les événements sont des exemples indépendants : aucune séquence ni transition métier n’est définie.</p>
    <div className="demo-contact-outcome-current">
      <span>Point de départ fictif</span>
      <strong>Sans tentative</strong>
    </div>
    <label className="demo-contact-outcome-field" htmlFor="demo-contact-outcome-choice">Simuler un résultat observé</label>
    <div className="demo-contact-outcome-actions">
      <select id="demo-contact-outcome-choice" value={selected} onChange={event => setSelected(event.target.value as Outcome | '')}>
        <option value="">Choisir un exemple…</option>
        {outcomes.map(outcome => <option key={outcome.value} value={outcome.value}>{outcome.label}</option>)}
      </select>
      <Button onClick={simulate} disabled={!selected}>Simuler ce résultat</Button>
    </div>
    {events.length > 0 && <ol className="demo-contact-outcome-history" aria-label="Historique de résultats simulés">
      {events.map((event, index) => <li key={`${event}-${index}`}><span>{index + 1}</span><strong>{outcomes.find(outcome => outcome.value === event)?.label}</strong><small>Événement fictif · non transmis</small></li>)}
    </ol>}
    <div className="demo-contact-outcome-footer">
      <p>Aucune urgence, qualification clinique, conversion patient ni transition réelle n’est créée. La simulation reste en mémoire jusqu’au rechargement.</p>
      {events.length > 0 && <Button variant="ghost" onClick={() => { setEvents([]); setSelected(''); }}><RotateCcw size={15}/>Réinitialiser l’aperçu</Button>}
    </div>
    <span className="sr-only" aria-live="polite">{selectedLabel ? `Résultat sélectionné : ${selectedLabel}` : ''}</span>
  </section>;
}

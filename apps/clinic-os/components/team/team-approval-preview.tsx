'use client';

import { useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { Button } from '@dental/ui-clinic';
import { demoApprovalRequests, type DemoApprovalDecision, type DemoApprovalRequestId } from './approval-demo-fixtures';
import './team-approval-preview.css';

const decisions: Record<DemoApprovalDecision, string> = {
  accepted: 'Acceptée dans cet aperçu',
  declined: 'Refusée dans cet aperçu',
};

export function TeamApprovalPreview() {
  const [results, setResults] = useState<Partial<Record<DemoApprovalRequestId, DemoApprovalDecision>>>({});

  function decide(id: DemoApprovalRequestId, decision: DemoApprovalDecision) {
    setResults(current => current[id] ? current : { ...current, [id]: decision });
  }

  return <section className="team-approval-preview work-panel" aria-labelledby="team-approval-title">
    <div className="team-approval-heading">
      <span className="team-approval-count" aria-hidden="true">{demoApprovalRequests.length}</span>
      <div><p className="eyebrow">M16 · DÉMONSTRATION LOCALE</p><h2 id="team-approval-title">Aperçu de la boîte d’approbations</h2></div>
    </div>
    <p className="team-approval-intro">Exemples de revue administrative, avec un responsable et une échéance fictifs. Aucun élément clinique ou dossier patient n’est inclus.</p>
    <div className="team-approval-caveat" role="note">Cette boîte illustre seulement une interface. Les choix ne représentent ni les permissions d’un membre réel, ni une approbation du cabinet; aucune décision ou tâche réelle n’est créée, envoyée ou enregistrée.</div>
    <ul className="team-approval-list">
      {demoApprovalRequests.map(request => {
        const decision = results[request.id];
        return <li key={request.id}>
          <div className="team-approval-item-heading"><div><span className="team-approval-version">{request.version}</span><h3>{request.title}</h3></div>
            {decision ? <span className={`team-approval-result team-approval-result-${decision}`} role="status">{decisions[decision]}</span> : <span className="team-approval-pending">À revoir dans la démo</span>}
          </div>
          <dl><div><dt>Responsable fictif</dt><dd>{request.owner}</dd></div><div><dt>Échéance</dt><dd>{request.due}</dd></div></dl>
          {!decision && <div className="team-approval-actions">
            <Button type="button" variant="primary" onClick={() => decide(request.id, 'accepted')}><Check size={15}/>Simuler l’acceptation</Button>
            <Button type="button" onClick={() => decide(request.id, 'declined')}><X size={15}/>Simuler le refus</Button>
          </div>}
        </li>;
      })}
    </ul>
    {Object.keys(results).length > 0 && <Button className="team-approval-reset" type="button" onClick={() => setResults({})}><RotateCcw size={15}/>Réinitialiser les décisions de démo</Button>}
    <p className="team-approval-storage">Décisions temporaires dans cet écran; un rechargement les efface.</p>
  </section>;
}

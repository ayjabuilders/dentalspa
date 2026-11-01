import { ShieldQuestion } from 'lucide-react';
import './team-access-decision-preview.css';

const openDecisions = [
  'Matrice des rôles et des actions',
  'Justificatifs de qualification du personnel',
  'Horaires, équipes et disponibilités',
  'Tâches pouvant être déléguées',
  'Autorité d’affectation et d’approbation',
  'Règles de délégation et d’absence',
  'Durée de conservation des audits d’accès',
];

export function TeamAccessDecisionPreview() {
  return <section className="team-access-decision-preview work-panel" aria-labelledby="team-access-decision-title">
    <header className="team-access-decision-heading">
      <span className="team-access-decision-icon" aria-hidden="true"><ShieldQuestion size={21}/></span>
      <div>
        <p className="eyebrow">M16 · DÉCISIONS À VALIDER</p>
        <h2 id="team-access-decision-title">Questions d’accès et d’équipe</h2>
        <p>Aperçu de préparation : aucune règle d’accès n’est activée ni décidée ici.</p>
      </div>
    </header>
    <ul className="team-access-decision-list">
      {openDecisions.map(decision => <li key={decision}>
        <div className="team-access-decision-copy">
          <strong>{decision}</strong>
          <span>À valider par : responsable du cabinet, responsable clinique habilité et revue confidentialité / données des employés.</span>
        </div>
        <span className="team-access-decision-status">À définir</span>
      </li>)}
    </ul>
    <p className="team-access-decision-note">Les décisions restent à la charge des personnes responsables. Cet aperçu ne crée aucune permission et ne permet pas de saisir ni d’enregistrer une décision.</p>
  </section>;
}

import type { patientDirectory } from '../fixtures';

export const patientDocumentChecklistStatuses = {
  not_applicable: 'Non applicable',
  missing: 'Manquant',
  received: 'Reçu',
  needs_correction: 'À corriger',
  completed_manually: 'Terminé manuellement',
} as const;

export type PatientDocumentChecklistStatus = keyof typeof patientDocumentChecklistStatuses;
export type PatientDocumentChecklistItem = {
  id: 'identity' | 'administrative_consent' | 'manual_checklist';
  label: string;
  status: PatientDocumentChecklistStatus;
  note: string;
};
type PatientDemoRecord = (typeof patientDirectory)[number];

const item = (id: PatientDocumentChecklistItem['id'], label: string, status: PatientDocumentChecklistStatus, note: string): PatientDocumentChecklistItem => ({ id, label, status, note });
const examples: Record<string, PatientDocumentChecklistItem[]> = {
  'DEMO-001': [
    item('identity', 'Pièce administrative', 'missing', 'Exemple de checklist; aucun fichier n’est attendu ni reçu.'),
    item('administrative_consent', 'Consentement administratif', 'received', 'État fictif, sans texte ni preuve de consentement.'),
    item('manual_checklist', 'Vérification administrative', 'needs_correction', 'Exemple sans note libre ni démarche d’assurance.'),
  ],
  'DEMO-002': [
    item('identity', 'Pièce administrative', 'received', 'État illustratif; aucun fichier n’est attaché à ce profil.'),
    item('administrative_consent', 'Consentement administratif', 'missing', 'Aucune déclaration ni preuve réelle de consentement.'),
    item('manual_checklist', 'Checklist administrative (CNSS/CNOPS, si applicable)', 'not_applicable', 'Pas de demande ni d’évaluation d’éligibilité dans cette démo.'),
  ],
  'DEMO-003': [
    item('identity', 'Pièce administrative', 'needs_correction', 'Statut fictif; identité du possible match toujours non vérifiée.'),
    item('administrative_consent', 'Consentement administratif', 'not_applicable', 'Exemple uniquement; aucun consentement n’est recueilli.'),
    item('manual_checklist', 'Checklist administrative (CNSS/CNOPS, si applicable)', 'missing', 'Indique seulement une pièce manquante dans le scénario fictif.'),
  ],
  'DEMO-004': [
    item('identity', 'Pièce administrative', 'completed_manually', 'État d’exemple, sans contrôle d’identité réel.'),
    item('administrative_consent', 'Consentement administratif', 'received', 'Aucune preuve, version ou date de consentement n’est stockée.'),
    item('manual_checklist', 'Checklist administrative (CNSS/CNOPS, si applicable)', 'needs_correction', 'Aucun formulaire, calcul, demande ou suivi assureur.'),
  ],
  'DEMO-005': [
    item('identity', 'Pièce administrative', 'missing', 'Exemple illustratif sans upload patient.'),
    item('administrative_consent', 'Consentement administratif', 'missing', 'Le formulaire de consentement n’est pas activé.'),
    item('manual_checklist', 'Checklist administrative (CNSS/CNOPS, si applicable)', 'completed_manually', 'État de démonstration; aucune démarche auprès d’un assureur.'),
  ],
  'DEMO-006': [
    item('identity', 'Pièce administrative', 'not_applicable', 'Valeur fictive; aucun dossier personnel n’est lu.'),
    item('administrative_consent', 'Consentement administratif', 'needs_correction', 'Aucun texte de consentement n’est rédigé ou enregistré.'),
    item('manual_checklist', 'Checklist administrative (CNSS/CNOPS, si applicable)', 'missing', 'Pas de demande, formulaire ou estimation de remboursement.'),
  ],
  'DEMO-007': [
    item('identity', 'Pièce administrative', 'received', 'Statut d’exemple; aucun document n’est disponible au téléchargement.'),
    item('administrative_consent', 'Consentement administratif', 'completed_manually', 'État illustratif, sans acte de publication ni preuve.'),
    item('manual_checklist', 'Checklist administrative (CNSS/CNOPS, si applicable)', 'not_applicable', 'Aucune procédure d’assurance n’est incluse.'),
  ],
  'DEMO-008': [
    item('identity', 'Pièce administrative', 'missing', 'Exemple local; aucun upload ou stockage.'),
    item('administrative_consent', 'Consentement administratif', 'not_applicable', 'Aucune personne n’a consenti dans ce scénario.'),
    item('manual_checklist', 'Checklist administrative (CNSS/CNOPS, si applicable)', 'received', 'État fictif; aucun fichier ou assureur n’est associé.'),
  ],
  'DEMO-009': [
    item('identity', 'Pièce administrative', 'needs_correction', 'Statut fictif, sans contenu de document.'),
    item('administrative_consent', 'Consentement administratif', 'missing', 'Aucun consentement ni contact patient n’est simulé.'),
    item('manual_checklist', 'Checklist administrative (CNSS/CNOPS, si applicable)', 'completed_manually', 'Aucune demande ou validation d’un organisme externe.'),
  ],
  'DEMO-010': [
    item('identity', 'Pièce administrative', 'completed_manually', 'État fictif, sans vérification d’identité.'),
    item('administrative_consent', 'Consentement administratif', 'received', 'Aucune déclaration ou pièce justificative n’est créée.'),
    item('manual_checklist', 'Checklist administrative (CNSS/CNOPS, si applicable)', 'not_applicable', 'Valeur de démonstration, sans décision d’éligibilité.'),
  ],
};

export function getPatientDocumentChecklistDemo(patient: PatientDemoRecord): PatientDocumentChecklistItem[] {
  return (examples[patient.id] ?? [
    item('identity', 'Pièce administrative', 'missing', 'Exemple fictif sans fichier.'),
    item('administrative_consent', 'Consentement administratif', 'not_applicable', 'Aucun consentement n’est enregistré.'),
    item('manual_checklist', 'Checklist administrative (CNSS/CNOPS, si applicable)', 'not_applicable', 'Aucune démarche ou décision assureur.'),
  ]).map(value => ({ ...value }));
}

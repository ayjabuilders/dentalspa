/** Filing taxonomy only: these labels are not clinical protocols or treatment instructions. */
export const PATIENT_DOCUMENT_CATALOG = [
  { id: 'history', label: 'Antécédents & anamnèse', section: 'clinical', legacy: 'clinical_record', types: [['medical_history', 'Questionnaire médical'], ['dental_history', 'Antécédents dentaires'], ['anamnese', 'Fiche d’anamnèse']] },
  { id: 'examination', label: 'Examens cliniques', section: 'clinical', legacy: 'clinical_record', types: [['oral_exam', 'Examen bucco-dentaire'], ['periodontal_chart', 'Bilan parodontal'], ['occlusion_exam', 'Bilan occlusal']] },
  { id: 'imaging', label: 'Radiologie & imagerie', section: 'clinical', legacy: 'radiograph', types: [['panoramic', 'Panoramique dentaire'], ['retroalveolar', 'Radiographie rétro-alvéolaire'], ['bitewing', 'Radiographie bite-wing'], ['cbct_report', 'Compte rendu / export CBCT'], ['cephalometric', 'Téléradiographie'], ['legacy_unspecified', 'Type non précisé (document existant)']] },
  { id: 'photography', label: 'Photographies cliniques', section: 'clinical', legacy: 'clinical_photo', types: [['intraoral_photo', 'Photographie intra-orale'], ['extraoral_photo', 'Photographie extra-orale'], ['progress_photo', 'Photographie de suivi'], ['legacy_unspecified', 'Type non précisé (document existant)']] },
  { id: 'digital_scan', label: 'Scans numériques & CAD/CAM', section: 'clinical', legacy: 'clinical_record', types: [['scan_report', 'Compte rendu de scan'], ['scan_capture', 'Capture de scan intra-oral'], ['cadcam_export', 'Export de présentation CAD/CAM']] },
  { id: 'treatment_plan', label: 'Diagnostic & plans de traitement', section: 'clinical', legacy: 'clinical_record', types: [['diagnostic_report', 'Bilan diagnostique externe'], ['treatment_plan', 'Plan de traitement'], ['referral_plan', 'Avis spécialisé']] },
  { id: 'consent', label: 'Consentements', section: 'clinical', legacy: 'care_consent', types: [['care_consent', 'Consentement aux soins'], ['surgery_consent', 'Consentement chirurgical'], ['image_consent', 'Autorisation d’utilisation des images']] },
  { id: 'prescriptions', label: 'Ordonnances', section: 'clinical', legacy: 'prescription', types: [['medication_prescription', 'Ordonnance médicamenteuse'], ['imaging_prescription', 'Prescription d’imagerie'], ['laboratory_prescription', 'Prescription d’examens'], ['legacy_unspecified', 'Type non précisé (document existant)']] },
  { id: 'reports', label: 'Comptes rendus cliniques & chirurgicaux', section: 'clinical', legacy: 'report', types: [['consultation_report', 'Compte rendu de consultation'], ['surgical_report', 'Compte rendu opératoire'], ['clinical_letter', 'Courrier clinique'], ['legacy_unspecified', 'Type non précisé (document existant)']] },
  { id: 'laboratory', label: 'Documents de laboratoire', section: 'clinical', legacy: 'lab_result', types: [['prosthetic_order', 'Fiche de laboratoire prothétique'], ['lab_result', 'Résultat d’analyse'], ['prosthetic_certificate', 'Certificat / traçabilité prothétique']] },
  { id: 'external', label: 'Documents médicaux externes', section: 'clinical', legacy: 'clinical_record', types: [['referral_letter', 'Lettre d’adressage'], ['specialist_opinion', 'Avis d’un spécialiste'], ['external_record', 'Dossier externe']] },
  { id: 'follow_up', label: 'Suivi & surveillance', section: 'clinical', legacy: 'report', types: [['followup_report', 'Compte rendu de contrôle'], ['monitoring_sheet', 'Fiche de suivi'], ['postoperative_record', 'Document de suivi postopératoire']] },
  { id: 'administrative', label: 'Administratif / CNSS', section: 'administrative', legacy: 'other', types: [['identity', 'Pièce d’identité'], ['insurance', 'Attestation d’assurance'], ['cnss', 'Formulaire CNSS'], ['cnops', 'Formulaire CNOPS'], ['administrative_letter', 'Courrier administratif'], ['legacy_unspecified', 'Type non précisé (document existant)']] },
  { id: 'other', label: 'Autres documents', section: 'clinical', legacy: 'other', types: [['other', 'Autre document médical'], ['legacy_unspecified', 'Type non précisé (document existant)']] },
] as const;

export type PatientLibraryCategory = typeof PATIENT_DOCUMENT_CATALOG[number]['id'];
export function patientDocumentDefinition(category: string, type: string) {
  const group = PATIENT_DOCUMENT_CATALOG.find(item => item.id === category);
  const selected = group?.types.find(item => item[0] === type);
  return group && selected ? { category: group.id, categoryLabel: group.label, type: selected[0], typeLabel: selected[1], section: group.section, legacy: group.legacy } : null;
}

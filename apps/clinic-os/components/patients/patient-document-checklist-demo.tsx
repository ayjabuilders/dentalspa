'use client';

import { useEffect, useState } from 'react';
import { ClipboardList, FileLock2, ShieldCheck } from 'lucide-react';
import { patientDirectory } from '../fixtures';
import { getPatientDocumentChecklistDemo, patientDocumentChecklistStatuses, type PatientDocumentChecklistItem, type PatientDocumentChecklistStatus } from './patient-document-checklist-data';
import './patient-document-checklist-demo.css';

type PatientDemoRecord = (typeof patientDirectory)[number];
const statusEntries = Object.entries(patientDocumentChecklistStatuses) as [PatientDocumentChecklistStatus, string][];

export function PatientDocumentChecklistDemo({ patient, onItemsChange }: { patient: PatientDemoRecord; onItemsChange?: (items: PatientDocumentChecklistItem[]) => void }) {
  const [items, setItems] = useState<PatientDocumentChecklistItem[]>(() => getPatientDocumentChecklistDemo(patient));
  const [changed, setChanged] = useState(false);
  useEffect(() => { setItems(getPatientDocumentChecklistDemo(patient)); setChanged(false); }, [patient.id, patient]);
  useEffect(() => { onItemsChange?.(items); }, [items, onItemsChange]);

  function updateItem(id: PatientDocumentChecklistItem['id'], status: PatientDocumentChecklistStatus) {
    setItems(current => current.map(item => item.id === id ? { ...item, status } : item));
    setChanged(true);
  }

  return <section id="patient-checklist" className="work-panel patient-documents-demo" aria-labelledby="patient-documents-title" tabIndex={-1}>
    <header><span className="patient-profile-icon"><ClipboardList size={19}/></span><div><p className="eyebrow muted">ADMINISTRATION · SCÉNARIO LOCAL</p><h2 id="patient-documents-title">Checklist documentaire</h2></div><span className="pill">Fictive</span></header>
    <p className="patient-documents-note" role="note"><ShieldCheck size={16}/><span>Exemple de statuts administratifs, indépendant de l’historique du profil. Modifier un statut ne sauvegarde ni dossier ni document.</span></p>
    <div className="patient-documents-list">
      {items.map(item => <div className="patient-documents-row" key={item.id}>
        <label htmlFor={`patient-document-${patient.id}-${item.id}`}><strong>{item.label}</strong><small>{item.note}</small></label>
        <select id={`patient-document-${patient.id}-${item.id}`} aria-label={`${item.label} · statut de démonstration`} value={item.status} onChange={event => updateItem(item.id, event.target.value as PatientDocumentChecklistStatus)}>
          {statusEntries.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>)}
    </div>
    <footer>
      <p><FileLock2 size={15}/>Aucun fichier n’est importé, publié ou téléchargeable dans cette démo.</p>
      <p>CNSS/CNOPS : checklist manuelle uniquement. Aucun formulaire, calcul, dépôt de demande ou résultat assureur.</p>
      <span className="patient-documents-feedback" role="status" aria-live="polite">{changed ? 'Aperçu modifié · non enregistré' : 'Aperçu local · rien à enregistrer'}</span>
    </footer>
  </section>;
}

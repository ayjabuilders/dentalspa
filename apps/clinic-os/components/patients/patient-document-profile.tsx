'use client';
import { useState } from 'react';
import { PatientDocumentLibrary } from './document-library';
import { useConnectedNavigation } from '../../lib/connected-navigation';
import './patient-hub.css';

export function PatientDocumentProfile({ api, token, clinicId, patientId, patientLabel, patientReference, onSessionExpired }: {
  api:string; token:string; clinicId:string; patientId:string; patientLabel:string; patientReference:string; onSessionExpired:()=>void;
}) {
  const [section,setSection]=useState<'administrative'|'clinical'>('clinical');
  const {locked}=useConnectedNavigation();
  return <section className="patient-hub" aria-label="Dossier documentaire du patient">
    <header className="patient-hub-identity"><div className="patient-hub-name"><span className="eyebrow">{patientReference}</span><h1>{patientLabel}</h1></div></header>
    <div className="patient-hub-tabs" role="tablist" aria-label="Dossiers du patient">
      {(['administrative','clinical'] as const).map(value=><button key={value} type="button" role="tab" id={'document-profile-'+value} aria-selected={section===value} aria-controls="document-profile-panel" disabled={locked} onClick={()=>setSection(value)}>{value==='administrative'?'Dossier administratif':'Dossier médical'}</button>)}
    </div>
    <div role="tabpanel" id="document-profile-panel" aria-labelledby={'document-profile-'+section}>
      <PatientDocumentLibrary key={section} section={section} api={api} token={token} clinicId={clinicId} patientId={patientId} patientLabel={patientLabel} patientReference={patientReference} onSessionExpired={onSessionExpired}/>
    </div>
  </section>;
}

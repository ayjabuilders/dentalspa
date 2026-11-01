'use client';
import type { PatientHub } from '@dental/contracts';
import { ChevronDown, FileText, Printer } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { FinancialDocument, FinancialDocumentDialog, type FinancialDocumentData } from './financial-document';
import { financialBrandingForLocalDemo } from './financial-document-branding';
import { useConnectedNavigation } from '../../lib/connected-navigation';

type Props = { quote: PatientHub['quotes'][number]; index: number; children?: ReactNode; historical?: boolean; clinicName?: string; clinicId?: string; patient?: Pick<PatientHub['patient'], 'display_name' | 'reference'> };
export function PatientQuote({ quote, index, children, historical=false, clinicName='Cabinet connecté', clinicId, patient }: Props) {
  const [preview,setPreview]=useState(false);
  const {locked}=useConnectedNavigation();
  const money = (minor: number) => new Intl.NumberFormat('fr-MA', { style: 'currency', currency: quote.currency_code }).format(minor / 100);
  const title=`Devis ${index+1}`;
  const document:FinancialDocumentData|undefined=quote.details?{
    kind:'quote',title,clinicName,patient,reference:quote.id,details:quote.details,totalMinor:quote.total_minor,currency:quote.currency_code,historical,branding:financialBrandingForLocalDemo(clinicId),
    metadata:[{label:'Version enregistrée',value:String(quote.version)},{label:'Validité prévue',value:quote.details.valid_until?new Intl.DateTimeFormat('fr-MA',{dateStyle:'long',timeZone:'UTC'}).format(new Date(`${quote.details.valid_until}T12:00:00Z`)):'Non précisée'},{label:'État',value:'Brouillon non émis'}],
  }:undefined;
  return <details className="patient-quote financial-quote-card">
    <summary><span className="financial-quote-icon"><FileText size={21}/></span><span><strong>{historical?`Version ${quote.version}`:title}</strong><small>{historical?'Version précédente conservée':`Brouillon · version ${quote.version}`}</small></span><strong className="financial-quote-amount">{money(quote.total_minor)}</strong><ChevronDown size={18}/></summary>
    {document ? <div className="patient-quote-detail financial-quote-detail">
      <div className="financial-quote-actions"><p>Version enregistrée · non émise · non publiée au patient</p><button type="button" disabled={locked} onClick={()=>setPreview(true)}><Printer size={17}/>Aperçu / impression</button></div>
      <FinancialDocument data={document}/>
      {children&&<div className="patient-quote-edit">{children}</div>}
      {!!quote.history?.length&&<details className="patient-quote-history"><summary>Historique des versions ({quote.history.length})</summary>{quote.history.map(version=><PatientQuote key={version.version} quote={version} index={index} clinicName={clinicName} clinicId={clinicId} patient={patient} historical/>)}</details>}
      {preview&&<FinancialDocumentDialog title={`${title} · brouillon`} kind="quote" onClose={()=>setPreview(false)}><FinancialDocument data={document}/></FinancialDocumentDialog>}
    </div> : <p>Détail des prestations indisponible.</p>}
  </details>;
}

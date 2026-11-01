'use client';
import { LocalInvoiceRecordSchema } from '@dental/contracts';
import { financialBrandingForLocalDemo } from './financial-document-branding';
import { FinancialDocument, FinancialDocumentDialog } from './financial-document';

type Invoice=ReturnType<typeof LocalInvoiceRecordSchema.parse>;
export function InvoiceDocument({invoice,onClose}:{invoice:Invoice;onClose:()=>void}){
  if(invoice.state!=='issued')return null;
  const snapshot=invoice.snapshot;
  const title=`Facture ${invoice.number}`;
  return <FinancialDocumentDialog title={title} kind="invoice" onClose={onClose}><FinancialDocument data={{
    kind:'invoice',title,clinicName:snapshot.clinic.name,branding:financialBrandingForLocalDemo(snapshot.clinic.id),patient:snapshot.patient,payerName:snapshot.payer.display_name,
    reference:invoice.quote_id,details:snapshot.quote.details,totalMinor:invoice.total_minor,currency:invoice.currency_code,
    metadata:[{label:'Numéro de facture',value:invoice.number!},{label:'Émise le',value:new Intl.DateTimeFormat('fr-MA',{dateStyle:'long',timeStyle:'short',timeZone:'Africa/Casablanca'}).format(new Date(invoice.issued_at!))},{label:'Fuseau horaire',value:'Casablanca'},{label:'Devis source',value:`Version ${invoice.quote_version}`}],
  }}/></FinancialDocumentDialog>;
}

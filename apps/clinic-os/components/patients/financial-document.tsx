'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import type { PatientHub } from '@dental/contracts';
import './financial-document.css';

type Details = NonNullable<PatientHub['quotes'][number]['details']>;
export type FinancialDocumentBranding = { logoSrc: string; printLogoSrc: string; logoAlt: string };
export type FinancialDocumentData = {
  kind: 'quote' | 'invoice';
  title: string;
  clinicName: string;
  patient?: { display_name: string; reference: string };
  payerName?: string;
  reference: string;
  metadata: Array<{ label: string; value: string }>;
  details: Details;
  totalMinor: number;
  currency: string;
  historical?: boolean;
  branding?: FinancialDocumentBranding;
};

/** A supplied, explicitly scoped image takes precedence over the typographic fallback. */
export function ClinicDocumentIdentity({ name, branding }: { name: string; branding?: FinancialDocumentBranding }) {
  const initials = name.trim().split(/\s+/u).filter(Boolean).slice(0, 2).map(word => [...word][0]).join('').toLocaleUpperCase('fr');
  if (branding) return <div className="financial-clinic-identity financial-clinic-branded"><div className="financial-clinic-logo"><span className="financial-logo-window financial-logo-screen"><img src={branding.logoSrc} alt={branding.logoAlt} width={1600} height={1160}/></span><span className="financial-logo-window financial-logo-print"><img src={branding.printLogoSrc} alt="" width={1600} height={1160}/></span></div><div><span>Cabinet enregistré</span><strong>{name}</strong></div></div>;
  return <div className="financial-clinic-identity"><span className="financial-clinic-monogram" aria-hidden="true">{initials || 'C'}</span><div><span>Cabinet</span><strong>{name}</strong></div></div>;
}

export function FinancialDocument({ data }: { data: FinancialDocumentData }) {
  const money = (value: number) => new Intl.NumberFormat('fr-MA', { style: 'currency', currency: data.currency }).format(value / 100);
  const quote = data.kind === 'quote';
  return <article className="financial-document-paper" data-kind={data.kind} data-branded={!!data.branding}>
    <header className="financial-document-letterhead">
      <ClinicDocumentIdentity name={data.clinicName} branding={data.branding}/>
      <div className="financial-document-title"><span className="financial-document-kicker">{quote ? 'PROPOSITION TARIFAIRE' : 'DOCUMENT DE FACTURATION'}</span><h2>{data.title}</h2><span className="financial-document-state" data-kind={data.kind}>{quote ? data.historical ? 'Version précédente · brouillon' : 'Brouillon non émis' : 'Émise · démonstration'}</span></div>
    </header>
    <div className="financial-document-parties">
      <section><h3>{quote ? 'Préparé pour' : 'Patient'}</h3>{data.patient ? <><strong>{data.patient.display_name}</strong><p>Référence patient · {data.patient.reference}</p></> : <p>Identité non disponible dans cette vue</p>}{data.payerName && <p className="financial-document-payer">Payeur fictif · {data.payerName}</p>}</section>
      <dl>{data.metadata.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
    </div>
    <table className="financial-document-lines">
      <caption>{quote ? 'Prestations du devis' : 'Prestations enregistrées'}</caption>
      <colgroup><col className="financial-line-label"/><col className="financial-line-quantity"/><col/><col/></colgroup>
      <thead><tr><th scope="col">Prestation</th><th scope="col">Qté</th><th scope="col">Prix unitaire</th><th scope="col">Montant</th></tr></thead>
      <tbody>{data.details.lines.map(line => <tr key={line.line_number}><th scope="row"><span>{line.label}</span>{(line.discount_minor > 0 || line.tax_minor > 0) && <small>Remise {money(line.discount_minor)} · taxe {money(line.tax_minor)}</small>}</th><td data-label="Quantité">{line.quantity}</td><td data-label="Prix unitaire">{money(line.unit_amount_minor)}</td><td data-label="Montant">{money(line.total_minor)}</td></tr>)}</tbody>
    </table>
    <div className="financial-document-ending"><div className="financial-document-summary"><div className="financial-document-note"><span>{quote ? 'À propos de ce devis' : 'À propos de cette facture'}</span><p>{quote ? 'Proposition enregistrée, non émise et non publiée au patient. Ce brouillon ne constitue pas un paiement.' : 'Contenu figé lors de l’émission. Cette facture ne prouve aucun paiement et n’a pas été envoyée au patient.'}</p></div><dl className="financial-document-totals"><div><dt>Sous-total</dt><dd>{money(data.details.subtotal_minor)}</dd></div><div><dt>Remise</dt><dd>{money(data.details.discount_minor)}</dd></div><div><dt>Taxe enregistrée</dt><dd>{money(data.details.tax_minor)}</dd></div><div><dt>{quote ? 'Total du brouillon' : 'Total facturé'}</dt><dd>{money(data.totalMinor)}</dd></div></dl></div>
    <footer className="financial-document-footer"><p className="financial-document-reference"><span>{quote ? 'Identifiant du devis' : 'Devis source'}</span>{data.reference}</p><strong>{quote ? 'Brouillon de démonstration locale · non émis.' : 'Document de démonstration locale — sans valeur fiscale.'}</strong><p>{quote ? 'Aucune signature, approbation clinique ou publication patient n’est représentée.' : 'Identité et payeur issus de données fictives. Document non fiscal.'}</p></footer></div>
  </article>;
}

export function FinancialDocumentDialog({ title, children, onClose, kind }: { title: string; children: ReactNode; onClose: () => void; kind: 'quote' | 'invoice' }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current, previous = document.activeElement; element?.showModal(); return () => { element?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); }; }, []);
  return createPortal(<dialog ref={dialog} data-ds="pearl" data-document-kind={kind} className="invoice-document financial-document-dialog" aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="invoice-document-controls financial-document-controls"><div><strong>{kind === 'quote' ? 'Aperçu du devis' : 'Aperçu de la facture'}</strong><span>{kind === 'quote' ? 'Brouillon · non émis' : 'Document non fiscal'}</span></div><button type="button" onClick={() => window.print()}><Printer size={17}/><span>Imprimer / PDF</span></button><button type="button" onClick={onClose} aria-label="Fermer le document"><X size={20}/></button></div>
    {children}
  </dialog>, document.body);
}

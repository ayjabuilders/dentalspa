'use client';
import { useEffect, useRef, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Modal } from '@dental/ui-clinic';
import type { PatientDocumentDraft, PatientDocumentItem } from '@dental/contracts';
import { PatientDocumentError, patientDocumentMessages, type PatientDocumentsTransport, type PatientDocumentSnapshot } from './patient-documents-transport';
import { ClinicDocumentIdentity } from './financial-document';
import { financialBrandingForLocalDemo } from './financial-document-branding';

export function PatientDocumentPaper({ document, draft, patientLabel, patientReference, clinicLabel }: {
  document: PatientDocumentSnapshot | PatientDocumentDraft; draft: boolean; patientLabel?: string; patientReference?: string; clinicLabel?: string;
}) {
  const snapshot = 'kind' in document ? document : null;
  return <article className="pd-generated-paper">
    <header><ClinicDocumentIdentity name={snapshot?.clinic_name ?? clinicLabel ?? 'Cabinet connecté'} branding={financialBrandingForLocalDemo(document.clinic_id)}/><div className="pd-paper-meta"><p>{document.document_date}</p><p>Version {document.version}</p></div></header>
    {draft && <div className="pd-draft-mark">BROUILLON · NON VALIDÉ · NE PAS UTILISER COMME DOCUMENT VALIDÉ</div>}
    <section className="pd-paper-patient"><p className="pd-paper-meta">{document.type === 'prescription' ? 'Ordonnance' : 'Compte rendu'}</p><h2>{document.title}</h2><h3>{snapshot?.patient_name ?? patientLabel ?? 'Dossier patient'}</h3>{(snapshot?.patient_reference ?? patientReference) && <p className="pd-paper-meta">Référence · {snapshot?.patient_reference ?? patientReference}</p>}</section>
    <div className="pd-authored-body">{document.content.body || 'Document vierge — aucun contenu rédigé.'}</div>
    <footer><p>{draft ? 'Brouillon en cours de rédaction. Aucune validation clinique.' : snapshot ? 'Validation enregistrée par ' + snapshot.validated_by_name + ' · ' + new Intl.DateTimeFormat('fr-MA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Casablanca' }).format(new Date(snapshot.validated_at)) : ''}</p></footer>
  </article>;
}

export function PatientDocumentsPreview({ item, draft, transport, patientLabel, patientReference, clinicLabel, onClose, returnFocus }: {
  item?: PatientDocumentItem; draft?: PatientDocumentDraft; transport: PatientDocumentsTransport;
  patientLabel?: string; patientReference?: string; clinicLabel?: string; onClose: () => void; returnFocus?: HTMLElement | null;
}) {
  const [loading, setLoading] = useState(!!item), [error, setError] = useState(''), [reload, setReload] = useState(0);
  const [content, setContent] = useState<{ url: string; snapshot: PatientDocumentSnapshot | null } | null>(null);
  const printButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!item) return;
    const controller = new AbortController(); let objectUrl: string | null = null, active = true;
    setContent(null); setLoading(true); setError('');
    void transport.content(item, controller.signal).then(result => {
      if (!active) return; objectUrl = URL.createObjectURL(result.blob); setContent({ url: objectUrl, snapshot: result.snapshot });
    }).catch(failure => { if (active) setError(patientDocumentMessages[failure instanceof PatientDocumentError ? failure.kind : 'unavailable']); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [item, transport, reload]);
  useEffect(() => {
    const after = () => printButton.current?.focus(); window.addEventListener('afterprint', after);
    return () => window.removeEventListener('afterprint', after);
  }, []);
  const document = draft ?? content?.snapshot, title = draft?.title ?? item?.title ?? 'Document';
  const extension = item?.content_type === 'application/pdf' ? '.pdf' : item?.content_type === 'image/jpeg' ? '.jpg' : item?.content_type === 'image/png' ? '.png' : '.json';
  function download() {
    if (!content) return;
    const anchor = window.document.createElement('a'); anchor.href = content.url; anchor.download = title.replace(/[<>:"/\\|?*]/gu, '_') + extension; anchor.style.display = 'none'; window.document.body.appendChild(anchor); anchor.click(); anchor.remove();
  }
  return <Modal open wide mobilePresentation="sheet" className={'patient-documents-modal' + (document ? ' pd-printable-dialog' : '')} returnFocus={returnFocus} title={title} description={draft ? 'Aperçu du brouillon enregistré — non validé.' : item?.source === 'upload' ? 'Document importé. Le dépôt ne vaut pas validation clinique.' : 'Version conservée après validation.'} onOpenChange={open => { if (!open) onClose(); }}>
    <div className="pd-preview-toolbar"><span>{draft ? 'Brouillon · version ' + draft.version : item?.source === 'upload' ? 'Fichier original' : 'Document validé'}</span><div>{content && <button type="button" onClick={download}><Download size={16}/>{content.snapshot ? 'Exporter JSON' : 'Télécharger l’original'}</button>}{document && <button type="button" ref={printButton} onClick={() => window.print()}><Printer size={16}/>Imprimer / PDF</button>}</div></div>
    {loading && <p role="status">Chargement sécurisé du document…</p>}{error && <div className="pd-error" role="alert"><p>{error}</p><button onClick={() => setReload(value => value + 1)}>Réessayer</button></div>}
    {document && <PatientDocumentPaper document={document} draft={!!draft} patientLabel={patientLabel} patientReference={patientReference} clinicLabel={clinicLabel}/>}
    {content && !content.snapshot && (item?.content_type === 'application/pdf' ? <><iframe className="pd-file-preview" title={'Aperçu de ' + title} src={content.url} sandbox="" referrerPolicy="no-referrer"/><p className="pd-help">Si l’aperçu PDF n’est pas disponible sur cet appareil, téléchargez le fichier original.</p></> : <img className="pd-file-preview" src={content.url} alt={title}/>)}
  </Modal>;
}

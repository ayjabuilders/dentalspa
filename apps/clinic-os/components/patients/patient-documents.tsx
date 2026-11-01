'use client';
import { createRequestKey } from '../../lib/request-key';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Modal } from '@dental/ui-clinic';
import { ArrowUpRight, ChevronLeft, ChevronRight, Download, FileText, FolderOpen, Image as ImageIcon, Plus, RefreshCw, Search, ShieldCheck, Upload, X } from 'lucide-react';
import type { PatientDocumentCapabilities, PatientDocumentDraft, PatientDocumentItem, PatientDocumentKind, PatientDocumentSection, PatientGeneratedType } from '@dental/contracts';
import { useConnectedNavigationLock } from '../../lib/connected-navigation';
import { createPatientDocumentsTransport, PatientDocumentError, patientDocumentMessages, validatePatientDocumentFile, type PatientDocumentList, type PatientDocumentDraftList, type PatientDocumentsTransport, type PatientDocumentUpload, type PatientDocumentFailure } from './patient-documents-transport';
import { PatientDocumentsPreview } from './patient-documents-preview';
import { PatientDocumentsEditor } from './patient-documents-editor';
import './patient-documents.css';

export type PatientDocumentsProps = { api: string; token: string; clinicId: string; patientId: string; onSessionExpired: () => void; patientLabel?: string; patientReference?: string; clinicLabel?: string; checklist?: ReactNode; initialSection?: PatientDocumentSection };
export const patientDocumentCategoryLabels: Record<string, string> = { identity: 'Identité', insurance: 'Assurance', cnss: 'CNSS', cnops: 'CNOPS', other: 'Autre document', report: 'Compte rendu', prescription: 'Ordonnance', clinical_record: 'Dossier médical', radiograph: 'Radiographie', clinical_photo: 'Photographie clinique', lab_result: 'Résultat de laboratoire', care_consent: 'Consentement aux soins' };
export function patientDocumentToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}
const dateLabel = (date: string) => new Intl.DateTimeFormat('fr-MA', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));
const failureText = (error: unknown) => patientDocumentMessages[error instanceof PatientDocumentError ? error.kind : 'unavailable'];

export function PatientDocuments(props: PatientDocumentsProps) { return <DocumentsWorkspace key={props.clinicId + ':' + props.patientId + ':' + props.token} {...props}/>; }
function DocumentsWorkspace({ api, token, clinicId, patientId, onSessionExpired, patientLabel, patientReference, clinicLabel, checklist, initialSection = 'administrative' }: PatientDocumentsProps) {
  const [section, setSection] = useState<PatientDocumentSection>(initialSection), [view, setView] = useState<'files' | PatientGeneratedType>('files');
  const [query, setQuery] = useState(''), [submitted, setSubmitted] = useState(''), [cursors, setCursors] = useState<(string | null)[]>([null]), [page, setPage] = useState(0);
  const [files, setFiles] = useState<PatientDocumentList | null>(null), [drafts, setDrafts] = useState<PatientDocumentDraftList | null>(null), [capabilities, setCapabilities] = useState<PatientDocumentCapabilities | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [reload, setReload] = useState(0), [online, setOnline] = useState(true);
  const [upload, setUpload] = useState(false), [editor, setEditor] = useState<{ type: PatientGeneratedType; draft?: PatientDocumentDraft } | null>(null), [preview, setPreview] = useState<{ item?: PatientDocumentItem; draft?: PatientDocumentDraft } | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null), searchInput = useRef<HTMLInputElement>(null), urls = useRef(new Set<string>()), downloadOperation = useRef<AbortController | null>(null);
  const callbacks = useRef({ onSessionExpired }); callbacks.current = { onSessionExpired };
  const clearPrivate = useRef<(kind: PatientDocumentFailure) => void>(() => {});
  clearPrivate.current = kind => { setError(patientDocumentMessages[kind]); setCapabilities(null); setFiles(null); setDrafts(null); setPreview(null); setEditor(null); setUpload(false); setNotice(''); for (const url of urls.current) URL.revokeObjectURL(url); urls.current.clear(); };
  const transport = useMemo(() => createPatientDocumentsTransport({ api, token, clinicId, patientId, onSessionExpired: () => callbacks.current.onSessionExpired(), onPrivateClear: kind => clearPrivate.current(kind) }), [api, token, clinicId, patientId]);
  useConnectedNavigationLock(upload || !!editor || !!preview || !!downloading);
  useEffect(() => {
    const network = () => { setOnline(navigator.onLine); if (!navigator.onLine) { setCapabilities(null); setFiles(null); setDrafts(null); setPreview(null); setError(patientDocumentMessages.offline); downloadOperation.current?.abort(); for (const url of urls.current) URL.revokeObjectURL(url); urls.current.clear(); } };
    network(); window.addEventListener('online', network); window.addEventListener('offline', network);
    const objectUrls = urls.current;
    return () => { transport.cancelAll(); downloadOperation.current?.abort(); for (const url of objectUrls) URL.revokeObjectURL(url); objectUrls.clear(); window.removeEventListener('online', network); window.removeEventListener('offline', network); };
  }, [transport]);
  const cursor = cursors[page] ?? null;
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setFiles(null); setDrafts(null); setLoading(online); setError(online ? '' : patientDocumentMessages.offline);
    if (online) void (view === 'files' ? transport.list(section, submitted, cursor, controller.signal) : transport.drafts(view, submitted, cursor, controller.signal)).then(result => {
      if (!active) return; setCapabilities(result.capabilities);
      if ('section' in result) setFiles(result); else setDrafts(result);
    }).catch(failure => { if (active) { setFiles(null); setDrafts(null); setCapabilities(null); setError(failureText(failure)); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [transport, section, view, submitted, cursor, reload, online]);
  const remember = () => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; };
  function resetPage() { setCursors([null]); setPage(0); }
  function selectSection(value: PatientDocumentSection) { setSection(value); setView('files'); setSubmitted(''); setQuery(''); resetPage(); setNotice(''); }
  function selectView(value: typeof view) { setView(value); setSubmitted(''); setQuery(''); resetPage(); }
  function search(event: FormEvent) { event.preventDefault(); setSubmitted(query.trim()); resetPage(); setReload(value => value + 1); }
  async function download(item: PatientDocumentItem) {
    if (downloading) return; const controller = new AbortController(); downloadOperation.current = controller; setDownloading(item.id); setError('');
    try {
      const result = await transport.content(item, controller.signal); if (controller.signal.aborted) return;
      const url = URL.createObjectURL(result.blob); urls.current.add(url);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = item.title.replace(/[<>:"/\\|?*]/gu, '_') + ({ 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg', 'application/json': '.json' }[item.content_type]); anchor.style.display = 'none'; document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); }, 1000);
    } catch (failure) { if (!controller.signal.aborted) setError(failureText(failure)); }
    finally { if (downloadOperation.current === controller) { setDownloading(null); downloadOperation.current = null; } }
  }
  const next = files?.next_cursor ?? drafts?.next_cursor ?? null, count = files?.items.length ?? drafts?.items.length ?? 0;
  const unavailable = !online || loading || !!downloading;
  return <section className="patient-documents" aria-label="Documents du patient">
    <header className="patient-documents-heading"><span className="patient-documents-emblem"><FolderOpen size={22}/></span><div><h3>Documents du dossier</h3><p>Pièces administratives, documents médicaux et brouillons.</p></div><button className="pd-icon" aria-label="Actualiser les documents" title="Actualiser les documents" disabled={unavailable} onClick={() => setReload(value => value + 1)}><RefreshCw size={18}/></button></header>
    <div className="patient-documents-tabs" role="tablist" aria-label="Espaces documentaires">{([['administrative', 'Administratif'], ['clinical', 'Dossier médical']] as const).map(([value, label]) => <button key={value} role="tab" aria-selected={section === value} disabled={!!capabilities && !(value === 'administrative' ? capabilities.can_read_administrative : capabilities.can_read_clinical)} onClick={() => selectSection(value)}>{label}</button>)}</div>
    <div className="pd-toolbar"><div className="pd-views" role="group" aria-label="Documents et brouillons"><button aria-pressed={view === 'files'} onClick={() => selectView('files')}>Documents</button>{section === 'clinical' && capabilities?.can_create_report && <button aria-pressed={view === 'report'} onClick={() => selectView('report')}>Mes comptes rendus</button>}{section === 'clinical' && capabilities?.can_create_prescription && <button aria-pressed={view === 'prescription'} onClick={() => selectView('prescription')}>Mes ordonnances</button>}</div><div>{capabilities?.can_upload && view === 'files' && !error && <button className="pd-primary" disabled={unavailable} onClick={() => { remember(); setUpload(true); }}><Upload size={17}/>Ajouter un fichier</button>}{section === 'clinical' && capabilities?.can_create_report && <button disabled={unavailable} onClick={() => { remember(); setEditor({ type: 'report' }); }}><Plus size={17}/>Nouveau compte rendu</button>}{section === 'clinical' && capabilities?.can_create_prescription && <button disabled={unavailable} onClick={() => { remember(); setEditor({ type: 'prescription' }); }}><Plus size={17}/>Nouvelle ordonnance</button>}</div></div>
    <form className="pd-search" onSubmit={search}><label>Rechercher un document<span className="pd-search-field"><Search size={17}/><input ref={searchInput} value={query} maxLength={100} placeholder="Titre du document…" autoComplete="off" onChange={event => setQuery(event.target.value)}/>{query && <button type="button" aria-label="Effacer la recherche de documents" onClick={() => { setQuery(''); setSubmitted(''); resetPage(); searchInput.current?.focus(); }}><X size={16}/></button>}</span></label><button type="submit" disabled={!online}>Rechercher</button></form>
    {view !== 'files' && <p className="pd-search-note">Vos brouillons enregistrés. Leur contenu n’est pas validé ni publié au patient.</p>}
    <div className="pd-status" role="status" aria-live="polite">{loading ? <p>Chargement des documents autorisés…</p> : error ? <div className="pd-state"><h4>Documents indisponibles</h4><p>{error}</p>{online && <button onClick={() => setReload(value => value + 1)}>Réessayer</button>}</div> : !count ? <div className="pd-state"><FileText size={26}/><h4>{submitted ? 'Aucun document pour cette recherche' : view === 'files' ? 'Aucun document enregistré' : 'Aucun brouillon enregistré'}</h4><p>{submitted ? 'Essayez un autre titre.' : view === 'files' ? 'Les fichiers déposés dans cet espace apparaîtront ici.' : 'Choisissez un modèle vierge pour commencer une rédaction.'}</p>{page > 0 && <button onClick={resetPage}>Revenir à la première page</button>}</div> : null}{notice && <p>{notice}</p>}{downloading && <p>Préparation du fichier original…</p>}</div>
    <ul className="pd-list">{files?.items.map(item => <li key={item.id}><span className="pd-document-icon">{item.content_type.startsWith('image/') ? <ImageIcon size={22}/> : <FileText size={22}/>}</span><div className="pd-document-info"><h4>{item.title}</h4><p>{patientDocumentCategoryLabels[item.category] ?? item.category} · {dateLabel(item.document_date)} · v{item.version}</p><p><span className="pd-badge" data-state={item.source === 'generated' ? 'validated' : 'stored'}>{item.source === 'generated' ? 'Validé' : 'Importé'}</span>{item.source === 'upload' && <span>{Math.max(1, Math.round(item.size_bytes / 1024))} Ko</span>}</p></div><div className="pd-row-actions"><button disabled={!!downloading} aria-label={'Consulter ' + item.title} onClick={() => { remember(); setPreview({ item }); }}>Consulter<ArrowUpRight size={17}/></button>{item.source === 'upload' && <button className="pd-icon" disabled={!!downloading} aria-label={'Télécharger ' + item.title} title="Télécharger le fichier original" onClick={() => void download(item)}><Download size={17}/></button>}</div></li>)}</ul>
    <ul className="pd-list">{drafts?.items.map(draft => <li key={draft.id}><span className="pd-document-icon"><FileText size={22}/></span><div className="pd-document-info"><h4>{draft.title}</h4><p>{dateLabel(draft.document_date)} · version {draft.version}</p><p><span className="pd-badge" data-state="draft">Brouillon · non validé</span></p></div><div className="pd-row-actions"><button aria-label={'Modifier ' + draft.title} disabled={!capabilities?.can_edit_draft} onClick={() => { remember(); setEditor({ type: draft.type, draft }); }}>Ouvrir le brouillon<ArrowUpRight size={17}/></button></div></li>)}</ul>
    <footer className="pd-pagination"><span>{loading ? 'Lecture en cours' : count + ' document(s) sur cette page'} · 10 maximum</span><nav aria-label="Pages des documents"><button className="pd-icon" aria-label="Page précédente des documents" disabled={unavailable || page === 0} onClick={() => setPage(value => value - 1)}><ChevronLeft size={18}/></button><span>Page {page + 1}</span><button className="pd-icon" aria-label="Page suivante des documents" disabled={unavailable || !next} onClick={() => { if (next) { setCursors(previous => [...previous.slice(0, page + 1), next]); setPage(value => value + 1); } }}><ChevronRight size={18}/></button></nav></footer>
    <p className="pd-boundary"><ShieldCheck size={16}/><span>Un fichier importé n’est pas une validation clinique. Les documents restent internes au cabinet.</span></p>
    {section === 'administrative' && checklist && <div className="pd-checklist">{checklist}</div>}
    {upload && capabilities && <DocumentUpload section={section} transport={transport} categories={capabilities.categories.filter(category => (section === 'administrative' ? ['identity', 'insurance', 'cnss', 'cnops', 'other'] : ['radiograph', 'clinical_photo', 'lab_result', 'care_consent', 'report', 'prescription', 'clinical_record', 'other']).includes(category))} returnFocus={opener.current} onClose={() => setUpload(false)} onSaved={() => { setUpload(false); resetPage(); setReload(value => value + 1); setNotice('Fichier enregistré dans le dossier.'); }}/>}
    {editor && capabilities && <PatientDocumentsEditor transport={transport} type={editor.type} initialDraft={editor.draft} capabilities={capabilities} patientLabel={patientLabel} patientReference={patientReference} clinicLabel={clinicLabel} returnFocus={opener.current} onClose={() => setEditor(null)} onSaved={() => setReload(value => value + 1)} onValidated={() => { setEditor(null); setView('files'); resetPage(); setReload(value => value + 1); setNotice('Version validée et conservée dans le dossier médical.'); }}/>}
    {preview && <PatientDocumentsPreview {...preview} transport={transport} patientLabel={patientLabel} patientReference={patientReference} clinicLabel={clinicLabel} returnFocus={opener.current} onClose={() => setPreview(null)}/>}
  </section>;
}

function DocumentUpload({ section, transport, categories, returnFocus, onClose, onSaved }: { section: PatientDocumentSection; transport: PatientDocumentsTransport; categories: PatientDocumentKind[]; returnFocus: HTMLElement | null; onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null), [category, setCategory] = useState<PatientDocumentKind>(categories[0] ?? 'other'), [title, setTitle] = useState(''), [date, setDate] = useState(patientDocumentToday);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState(''), [discard, setDiscard] = useState(false);
  const pending = useRef<{ key: string; input: PatientDocumentUpload } | null>(null), operation = useRef<AbortController | null>(null), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; operation.current?.abort(); pending.current = null; }; }, []);
  function close() { if (busy || uncertain) return; if (file || title) setDiscard(true); else onClose(); }
  async function submit(event?: FormEvent) {
    event?.preventDefault(); if (busy) return; setError('');
    if (!pending.current) {
      if (!file || !validatePatientDocumentFile(file) || !title.trim() || title.trim().length > 160 || !/^\d{4}-\d{2}-\d{2}$/u.test(date) || !categories.includes(category)) { setError(patientDocumentMessages.invalid); return; }
      pending.current = { key: createRequestKey(), input: { section, file, category, title: title.trim(), date } };
    }
    const controller = new AbortController(); operation.current = controller; setBusy(true);
    try { await transport.upload(pending.current.input, pending.current.key, controller.signal); if (alive.current) { pending.current = null; setUncertain(false); onSaved(); } }
    catch (failure) { if (alive.current) { const kind = failure instanceof PatientDocumentError ? failure.kind : 'uncertain'; setError(patientDocumentMessages[kind]); setUncertain(kind === 'uncertain'); if (kind !== 'uncertain') pending.current = null; } }
    finally { if (alive.current) setBusy(false); }
  }
  return <Modal open wide mobilePresentation="sheet" className="patient-documents-modal" returnFocus={returnFocus} title="Importer un document" description="PDF, JPEG ou PNG · 20 Mio maximum. Le fichier restera interne au dossier." closeDisabled={busy || uncertain} onOpenChange={open => { if (!open) close(); }}><form className="pd-form" onSubmit={submit} noValidate>
    {error && <div className="pd-error" role="alert">{error}</div>}<fieldset disabled={busy || uncertain}><label>Fichier<input type="file" accept="application/pdf,image/jpeg,image/png" onChange={event => { const next = event.target.files?.[0] ?? null; setFile(next); if (!title && next) setTitle(next.name.replace(/\.[^.]+$/u, '').slice(0, 160)); }}/></label>{file && <div className="pd-upload-file"><FileText size={20}/><span>{file.name} · {Math.ceil(file.size / 1024)} Ko</span></div>}<label>Titre du document<input value={title} maxLength={160} onChange={event => setTitle(event.target.value)} required/></label><div className="pd-fields"><label>Catégorie<select value={category} onChange={event => setCategory(event.target.value as PatientDocumentKind)}>{categories.map(value => <option key={value} value={value}>{patientDocumentCategoryLabels[value] ?? value}</option>)}</select></label><label>Date du document<input type="date" value={date} onChange={event => setDate(event.target.value)} required/></label></div></fieldset>
    {busy && <div className="pd-progress" role="status"><progress aria-label="Import du fichier en cours"/><span>Envoi et vérification du fichier…</span></div>}
    <div className="pd-actions"><button type="button" disabled={busy || uncertain} onClick={close}>Annuler</button><button className="pd-primary" type="submit" disabled={busy}>{busy ? 'Import en cours…' : uncertain ? 'Réessayer le même envoi' : 'Importer le fichier'}</button></div>
    {discard && <div className="pd-confirm" role="alert"><p>Abandonner cet import non enregistré ?</p><div className="pd-actions"><button type="button" onClick={() => setDiscard(false)}>Continuer l’import</button><button type="button" onClick={onClose}>Abandonner l’import</button></div></div>}
  </form></Modal>;
}

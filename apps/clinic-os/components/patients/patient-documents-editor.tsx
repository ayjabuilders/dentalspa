'use client';
import { createRequestKey } from '../../lib/request-key';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Modal } from '@dental/ui-clinic';
import { ArrowUpRight, CheckCircle2, FileText, History, Printer } from 'lucide-react';
import { CreatePatientDocumentDraftSchema, UpdatePatientDocumentDraftSchema, type CreatePatientDocumentDraft, type UpdatePatientDocumentDraft, type PatientDocumentCapabilities, type PatientDocumentDraft, type PatientGeneratedType } from '@dental/contracts';
import { PatientDocumentError, patientDocumentMessages, type PatientDocumentTemplate, type PatientDocumentVersions, type PatientDocumentsTransport } from './patient-documents-transport';
import { PatientDocumentsPreview } from './patient-documents-preview';
import { patientDocumentToday } from './patient-documents';

type Attempt = { key: string } & ({ kind: 'create'; body: CreatePatientDocumentDraft } | { kind: 'update'; id: string; body: UpdatePatientDocumentDraft } | { kind: 'validate'; id: string; version: number });
export function PatientDocumentsEditor({ transport, type, initialDraft, capabilities, patientLabel, patientReference, clinicLabel, returnFocus, onClose, onSaved, onValidated }: {
  transport: PatientDocumentsTransport; type: PatientGeneratedType; initialDraft?: PatientDocumentDraft; capabilities: PatientDocumentCapabilities;
  patientLabel?: string; patientReference?: string; clinicLabel?: string; returnFocus: HTMLElement | null; onClose: () => void; onSaved: () => void; onValidated: () => void;
}) {
  const [templates, setTemplates] = useState<PatientDocumentTemplate[]>([]), [template, setTemplate] = useState<PatientDocumentTemplate | null>(null);
  const [saved, setSaved] = useState<PatientDocumentDraft | null>(null), [title, setTitle] = useState(''), [date, setDate] = useState(patientDocumentToday), [body, setBody] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [reload, setReload] = useState(0);
  const [discard, setDiscard] = useState(false), [validateConfirm, setValidateConfirm] = useState(false), [reviewed, setReviewed] = useState(false), [conflict, setConflict] = useState(false), [reloadConfirm, setReloadConfirm] = useState(false);
  const [preview, setPreview] = useState<PatientDocumentDraft | null>(null), [historyOpen, setHistoryOpen] = useState(false), [history, setHistory] = useState<PatientDocumentVersions | null>(null), [historyError, setHistoryError] = useState('');
  const attempt = useRef<Attempt | null>(null), operation = useRef<AbortController | null>(null), alive = useRef(true), previewOpener = useRef<HTMLElement | null>(null);
  const canEdit = type === 'prescription' ? capabilities.can_edit_prescription : capabilities.can_edit_report;
  const canCreate = type === 'prescription' ? capabilities.can_create_prescription : capabilities.can_create_report;
  const dirty = saved ? title !== saved.title || date !== saved.document_date || body !== saved.content.body : !!(title || body);
  const locked = busy || uncertain;
  function loadSaved(value: PatientDocumentDraft) { setSaved(value); setTitle(value.title); setDate(value.document_date); setBody(value.content.body); setConflict(false); setReloadConfirm(false); setHistory(null); }
  useEffect(() => { alive.current = true; return () => { alive.current = false; operation.current?.abort(); attempt.current = null; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); let active = true; setLoading(true); setError('');
    void (async () => {
      try {
        if (initialDraft) { const result = await transport.draft(initialDraft.id, controller.signal); if (result.type !== type) throw new PatientDocumentError('unavailable'); if (active) loadSaved(result); }
        else { const result = await transport.templates(type, controller.signal); if (active) { setTemplates(result); if (result.length === 1) { setTemplate(result[0]!); setTitle(result[0]!.label); setBody(result[0]!.initial_content.body); } } }
      } catch (failure) { if (active) setError(patientDocumentMessages[failure instanceof PatientDocumentError ? failure.kind : 'unavailable']); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; controller.abort(); };
  }, [transport, initialDraft, type, reload]);
  useEffect(() => {
    if (!historyOpen || !saved) return;
    const controller = new AbortController(); let active = true; setHistory(null); setHistoryError('');
    void transport.versions(saved.id, controller.signal).then(result => { if (active) setHistory(result); }).catch(failure => { if (active) setHistoryError(patientDocumentMessages[failure instanceof PatientDocumentError ? failure.kind : 'unavailable']); });
    return () => { active = false; controller.abort(); };
  }, [historyOpen, saved, transport]);
  function close() { if (locked) return; if (dirty) setDiscard(true); else onClose(); }
  async function execute() {
    if (!attempt.current || busy) return;
    const sent = attempt.current, controller = new AbortController(); operation.current = controller; setBusy(true); setError(''); setNotice('');
    try {
      if (sent.kind === 'validate') { await transport.validate(sent.id, sent.version, sent.key, controller.signal); if (alive.current) { attempt.current = null; setUncertain(false); onValidated(); } }
      else {
        const result = sent.kind === 'create' ? await transport.create(sent.body, sent.key, controller.signal) : await transport.update(sent.id, sent.body, sent.key, controller.signal);
        if (alive.current) { attempt.current = null; setUncertain(false); loadSaved(result); setNotice('Brouillon enregistré · version ' + result.version); onSaved(); }
      }
    } catch (failure) {
      if (alive.current) { const kind = failure instanceof PatientDocumentError ? failure.kind : 'uncertain'; setError(patientDocumentMessages[kind]); setUncertain(kind === 'uncertain'); setConflict(kind === 'conflict'); if (kind !== 'uncertain') attempt.current = null; }
    } finally { if (alive.current) setBusy(false); }
  }
  function save(event: FormEvent) {
    event.preventDefault(); if (locked && !uncertain) return;
    if (uncertain) { void execute(); return; }
    if ((!saved && (!canCreate || !template)) || (saved && !canEdit)) return;
    const common = { title: title.trim(), document_date: date, content: { body } };
    if (saved) { const parsed = UpdatePatientDocumentDraftSchema.safeParse({ ...common, expected_version: saved.version }); if (!parsed.success) { setError('Vérifiez le titre, la date et le contenu (30 000 caractères maximum).'); return; } attempt.current = { key: createRequestKey(), kind: 'update', id: saved.id, body: parsed.data }; }
    else { const parsed = CreatePatientDocumentDraftSchema.safeParse({ ...common, type, template_id: template!.id, template_version: template!.version }); if (!parsed.success) { setError('Vérifiez le titre, la date et le contenu (30 000 caractères maximum).'); return; } attempt.current = { key: createRequestKey(), kind: 'create', body: parsed.data }; }
    void execute();
  }
  async function reloadSaved() {
    if (!saved || locked) return; setLoading(true); setError(''); const controller = new AbortController(); operation.current = controller;
    try { const result = await transport.draft(saved.id, controller.signal); if (alive.current) { loadSaved(result); setValidateConfirm(false); setReviewed(false); } }
    catch (failure) { if (alive.current) setError(patientDocumentMessages[failure instanceof PatientDocumentError ? failure.kind : 'unavailable']); }
    finally { if (alive.current) setLoading(false); }
  }
  function openPreview(value: PatientDocumentDraft) { previewOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setPreview(value); }
  return <><Modal open wide mobilePresentation="sheet" className="patient-documents-modal" returnFocus={returnFocus} title={type === 'prescription' ? 'Rédiger une ordonnance' : 'Rédiger un compte rendu'} description="Rédaction manuelle dans un modèle vierge. Aucun texte clinique n’est proposé automatiquement." closeDisabled={locked} onOpenChange={open => { if (!open) close(); }}>
    {loading ? <p role="status">Chargement du modèle ou de la version enregistrée…</p> : <>
      {error && <div className="pd-error" role="alert"><p>{error}</p>{conflict && saved && <button disabled={locked} onClick={() => setReloadConfirm(true)}>Recharger la version enregistrée</button>}{!saved && !templates.length && !locked && <button onClick={() => setReload(value => value + 1)}>Réessayer</button>}</div>}
      {!saved && !template ? <div className="pd-template-list">{!templates.length && !error ? <p>Aucun modèle vierge autorisé n’est disponible.</p> : templates.map(item => <button key={item.id + ':' + item.version} disabled={!canCreate} onClick={() => { setTemplate(item); setTitle(item.label); setBody(item.initial_content.body); }}><span><strong>{item.label}</strong><small>Modèle vierge · version {item.version}</small></span><ArrowUpRight size={17}/></button>)}</div> : <form className="pd-form" onSubmit={save} noValidate>
        <p className="pd-help"><FileText size={15}/> {saved ? 'Brouillon enregistré · version ' + saved.version : 'Nouveau brouillon'} · Modèle version {saved?.template_version ?? template?.version}</p>
        <fieldset disabled={locked || !canEdit || conflict}><label>Titre du document<input value={title} maxLength={160} required onChange={event => { setTitle(event.target.value); setNotice(''); }}/></label><label>Date du document<input type="date" value={date} required onChange={event => { setDate(event.target.value); setNotice(''); }}/></label><label>Contenu du document<textarea value={body} maxLength={30000} onChange={event => { setBody(event.target.value); setNotice(''); }} placeholder="Rédigez le contenu du document…"/></label></fieldset>
        <p className="pd-help">{body.length.toLocaleString('fr-MA')} / 30 000 caractères. {type === 'prescription' ? 'La prescription relève du praticien autorisé.' : 'Le brouillon doit être relu et validé par un praticien autorisé.'}</p>
        {notice && <p role="status">{notice}</p>}{busy && <div className="pd-progress" role="status"><progress aria-label="Enregistrement du document en cours"/><span>{attempt.current?.kind === 'validate' ? 'Validation de la version enregistrée…' : 'Enregistrement du brouillon…'}</span></div>}
        <div className="pd-actions"><button type="button" disabled={locked} onClick={close}>Fermer</button><button className="pd-primary" type="submit" disabled={busy || (!uncertain && (conflict || !canEdit || (!!saved && !dirty)))}>{uncertain ? attempt.current?.kind === 'validate' ? 'Réessayer la même validation' : 'Réessayer le même enregistrement' : 'Enregistrer le brouillon'}</button></div>
        {saved && <div className="pd-actions"><button type="button" disabled={locked || dirty} onClick={() => openPreview(saved)}><Printer size={16}/>Aperçu du brouillon</button><button type="button" disabled={locked} aria-expanded={historyOpen} onClick={() => setHistoryOpen(value => !value)}><History size={16}/>Historique des versions</button>{capabilities.can_validate && <button type="button" disabled={locked || dirty || conflict} onClick={() => { setValidateConfirm(true); setReviewed(false); }}><CheckCircle2 size={16}/>Valider cette version</button>}</div>}
        {saved && dirty && <p className="pd-help">Enregistrez vos modifications avant l’aperçu ou la validation.</p>}
      </form>}
      {historyOpen && saved && <section className="pd-history" aria-label="Historique des versions">{historyError ? <p role="alert">{historyError}</p> : !history ? <p role="status">Lecture des versions conservées…</p> : <ul>{history.map(version => <li key={version.version}><span>Version {version.version} · {version.document_date}</span><button disabled={locked} onClick={() => openPreview({ ...saved, ...version })}>Consulter la version {version.version}</button></li>)}</ul>}</section>}
      {validateConfirm && saved && <div className="pd-confirm" role="alert"><strong>Valider la version {saved.version} ?</strong><p>Cette action conserve une version clinique immuable. Elle n’envoie aucun document au patient et ne représente pas une signature électronique.</p><label><input type="checkbox" disabled={locked} checked={reviewed} onChange={event => setReviewed(event.target.checked)}/>Je confirme avoir relu cette version.</label><div className="pd-actions"><button disabled={locked} onClick={() => setValidateConfirm(false)}>Continuer la relecture</button><button className="pd-primary" disabled={locked || !reviewed || dirty || conflict} onClick={() => { attempt.current = { key: createRequestKey(), kind: 'validate', id: saved.id, version: saved.version }; void execute(); }}>Confirmer la validation</button></div></div>}
      {reloadConfirm && <div className="pd-confirm" role="alert"><p>Remplacer le texte affiché par la dernière version enregistrée ? Vos modifications locales non enregistrées seront abandonnées.</p><div className="pd-actions"><button onClick={() => setReloadConfirm(false)}>Conserver mon texte</button><button onClick={() => void reloadSaved()}>Recharger et abandonner mes modifications</button></div></div>}
      {discard && <div className="pd-confirm" role="alert"><p>Abandonner les modifications non enregistrées ?</p><div className="pd-actions"><button onClick={() => setDiscard(false)}>Continuer la rédaction</button><button onClick={onClose}>Abandonner les modifications</button></div></div>}
    </>}
  </Modal>{preview && <PatientDocumentsPreview draft={preview} transport={transport} patientLabel={patientLabel} patientReference={patientReference} clinicLabel={clinicLabel} returnFocus={previewOpener.current} onClose={() => setPreview(null)}/>}</>;
}

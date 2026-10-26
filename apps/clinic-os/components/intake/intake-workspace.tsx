'use client';
import { InquiryOwnerSearch } from './inquiry-owner-search';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, ArrowRight, Check, ChevronRight, ClipboardList, Clock3, Inbox, LoaderCircle, Mail, Phone, Plus, RefreshCw, Search, ShieldCheck, UserRound, X } from 'lucide-react';
import { Button, Modal } from '@dental/ui-clinic';
import { CreateInquirySchema, IntakeSourceSchema, type CreateInquiry, type Inquiry, type InquiryList, type InquiryOwnerWorklist } from '@dental/contracts';
import { createDemoIntakeTransport, inquiryAttempt, IntakeError, type IntakeAttempt, type IntakeFailure, type IntakeTransport } from './transport';
import { InquiryFollowUp } from './inquiry-follow-up';
import { OwnerWorklist } from './owner-worklist';
import './intake.css';
import { InquiryContactPreference } from './inquiry-contact-preference';
import { InquirySchedule } from './inquiry-schedule';
import { InquiryScheduleHistory } from './inquiry-schedule-history';

const sources: Record<CreateInquiry['source'], string> = { phone: 'Téléphone', website: 'Site web', whatsapp: 'WhatsApp', instagram: 'Instagram', email: 'E-mail', google_business: 'Google Business', walk_in: 'Sur place', other: 'Autre' };
const failures: Record<IntakeFailure, string> = {
  missing: 'Cette demande n’est pas accessible.',
  offline: 'Vous êtes hors connexion. Retrouvez le réseau puis réessayez. Aucune demande n’est envoyée en arrière-plan.',
  denied: 'Votre compte ne dispose pas de l’accès aux demandes de ce cabinet.',
  expired: 'Votre session a expiré. Connectez-vous à nouveau.',
  disabled: 'L’enregistrement des demandes n’est pas activé pour cet environnement. Votre saisie reste dans ce formulaire.',
  conflict: 'Cette tentative ne correspond plus à son envoi initial. Vérifiez votre saisie avant de réessayer.',
  invalid: 'Le cabinet a refusé ces informations. Vérifiez les champs puis réessayez.',
  unavailable: 'La réponse du cabinet n’a pas pu être vérifiée. Réessayez avec les mêmes informations pour éviter un doublon.',
};
const initialDraft = { display_name: '', contact_email: '', contact_phone: '', source: 'phone' as CreateInquiry['source'], follow_up_at: '' };
const dateLabel = (value: string) => new Intl.DateTimeFormat('fr-MA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const failureKind = (error: unknown): IntakeFailure => error instanceof IntakeError ? error.kind : 'unavailable';

export function DemoIntakeWorkspace() {
  const [transport] = useState(createDemoIntakeTransport);
  return <IntakeWorkspace transport={transport}/>;
}

export function IntakeWorkspace({ transport, onSessionExpired }: { transport: IntakeTransport; onSessionExpired?: () => void }) {
  const [freshWorklist, setFreshWorklist] = useState<InquiryOwnerWorklist | null>(null);
  const [searchResetRevision, setSearchResetRevision] = useState(0);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [privacyRevision, setPrivacyRevision] = useState(0);
  const [list, setList] = useState<InquiryList | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<IntakeFailure | null>(null);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ownerDetail, setOwnerDetail] = useState<Inquiry | null>(null);
  const [ownerSelection, setOwnerSelection] = useState(false);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const detailFocus = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initialDraft);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState('');
  const [online, setOnline] = useState(true);
  const [timezone, setTimezone] = useState('heure locale de cet appareil');
  const active = useRef(true);
  const savingRef = useRef(false);
  const loadRequest = useRef<AbortController | null>(null);
  const createRequest = useRef<AbortController | null>(null);
  const retry = useRef<IntakeAttempt | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const expiredCallback = useRef(onSessionExpired);
  expiredCallback.current = onSessionExpired;

  const load = useCallback(async () => {
    loadRequest.current?.abort();
    const controller = new AbortController();
    loadRequest.current = controller;
    setLoading(true); setLoadError(null);
    try {
      const result = await transport.list(controller.signal);
      if (active.current && !controller.signal.aborted) setList(result);
    } catch (error) {
      if (!active.current || controller.signal.aborted) return;
      const kind = failureKind(error);
      setLoadError(kind); setList(null);
      if (kind === 'expired') expiredCallback.current?.();
    } finally { if (active.current && !controller.signal.aborted) setLoading(false); }
  }, [transport]);

  useEffect(() => {
    active.current = true;
    const unsubscribe = transport.onPrivateClear(kind => { loadRequest.current?.abort(); createRequest.current?.abort(); setList(null); setFreshWorklist(null); setOwnerDetail(null); setOwnerSelection(true); setSelectedId(null); setQuery(''); setSource('all'); if (kind !== 'offline') { setDraft(initialDraft); setOpen(false); setSubmitError(''); } setSuccess(''); setLoading(false); setLoadError(kind); setPrivacyRevision(value => value + 1); if (kind === 'expired') expiredCallback.current?.(); });
    const network = () => { setOnline(navigator.onLine); if (!navigator.onLine) transport.clearPrivate('offline'); };
    network(); setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    window.addEventListener('online', network); window.addEventListener('offline', network);
    void load();
    return () => { unsubscribe(); active.current = false; loadRequest.current?.abort(); createRequest.current?.abort(); window.removeEventListener('online', network); window.removeEventListener('offline', network); };
  }, [load]);
  useEffect(() => { if (submitError) errorRef.current?.focus(); }, [submitError]);

  const visible = useMemo(() => (list?.items ?? []).filter(item => (source === 'all' || source === item.source) && `${item.display_name} ${item.contact_email ?? ''} ${item.contact_phone ?? ''}`.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr'))), [list, source, query]);
  const selected = ownerSelection ? ownerDetail : visible.find(item => item.id === selectedId) ?? visible[0] ?? null;
  useEffect(() => { if (ownerDetail) detailFocus.current?.focus(); }, [ownerDetail]);

  function startInquiry() { setSuccess(''); setSubmitError(''); setFieldErrors({}); setOpen(true); }
  function closeDialog(value: boolean) { if (!savingRef.current) setOpen(value); }
  function updateDraft(key: keyof typeof initialDraft, value: string) {
    setDraft(previous => ({ ...previous, [key]: value }));
    setFieldErrors(previous => ({ ...previous, [key]: '' }));
    setSubmitError('');
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    setSubmitError(''); setFieldErrors({});
    if (!online) { setSubmitError(failures.offline); return; }
    const followUp = draft.follow_up_at ? new Date(draft.follow_up_at) : null;
    if (followUp && Number.isNaN(followUp.getTime())) { setFieldErrors({ follow_up_at: 'Choisissez une date et une heure valides.' }); return; }
    const parsed = CreateInquirySchema.safeParse({ display_name: draft.display_name, contact_email: draft.contact_email.trim() || null, contact_phone: draft.contact_phone.trim() || null, source: draft.source, follow_up_at: followUp?.toISOString() ?? null });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      parsed.error.issues.forEach(issue => { const key = String(issue.path[0]); errors[key] = key === 'contact_email' ? 'Saisissez une adresse e-mail valide.' : key === 'contact_phone' ? 'Utilisez 3 à 40 caractères : chiffres, +, espaces, parenthèses, points ou tirets.' : key === 'display_name' ? 'Saisissez un nom de 1 à 120 caractères.' : 'Vérifiez cette information.'; });
      setFieldErrors(errors); setSubmitError('Quelques informations sont à vérifier avant l’enregistrement.'); return;
    }
    retry.current = inquiryAttempt(retry.current, parsed.data);
    savingRef.current = true; setSaving(true);
    const controller = new AbortController(); createRequest.current = controller;
    try {
      const result = await transport.create(parsed.data, retry.current.key, controller.signal);
      if (!active.current || controller.signal.aborted) return;
      setList(previous => {
        const items = [result.item, ...(previous?.items ?? []).filter(item => item.id !== result.item.id)].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
        return { items: items.slice(0, 100), truncated: previous?.truncated === true || items.length > 100 };
      });
      setOwnerSelection(false); setOwnerDetail(null); setSelectionRevision(value => value + 1); setSelectedId(result.item.id); setQuery(''); setSource('all'); setLoadError(null);
      setSuccess(transport.mode === 'demo' ? 'Demande ajoutée à cet aperçu uniquement. Elle disparaîtra au rechargement.' : result.replayed ? 'Enregistrement retrouvé. Aucune seconde demande n’a été créée.' : 'Demande enregistrée par le cabinet. Aucun rendez-vous n’est confirmé.');
      retry.current = null; setDraft(initialDraft); setOpen(false);
    } catch (error) {
      if (!active.current || controller.signal.aborted) return;
      const kind = failureKind(error); setSubmitError(failures[kind]);
      if (kind === 'expired') { setList(null); expiredCallback.current?.(); }
    } finally { savingRef.current = false; if (active.current) setSaving(false); }
  }

  return <section className="intake-workspace" aria-labelledby="intake-title">
    <div className="page-heading intake-heading"><div><p className="eyebrow muted">LE PREMIER CONTACT COMPTE</p><h1 id="intake-title">Vos nouvelles demandes</h1><p>Une attention claire, dès le premier échange.</p></div><Button variant="primary" onClick={startInquiry} disabled={!online || loading || (loadError !== null && loadError !== 'offline')}><Plus size={18}/>Nouvelle demande</Button></div>
    <div className={`intake-context ${transport.mode === 'connected' ? 'connected' : ''}`}><ShieldCheck size={19}/><p><strong>{transport.mode === 'demo' ? 'Aperçu synthétique · mémoire temporaire' : 'Cabinet vérifié · accès connecté'}</strong><span>{transport.mode === 'demo' ? 'Aucune donnée n’est envoyée. Les demandes ajoutées disparaissent au rechargement.' : 'Seules les demandes autorisées par le cabinet sont affichées.'} Une demande n’est ni un dossier patient ni un rendez-vous.</span></p></div>
    {!online && <div className="intake-message" role="status"><AlertCircle size={18}/><p>{failures.offline}</p></div>}
    {success && <div className="intake-message intake-success" role="status"><Check size={18}/><p>{success}</p><button aria-label="Masquer la confirmation" onClick={() => setSuccess('')}><X size={17}/></button></div>}
    <OwnerWorklist freshData={freshWorklist} transport={transport} selectionRevision={selectionRevision} onSelectionStart={() => { setSearchResetRevision(value => value + 1); setOwnerSelection(true); setOwnerDetail(null); }} onSelected={item => { setOwnerDetail(item); setOwnerSelection(true); }} onReset={() => setOwnerDetail(null)} onSessionExpired={() => { setList(null); setOwnerDetail(null); expiredCallback.current?.(); }}/>
    <InquiryOwnerSearch transport={transport} resetRevision={searchResetRevision} onInvalidate={() => { setOwnerSelection(true); setOwnerDetail(null); setSelectionRevision(value => value + 1); }} onSelected={item => { setOwnerSelection(true); setOwnerDetail(item); }}/>
    <div className="intake-grid">
      <section className="work-panel intake-master" aria-label="Liste des demandes">
        <div className="intake-list-heading"><div><Inbox size={19}/><h2>À prendre en charge</h2><span className="intake-count">{list?.items.length ?? '—'}</span></div><button className="icon-button" aria-label="Actualiser les demandes" onClick={() => void load()} disabled={loading || !online || saving}><RefreshCw size={18} className={loading ? 'intake-spin' : ''}/></button></div>
        <p className="intake-local-filter-note">Filtre local · uniquement les demandes chargées ci-dessous (100 maximum).</p>
        <div className="intake-tools"><label className="search-field"><Search size={18}/><input aria-label="Rechercher une demande" placeholder="Un nom, un contact…" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button aria-label="Effacer la recherche des demandes" onClick={() => setQuery('')}><X size={16}/></button>}</label><label className="intake-source-filter"><span className="sr-only">Filtrer par source</span><select aria-label="Filtrer par source" value={source} onChange={event => setSource(event.target.value)}><option value="all">Toutes les sources</option>{IntakeSourceSchema.options.map(value => <option key={value} value={value}>{sources[value]}</option>)}</select></label></div>
        {loading ? <div className="intake-empty" role="status"><LoaderCircle className="intake-spin"/><h3>Vos demandes arrivent…</h3><p>Vérification de l’accès et du répertoire.</p></div> : loadError ? <div className="intake-empty" role="alert"><AlertCircle/><h3>{loadError === 'denied' ? 'Accès non autorisé' : 'Répertoire indisponible'}</h3><p>{loadError === 'disabled' ? 'Le service des demandes n’est pas disponible dans cet environnement.' : failures[loadError]}</p>{loadError !== 'denied' && loadError !== 'expired' && <Button onClick={() => void load()} disabled={!online}><RefreshCw size={17}/>Réessayer</Button>}</div> : visible.length ? <ul className="intake-list">{visible.map(item => <li key={item.id}><button aria-pressed={selected?.id === item.id} onClick={() => { setSearchResetRevision(value => value + 1); setOwnerSelection(false); setOwnerDetail(null); setSelectionRevision(value => value + 1); setSelectedId(item.id); }} className="intake-row"><span className="intake-avatar" aria-hidden="true">{item.display_name.slice(0, 1).toLocaleUpperCase('fr')}</span><span className="intake-row-copy"><strong>{item.display_name}</strong><span>{sources[item.source]}<span aria-hidden="true"> · </span>{dateLabel(item.created_at)}</span></span><span className="intake-new">Nouvelle</span><ChevronRight size={17}/></button></li>)}</ul> : <div className="intake-empty"><Inbox/><h3>{query || source !== 'all' ? 'Aucune demande trouvée' : 'Une nouvelle relation commence ici.'}</h3><p>{query || source !== 'all' ? 'Essayez un autre nom ou une autre source.' : 'Enregistrez un premier contact pour le retrouver dans cet espace.'}</p>{query || source !== 'all' ? <Button onClick={() => { setQuery(''); setSource('all'); }}>Réinitialiser les filtres</Button> : <Button onClick={startInquiry}>Créer une demande<Plus size={17}/></Button>}</div>}
        {list?.truncated && <p className="intake-truncated" role="status">Seules les 100 demandes les plus récentes sont affichées. La recherche et les filtres s’appliquent à cette liste.</p>}
        {!loading && !loadError && <p className="intake-list-footer">{visible.length} demande{visible.length > 1 ? 's' : ''} affichée{visible.length > 1 ? 's' : ''} · attribution manuelle des sources</p>}
      </section>
      <aside ref={detailFocus} tabIndex={-1} className="work-panel intake-detail" aria-label="Demande sélectionnée">{selected && (ownerSelection || (!loading && !loadError)) ? <InquiryDetail inquiry={selected} transport={transport}/> : <div className="intake-empty"><ClipboardList/><h3>Chaque demande, son attention.</h3><p>Sélectionnez un premier contact pour retrouver ses coordonnées et son suivi.</p></div>}<InquiryContactPreference inquiry={ownerSelection || (!loading && !loadError) ? selected : null} transport={transport}/><InquirySchedule inquiry={ownerSelection || (!loading && !loadError) ? selected : null} transport={transport} onFresh={(item, freshList, worklist) => { setHistoryRevision(value => value + 1); setList(freshList); setOwnerDetail(item); setOwnerSelection(true); setFreshWorklist(worklist); }}/><InquiryScheduleHistory inquiry={ownerSelection || (!loading && !loadError) ? selected : null} transport={transport} revision={historyRevision}/><InquiryFollowUp key={privacyRevision} inquiry={ownerSelection || (!loading && !loadError) ? selected : null} transport={transport} onSessionExpired={() => { setList(null); expiredCallback.current?.(); }}/></aside>
    </div>
    <Modal open={open} onOpenChange={closeDialog} title="Un nouveau premier contact" description={transport.mode === 'demo' ? 'Démonstration locale : utilisez uniquement des informations fictives.' : 'Saisie manuelle dans le cabinet vérifié. Données synthétiques uniquement.'} wide>
      <form className="intake-form" onSubmit={submit} noValidate aria-busy={saving}>
        {submitError && <div className="intake-message intake-error" role="alert" tabIndex={-1} ref={errorRef}><AlertCircle size={18}/><p>{submitError}</p></div>}
        <fieldset disabled={saving}>
          <div className="intake-form-field intake-form-wide"><label htmlFor="inquiry-name">Nom du contact <span aria-hidden="true">*</span></label><input id="inquiry-name" name="display_name" required maxLength={120} autoComplete="off" placeholder="Ex. Lina Exemple" value={draft.display_name} onChange={event => updateDraft('display_name', event.target.value)} aria-invalid={!!fieldErrors.display_name} aria-describedby={fieldErrors.display_name ? 'inquiry-name-error' : undefined}/>{fieldErrors.display_name && <small id="inquiry-name-error" className="intake-field-error">{fieldErrors.display_name}</small>}</div>
          <div className="intake-form-field intake-form-wide"><label htmlFor="inquiry-source">Source du premier contact <span aria-hidden="true">*</span></label><select id="inquiry-source" value={draft.source} onChange={event => updateDraft('source', event.target.value)}>{IntakeSourceSchema.options.map(value => <option key={value} value={value}>{sources[value]}</option>)}</select><small>Attribution manuelle. Aucune connexion à ces services.</small></div>
          <div className="intake-form-field"><label htmlFor="inquiry-email">E-mail <span>(facultatif)</span></label><input id="inquiry-email" type="email" maxLength={254} autoComplete="off" value={draft.contact_email} onChange={event => updateDraft('contact_email', event.target.value)} aria-invalid={!!fieldErrors.contact_email} aria-describedby={fieldErrors.contact_email ? 'inquiry-email-error' : undefined}/>{fieldErrors.contact_email && <small id="inquiry-email-error" className="intake-field-error">{fieldErrors.contact_email}</small>}</div>
          <div className="intake-form-field"><label htmlFor="inquiry-phone">Téléphone <span>(facultatif)</span></label><input id="inquiry-phone" type="tel" maxLength={40} autoComplete="off" value={draft.contact_phone} onChange={event => updateDraft('contact_phone', event.target.value)} aria-invalid={!!fieldErrors.contact_phone} aria-describedby={fieldErrors.contact_phone ? 'inquiry-phone-error' : undefined}/>{fieldErrors.contact_phone && <small id="inquiry-phone-error" className="intake-field-error">{fieldErrors.contact_phone}</small>}</div>
          <div className="intake-form-field intake-form-wide"><label htmlFor="inquiry-follow-up">Date de suivi souhaitée <span>(facultatif)</span></label><input id="inquiry-follow-up" type="datetime-local" value={draft.follow_up_at} onChange={event => updateDraft('follow_up_at', event.target.value)} aria-invalid={!!fieldErrors.follow_up_at} aria-describedby="inquiry-follow-up-help"/><small id="inquiry-follow-up-help">{fieldErrors.follow_up_at || `Heure de cet appareil : ${timezone}. Il ne s’agit pas d’un créneau réservé.`}</small></div>
        </fieldset>
        <div className="intake-assignee"><UserRound size={18}/><div><strong>Attribuée à vous</strong><span>{transport.mode === 'demo' ? 'Profil de démonstration' : 'Le serveur attribue la demande à votre compte vérifié.'}</span></div><ShieldCheck size={17}/></div>
        <p className="intake-form-note">Aucune note médicale, inscription patient ou confirmation de rendez-vous n’est créée.</p>
        <div className="intake-form-actions"><Button type="button" onClick={() => closeDialog(false)} disabled={saving}>Fermer</Button><Button type="submit" variant="primary" disabled={saving || !online}>{saving ? <><LoaderCircle className="intake-spin" size={18}/>Enregistrement…</> : <>Enregistrer la demande<ArrowRight size={17}/></>}</Button></div>
      </form>
    </Modal>
  </section>;
}

function InquiryDetail({ inquiry, transport }: { inquiry: Inquiry; transport: IntakeTransport }) {
  return <><div className="intake-detail-top"><span className="intake-detail-icon"><ClipboardList size={24}/></span><span className="intake-new">Nouvelle demande</span></div><p className="eyebrow muted">PREMIER CONTACT</p><h2>{inquiry.display_name}</h2><p className="intake-detail-date">Reçue le {dateLabel(inquiry.created_at)}</p><dl className="intake-detail-fields"><div><dt>Source déclarée</dt><dd>{sources[inquiry.source]}</dd></div><div><dt><UserRound size={16}/>Responsable</dt><dd>{inquiry.owner_user_id === transport.currentUserId ? 'Vous' : 'Membre du cabinet'}<small>{inquiry.owner_user_id === transport.currentUserId ? 'Créateur de la demande' : `Compte ${inquiry.owner_user_id.slice(0, 8)}…`}</small></dd></div><div><dt><Mail size={16}/>E-mail</dt><dd>{inquiry.contact_email ?? 'Non renseigné'}</dd></div><div><dt><Phone size={16}/>Téléphone</dt><dd>{inquiry.contact_phone ?? 'Non renseigné'}</dd></div><div><dt><Clock3 size={16}/>Suivi souhaité</dt><dd>{inquiry.follow_up_at ? dateLabel(inquiry.follow_up_at) : 'Non planifié'}</dd></div></dl><div className="intake-detail-note"><ShieldCheck size={19}/><p>Un premier contact, en toute clarté.<small>Aucun message envoyé et aucun rendez-vous confirmé.</small></p></div></>;
}

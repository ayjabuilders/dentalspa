'use client';
import {sessionFetch as fetch} from '../../lib/renewing-session';

import {useConnectedNavigationLock} from '../../lib/connected-navigation';
import { useEffect, useRef, useState } from 'react';
import { AgendaSettingsReadSchema, AgendaSettingsSavedSchema, UpdateAgendaSettingsSchema, SchedulingResourceListResponseSchema, type AgendaSettings, type SchedulingResourceSummary } from '@dental/contracts';
import { Clock3, Settings2, Stethoscope, CalendarOff, ArrowLeft, ChevronDown, ChevronRight, Plus, Save, RotateCcw, Info, CheckCircle2 } from 'lucide-react';
import { Button, Modal } from '@dental/ui-clinic';
import './agenda-settings.css';
import {agendaServiceStyle} from '../scheduling/agenda-service-style';

function requestKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64; bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type Props = { api: string; token: string; clinicId: string; onSessionExpired: () => void; onOpenAgenda?: () => void };
type Windows = AgendaSettings['weekly_windows'];
const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const initial: AgendaSettings = { schema_version: 1, revision: 1, time_zone: 'Africa/Casablanca', slot_step_minutes: 15, minimum_notice_minutes: 0, booking_horizon_days: 30, confirmation_mode: 'staff_review', patient_cancellation_enabled: false, patient_reschedule_enabled: false, cancellation_notice_minutes: 0, reschedule_notice_minutes: 0, weekly_windows: [], closures: [], visit_types: [] };

function Hours({ value, onChange, label }: { value: Windows; onChange: (value: Windows) => void; label: string }) {
  return <fieldset className="agenda-hours"><legend>{label}</legend>
    {!value.length && <p>Aucune plage : fermé pour ce périmètre.</p>}
    {value.map((window, index) => <div className="agenda-row" key={index}>
      <label>Jour<select aria-label={`${label} · jour ${index + 1}`} value={window.weekday} onChange={event => onChange(value.map((row, i) => i === index ? { ...row, weekday: Number(event.target.value) } : row))}>{days.map((day, i) => <option key={day} value={i + 1}>{day}</option>)}</select></label>
      <label>De<input aria-label={`${label} · début ${index + 1}`} type="time" value={window.start} onChange={event => onChange(value.map((row, i) => i === index ? { ...row, start: event.target.value } : row))}/></label>
      <label>À<input aria-label={`${label} · fin ${index + 1}`} type="time" value={window.end} onChange={event => onChange(value.map((row, i) => i === index ? { ...row, end: event.target.value } : row))}/></label>
      <Button type="button" aria-label={`${label} · supprimer la plage ${index + 1}`} onClick={() => onChange(value.filter((_, i) => i !== index))}>Supprimer</Button>
    </div>)}
    <Button type="button" onClick={() => onChange([...value, { weekday: 1, start: '09:00', end: '12:00' }])}>Ajouter une plage — {label.toLowerCase()}</Button>
  </fieldset>;
}

export function AgendaSettingsEditor(props: Props) {
  return <Editor key={`${props.api}:${props.clinicId}:${props.token}`} {...props}/>;
}

function Editor({ api, token, clinicId, onSessionExpired, onOpenAgenda }: Props) {
  const [editorOpen,setEditorOpen]=useState(false),[closeRequested,setCloseRequested]=useState(false);
  const [section, setSection] = useState<'hours'|'visits'|'rules'|'closures'>('hours');
  const [draft, setDraft] = useState<AgendaSettings | null>(null);
  const [revision, setRevision] = useState(0);
  const [savedDraft, setSavedDraft] = useState('');
  const [leaveRequested, setLeaveRequested] = useState(false);
  const [expandedVisit, setExpandedVisit] = useState<string | null>(null);
  const [resources, setResources] = useState<SchedulingResourceSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<{ key: string; body: ReturnType<typeof UpdateAgendaSettingsSchema.parse> } | null>(null);
  const operation = useRef<AbortController | null>(null);
  const expire = useRef(onSessionExpired); expire.current = onSessionExpired;
  const headers = { Authorization: `Bearer ${token}`, 'X-Clinic-Id': clinicId };

  async function load() {
    if (operation.current) return;
    const controller = new AbortController(); operation.current = controller;
    setBusy(true); setError(''); setNotice('');
    try {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
      const response = await fetch(`${api}/api/v1/agenda-settings`, { headers, cache: 'no-store', signal });
      if (controller.signal.aborted) return;
      if (response.status === 401) { expire.current(); return; }
      if (!response.ok) throw new Error(response.status === 403 ? 'Accès réservé au gestionnaire du cabinet.' : 'Les paramètres ne sont pas disponibles. Vérifiez que le service local est activé.');
      const parsedSettings = AgendaSettingsReadSchema.safeParse(await response.json());
      if (!parsedSettings.success) throw new Error('La configuration reçue ne peut pas être affichée. Réessayez le chargement.');
      const result = parsedSettings.data;
      const resourceResponse = await fetch(`${api}/api/v1/scheduling/resources`, { headers, cache: 'no-store', signal });
      if (resourceResponse.status === 401) { expire.current(); return; }
      if (!resourceResponse.ok) throw new Error('Impossible de charger les ressources du cabinet.');
      const parsedResources = SchedulingResourceListResponseSchema.safeParse(await resourceResponse.json());
      if (!parsedResources.success) throw new Error('La liste des ressources reçue ne peut pas être affichée.');
      const resourceList = parsedResources.data;
      if (resourceList.truncated) throw new Error('La liste des ressources est incomplète.');
      if (controller.signal.aborted) return;
      setResources(resourceList.items); setSavedDraft(JSON.stringify(result.settings ?? initial)); setLeaveRequested(false); setDraft(result.settings ?? structuredClone(initial)); setRevision(result.settings?.revision ?? 0);
      pending.current = null; setUncertain(false);
      setNotice(result.settings ? '' : 'Nouvelle configuration : aucune ouverture ni visite active. Les valeurs proposées sont à vérifier avant enregistrement.');
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Chargement impossible.'); }
    finally { if (operation.current === controller) operation.current = null; if (!controller.signal.aborted) setBusy(false); }
  }

  async function save() {
    if (!draft || operation.current || (!pending.current && revision > 0 && JSON.stringify(draft) === savedDraft)) return;
    const parsed = UpdateAgendaSettingsSchema.safeParse({ expected_revision: revision, settings: { ...draft, revision: revision + 1 } });
    if (!parsed.success) { const issue = parsed.error.issues[0]; const field = issue?.path[1]; if (field === 'visit_types' && typeof issue?.path[2] === 'number') setExpandedVisit(draft.visit_types[issue.path[2]]?.id ?? null); setSection(field === 'visit_types' ? 'visits' : field === 'weekly_windows' ? 'hours' : field === 'closures' ? 'closures' : 'rules'); setError('Vérifiez les plages (sans chevauchement, incluses dans les horaires du cabinet), les durées et les ressources de chaque visite.'); return; }
    const command = pending.current ?? { key: requestKey(), body: parsed.data };
    pending.current = command;
    const controller = new AbortController(); operation.current = controller;
    setBusy(true); setError(''); setNotice('');
    let rejected = false;
    try {
      const response = await fetch(`${api}/api/v1/agenda-settings`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'Idempotency-Key': command.key }, body: JSON.stringify(command.body), cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      if (controller.signal.aborted) return;
      if (response.status === 401) { expire.current(); return; }
      rejected = !uncertain && [400, 403, 409].includes(response.status);
      if (!response.ok) throw new Error(response.status === 409 ? 'Une autre modification existe. Rechargez la version serveur avant de reprendre.' : 'Enregistrement impossible. Vérifiez les paramètres et vos droits.');
      const receipt = AgendaSettingsSavedSchema.parse(await response.json());
      if (JSON.stringify(receipt.settings) !== JSON.stringify(command.body.settings)) throw new Error('Réponse inattendue.');
      if (controller.signal.aborted) return;
      setSavedDraft(JSON.stringify(receipt.settings)); setLeaveRequested(false); setDraft(receipt.settings); setRevision(receipt.settings.revision); pending.current = null; setUncertain(false);
      setEditorOpen(false);setCloseRequested(false);
      setNotice(`Version ${receipt.settings.revision} enregistrée. Horaires et mode de réservation mis à jour.`);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (rejected) { pending.current = null; setError(cause instanceof Error ? cause.message : 'Enregistrement refusé.'); }
      else { setUncertain(true); setError('Résultat à vérifier : reprenez le même enregistrement ou rechargez la version serveur. Le formulaire est conservé et verrouillé.'); }
    } finally { if (operation.current === controller) operation.current = null; if (!controller.signal.aborted) setBusy(false); }
  }

  useEffect(() => {
    void load();
    return () => { operation.current?.abort(); operation.current = null; pending.current = null; };
    // The keyed session owns this editor; changing tenant/token remounts it.
  }, []);
  const update = <K extends keyof AgendaSettings>(key: K, value: AgendaSettings[K]) => setDraft(current => current ? { ...current, [key]: value } : current);

  useConnectedNavigationLock(busy||uncertain||(draft!==null&&JSON.stringify(draft)!==savedDraft));
  const dirty = draft !== null && JSON.stringify(draft) !== savedDraft;
  const sections = [
    {id:'hours',label:'Horaires',Icon:Clock3},
    {id:'visits',label:'Visites',Icon:Stethoscope},
    {id:'rules',label:'Réservation',Icon:Settings2},
    {id:'closures',label:'Fermetures',Icon:CalendarOff},
  ] as const;
  function openSection(next: typeof section, visitId: string | null = null) {
    if(busy||uncertain)return;
    setSection(next);setExpandedVisit(visitId);setCloseRequested(false);setEditorOpen(true);
  }
  function addVisit() {
    if(!draft||busy||uncertain)return;
    const id=requestKey();
    update('visit_types',[...draft.visit_types,{id,name:'',active:false,public_bookable:false,duration_minutes:30,buffer_before_minutes:0,buffer_after_minutes:0,resource_pairs:[],weekly_windows:[]}]);
    openSection('visits',id);
  }
  return <section className="agenda-settings" aria-labelledby="agenda-settings-title" aria-busy={busy}>
    <header className="agenda-settings-header"><span className="agenda-settings-emblem"><Settings2 size={23}/></span><div className="agenda-heading-copy"><h1 id="agenda-settings-title" tabIndex={-1}>Paramètres de l’agenda</h1><p>Organisez les ouvertures, les prestations et leurs réservations.</p></div><div className="agenda-heading-actions">{onOpenAgenda&&<Button type="button" variant="ghost" className="agenda-back" onClick={()=>{if(dirty)setLeaveRequested(true);else onOpenAgenda();}} disabled={busy||uncertain}><ArrowLeft size={16}/>Retour à l’agenda</Button>}<Button type="button" variant="primary" disabled={!draft||busy||uncertain} onClick={addVisit}><Plus size={17}/>Ajouter une prestation</Button></div></header>
    {leaveRequested && <div className="agenda-leave-confirmation" role="alert"><strong>Modifications non enregistrées</strong><p>Enregistrez vos paramètres ou abandonnez ces modifications pour revenir à l’agenda.</p><div><Button type="button" disabled={busy || uncertain} onClick={() => setLeaveRequested(false)}>Continuer la modification</Button><Button type="button" disabled={busy || uncertain} onClick={onOpenAgenda}>Abandonner et revenir à l’agenda</Button></div></div>}
    {error && !editorOpen && <p role="alert" className="agenda-settings-error">{error}</p>}
    {notice && <p role="status" className="agenda-settings-notice">{revision?<CheckCircle2 size={17}/>:<Info size={17}/>} {notice}</p>}
    {!draft && busy && <p role="status">Chargement des paramètres…</p>}
    {!draft&&!busy&&<Button type="button" onClick={()=>void load()}>Réessayer le chargement</Button>}
    {draft&&<>
      <div className="agenda-settings-cards" aria-label="Configurer l’agenda">{sections.map(card=>{const detail=card.id==='hours'?`${new Set(draft.weekly_windows.map(window=>window.weekday)).size} jours ouverts`:card.id==='visits'?`${draft.visit_types.filter(visit=>visit.active).length} prestations actives`:card.id==='rules'?draft.confirmation_mode==='automatic'?'Confirmation automatique':'Validation par l’équipe':`${draft.closures.length} fermeture${draft.closures.length===1?'':'s'}`;return <button type="button" key={card.id} disabled={busy||uncertain} onClick={()=>openSection(card.id)}><span className="agenda-card-icon"><card.Icon size={20}/></span><span><strong>{card.label}</strong><small>{detail}</small></span><ChevronRight size={16}/></button>})}</div>
      <div className="agenda-settings-overview">
        <section className="agenda-opening-card"><header><div><h2>Semaine d’ouverture</h2><p>Heure du cabinet · Casablanca</p></div><Button type="button" variant="ghost" aria-label="Modifier les horaires" disabled={busy||uncertain} onClick={()=>openSection('hours')}>Modifier<ChevronRight size={15}/></Button></header>{days.map((day,i)=>{const windows=draft.weekly_windows.filter(window=>window.weekday===i+1);return <button type="button" className="agenda-overview-day" key={day} disabled={busy||uncertain} aria-label={`Modifier les horaires · ${day}`} onClick={()=>openSection('hours')}><strong>{day}</strong><span className="agenda-day-windows">{windows.length?windows.map((window,index)=><span key={index}>{window.start}<span aria-hidden="true"> – </span>{window.end}</span>):<span className="agenda-day-closed">Fermé</span>}</span></button>})}<footer><Clock3 size={14}/>{draft.weekly_windows.length} plages définies</footer></section>
        <section className="agenda-services-card"><header><div><h2>Prestations et disponibilités</h2><p>Durée, visibilité et créneaux par prestation</p></div><span className="agenda-overview-count">{draft.visit_types.length}</span></header><div className="agenda-services-list">{draft.visit_types.map(v=>{const service=agendaServiceStyle(v.name);return <button className="agenda-overview-visit" type="button" key={v.id} disabled={busy||uncertain} onClick={()=>openSection('visits',v.id)}><span className="agenda-service-icon" style={{color:service.color,background:service.background}}><service.Icon size={20}/></span><span><strong>{v.name||'Nouvelle prestation'}</strong><small>{v.duration_minutes} min · {v.weekly_windows.length} plages</small></span><span className="agenda-service-badges"><span data-active={v.active}>{v.active?'Actif':'Inactif'}</span><small>{v.public_bookable?'Lien public':'Interne'}</small></span><ChevronRight size={16}/></button>})}{!draft.visit_types.length&&<div className="agenda-services-empty"><Stethoscope size={25}/><strong>Aucune prestation configurée</strong><p>Ajoutez un type de visite pour définir sa durée et ses disponibilités.</p><Button type="button" disabled={busy||uncertain} onClick={addVisit}><Plus size={16}/>Ajouter un type de visite</Button></div>}</div></section>
      </div>
      <footer className="agenda-settings-provenance"><span>{dirty?'Modifications en cours':revision?`Configuration enregistrée · v${revision}`:'Configuration à enregistrer'}</span><details className="agenda-settings-help"><summary><Info size={15}/>À savoir</summary><p>Configuration locale synthétique. Ces paramètres pilotent les créneaux et la confirmation du lien public. Les actions Patient Pass restent en cours.</p></details></footer>
    </>}
    <Modal mobilePresentation="sheet" open={editorOpen&&!!draft} onOpenChange={open=>{if(!open){if(dirty)setCloseRequested(true);else setEditorOpen(false);}}} title={{hours:'Horaires du cabinet',visits:'Types de visite',rules:'Règles de réservation',closures:'Fermetures et exceptions'}[section]} description="Les modifications s’appliquent après enregistrement." wide closeDisabled={busy||uncertain} className="agenda-settings-modal"><div className="agenda-settings">
    {error&&<p role="alert" className="agenda-settings-error">{error}</p>}
    {closeRequested&&<div role="alert" className="agenda-leave-confirmation"><p>Abandonner les modifications non enregistrées ?</p><Button type="button" disabled={busy||uncertain} onClick={()=>setCloseRequested(false)}>Continuer</Button><Button type="button" disabled={busy||uncertain} onClick={()=>{setDraft(JSON.parse(savedDraft));setError('');setCloseRequested(false);setEditorOpen(false);}}>Abandonner</Button></div>}
    <div className="agenda-section-tabs" role="tablist" aria-label="Sections des paramètres">{sections.map((tab,index)=><button type="button" role="tab" key={tab.id} id={`agenda-tab-${tab.id}`} aria-controls={`agenda-section-${tab.id}`} aria-selected={section===tab.id} tabIndex={section===tab.id?0:-1} disabled={busy||uncertain} onClick={()=>{setSection(tab.id);setExpandedVisit(null);}} onKeyDown={event=>{const next=event.key==='ArrowRight'?(index+1)%sections.length:event.key==='ArrowLeft'?(index+sections.length-1)%sections.length:event.key==='Home'?0:event.key==='End'?sections.length-1:null;if(next===null)return;event.preventDefault();const target=sections[next];if(target){setSection(target.id);setExpandedVisit(null);document.getElementById(`agenda-tab-${target.id}`)?.focus();}}}><tab.Icon size={16}/>{tab.label}</button>)}</div>
    {draft && <fieldset disabled={busy || uncertain} className="agenda-settings-body">
      <div role="tabpanel" id="agenda-section-hours" aria-labelledby="agenda-tab-hours" hidden={section!=='hours'}><Hours label="Horaires du cabinet" value={draft.weekly_windows} onChange={value => update('weekly_windows', value)}/></div>
      <div role="tabpanel" id="agenda-section-rules" aria-labelledby="agenda-tab-rules" hidden={section!=='rules'}><fieldset><legend>Règles de réservation</legend><div className="agenda-grid">
        {([['slot_step_minutes', 'Pas des créneaux (minutes)'], ['minimum_notice_minutes', 'Préavis minimum (minutes)'], ['booking_horizon_days', 'Réservation ouverte sur (jours)'], ['cancellation_notice_minutes', 'Préavis d’annulation (minutes)'], ['reschedule_notice_minutes', 'Préavis de déplacement (minutes)']] as const).map(([key, label]) => <label key={key}>{label}<input type="number" value={draft[key]} min={0} onChange={event => update(key, Number(event.target.value))}/></label>)}
        <label>Confirmation<select value={draft.confirmation_mode} onChange={event => update('confirmation_mode', event.target.value as AgendaSettings['confirmation_mode'])}><option value="staff_review">Validation par l’équipe</option><option value="automatic">Automatique</option></select></label>
        <label className="agenda-check"><input type="checkbox" checked={draft.patient_cancellation_enabled} onChange={event => update('patient_cancellation_enabled', event.target.checked)}/>Annulation autorisée au patient</label>
        <label className="agenda-check"><input type="checkbox" checked={draft.patient_reschedule_enabled} onChange={event => update('patient_reschedule_enabled', event.target.checked)}/>Déplacement autorisé au patient</label>
      </div></fieldset></div>
      <div role="tabpanel" id="agenda-section-visits" aria-labelledby="agenda-tab-visits" hidden={section!=='visits'}><fieldset><legend>Types de visite</legend>{expandedVisit&&<Button type="button" variant="ghost" onClick={()=>setExpandedVisit(null)}><ArrowLeft size={16}/>Tous les types de visite</Button>}<p>Les plages d’un type doivent rester dans les horaires du cabinet. Une visite de suivi peut rester invisible sur le lien public.</p>
        {draft.visit_types.map((visit, index) => {
          const change = (value: Partial<typeof visit>) => update('visit_types', draft.visit_types.map((row, i) => i === index ? { ...row, ...value } : row));
          const service=agendaServiceStyle(visit.name);
          return <article className="agenda-visit" key={visit.id} hidden={expandedVisit!==null&&expandedVisit!==visit.id}><button type="button" className="agenda-visit-summary" aria-expanded={expandedVisit === visit.id} aria-controls={"agenda-visit-" + visit.id} onClick={() => setExpandedVisit(current => current === visit.id ? null : visit.id)}><service.Icon size={22} style={{color:service.color}}/><span><strong>{visit.name || "Nouveau type de visite"}</strong><small>{visit.duration_minutes} min · {visit.resource_pairs.length} paire{visit.resource_pairs.length === 1 ? "" : "s"} de ressources</small></span><span className="agenda-visit-badges"><span data-active={visit.active}>{visit.active ? "Actif" : "Inactif"}</span><span>{visit.public_bookable ? "Lien public" : "Interne"}</span></span><ChevronDown size={18}/></button><div id={"agenda-visit-" + visit.id} hidden={expandedVisit !== visit.id} className="agenda-visit-editor"><div className="agenda-grid">
            <label>Nom du type<input value={visit.name} maxLength={80} onChange={event => change({ name: event.target.value })}/></label>
            {([['duration_minutes', 'Durée (minutes)'], ['buffer_before_minutes', 'Marge avant (minutes)'], ['buffer_after_minutes', 'Marge après (minutes)']] as const).map(([key, label]) => <label key={key}>{label}<input type="number" min={0} value={visit[key]} onChange={event => change({ [key]: Number(event.target.value) })}/></label>)}
            <label className="agenda-check"><input type="checkbox" checked={visit.active} onChange={event => change({ active: event.target.checked })}/>Type actif</label>
            <label className="agenda-check"><input type="checkbox" checked={visit.public_bookable} onChange={event => change({ public_bookable: event.target.checked })}/>Visible sur le lien public</label>
          </div>
          {visit.resource_pairs.map((pair, pairIndex) => <div className="agenda-row" key={pairIndex}>
            {(['provider', 'chair'] as const).map(kind => <label key={kind}>{kind === 'provider' ? 'Praticien' : 'Fauteuil'}<select value={pair[`${kind}_id`]} onChange={event => change({ resource_pairs: visit.resource_pairs.map((row, i) => i === pairIndex ? { ...row, [`${kind}_id`]: event.target.value } : row) })}><option value="">Choisir une ressource</option>{resources.filter(resource => resource.kind === kind).map(resource => <option key={resource.id} value={resource.id}>{resource.display_name}</option>)}</select></label>)}
            <Button type="button" onClick={() => change({ resource_pairs: visit.resource_pairs.filter((_, i) => i !== pairIndex) })}>Retirer cette paire</Button>
          </div>)}
          <Button type="button" onClick={() => change({ resource_pairs: [...visit.resource_pairs, { provider_id: '', chair_id: '' }] })}>Ajouter une paire de ressources</Button>
          <Hours label={`Plages de ${visit.name || 'la visite'}`} value={visit.weekly_windows} onChange={weekly_windows => change({ weekly_windows })}/>
          <Button type="button" onClick={() => update('visit_types', draft.visit_types.filter((_, i) => i !== index))}>Retirer ce type de visite</Button>
          </div></article>;
        })}
        <Button type="button" onClick={addVisit}><Plus size={16}/>Ajouter un type de visite</Button>
      </fieldset></div>
      <div role="tabpanel" id="agenda-section-closures" aria-labelledby="agenda-tab-closures" hidden={section!=='closures'}><fieldset><legend>Fermetures et exceptions</legend>
        {draft.closures.map((closure, index) => <div className="agenda-row" key={index}>
          <label>Date<input type="date" value={closure.date} onChange={event => update('closures', draft.closures.map((row, i) => i === index ? { ...row, date: event.target.value } : row))}/></label>
          <label>Ressource<select value={closure.resource_id ?? ''} onChange={event => update('closures', draft.closures.map((row, i) => i === index ? { ...row, resource_id: event.target.value || null } : row))}><option value="">Tout le cabinet</option>{resources.map(resource => <option key={resource.id} value={resource.id}>{resource.display_name}</option>)}</select></label>
          {(['start', 'end'] as const).map(key => <label key={key}>{key === 'start' ? 'Début' : 'Fin'}<input type="time" value={closure[key]} onChange={event => update('closures', draft.closures.map((row, i) => i === index ? { ...row, [key]: event.target.value } : row))}/></label>)}
          <Button type="button" onClick={() => update('closures', draft.closures.filter((_, i) => i !== index))}>Retirer la fermeture</Button>
        </div>)}
        <Button type="button" onClick={() => update('closures', [...draft.closures, { date: '', resource_id: null, start: '00:00', end: '23:59' }])}>Ajouter une fermeture</Button>
      </fieldset></div>
    </fieldset>}
    <div className="agenda-settings-actions">{draft && <span className="agenda-save-state" role="status">{uncertain ? "Enregistrement à vérifier" : dirty ? "Modifications non enregistrées" : revision === 0 ? "Non enregistré" : "À jour"}</span>}<Button type="button" variant="ghost" disabled={busy||uncertain} aria-label={draft?'Abandonner les modifications et recharger':'Réessayer le chargement'} title={dirty?'Abandonner les modifications et recharger':'Actualiser les paramètres'} onClick={() => void load()}><RotateCcw size={16}/>{draft ? dirty ? 'Annuler les modifications' : 'Actualiser' : 'Réessayer'}</Button>{draft && <Button type="button" aria-label={busy?'Traitement…':uncertain?'Reprendre le même enregistrement':'Enregistrer les paramètres'} variant="primary" disabled={busy || (!uncertain && revision > 0 && !dirty)} onClick={() => void save()}><Save size={16}/>{busy ? 'Enregistrement…' : uncertain ? 'Réessayer' : 'Enregistrer'}</Button>}</div>
    </div></Modal>
  </section>;
}

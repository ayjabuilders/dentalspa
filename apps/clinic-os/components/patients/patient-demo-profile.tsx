'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, FileCheck2, FileLock2, MessageSquareText, ShieldCheck, UserRound, Clock3, ClipboardList, Wallet } from 'lucide-react';
import { Button } from '@dental/ui-clinic';
import { patientDirectory } from '../fixtures';
import { getPatientDemoJourney } from './patient-demo-journey';
import { PatientDocumentChecklistDemo } from './patient-document-checklist-demo';
import { getPatientDocumentChecklistDemo } from './patient-document-checklist-data';
import './patient-demo-profile.css';
import './patient-demo-journey.css';

type PatientDemoRecord = (typeof patientDirectory)[number];
const sections = [['patient-overview', 'Vue d’ensemble'], ['patient-checklist', 'Documents'], ['patient-journey', 'Parcours'], ['patient-records', 'Dossier & échanges']] as const;
type SectionId = (typeof sections)[number][0];
const sectionAliases: Record<string, SectionId> = {
  'patient-visit': 'patient-overview', 'patient-admin-profile': 'patient-overview', 'patient-pass': 'patient-overview',
  'patient-clinical': 'patient-records', 'patient-finance': 'patient-records', 'patient-messages': 'patient-records',
};

export function PatientDemoProfile({ patient, patientPassHref }: { patient: PatientDemoRecord; patientPassHref: string | null }) {
  const journey = getPatientDemoJourney(patient);
  const [selectedSection, setSelectedSection] = useState<SectionId>('patient-overview');
  const [documentItems, setDocumentItems] = useState(() => getPatientDocumentChecklistDemo(patient));
  useEffect(() => { setDocumentItems(getPatientDocumentChecklistDemo(patient)); }, [patient]);
  const documentsToReview = documentItems.filter(item => item.status === 'missing' || item.status === 'needs_correction').length;
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    const restoreSection = () => {
      const hash = window.location.hash.slice(1);
      setSelectedSection(sections.find(([id]) => id === hash)?.[0] ?? sectionAliases[hash] ?? 'patient-overview');
    };
    restoreSection();
    window.addEventListener('hashchange', restoreSection);
    window.addEventListener('popstate', restoreSection);
    return () => { window.removeEventListener('hashchange', restoreSection); window.removeEventListener('popstate', restoreSection); };
  }, [patient.id]);
  function selectSection(id: SectionId, focus = false) {
    setSelectedSection(id);
    if (window.location.hash !== `#${id}`) window.history.pushState(window.history.state, '', `#${id}`);
    if (focus) tabs.current[sections.findIndex(([sectionId]) => sectionId === id)]?.focus();
  }
  const nextStep = journey.steps.find(step => step.category === 'Suivi administratif');
  const appointment = journey.steps.find(step => step.category === 'Rendez-vous');
  const index = patientDirectory.findIndex(item => item.id === patient.id);
  const nextPatient = patientDirectory[index + 1];
  const previousPatient=patientDirectory[index-1];
  const directoryHref = `/patients?preview=1&selected=${encodeURIComponent(patient.id)}`;
  return <section className="patient-profile" aria-labelledby="patient-profile-title">
    <div className="patient-profile-breadcrumb"><Link className="patient-profile-back" href={directoryHref}><ArrowLeft size={17}/>Tous les patients</Link><span>{index + 1} / {patientDirectory.length}</span><nav className="patient-profile-record-nav" aria-label="Parcourir les fiches fictives">{previousPatient && <Link className="patient-profile-back" href={`/patients/${previousPatient.id}`} aria-label="Fiche précédente" title="Fiche précédente"><ArrowLeft size={17}/></Link>}{nextPatient && <Link className="patient-profile-back" href={`/patients/${nextPatient.id}`} aria-label="Fiche suivante" title="Fiche suivante"><ArrowRight size={17}/></Link>}</nav></div>
    <header className="patient-profile-hero">
      <img src={`/assets/portrait-${patient.image}.webp`} width="104" height="104" alt="Portrait illustratif"/>
      <div><p className="eyebrow muted">DOSSIER PATIENT</p><h1 id="patient-profile-title">{patient.name}</h1><p>{patient.id} · Casablanca</p></div>
      <div className="patient-profile-context"><span className="pill">Profil fictif</span><Button asChild variant="secondary"><Link href="/connection?view=patients">Ouvrir les dossiers enregistrés<ArrowUpRight size={17}/></Link></Button></div>
    </header>
    <p className="patient-profile-demo-note" role="note"><ShieldCheck size={17}/><span>Données fictives · aucun dossier réel relié. Les changements restent dans cette session.</span></p>
    <div className="patient-profile-quick-nav" role="tablist" aria-label="Sections de la fiche patient">{sections.map(([id, label], position) => <button key={id} id={`tab-${id}`} ref={node => { tabs.current[position] = node; }} type="button" role="tab" aria-selected={selectedSection === id} aria-controls={`panel-${id}`} tabIndex={selectedSection === id ? 0 : -1} onClick={() => selectSection(id)} onKeyDown={event => {
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : event.key === 'ArrowRight' ? (position + 1) % sections.length : event.key === 'ArrowLeft' ? (position + sections.length - 1) % sections.length : null;
      if (target === null) return;
      event.preventDefault();
      selectSection(sections[target]![0], true);
    }}>{label}</button>)}</div>
    <section id="panel-patient-overview" className="patient-profile-overview" role="tabpanel" aria-labelledby="tab-patient-overview" hidden={selectedSection !== 'patient-overview'} tabIndex={0}>
      <div className="patient-profile-quick-cards" aria-label="Repères du scénario">
        <button type="button" className="patient-profile-quick-card patient-profile-docs-stat" onClick={() => selectSection('patient-checklist', true)} aria-label={`Documents : ${documentsToReview} éléments à revoir. Ouvrir la checklist`}>
          <span className="patient-profile-icon"><FileCheck2 size={23}/></span><span className="patient-profile-quick-card-copy"><span className="patient-profile-card-label">Documents à revoir</span><strong><span data-testid="patient-documents-to-review">{documentsToReview}</span><small> / {documentItems.length} éléments</small></strong><span>Manquants ou à corriger · checklist fictive</span></span><ArrowUpRight size={20} className="patient-profile-card-arrow"/>
        </button>
        <button type="button" className="patient-profile-quick-card patient-profile-action-stat" onClick={() => selectSection('patient-journey', true)} aria-label="Voir la prochaine étape dans le parcours">
          <span className="patient-profile-icon"><ClipboardList size={23}/></span><span className="patient-profile-quick-card-copy"><span className="patient-profile-card-label">Prochaine étape</span><strong>{nextStep?.title ?? 'Revoir la demande'}</strong><span>{nextStep?.state ?? 'À définir'} · parcours fictif</span></span><ArrowUpRight size={20} className="patient-profile-card-arrow"/>
        </button>
      </div>
      <div className="patient-profile-main-summary">
        <article id="patient-visit" className="work-panel patient-profile-card patient-profile-visit" tabIndex={-1}>
          <header><span className="patient-profile-icon"><CalendarDays size={20}/></span><div><p className="eyebrow muted">RENDEZ-VOUS · EXEMPLE</p><h2>Visite du scénario</h2></div><span className="pill">Non confirmé</span></header>
          <strong className="patient-profile-visit-time">{patient.visit}</strong><p>{appointment?.title ?? patient.visitNote}</p>
          <p className="patient-profile-note">Créneau illustratif · aucune réservation enregistrée.</p>
        </article>
      </div>
      <article id="patient-admin-profile" className="work-panel patient-profile-card patient-profile-identity" tabIndex={-1}>
        <header><span className="patient-profile-icon"><UserRound size={20}/></span><div><h2>Coordonnées</h2><p className="patient-profile-subtitle">Contacts fictifs · non utilisables</p></div></header>
        <dl><div><dt>Téléphone</dt><dd>{patient.phone}</dd></div><div><dt>Courriel</dt><dd>{patient.email}</dd></div><div><dt>Référence</dt><dd>{patient.id}</dd></div></dl>
        <div id="patient-pass" className="patient-profile-pass" tabIndex={-1}><h3>Vue du patient</h3><p>Aperçu mobile · aucun compte lié</p>{patientPassHref && <Button asChild variant="primary"><a href={patientPassHref} target="_blank" rel="noreferrer">Voir le Patient Pass<ArrowUpRight size={17}/></a></Button>}</div>
      </article>
    </section>
    <section id="panel-patient-checklist" role="tabpanel" aria-labelledby="tab-patient-checklist" hidden={selectedSection !== 'patient-checklist'} tabIndex={0}>
      <PatientDocumentChecklistDemo patient={patient} onItemsChange={setDocumentItems}/>
    </section>
    <section id="panel-patient-journey" className="work-panel patient-journey" role="tabpanel" aria-labelledby="tab-patient-journey" hidden={selectedSection !== 'patient-journey'} tabIndex={0}>
      <header className="patient-journey-heading"><span className="patient-profile-icon"><Clock3 size={19}/></span><div><h2 id="patient-journey-title">{journey.title}</h2><p>{journey.description}</p></div><span className="pill">Scénario fictif</span></header>
      <p className="patient-journey-disclaimer" role="note"><ShieldCheck size={17}/><span>Ces étapes ne sont pas l’historique de cette personne. Elles illustrent le parcours sans créer de lien patient, rendez-vous, document, devis ou paiement.</span></p>
      <ol className="patient-journey-list">{journey.steps.map((step, position) => <li key={`${step.category}-${position}`}><span className="patient-journey-marker" aria-hidden="true">{position + 1}</span><div className="patient-journey-copy"><p className="patient-journey-category">{step.category}</p><h3>{step.title}</h3><p>{step.detail}</p></div><span className="patient-journey-state">{step.state}</span></li>)}</ol>
    </section>
    <section id="panel-patient-records" className="work-panel patient-profile-records" role="tabpanel" aria-labelledby="tab-patient-records" hidden={selectedSection !== 'patient-records'} tabIndex={0}>
      <header><h2 id="patient-records-title">Dossier & échanges</h2><p>Aucun dossier connecté sur ce profil.</p></header>
      <article id="patient-clinical"><FileLock2 size={20}/><div><h3>Dossier de soins</h3><p>Aucun contenu clinique associé ou validé.</p></div><span>Non relié</span></article>
      <article id="patient-finance"><Wallet size={20}/><div><h3>Devis & paiements</h3><p>Aucun devis, facture ou paiement associé.</p></div><span>Non relié</span></article>
      <article id="patient-messages"><MessageSquareText size={20}/><div><h3>Échanges avec le cabinet</h3><p>Aucune conversation associée. Envoi indisponible.</p></div><span>Non relié</span></article>
    </section>
    <footer className="patient-profile-footer"><Link href={directoryHref}><ArrowLeft size={16}/>Retour aux patients</Link><Link href="/build">État des fonctionnalités<ArrowRight size={16}/></Link></footer>
  </section>;
}

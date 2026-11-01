'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Bell, CalendarDays, Check, ChevronRight, Download, FileText, Heart, Home, LockKeyhole, MessageCircle, SlidersHorizontal, UserRound } from 'lucide-react';
import { PatientCard, PatientSheet } from '@dental/ui-patient';
import { motion, useReducedMotion } from 'motion/react';
import { PatientOnboarding } from './onboarding';
import { PatientConnectedHome, PatientFeatureUnavailable, PatientSessionPanel, usePatientSession } from './patient-session';
import { createPatientDemoScenarios, findPatientDemoScenario, linkPatientDemoAppointment, type PatientDemoScenario } from './demo-scenarios';
import { VisitPreparationDemo } from './visit-preparation-demo';
import { PatientMessagesDemo } from './messages-demo';
import './onboarding.css';
import './messages-demo.css';
const tabs = [{ id: 'home', title: 'Accueil', icon: Home }, { id: 'appointments', title: 'RDV', icon: CalendarDays }, { id: 'documents', title: 'Dossier', icon: FileText }, { id: 'messages', title: 'Messages', icon: MessageCircle }, { id: 'account', title: 'Compte', icon: UserRound }];
const demosEnabled = process.env.NEXT_PUBLIC_PATIENT_DEMOS !== 'false';
type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
type DemoVisit = NonNullable<PatientDemoScenario['visit']>;
function appointmentDemoLabel(state: DemoVisit['demoState']) {
  if (state === 'simulated-confirmation') return 'SIMULATION · CONFIRMATION NON RÉELLE';
  if (state === 'simulated-reschedule') return 'SIMULATION · DÉPLACEMENT NON RÉEL';
  if (state === 'simulated-cancellation') return 'SIMULATION · ANNULATION NON RÉELLE';
  return 'EXEMPLE DE VISITE · NON CONFIRMÉ';
}
function appointmentDemoTitle(state: DemoVisit['demoState']) {
  if (state === 'simulated-confirmation') return 'Confirmation simulée';
  if (state === 'simulated-reschedule') return 'Déplacement simulé';
  if (state === 'simulated-cancellation') return 'Annulation simulée';
  return 'Scénario de visite · non confirmé';
}
export default function PatientPass() {
  const [demoPatient, setDemoPatient] = useState<ReturnType<typeof findPatientDemoScenario>>(null);
  const [demoScenarios, setDemoScenarios] = useState<PatientDemoScenario[]>([]);
  const [hasDemoQuery, setHasDemoQuery] = useState(false);
  const [demoModeResolved, setDemoModeResolved] = useState(false);
  const [selectedDemoId, setSelectedDemoId] = useState('');
  const [tab, setTab] = useState('home');
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [sheet, setSheet] = useState<'appointment' | 'install' | 'notifications' | 'scenario' | null>(null);
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [offline, setOffline] = useState(false);
  const [update, setUpdate] = useState<ServiceWorker | null>(null);
  const reduce = useReducedMotion();
  const patientSession = usePatientSession();
  const contentRef = useRef<HTMLElement>(null);
  const navigationRequested = useRef(false);
  function navigate(next: string) {
    if (next === tab && !onboardingOpen) {
      navigationRequested.current = false;
      contentRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    navigationRequested.current = true;
    setOnboardingOpen(false);
    setTab(next);
  }
  useEffect(() => {
    if (navigationRequested.current) {
      contentRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
      navigationRequested.current = false;
    }
  }, [tab, onboardingOpen]);
  useEffect(() => {
    const mode = matchMedia('(display-mode: standalone)');
    setInstalled(mode.matches);
    const capture = (e: Event) => { e.preventDefault(); setPrompt(e as InstallEvent); };
    const completed = () => { setInstalled(true); setSheet(null); };
    const network = () => setOffline(!navigator.onLine);
    network(); window.addEventListener('online', network); window.addEventListener('offline', network);
    window.addEventListener('beforeinstallprompt', capture); window.addEventListener('appinstalled', completed);
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js').then(registration => { if (registration.waiting) setUpdate(registration.waiting); registration.addEventListener('updatefound', () => { const worker = registration.installing; worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) setUpdate(worker); }); }); }).catch(() => {});
    return () => { window.removeEventListener('online', network); window.removeEventListener('offline', network); window.removeEventListener('beforeinstallprompt', capture); window.removeEventListener('appinstalled', completed); };
  }, []);
  useEffect(() => {
    if (!demosEnabled) { setDemoModeResolved(true); return; }
    const scenarios = createPatientDemoScenarios();
    const params = new URLSearchParams(window.location.search);
    const id = params.get('demoPatientId') ?? '';
    const name = params.get('demoPatientName') ?? '';
    const linkedScenario = linkPatientDemoAppointment(
      findPatientDemoScenario(id, name, scenarios),
      params.get('demoAppointmentStartsAt'),
      params.get('demoAppointmentAction'),
    );
    setDemoScenarios(scenarios);
    setSelectedDemoId(scenarios[0]?.id ?? '');
    setHasDemoQuery(Boolean(id || name));
    setDemoPatient(linkedScenario);
    setDemoModeResolved(true);
  }, []);
  useEffect(() => {
    if (patientSession.profile) setDemoPatient(null);
  }, [patientSession.profile]);
  async function install() { if (!prompt) return; await prompt.prompt(); const choice = await prompt.userChoice; if (choice.outcome === 'accepted') setSheet(null); setPrompt(null); }
  function activateUpdate() { if (!update || !window.confirm('Actualiser Patient Pass ? Les saisies non enregistrées seront perdues.')) return; navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true }); update.postMessage({ type: 'ACTIVATE_UPDATE' }); }
  const demoScenario = demoPatient ?? (hasDemoQuery
    ? { id: 'DEMO-000', name: '', visit: null }
    : demoScenarios.find(scenario => scenario.id === selectedDemoId) ?? demoScenarios[0] ?? { id: 'DEMO-000', name: '', visit: null });
  function renderActiveTab() {
    if (!demosEnabled && !patientSession.profile) return <PatientSessionPanel session={patientSession}/>;
    if (tab === 'home') {
      if (patientSession.profile) return <PatientConnectedHome profile={patientSession.profile} onShow={navigate}/>;
      return <>
        <div className="pass-greeting"><span className="eyebrow">VOTRE ESPACE DENTAL SPA</span><h1><span className="pass-home-desktop-title">Votre sourire.<br/></span><span>Votre espace.</span></h1><p>Rendez-vous, documents et échanges, au même endroit.</p></div>
        <div className="pass-home-grid"><div className="pass-home-primary">
        {demoScenario.visit ? <section className="next-appointment"><div className="appointment-heading"><span>{appointmentDemoLabel(demoScenario.visit.demoState)}</span><CalendarDays size={20}/></div><div className="appointment-date"><strong>{demoScenario.visit.day}</strong><div>{demoScenario.visit.month}<small>{demoScenario.visit.year} · scénario fictif</small></div><span>{demoScenario.visit.time}</span></div><div className="appointment-location"><span className="doctor-avatar">DS</span><div><strong>Cabinet Dental Spa · Casablanca</strong><small>{demoScenario.visit.description}</small></div></div><button onClick={() => setSheet('appointment')}>Voir l’exemple<ArrowRight size={18}/></button></section> : <PatientCard title="Aucun rendez-vous dans ce scénario"><div className="pass-empty"><CalendarDays size={30}/><p>Cette démonstration n’inclut aucun créneau. Aucune réservation n’est créée.</p><span className="pass-tag"><LockKeyhole size={13}/>Scénario fictif · aucune visite confirmée</span></div></PatientCard>}
        </div><div className="pass-home-secondary"><div className="pass-section-title"><h2>À portée de main</h2></div>
        <div className="pass-shortcuts"><button onClick={() => navigate('documents')}><span><FileText/></span><strong>Mon dossier</strong><small>Documents partagés</small><ChevronRight size={17}/></button><button onClick={() => navigate('messages')}><span><MessageCircle/></span><strong>Mon équipe</strong><small>Échanges administratifs</small><ChevronRight size={17}/></button></div>
        <button className="onboarding-entry" type="button" onClick={() => setOnboardingOpen(true)}><span><strong>Première visite ?</strong><small>Découvrez Patient Pass en 3 étapes</small></span><ChevronRight size={19} aria-hidden="true"/></button>
        <PatientCard title="Un espace qui vous appartient" className="trust-card"><Heart size={26}/><p>Seuls les documents validés et partagés par votre équipe pourront apparaître ici.</p><span><LockKeyhole size={13}/>Personnel. Protégé. À votre rythme.</span></PatientCard>
        </div></div>
        {!installed && <button className="pass-install" onClick={() => setSheet('install')}><span className="install-symbol"><Download size={21}/></span><span><strong>Gardez-nous près de vous</strong><small>Ajouter Patient Pass à votre écran</small></span><ChevronRight size={17}/></button>}
      </>;
    }
    if (tab === 'appointments') {
      if (patientSession.profile) return <PatientFeatureUnavailable title="Mes rendez-vous" message="Les rendez-vous de ce compte ne sont pas encore disponibles dans Patient Pass." onAccount={() => navigate('account')}/>;
      return <><div className="pass-greeting"><span className="eyebrow">À VOTRE RYTHME</span><h1>Mes rendez-vous</h1><p>Une vue claire de vos prochaines visites.</p></div>{demoScenario.visit ? <><PatientCard title={appointmentDemoTitle(demoScenario.visit.demoState)}><div className="visit-preview"><CalendarDays/><div><strong>{demoScenario.visit.day} {demoScenario.visit.month} {demoScenario.visit.year} · {demoScenario.visit.time}</strong><p>Cabinet Dental Spa · Casablanca</p><small>{demoScenario.visit.description}</small></div></div><span className="pass-tag"><LockKeyhole size={13}/>Exemple uniquement · aucune réservation réelle</span><button className="pass-primary" onClick={() => setSheet('appointment')}>Voir l’exemple<ArrowRight size={17}/></button></PatientCard><VisitPreparationDemo visit={demoScenario.visit}/></> : <PatientCard title="Aucun rendez-vous dans ce scénario"><div className="pass-empty"><CalendarDays size={30}/><p>Aucun créneau fictif n’est associé à ce profil.</p><span className="pass-tag"><LockKeyhole size={13}/>Aucune réservation réelle</span></div></PatientCard>}<p className="pass-footnote">Les rendez-vous réels seront affichés après leur confirmation par le cabinet et leur connexion au compte vérifié.</p></>;
    }
    if (tab === 'documents') {
      if (patientSession.profile) return <PatientFeatureUnavailable title="Mon dossier" message="Aucun document n’est chargé dans cette version. Les documents approuvés ne seront affichés qu’après leur partage par le cabinet." onAccount={() => navigate('account')}/>;
      return <><div className="pass-greeting"><span className="eyebrow">VOTRE ESPACE PERSONNEL</span><h1>Mon dossier</h1><p>Les informations qui vous sont destinées.</p></div><PatientCard title="Aucun document partagé"><div className="pass-empty"><FileText size={32}/><p>Les documents approuvés par votre praticien apparaîtront ici. Cet aperçu ne contient aucun dossier médical.</p><span className="pass-tag"><LockKeyhole size={13}/>Accès personnel vérifié requis</span><button className="pass-primary" onClick={() => navigate('account')}>Accéder à mon compte<ArrowRight size={17}/></button></div></PatientCard></>;
    }
    if (tab === 'messages') {
      if (patientSession.profile) return <PatientFeatureUnavailable title="Mon équipe" message="La messagerie sécurisée n’est pas encore disponible dans cette version." onAccount={() => navigate('account')}/>;
      return null;
    }
    return <PatientSessionPanel session={patientSession}/>;
  }
  return <div className={`pass-frame${largeText ? ' pass-large-text' : ''}`}><a className="skip-link" href="#pass-content">Aller au contenu</a>
  <header className="pass-header"><button type="button" onClick={() => navigate('home')} className="pass-brand" aria-label="Patient Pass — accueil"><img src="/assets/favicon.svg" width="27" height="32" alt=""/><span>Dental Spa<small>PATIENT PASS</small></span></button><div className="pass-header-actions"><span className="pass-mode"><span aria-hidden="true"/>{patientSession.profile ? 'Espace vérifié' : demosEnabled ? 'Aperçu fictif' : 'Accès personnel'}</span><button className="pass-icon" aria-label="Notifications" onClick={() => setSheet('notifications')}><Bell size={20}/></button><button className="pass-profile-avatar" aria-label="Ouvrir mon compte" onClick={() => navigate('account')}><UserRound size={20}/></button></div></header>
  <div className="pass-layout"><nav className="pass-tabs" aria-label="Navigation Patient Pass"><span className="pass-nav-label">MON ESPACE</span>{tabs.map(item => <button key={item.id} onClick={() => navigate(item.id)} aria-current={tab === item.id && !onboardingOpen ? 'page' : undefined}><item.icon size={21}/><span>{item.title === 'RDV' ? <><span className="pass-nav-desktop">Rendez-vous</span><span className="pass-nav-mobile">RDV</span></> : item.title}</span></button>)}<div className="pass-nav-note"><LockKeyhole size={20}/><strong>À votre rythme.</strong><p>Votre espace personnel, toujours à portée de main.</p>{!installed && <button type="button" onClick={() => setSheet('install')}><Download size={16}/>Installer Patient Pass</button>}</div></nav>
  <div className="pass-workspace"><div className="pass-context" data-home={tab==='home'&&!onboardingOpen}><div>{tab !== 'home' || onboardingOpen ? <button type="button" className="pass-icon" aria-label="Retour à l’accueil" onClick={() => navigate('home')}><ArrowLeft size={18}/></button> : <Home size={17} aria-hidden="true"/>}<span className="pass-context-trail">Mon espace <ChevronRight size={14}/><strong>{onboardingOpen ? 'Guide d’accueil' : tabs.find(item => item.id === tab)?.title}</strong></span></div>{demosEnabled && !patientSession.profile && demoModeResolved && !hasDemoQuery && <button className="pass-scenario-button" onClick={() => setSheet('scenario')}><SlidersHorizontal size={16}/><span>Changer d’exemple</span></button>}</div>
  {(demosEnabled || patientSession.profile) && <div className="demo-strip"><LockKeyhole size={14}/>{patientSession.profile ? 'Session vérifiée · contenu limité à votre compte' : <span>Démonstration · données fictives{demoScenario.name && <> · <strong>{demoScenario.name}</strong></>}</span>}{demosEnabled&&!patientSession.profile&&demoModeResolved&&!hasDemoQuery&&<button type="button" className="pass-scenario-mobile" aria-label="Changer d’exemple" onClick={()=>setSheet('scenario')}><SlidersHorizontal size={18}/></button>}</div>}
  {offline && <p className="offline-strip" role="status">Hors connexion. Vos données ne sont pas enregistrées sur cet appareil.</p>}{update && <button className="pass-update" onClick={activateUpdate}>Mise à jour disponible — actualiser</button>}
  <main id="pass-content" tabIndex={-1} ref={contentRef}>
    {demosEnabled && !patientSession.profile && !demoModeResolved ? <section className="pass-card pass-loading" role="status" aria-busy="true"><span/>Préparation de l’aperçu fictif…</section> : onboardingOpen ? <PatientOnboarding largeText={largeText} onLargeTextChange={setLargeText} onClose={() => navigate('home')} /> : <motion.div className={`pass-tab-content pass-page-${tab}`} key={tab} initial={reduce ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .18 }}>{renderActiveTab()}</motion.div>}
    {/* Tab changes retain this in-memory draft; a different identity or session discards it. */}
    {demosEnabled && !patientSession.profile && demoModeResolved && <div key={`${demoScenario.id}:${demoScenario.name}:${patientSession.state}`} className="pass-tab-content pass-page-messages" hidden={tab !== 'messages' || onboardingOpen}>
      <PatientMessagesDemo patient={{ id: demoScenario.id, name: demoScenario.name }}/>
    </div>}
  </main><footer className="pass-footer"><LockKeyhole size={13}/>Aucun dossier personnel conservé hors connexion.</footer></div></div>
  <PatientSheet open={sheet === 'scenario'} onOpenChange={open => !open && setSheet(null)} title="Explorer un profil fictif" description="Changez de scénario pour découvrir l’interface. Aucun compte ni rendez-vous n’est créé."><div className="pass-scenario-options">{demoScenarios.map(scenario => <button type="button" key={scenario.id} aria-pressed={scenario.id === selectedDemoId} onClick={() => { setSelectedDemoId(scenario.id); setSheet(null); navigate('home'); }}><span className="pass-profile-avatar">{scenario.name.slice(0,1)}</span><span><strong>{scenario.name}</strong><small>{scenario.visit ? 'Avec une visite d’exemple' : 'Sans visite prévue'}</small></span>{scenario.id === selectedDemoId ? <Check size={18}/> : <ChevronRight size={18}/>}</button>)}</div></PatientSheet>
  <PatientSheet open={sheet === 'appointment'} onOpenChange={open => !open && setSheet(null)} title="Exemple de visite" description="Scénario fictif · aucune réservation réelle."><div className="sheet-details"><CalendarDays size={30}/><h3>{demoScenario.visit ? `${demoScenario.visit.day} ${demoScenario.visit.month} ${demoScenario.visit.year} · ${demoScenario.visit.time}` : 'Aucun créneau dans ce scénario'}</h3><p>Cabinet Dental Spa · Casablanca</p><p>{demoScenario.visit?.description ?? 'Ce profil de démonstration ne comporte pas de visite.'} Les rendez-vous réels apparaîtront ici après confirmation par le cabinet.</p><button className="pass-primary" onClick={() => setSheet(null)}>J’ai compris<Check size={18}/></button></div></PatientSheet>
  <PatientSheet open={sheet === 'install'} onOpenChange={open => !open && setSheet(null)} title="Dental Spa, tout près de vous" description="Installez Patient Pass sur votre écran d’accueil."><div className="sheet-details"><Download size={36}/>{prompt ? <button className="pass-primary" onClick={install}>Installer Patient Pass</button> : <><p>iPhone / iPad : ouvrez cette page dans Safari, puis Partager → Sur l’écran d’accueil.</p><p>Android / ordinateur : dans Chrome ou Edge, ouvrez le menu et choisissez « Installer » si proposé.</p></>}<small>Hors connexion, seul un écran d’accueil statique est disponible. Aucun dossier personnel n’est mis en cache.</small></div></PatientSheet>
  <PatientSheet open={sheet === 'notifications'} onOpenChange={open => !open && setSheet(null)} title="Vos notifications" description="Un peu d’attention, au bon moment."><div className="sheet-details"><Bell size={32}/><h3>Tout est calme.</h3><p>Aucune notification pour le moment. L’envoi de notifications est désactivé dans cet aperçu.</p></div></PatientSheet></div>;
}

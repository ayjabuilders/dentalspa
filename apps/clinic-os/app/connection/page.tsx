'use client';
import { ConfiguredBookingInbox } from '../../components/booking-request-inbox/configured-booking-inbox';
import { BookingRequestNotice } from '../../components/booking-request-inbox/booking-request-notice';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Inbox, CalendarDays, CalendarCheck, WalletCards, Settings2, Users, MessageCircle, ShieldCheck, ArrowLeft, ArrowRight, LogOut, Eye, EyeOff, LoaderCircle, LockKeyhole, AlertCircle, FolderSearch2 } from 'lucide-react';
import { Button, ClinicDesignProvider } from '@dental/ui-clinic';
import { ClinicWorkspaceChoicesSchema, WorkspaceSchema, type ClinicWorkspaceChoice } from '@dental/contracts';
import { WorkspaceNavigation, WorkspaceTopbar, type WorkspaceModule } from '../../components/connected-workspace/workspace-chrome';
import { IntakeWorkspace } from '../../components/intake/intake-workspace';
import { createHttpIntakeTransport, type IntakeTransport } from '../../components/intake/transport';
import { createPatientLookupTransport, type PatientLookupTransport } from '../../components/patient-lookup/transport';
import { PatientDirectory } from '../../components/patient-directory/patient-directory';
import { PatientHub } from '../../components/patients/patient-hub';
import { PatientDocumentProfile } from '../../components/patients/patient-document-profile';
import { RecordedAppointments, createAgendaViewPreferences } from '../../components/scheduling/recorded-appointments';
import { createPatientDirectoryTransport, type PatientDirectoryTransport } from '../../components/patient-directory/transport';
import { SchedulingWorkspace } from '../../components/scheduling/scheduling-workspace';
import { createSchedulingTransport, type SchedulingTransport } from '../../components/scheduling/transport';
import { TeamRosterView } from '../../components/team/team-roster';
import { TeamManagement } from '../../components/team/team-management';
import { TeamActivityPanel } from '../../components/team/team-activity';
import { createTeamTransport, type TeamTransport } from '../../components/team/transport';
import { BookingRequestInbox } from '../../components/booking-request-inbox/booking-request-inbox';
import { AgendaSettingsEditor } from '../../components/agenda-settings/agenda-settings';
import { FakeInbox } from '../../components/fake-inbox/fake-inbox';
import { resolveApiBaseUrl } from '../../lib/api-base-url';
import './connection.css';
import '@dental/design-tokens/pearl.css';
import '@dental/ui-clinic/pearl.css';
import './pearl-connected.css';
import {ConnectedNavigationProvider,useConnectedNavigation} from '../../lib/connected-navigation';
import {installRenewingSession,stopRenewingSession,sessionFetch as fetch} from '../../lib/renewing-session';
import { FinanceHome } from '../../components/finance/finance-home';
import { FinanceCatalog } from '../../components/finance/finance-catalog';
import { InstallmentReminders, createInstallmentReminderViewState } from '../../components/finance/installment-reminders';
import {agreementFromLocation,patientFromLocation,useWorkspaceHistory,type WorkspaceAgreementTarget,type WorkspaceRoute} from '../../lib/workspace-history';

const stages = ['Vérification de votre identité…', 'Vérification des cabinets associés à votre compte…'];

export default function Connection() {return <ConnectedNavigationProvider><ConnectedWorkspace/></ConnectedNavigationProvider>;}
function ConnectedWorkspace() {
  const {locked:navigationLocked}=useConnectedNavigation();
  const [ready,setReady]=useState(false);
  const [expandedMenu,setExpandedMenu]=useState(false);
  const [compactLayout,setCompactLayout]=useState(false);
  const [workspaceMotion,setWorkspaceMotion]=useState(true);
  const [restoring,setRestoring]=useState(true);
  useEffect(()=>{const url=new URL(window.location.href);if(url.searchParams.has('email')||url.searchParams.has('password')){url.searchParams.delete('email');url.searchParams.delete('password');window.history.replaceState(null,'',url.pathname+url.search);}setReady(true);},[]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visiblePassword, setVisiblePassword] = useState(false);
  const [stage, setStage] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [verifiedWorkspace, setVerifiedWorkspace] = useState<ReturnType<typeof WorkspaceSchema.parse> | null>(null);
  const [clinicChoices, setClinicChoices] = useState<ClinicWorkspaceChoice[]>([]);
  const [activeClinicName, setActiveClinicName] = useState('');
  const [online, setOnline] = useState(true);
  const [intakeTransport, setIntakeTransport] = useState<IntakeTransport | null>(null);
  const [showIntake, setShowIntake] = useState(false);
  const connectedIntake = useRef<IntakeTransport | null>(null);
  const [lookupTransport, setLookupTransport] = useState<PatientLookupTransport | null>(null);
  const [showLookup, setShowLookup] = useState(false);
  const connectedLookup = useRef<PatientLookupTransport | null>(null);
  const [patientDirectoryTransport, setPatientDirectoryTransport] = useState<PatientDirectoryTransport | null>(null);
  const [showPatientDirectory, setShowPatientDirectory] = useState(false);
  const [selectedConnectedPatient, setSelectedConnectedPatient] = useState<string | null>(null);
  const [selectedAgreement,setSelectedAgreement]=useState<WorkspaceAgreementTarget|null>(null);
  const [reminderView,setReminderView]=useState(createInstallmentReminderViewState);
  const [showInstallmentReminders,setShowInstallmentReminders]=useState(false);
  const [patientOpenedFromAgenda, setPatientOpenedFromAgenda] = useState(false);
  const connectedPatientDirectory = useRef<PatientDirectoryTransport | null>(null);
  const [schedulingTransport, setSchedulingTransport] = useState<SchedulingTransport | null>(null);
  const [showScheduling, setShowScheduling] = useState(false);
  // Only view preferences survive module navigation, never appointment responses.
  // Workspace/session teardown clears these in-memory preferences too.
  const [agendaView, setAgendaView] = useState(createAgendaViewPreferences);
  const connectedScheduling = useRef<SchedulingTransport | null>(null);
  const [teamTransport, setTeamTransport] = useState<TeamTransport | null>(null);
  const [showTeam, setShowTeam] = useState(false);
  const [showBookingRequests, setShowBookingRequests] = useState(false);
  const [showAgendaSettings, setShowAgendaSettings] = useState(false);
  const [showFinanceHome, setShowFinanceHome] = useState(false);
  const [showFinanceCatalog, setShowFinanceCatalog] = useState(false);
  const [showFakeInbox, setShowFakeInbox] = useState(false);
  const connectedTeam = useRef<TeamTransport | null>(null);
  const active = useRef(true);
  const busy = useRef(false);
  const request = useRef<AbortController | null>(null);
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionChannel=useRef<BroadcastChannel|null>(null);
  const session = useRef<{ token: string; userId: string; expiresAt: number; api: string; renewable?:boolean } | null>(null);
  const errorRegion = useRef<HTMLDivElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const pending = stage !== null;
  const config = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return { client: null, issue: 'La connexion attend la configuration Supabase de développement.' };
    try {
      return { client: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }), issue: '' };
    } catch {
      return { client: null, issue: 'La configuration de connexion doit être vérifiée par l’équipe de développement.' };
    }
  }, []);
  const client = config.client;

  useEffect(() => {
    active.current = true;
    const channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('clinic-session-events');sessionChannel.current=channel;
    if(channel)channel.onmessage=event=>{if(event.data==='logout'&&active.current){setNotice('Session fermée dans un autre onglet.');void clearSession(false);}};
    try {
      document.documentElement.dataset.theme = localStorage.getItem('dental-theme') === 'dark' ? 'dark' : 'light';
    } catch { /* The connection remains usable when preference storage is unavailable. */ }
    const updateNetwork = () => setOnline(navigator.onLine);
    updateNetwork();
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    return () => {
      active.current = false;
      channel?.close();if(sessionChannel.current===channel)sessionChannel.current=null;
      stopRenewingSession();
      request.current?.abort();
      connectedIntake.current?.dispose?.();
      connectedLookup.current?.dispose();
      connectedScheduling.current?.dispose();
      connectedTeam.current?.dispose();
      connectedPatientDirectory.current?.dispose();
      if (expiry.current) clearTimeout(expiry.current);
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
      // Unmount/reload clears view data, not the server-held refresh cookie.
    };
  }, [client]);
  useEffect(() => { if (error) errorRegion.current?.focus(); }, [error]);
  useEffect(() => {
    if (verifiedWorkspace === null) return;
    if (showFinanceHome) document.querySelector<HTMLElement>('#finance-home-title')?.focus();
    else if (showInstallmentReminders) document.querySelector<HTMLElement>('#installment-reminders-title')?.focus();
    else if (showFinanceCatalog) document.querySelector<HTMLElement>('#finance-catalog-title')?.focus();
    else if (showAgendaSettings) document.querySelector<HTMLElement>('#agenda-settings-title')?.focus();
    else if (showScheduling) document.querySelector<HTMLElement>('#recorded-appointments-title')?.focus();
    else resultHeading.current?.focus();
  }, [verifiedWorkspace, showFinanceHome, showScheduling, showAgendaSettings, showFinanceCatalog, showInstallmentReminders]);
  useEffect(() => { if (clinicChoices.length > 0) resultHeading.current?.focus(); }, [clinicChoices.length]);
  useEffect(() => {
    if (showIntake || showLookup || showPatientDirectory || showScheduling || showTeam || showBookingRequests || showFakeInbox) setShowAgendaSettings(false);
  }, [showIntake, showLookup, showPatientDirectory, showScheduling, showTeam, showBookingRequests, showFakeInbox]);

  useEffect(() => { if(showIntake||showLookup||showPatientDirectory||showScheduling||showTeam||showBookingRequests||showFakeInbox||showAgendaSettings)setShowFinanceCatalog(false); },[showIntake,showLookup,showPatientDirectory,showScheduling,showTeam,showBookingRequests,showFakeInbox,showAgendaSettings]);

  function clearWorkspaceData() {
    setShowInstallmentReminders(false);setReminderView(createInstallmentReminderViewState());setSelectedAgreement(null);setSelectedConnectedPatient(null);
    setShowFinanceHome(false);setShowFinanceCatalog(false);
    setVerifiedWorkspace(null);
    setClinicChoices([]);
    setActiveClinicName('');
    connectedIntake.current?.dispose?.();
    connectedIntake.current = null;
    setIntakeTransport(null);
    setShowIntake(false);
    connectedLookup.current?.dispose();
    connectedLookup.current = null;
    setLookupTransport(null);
    setShowLookup(false);
    connectedPatientDirectory.current?.dispose();
    connectedPatientDirectory.current = null;
    setPatientDirectoryTransport(null);
    setShowPatientDirectory(false);
    connectedScheduling.current?.dispose();
    connectedScheduling.current = null;
    setSchedulingTransport(null);
    setShowScheduling(false);
    setAgendaView(createAgendaViewPreferences());
    setPatientOpenedFromAgenda(false);
    connectedTeam.current?.dispose();
    connectedTeam.current = null;
    setTeamTransport(null);
    setShowTeam(false);
    setShowBookingRequests(false);
    setShowAgendaSettings(false);
    setShowFakeInbox(false);
  }

  async function clearSession(notifyOtherTabs=true) {
    stopRenewingSession();
    if(notifyOtherTabs)sessionChannel.current?.postMessage('logout');
    busy.current = true;
    setClosing(true);
    if (expiry.current) clearTimeout(expiry.current);
    expiry.current = null;
    session.current = null;
    clearWorkspaceData();
    setPassword('');
    setVisiblePassword(false);
    try {
      const closed=await sessionRequest('logout').catch(()=>undefined);
      if(!closed?.ok)setNotice('Déconnexion locale effectuée. La fermeture serveur sera retentée au prochain chargement.');
      await client?.auth.signOut({ scope: 'local' });
    } catch {
      // Displayed records are already cleared; never expose provider error details.
    } finally {
      busy.current = false;
      if (active.current) setClosing(false);
    }
  }

  async function sessionRequest(action:'start'|'resume'|'logout',refreshToken?:string,signal?:AbortSignal){
    if(action==='logout'){try{sessionStorage.setItem('clinic-logout-pending','1');}catch{/* Storage may be unavailable. */}}
    const response=await fetch('/api/clinic-session',{method:'POST',headers:{'Content-Type':'application/json','X-Clinic-Session':'1'},credentials:'same-origin',cache:'no-store',body:JSON.stringify({action,...(refreshToken?{refresh_token:refreshToken}:{})}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
    if(response.ok&&(action==='logout'||action==='start')){try{sessionStorage.removeItem('clinic-logout-pending');}catch{/* No credentials are stored here. */}}
    return response;
  }
  function parseRestored(raw:unknown){
    const value=raw as {access_token?:unknown;expires_at?:unknown;user_id?:unknown};
    if(!value||typeof value.access_token!=='string'||typeof value.expires_at!=='number'||typeof value.user_id!=='string'||!value.access_token||value.expires_at*1000<=Date.now())throw Error('session');
    return {token:value.access_token,userId:value.user_id,expiresAt:value.expires_at*1000,api:resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_URL,window.location.hostname),renewable:true};
  }
  useEffect(()=>{
    const controller=new AbortController();
    void(async()=>{try{
      if(!client)return;
      let logoutPending=false;try{logoutPending=sessionStorage.getItem('clinic-logout-pending')==='1';}catch{/* No persistent credential fallback. */}
      if(logoutPending){await sessionRequest('logout',undefined,controller.signal);return;}
      const r=await sessionRequest('resume',undefined,controller.signal);
      if(!r.ok)return;
      const auth=parseRestored(await r.json());if(controller.signal.aborted)return;
      const choices=await listWorkspaces(auth.token,auth.api,controller.signal);if(controller.signal.aborted)return;
      if(!choices.length){await sessionRequest('logout');return;}
      beginSession(auth);
      if(choices.length===1)await verifyAndInstall(choices[0]!,auth,controller.signal);
      else setClinicChoices(choices);
    }catch{if(!controller.signal.aborted)setNotice('La session n’a pas pu être restaurée. Reconnectez-vous ou réessayez après le retour du réseau.');}
    finally{if(!controller.signal.aborted)setRestoring(false);}})();
    return()=>controller.abort();
  },[client]);

  function beginSession(auth:NonNullable<typeof session.current>){
    session.current=auth;stopRenewingSession();
    if(auth.renewable)installRenewingSession({auth,refresh:async()=>{
      const response=await sessionRequest('resume');
      if(response.status===401)throw Error('session-expired');
      if(!response.ok)throw Error('refresh-unavailable');
      const next=parseRestored(await response.json());
      if(session.current===auth&&next.userId===auth.userId)auth.expiresAt=next.expiresAt;
      return next;
    },onExpired:()=>{if(active.current){setNotice('Votre session ne peut plus être renouvelée. Reconnectez-vous.');void clearSession();}}});
  }

  async function listWorkspaces(token: string, api: string, signal?: AbortSignal) {
    const response = await fetch(`${api}/api/v1/me/workspaces`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      ...(signal ? { signal } : { signal: AbortSignal.timeout(15000) }),
    });
    if (!response.ok) throw new Error(response.status === 401 ? 'session' : 'workspace-list');
    return ClinicWorkspaceChoicesSchema.parse(await response.json()).items;
  }

  function installWorkspace(workspace: ReturnType<typeof WorkspaceSchema.parse>, auth: NonNullable<typeof session.current>, choice: ClinicWorkspaceChoice) {
    if (auth.expiresAt <= Date.now()) throw new Error('expired');
    setVerifiedWorkspace(workspace);
    setClinicChoices([]);
    setActiveClinicName(choice.clinic_name);
    const transport = createHttpIntakeTransport({ api: auth.api, token: auth.token, clinicId: workspace.clinic_id, userId: workspace.user_id, roles: workspace.roles });
    connectedIntake.current = transport;
    setIntakeTransport(transport);
    const lookup = createPatientLookupTransport({ api: auth.api, token: auth.token, clinicId: workspace.clinic_id });
    connectedLookup.current = lookup;
    setLookupTransport(lookup);
    const patientDirectory = createPatientDirectoryTransport({ api: auth.api, token: auth.token, clinicId: workspace.clinic_id });
    connectedPatientDirectory.current = patientDirectory;
    setPatientDirectoryTransport(patientDirectory);
    // A patient-workspace link may request the connected register. Do not load
    // patient data until the user has completed authentication and clinic verification.
    const canSchedule=workspace.roles.some(role=>role==='manager'||role==='reception'||role==='dentist');
    const allowedViews=['intake','patients','lookup','team',...(canSchedule?['planning']:[]),...(workspace.roles.includes('manager')?['agenda-settings','finance','finance-catalog','finance-reminders']:[]),...(workspace.roles.some(role=>role==='manager'||role==='reception')?['booking-requests','inbox']:[])];
    const originalView=new URLSearchParams(window.location.search).get('view');
    const requested=originalView==='lookup'?'patients':originalView;
    if(originalView==='lookup')window.history.replaceState(null,'','/connection?view=patients');
    const requestedView=requested&&allowedViews.includes(requested)?requested:(canSchedule?'planning':'patients');
    setShowIntake(requestedView==='intake');setShowLookup(requestedView==='lookup');setShowTeam(requestedView==='team');
    setShowBookingRequests(requestedView === 'booking-requests' && workspace.roles.some(role=>role==='reception'||role==='manager'));
    setShowAgendaSettings(requestedView === 'agenda-settings' && workspace.roles.includes('manager'));
    setShowFinanceHome(requestedView === 'finance' && workspace.roles.includes('manager'));
    setShowFinanceCatalog(requestedView === 'finance-catalog' && workspace.roles.includes('manager'));
    setShowInstallmentReminders(requestedView==='finance-reminders'&&workspace.roles.includes('manager'));
    setSelectedAgreement(requestedView==='patients'&&workspace.roles.includes('manager')?agreementFromLocation():null);
    setShowPatientDirectory(requestedView === 'patients');
    setSelectedConnectedPatient(requestedView==='patients'?patientFromLocation():null);
    setShowFakeInbox(requestedView === 'inbox' && workspace.roles.some(role => role === 'reception' || role === 'manager'));
    setShowScheduling(requestedView === 'planning' && workspace.roles.some(role => role === 'reception' || role === 'manager' || role === 'dentist'));
    const scheduling = createSchedulingTransport({ api: auth.api, token: auth.token, clinicId: workspace.clinic_id });
    connectedScheduling.current = scheduling;
    setSchedulingTransport(scheduling);
    const team = createTeamTransport({ api: auth.api, token: auth.token, clinicId: workspace.clinic_id });
    connectedTeam.current = team;
    setTeamTransport(team);
    if (expiry.current) clearTimeout(expiry.current);
    expiry.current = auth.renewable?null:setTimeout(() => {
      if (!active.current) return;
      setNotice('Votre session a expiré. Les recherches et les données consultées ont été effacées.');
      void clearSession();
    }, auth.expiresAt - Date.now());
  }

  async function verifyAndInstall(choice: ClinicWorkspaceChoice, auth: NonNullable<typeof session.current>, signal?: AbortSignal) {
    if (auth.expiresAt <= Date.now()) throw new Error('expired');
    const response = await fetch(`${auth.api}/api/v1/me/workspace`, {
      headers: { Authorization: `Bearer ${auth.token}`, 'X-Clinic-Id': choice.clinic_id }, cache: 'no-store',
      ...(signal ? { signal } : { signal: AbortSignal.timeout(15000) }),
    });
    if (!response.ok) throw new Error(response.status === 401 ? 'session' : response.status === 403 ? 'membership-revoked' : 'workspace');
    const workspace = WorkspaceSchema.parse(await response.json());
    if (workspace.clinic_id !== choice.clinic_id || workspace.user_id !== auth.userId || auth.expiresAt <= Date.now()) throw new Error('scope');
    if (!active.current) return;
    installWorkspace(workspace, auth, choice);
  }

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || busy.current || restoring || !online) return;
    setError(''); setNotice(''); clearWorkspaceData(); stopRenewingSession(); session.current = null;
    busy.current = true; setStage(0);
    const controller = new AbortController(); request.current = controller;
    let failureMessage = 'La connexion est indisponible. Vérifiez votre réseau et réessayez.';
    const submittedPassword = password; setPassword(''); setVisiblePassword(false);
    try {
      const { data, error: authError } = await client.auth.signInWithPassword({ email: email.trim(), password: submittedPassword });
      if (!active.current) { await client.auth.signOut({ scope: 'local' }); return; }
      if (authError || !data.session) {
        failureMessage = authError?.status === 429 ? 'Trop de tentatives. Patientez quelques instants avant de réessayer.' : 'Connexion refusée. Vérifiez votre adresse e-mail et votre mot de passe.';
        throw new Error('authentication');
      }
      const expiresAt = data.session.expires_at ? data.session.expires_at * 1000 : 0;
      if (expiresAt <= Date.now()) { failureMessage = 'La session a expiré. Connectez-vous à nouveau.'; throw new Error('expired'); }
      let auth = { token: data.session.access_token, userId: data.session.user.id, expiresAt, api: resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_URL, window.location.hostname),renewable:false };
      try{const stored=await sessionRequest('start',data.session.refresh_token,controller.signal);if(stored.ok){const restored=parseRestored(await stored.json());if(restored.userId!==auth.userId)throw Error('scope');auth=restored;}else setNotice('Session temporaire : la restauration après rechargement est indisponible.');}catch{if(controller.signal.aborted)return;setNotice('Session temporaire : la restauration après rechargement est indisponible.');}
      if(controller.signal.aborted||!active.current)return;
      beginSession(auth); setStage(1);
      let choices: ClinicWorkspaceChoice[];
      try { choices = await listWorkspaces(auth.token, auth.api, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])); }
      catch (failure) {
        failureMessage = failure instanceof Error && failure.message === 'session' ? 'La session n’est plus valide. Connectez-vous à nouveau.' : 'La liste des cabinets autorisés est indisponible. Réessayez plus tard.';
        throw failure;
      }
      if (choices.length === 0) { failureMessage = 'Aucun cabinet actif n’est associé à ce compte. Contactez son administrateur.'; throw new Error('no-membership'); }
      if (!active.current) return;
      if (choices.length > 1) { setClinicChoices(choices); setNotice('Choisissez le cabinet à ouvrir. Chaque accès sera vérifié à nouveau par le serveur.'); return; }
      try { await verifyAndInstall(choices[0]!, auth, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])); }
      catch (failure) {
        failureMessage = failure instanceof Error && failure.message === 'session' ? 'La session n’est plus valide. Connectez-vous à nouveau.' : 'L’accès au cabinet doit être revérifié. Reconnectez-vous et réessayez.';
        throw failure;
      }
    } catch (failure) {
      if (active.current) {
        setError(failure instanceof DOMException && failure.name === 'TimeoutError' ? 'Le cabinet met trop de temps à répondre. Réessayez dans un instant.' : failureMessage);
        clearWorkspaceData(); session.current = null;
      }
      await sessionRequest('logout').catch(()=>undefined);
      await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
    } finally {
      request.current = null; busy.current = false; if (active.current) setStage(null);
    }
  }

  async function selectWorkspace(choice: ClinicWorkspaceChoice) {
    const auth = session.current;
    if (!auth || busy.current || !online) return;
    busy.current = true; setStage(1); setError(''); setNotice('');
    const controller = new AbortController(); request.current = controller;
    try {
      const choices = await listWorkspaces(auth.token, auth.api, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
      setClinicChoices(choices);
      if (!choices.some(item => item.clinic_id === choice.clinic_id)) throw new Error('membership-revoked');
      await verifyAndInstall(choice, auth, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
    } catch (failure) {
      if (active.current) {
        const expired = failure instanceof Error && failure.message === 'session' || auth.expiresAt <= Date.now();
        setError(expired ? 'La session a expiré. Connectez-vous à nouveau.' : failure instanceof Error && failure.message === 'membership-revoked' ? 'Cet accès n’est plus actif. Choisissez un cabinet autorisé.' : 'Le cabinet n’a pas pu être vérifié. Choisissez un accès actif ou réessayez.');
        if (expired) { void clearSession(); return; }
      }
    } finally {
      request.current = null; busy.current = false; if (active.current) setStage(null);
    }
  }

  async function changeWorkspace() {
    const auth = session.current;
    if (!auth || busy.current || !online) return;
    busy.current = true; setStage(1); setError(''); setNotice(''); clearWorkspaceData();
    const controller = new AbortController(); request.current = controller;
    try {
      const choices = await listWorkspaces(auth.token, auth.api, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
      if (!active.current) return;
      if (choices.length === 0) { setError('Aucun cabinet actif n’est associé à ce compte.'); void clearSession(); return; }
      setClinicChoices(choices); setNotice('Choisissez le cabinet à ouvrir. Chaque accès sera vérifié à nouveau par le serveur.');
    } catch {
      if (active.current) setError(auth.expiresAt <= Date.now() ? 'La session a expiré. Connectez-vous à nouveau.' : 'Les accès aux cabinets ne peuvent pas être actualisés. Réessayez.');
      if (auth.expiresAt <= Date.now()) void clearSession();
    } finally {
      request.current = null; busy.current = false; if (active.current) setStage(null);
    }
  }

  async function disconnect() {
    setError('');
    setNotice('Vous êtes déconnecté. Les recherches et les données consultées ont été effacées.');
    await clearSession();
  }

  const currentModule=showFinanceHome?'finance':showIntake?'intake':showLookup?'lookup':showPatientDirectory?'patients':showScheduling?'planning':showAgendaSettings?'agenda-settings':showBookingRequests?'booking-requests':showTeam?'team':showFinanceCatalog?'finance-catalog':showInstallmentReminders?'finance-reminders':'inbox';
  const labels:Record<string,string>={finance:'Finance',intake:'Demandes',patients:'Patients',planning:'Agenda','agenda-settings':'Paramètres agenda','booking-requests':'Réservations',team:'Équipe','finance-catalog':'Catalogue tarifaire','finance-reminders':'Échéances',inbox:'Messagerie',lookup:'Recherche patient'};
  const workspaceModules:WorkspaceModule[] = [
    ...(intakeTransport?[{id:'intake',label:'Demandes',description:'Contacts entrants et suivi',icon:Inbox,group:'Activité' as const}]:[]),
    ...(patientDirectoryTransport?[{id:'patients',label:'Patients',description:'Répertoire et dossiers patients',icon:FolderSearch2,group:'Activité' as const}]:[]),
    ...(schedulingTransport&&verifiedWorkspace?.roles.some(r=>r==='manager'||r==='reception'||r==='dentist')?[{id:'planning',label:'Agenda',description:'Calendrier et rendez-vous',icon:CalendarDays,group:'Activité' as const}]:[]),
    ...(verifiedWorkspace?.roles.some(r=>r==='manager'||r==='reception')?[{id:'booking-requests',label:'Réservations',description:'Demandes de rendez-vous en ligne',icon:CalendarCheck,group:'Activité' as const},{id:'inbox',label:'Messagerie',description:'Conversations du cabinet',icon:MessageCircle,group:'Activité' as const}]:[]),
    ...(verifiedWorkspace?.roles.includes('manager')?[{id:'finance',label:'Finance',description:'Dossiers financiers, échéances et catalogue',icon:WalletCards,group:'Activité' as const},{id:'finance-reminders',label:'Échéances',description:'Échéanciers à revoir et soldes dus',icon:WalletCards,group:'Activité' as const},{id:'finance-catalog',label:'Catalogue tarifaire',description:'Prestations, catégories et tarifs',icon:WalletCards,group:'Cabinet' as const},{id:'agenda-settings',label:'Paramètres agenda',description:'Horaires et types de visite',icon:Settings2,group:'Cabinet' as const}]:[]),
    ...(teamTransport?[{id:'team',label:'Équipe',description:'Membres actifs du cabinet',icon:Users,group:'Cabinet' as const}]:[]),
  ];
  function applyWorkspaceRoute(route:WorkspaceRoute){
    const module=route.module;
    setShowIntake(module==='intake');setShowLookup(false);setShowPatientDirectory(module==='patients');setShowScheduling(module==='planning');setShowAgendaSettings(module==='agenda-settings');setShowBookingRequests(module==='booking-requests');setShowTeam(module==='team');setShowFinanceHome(module==='finance');setShowFinanceCatalog(module==='finance-catalog');setShowInstallmentReminders(module==='finance-reminders');setSelectedAgreement(module==='patients'&&verifiedWorkspace?.roles.includes('manager')?route.agreement??null:null);setShowFakeInbox(module==='inbox');setSelectedConnectedPatient(route.patient);setPatientOpenedFromAgenda(false);
    if(module!==currentModule)requestAnimationFrame(()=>{
      document.querySelector('.connected-module-content')?.scrollTo({top:0,behavior:'instant'});
      window.scrollTo({top:0,behavior:'instant'});
    });
  }
  const workspaceHistory=useWorkspaceHistory({clinicId:verifiedWorkspace?.clinic_id,route:{module:currentModule,patient:selectedConnectedPatient,agreement:selectedAgreement},allowed:workspaceModules.map(item=>item.id),locked:navigationLocked,apply:applyWorkspaceRoute});
  function openModule(module:string){
    if(module==='lookup')module='patients';
    if(navigationLocked||!workspaceModules.some(item=>item.id===module))return;
    if(module===currentModule)return;
    workspaceHistory.navigate({module,patient:null});
  }
  return <ClinicDesignProvider value="pearl"><main data-sidebar={expandedMenu?'expanded':'compact'} data-density={compactLayout?'compact':'comfortable'} data-motion={workspaceMotion?'full':'reduced'} data-ds="pearl" className={`connection-page connected-access ${verifiedWorkspace?'connected-shell workspace-layout':'access-shell'} ${showIntake ? 'intake-connected-page' : ''} ${showLookup ? 'patient-lookup-page' : ''} ${showPatientDirectory ? 'patient-directory-page' : ''} ${(showFinanceHome || showScheduling || showAgendaSettings || showBookingRequests || showFinanceCatalog || showInstallmentReminders) ? 'scheduling-connected-page' : ''} ${showTeam ? 'team-connected-page' : ''} ${showFakeInbox ? 'fake-inbox-connected-page' : ''}`}>
    {verifiedWorkspace&&<div className="workspace-header"><WorkspaceTopbar modules={workspaceModules} current={currentModule} locked={navigationLocked} onNavigate={openModule} clinicName={activeClinicName} roles={verifiedWorkspace.roles.map(role=>({manager:'Gestionnaire',dentist:'Dentiste',reception:'Réception',assistant:'Assistant'}[role])).join(' · ')} onChangeClinic={()=>void changeWorkspace()} onDisconnect={()=>void disconnect()} canChangeClinic={!pending&&!closing&&online} backLabel={labels[workspaceHistory.previous?.module??'']} forwardLabel={labels[workspaceHistory.next?.module??'']} onBack={workspaceHistory.back} onForward={workspaceHistory.forward} compact={compactLayout} onCompact={setCompactLayout} motion={workspaceMotion} onMotion={setWorkspaceMotion}/>{session.current&&verifiedWorkspace.roles.some(role=>role==='manager'||role==='reception')&&<BookingRequestNotice api={session.current.api} token={session.current.token} clinicId={verifiedWorkspace.clinic_id} locked={navigationLocked} onOpen={()=>openModule('booking-requests')} onSessionExpired={()=>void clearSession()}/>}{!online&&<p className="workspace-lock" role="status">Hors connexion · reconnectez-vous pour poursuivre.</p>}{notice&&<p className="workspace-lock" role="status">{notice}</p>}{error&&<p className="access-feedback access-failure" role="alert">{error}</p>}</div>}
    {!verifiedWorkspace ? <div className="access-layout">
      <aside className="access-story" aria-label="Dental Spa OS">
        <Link href="/" className="access-brand"><span className="access-brand-mark"><ShieldCheck size={22}/></span><span>Dental Spa <strong>OS</strong></span></Link>
        <div className="access-story-copy"><span className="access-story-label">VOTRE ESPACE CABINET</span><h2>Le quotidien du cabinet,<br/>en toute clarté.</h2><p>Retrouvez votre équipe, vos patients et votre agenda dans un même espace.</p></div>
        <div className="access-story-bottom"><span><LockKeyhole size={15}/>Accès selon votre rôle</span><span>Développement · données fictives</span></div>
      </aside>
      <section className="connection-card access-form-panel" aria-labelledby="connection-title">
      <Link href="/" className="access-back"><ArrowLeft size={16}/>Retour à l’aperçu</Link>
      <ol className="access-steps" aria-label="Étapes de connexion"><li aria-current={clinicChoices.length === 0 ? 'step' : undefined}><span>1</span>Connexion</li><li aria-current={clinicChoices.length > 0 ? 'step' : undefined}><span>2</span>Votre cabinet</li></ol>
      <header className="access-heading"><div className="access-emblem"><ShieldCheck size={24}/></div><h1 id="connection-title">Votre espace sécurisé.</h1><p>{clinicChoices.length > 0 ? 'Votre compte est connecté. Choisissez votre espace de travail.' : 'Connectez-vous avec votre compte professionnel.'}</p></header>
      {!client && <div className="access-feedback" role="status"><strong>Connexion en préparation</strong><p>{config.issue} L’aperçu reste disponible sans compte.</p></div>}
      {!online && <div className="access-feedback" role="status"><strong>Vous êtes hors connexion</strong><p>Reconnectez-vous au réseau pour vérifier vos accès. Les fiches ne sont pas sauvegardées pour une consultation hors ligne.</p></div>}
      {notice && <p className="access-notice" role="status">{notice}</p>}
      {error && <div className="access-feedback access-failure" role="alert" tabIndex={-1} ref={errorRegion}><AlertCircle size={18}/><p>{error}</p></div>}
      {verifiedWorkspace === null && clinicChoices.length > 0 ? <section className="access-records clinic-choice-list" aria-labelledby="clinic-choice-title" aria-busy={pending}>
        <div><h2 id="clinic-choice-title" tabIndex={-1} ref={resultHeading}>Choisissez un cabinet</h2><p>{clinicChoices.length} accès {clinicChoices.length > 1 ? 'disponibles' : 'disponible'} pour votre compte</p></div>
        <ul>{clinicChoices.map(choice => <li key={choice.clinic_id}><Button type="button" disabled={pending || closing || !online} onClick={() => void selectWorkspace(choice)} aria-label={choice.clinic_name}><span>{choice.clinic_name}</span><small>{choice.roles.map(role => ({ dentist: 'Dentiste', reception: 'Réception', assistant: 'Assistant', manager: 'Gestionnaire' }[role])).join(' · ')}</small><ArrowRight size={17}/></Button></li>)}</ul>
        {pending && <p className="access-progress" role="status" aria-live="polite">{stages[stage ?? 0]}</p>}
        <Button type="button" onClick={disconnect} disabled={pending || closing}><LogOut size={17}/>Se déconnecter</Button>
      </section> : verifiedWorkspace === null ? <form onSubmit={connect} aria-label="Connexion au cabinet" aria-busy={pending}>
        <fieldset disabled={!ready || restoring || !client || pending || closing}>
          <label htmlFor="access-email">Adresse e-mail</label>
          <input id="access-email" name="email" type="email" required autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={event => setEmail(event.target.value)}/>
          <label htmlFor="access-password">Mot de passe</label>
          <div className="access-password"><input id="access-password" name="password" type={visiblePassword ? 'text' : 'password'} required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)}/><button type="button" aria-label={visiblePassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={visiblePassword} onClick={() => setVisiblePassword(value => !value)}>{visiblePassword ? <EyeOff size={19}/> : <Eye size={19}/>}</button></div>
        </fieldset>
        <Button type="submit" variant="primary" disabled={!ready || restoring || !client || pending || closing || !online}>{restoring ? 'Restauration de la session…' : closing ? 'Déconnexion en cours…' : pending ? <><LoaderCircle className="access-spinner" size={18}/>Vérification en cours</> : <>Se connecter<ArrowRight size={18}/></>}</Button>
        <p className="access-progress" role="status" aria-live="polite">{restoring ? 'Recherche d’une session active…' : closing ? 'Fermeture de la session…' : pending ? stages[stage] : 'Vos accès sont vérifiés à chaque connexion.'}</p>
      </form> : null}
      <footer><LockKeyhole size={15}/><small>Environnement de développement · comptes et données fictifs.</small></footer>
    </section></div> : <aside className="workspace-sidebar"><WorkspaceNavigation modules={workspaceModules} current={currentModule} locked={navigationLocked} onNavigate={openModule} expanded={expandedMenu} onExpanded={()=>setExpandedMenu(value=>!value)}/></aside>}
    <div className="connected-module-content">
    {verifiedWorkspace !== null && intakeTransport && showIntake && <div className="intake-connected-panel"><div className="intake-connected-controls"><p>Session vérifiée · demandes du cabinet actif uniquement</p><Button type="button" onClick={disconnect}><LogOut size={17}/>Se déconnecter</Button></div><IntakeWorkspace transport={intakeTransport} onSessionExpired={() => { setNotice('Votre session a expiré. Les demandes ont été retirées de cet écran.'); void clearSession(); }}/></div>}
    {verifiedWorkspace !== null && patientDirectoryTransport && showPatientDirectory && <div>{workspaceHistory.previous?.module==='finance-reminders'&&<Button type="button" disabled={navigationLocked} onClick={workspaceHistory.back}><ArrowLeft size={17}/>Retour aux échéances</Button>}{patientOpenedFromAgenda && <Button type="button" disabled={navigationLocked} onClick={()=>openModule('planning')}><ArrowLeft size={17}/>Retour à l’agenda</Button>}<div className="lookup-connected-controls"><Button type="button" onClick={disconnect}><LogOut size={17}/>Se déconnecter</Button></div><PatientDirectory onOpenAgenda={schedulingTransport&&verifiedWorkspace.roles.some(r=>r==='manager'||r==='reception'||r==='dentist')?()=>openModule('planning'):undefined} onOpenRequests={intakeTransport?()=>openModule('intake'):undefined} lookupTransport={lookupTransport} transport={patientDirectoryTransport} initialPatientId={selectedConnectedPatient} onPatientChange={patient=>workspaceHistory.navigate({module:'patients',patient})} renderProfile={record => session.current ? verifiedWorkspace.roles.includes('assistant')&&!verifiedWorkspace.roles.some(role=>['manager','reception','dentist'].includes(role)) ? <PatientDocumentProfile key={`${verifiedWorkspace.clinic_id}:${record.id}`} api={session.current.api} token={session.current.token} clinicId={verifiedWorkspace.clinic_id} patientId={record.id} patientLabel={record.display_name} patientReference={record.reference} onSessionExpired={()=>void clearSession()}/> : <PatientHub key={`${verifiedWorkspace.clinic_id}:${record.id}`} api={session.current.api} token={session.current.token} clinicId={verifiedWorkspace.clinic_id} clinicName={activeClinicName} initialAgreement={selectedAgreement} patientId={record.id} canCreateQuote={verifiedWorkspace.roles.includes('manager')} onSessionExpired={() => void clearSession()}/> : null} onSessionExpired={() => { setNotice('Votre session a expiré. Le répertoire et les fiches consultées ont été effacés.'); void clearSession(); }}/></div>}
    {verifiedWorkspace !== null && schedulingTransport && <div hidden={!showScheduling}>{showScheduling && session.current && <RecordedAppointments view={agendaView} onViewChange={setAgendaView} onOpenRequests={verifiedWorkspace.roles.some(role=>role==='manager'||role==='reception')?()=>openModule('booking-requests'):undefined} onOpenSettings={verifiedWorkspace.roles.includes('manager')?()=>openModule('agenda-settings'):undefined} canChange={verifiedWorkspace.roles.some(role=>role==='manager'||role==='reception')} key={verifiedWorkspace.clinic_id} api={session.current.api} token={session.current.token} clinicId={verifiedWorkspace.clinic_id} onSessionExpired={() => void clearSession()} onOpenPatient={id => { if(navigationLocked)return; workspaceHistory.navigate({module:'patients',patient:id});setPatientOpenedFromAgenda(true); }}/>}<details className="connected-resource-options"><summary>Options temporaires sur les ressources</summary><SchedulingWorkspace transport={schedulingTransport} onSessionExpired={() => { setNotice('Votre session a expiré. Les données de planification ont été effacées.'); void clearSession(); }}/></details></div>}
    {verifiedWorkspace !== null && teamTransport && showTeam && <div><div className="team-roster-connected-controls"><Button onClick={disconnect}><LogOut size={17}/>Se déconnecter</Button></div>{verifiedWorkspace.roles.includes('manager')&&session.current?<TeamManagement key={verifiedWorkspace.clinic_id} api={session.current.api} token={session.current.token} clinicId={verifiedWorkspace.clinic_id} currentUserId={session.current.userId} onSessionExpired={()=>void clearSession()} activity={<TeamActivityPanel transport={teamTransport} onSessionExpired={()=>void clearSession()} rosterAuthorityDenied={false}/>}/>: <TeamRosterView key={verifiedWorkspace.clinic_id} transport={teamTransport} onSessionExpired={() => { setNotice('Votre session a expiré. L’annuaire, l’activité et la recherche ont été effacés.'); void clearSession(); }}/>}</div>}
    {verifiedWorkspace!==null&&showInstallmentReminders&&verifiedWorkspace.roles.includes('manager')&&session.current&&<InstallmentReminders key={verifiedWorkspace.clinic_id} api={session.current.api} token={session.current.token} clinicId={verifiedWorkspace.clinic_id} initialViewState={reminderView} onViewStateChange={setReminderView} onSessionExpired={()=>void clearSession()} onOpenAgreement={({patientId,planId,version})=>{if(!navigationLocked)workspaceHistory.navigate({module:'patients',patient:patientId,agreement:{planId,version}});}}/>}
    {verifiedWorkspace !== null && showFinanceHome && verifiedWorkspace.roles.includes('manager') && <FinanceHome onOpen={openModule}/>}
    {verifiedWorkspace !== null && showFinanceCatalog && verifiedWorkspace.roles.includes('manager') && session.current && <FinanceCatalog api={session.current.api} token={session.current.token} clinicId={verifiedWorkspace.clinic_id} onSessionExpired={()=>void clearSession()} onOpenPatients={()=>openModule('patients')}/>}
    {verifiedWorkspace !== null && showAgendaSettings && verifiedWorkspace.roles.includes('manager') && session.current && <AgendaSettingsEditor onOpenAgenda={()=>openModule('planning')} api={session.current.api} token={session.current.token} clinicId={verifiedWorkspace.clinic_id} onSessionExpired={() => { void clearSession(); }}/ >}
    {verifiedWorkspace !== null && showBookingRequests && session.current && (
      <div><ConfiguredBookingInbox api={session.current.api} token={session.current.token} clinicId={verifiedWorkspace.clinic_id} onSessionExpired={()=>void clearSession()} onOpenAgenda={()=>openModule('planning')}/><details className="connected-resource-options"><summary>Anciennes demandes de démonstration</summary><BookingRequestInbox
        key={verifiedWorkspace.clinic_id}
        api={session.current.api}
        token={session.current.token}
        clinicId={verifiedWorkspace.clinic_id}
        onSessionExpired={() => {
          setNotice('Votre session a expiré. Les demandes fictives ont été retirées de cet écran.');
          void clearSession();
        }}
      /></details></div>
    )}
    {verifiedWorkspace !== null && showFakeInbox && session.current && (
      <FakeInbox
        key={verifiedWorkspace.clinic_id}
        api={session.current.api}
        token={session.current.token}
        clinicId={verifiedWorkspace.clinic_id}
        onSessionExpired={() => {
          setNotice('Votre session a expiré. Les événements synthétiques ont été retirés de cet écran.');
          void clearSession();
        }}
      />
    )}
    </div>
  </main></ClinicDesignProvider>;
}

'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ShieldCheck, ArrowLeft, ArrowRight, LogOut, Eye, EyeOff, LoaderCircle, LockKeyhole, Users, AlertCircle } from 'lucide-react';
import { Button } from '@dental/ui-clinic';
import { IdSchema, PatientSummarySchema, WorkspaceSchema, type PatientSummary } from '@dental/contracts';
import { IntakeWorkspace } from '../../components/intake/intake-workspace';
import { createHttpIntakeTransport, type IntakeTransport } from '../../components/intake/transport';
import './connection.css';

const stages = ['Vérification de votre identité…', 'Vérification des accès au cabinet…', 'Chargement des fiches autorisées…'];

export default function Connection() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clinic, setClinic] = useState('');
  const [visiblePassword, setVisiblePassword] = useState(false);
  const [stage, setStage] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [records, setRecords] = useState<PatientSummary[] | null>(null);
  const [online, setOnline] = useState(true);
  const [intakeTransport, setIntakeTransport] = useState<IntakeTransport | null>(null);
  const [showIntake, setShowIntake] = useState(false);
  const connectedIntake = useRef<IntakeTransport | null>(null);
  const active = useRef(true);
  const busy = useRef(false);
  const request = useRef<AbortController | null>(null);
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    try {
      document.documentElement.dataset.theme = localStorage.getItem('dental-theme') === 'dark' ? 'dark' : 'light';
    } catch { /* The connection remains usable when preference storage is unavailable. */ }
    const updateNetwork = () => setOnline(navigator.onLine);
    updateNetwork();
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    return () => {
      active.current = false;
      request.current?.abort();
      connectedIntake.current?.dispose?.();
      if (expiry.current) clearTimeout(expiry.current);
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
      void client?.auth.signOut({ scope: 'local' }).catch(() => undefined);
    };
  }, [client]);
  useEffect(() => { if (error) errorRegion.current?.focus(); }, [error]);
  useEffect(() => { if (records !== null) resultHeading.current?.focus(); }, [records]);

  async function clearSession() {
    busy.current = true;
    setClosing(true);
    if (expiry.current) clearTimeout(expiry.current);
    expiry.current = null;
    setRecords(null);
    connectedIntake.current?.dispose?.();
    connectedIntake.current = null;
    setIntakeTransport(null);
    setShowIntake(false);
    setPassword('');
    setVisiblePassword(false);
    try {
      await client?.auth.signOut({ scope: 'local' });
    } catch {
      // Displayed records are already cleared; never expose provider error details.
    } finally {
      busy.current = false;
      if (active.current) setClosing(false);
    }
  }

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || busy.current || !online) return;
    setError('');
    setNotice('');
    const clinicId = clinic.trim().toLowerCase();
    if (!IdSchema.safeParse(clinicId).success) {
      setError('Vérifiez l’identifiant du cabinet : un UUID complet est nécessaire.');
      return;
    }
    busy.current = true;
    setStage(0);
    setRecords(null);
    const controller = new AbortController();
    request.current = controller;
    let failureMessage = 'La connexion est indisponible. Vérifiez votre réseau et réessayez.';
    const submittedPassword = password;
    setPassword('');
    setVisiblePassword(false);
    try {
      const { data, error: authError } = await client.auth.signInWithPassword({ email: email.trim(), password: submittedPassword });
      if (!active.current) { await client.auth.signOut({ scope: 'local' }); return; }
      if (authError || !data.session) {
        failureMessage = authError?.status === 429
          ? 'Trop de tentatives. Patientez quelques instants avant de réessayer.'
          : 'Connexion refusée. Vérifiez votre adresse e-mail et votre mot de passe.';
        throw new Error('authentication');
      }
      const expiresAt = data.session.expires_at;
      if (!expiresAt || expiresAt * 1000 <= Date.now()) {
        failureMessage = 'La session a expiré. Connectez-vous à nouveau.';
        throw new Error('expired');
      }
      const headers = { Authorization: `Bearer ${data.session.access_token}`, 'X-Clinic-Id': clinicId };
      const api = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4300').replace(/\/$/, '');
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
      setStage(1);
      const scope = await fetch(`${api}/api/v1/me/workspace`, { headers, cache: 'no-store', signal });
      if (!scope.ok) {
        failureMessage = scope.status === 403 ? 'Ce compte n’a pas accès à ce cabinet. Contactez son administrateur.'
          : scope.status === 401 ? 'La session n’est plus valide. Connectez-vous à nouveau.'
          : 'Le service de vérification du cabinet est indisponible. Réessayez plus tard.';
        throw new Error('workspace');
      }
      failureMessage = 'La réponse du cabinet n’a pas pu être vérifiée. Aucune fiche n’a été affichée.';
      const workspace = WorkspaceSchema.parse(await scope.json());
      if (workspace.clinic_id !== clinicId || workspace.user_id !== data.session.user.id) throw new Error('scope');
      if (!active.current) return;
      setStage(2);
      const response = await fetch(`${api}/api/v1/patients`, { headers, cache: 'no-store', signal });
      if (!response.ok) {
        failureMessage = response.status === 401 ? 'La session a expiré. Connectez-vous à nouveau.'
          : response.status === 403 ? 'Ce compte ne peut pas consulter les fiches de ce cabinet.'
          : 'Les fiches sont momentanément indisponibles. Réessayez plus tard.';
        throw new Error('patients');
      }
      const authorized = PatientSummarySchema.array().parse(await response.json());
      if (authorized.some(record => record.clinic_id !== workspace.clinic_id)) throw new Error('scope');
      if (expiresAt * 1000 <= Date.now()) {
        failureMessage = 'La session a expiré. Connectez-vous à nouveau.';
        throw new Error('expired');
      }
      if (!active.current) return;
      setRecords(authorized);
      const transport = createHttpIntakeTransport({ api, token: data.session.access_token, clinicId: workspace.clinic_id, userId: workspace.user_id });
      connectedIntake.current = transport;
      setIntakeTransport(transport);
      expiry.current = setTimeout(() => {
        if (!active.current) return;
        setNotice('Votre session a expiré. Les fiches ont été retirées de cet écran.');
        void clearSession();
      }, expiresAt * 1000 - Date.now());
    } catch (failure) {
      if (active.current) {
        const timedOut = failure instanceof DOMException && failure.name === 'TimeoutError';
        setError(timedOut ? 'Le cabinet met trop de temps à répondre. Réessayez dans un instant.' : failureMessage);
        setRecords(null);
      }
      await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
    } finally {
      request.current = null;
      busy.current = false;
      if (active.current) setStage(null);
    }
  }

  async function disconnect() {
    setError('');
    setNotice('Vous êtes déconnecté. Les fiches ont été retirées de cet écran.');
    await clearSession();
  }

  return <main className={`connection-page connected-access ${showIntake ? 'intake-connected-page' : ''}`}>
    <section className="connection-card work-panel" aria-labelledby="connection-title">
      <Link href="/" className="access-back"><ArrowLeft size={16}/>Retour à l’aperçu</Link>
      <div className="access-emblem"><ShieldCheck size={28}/></div>
      <header><p className="eyebrow">ACCÈS AU CABINET</p><h1 id="connection-title">Votre espace sécurisé.</h1><p>Retrouvez les fiches auxquelles votre cabinet vous donne accès.</p></header>
      <div className="access-demo"><LockKeyhole size={17}/><span>Environnement de développement<br/><small>Comptes et données synthétiques uniquement.</small></span></div>
      {!client && <div className="access-feedback" role="status"><strong>Connexion en préparation</strong><p>{config.issue} L’aperçu reste disponible sans compte.</p></div>}
      {!online && <div className="access-feedback" role="status"><strong>Vous êtes hors connexion</strong><p>Reconnectez-vous au réseau pour vérifier vos accès. Les fiches ne sont pas sauvegardées pour une consultation hors ligne.</p></div>}
      {notice && <p className="access-notice" role="status">{notice}</p>}
      {error && <div className="access-feedback access-failure" role="alert" tabIndex={-1} ref={errorRegion}><AlertCircle size={18}/><p>{error}</p></div>}
      {records === null ? <form onSubmit={connect} aria-label="Connexion au cabinet" aria-busy={pending}>
        <fieldset disabled={!client || pending || closing}>
          <label htmlFor="access-email">Adresse e-mail</label>
          <input id="access-email" name="email" type="email" required autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={event => setEmail(event.target.value)}/>
          <label htmlFor="access-password">Mot de passe</label>
          <div className="access-password"><input id="access-password" name="password" type={visiblePassword ? 'text' : 'password'} required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)}/><button type="button" aria-label={visiblePassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={visiblePassword} onClick={() => setVisiblePassword(value => !value)}>{visiblePassword ? <EyeOff size={19}/> : <Eye size={19}/>}</button></div>
          <label htmlFor="access-clinic">Identifiant du cabinet de développement</label>
          <input id="access-clinic" name="clinic" required aria-describedby="access-clinic-help" placeholder="UUID du cabinet autorisé" autoComplete="off" autoCapitalize="none" spellCheck={false} value={clinic} onChange={event => setClinic(event.target.value)}/>
          <small id="access-clinic-help">Fourni par l’administrateur. Cet identifiant ne donne aucun accès à lui seul.</small>
        </fieldset>
        <Button type="submit" variant="primary" disabled={!client || pending || closing || !online}>{closing ? 'Déconnexion en cours…' : pending ? <><LoaderCircle className="access-spinner" size={18}/>Vérification en cours</> : <>Se connecter<ArrowRight size={18}/></>}</Button>
        <p className="access-progress" role="status" aria-live="polite">{closing ? 'Fermeture de la session…' : pending ? stages[stage] : 'Vos accès sont vérifiés par le serveur.'}</p>
      </form> : <section className="access-records" aria-labelledby="access-result-title">
        <div className="access-success"><ShieldCheck size={20}/><div><h2 id="access-result-title" tabIndex={-1} ref={resultHeading}>Accès au cabinet vérifié</h2><p>{records.length} fiche{records.length > 1 ? 's' : ''} autorisée{records.length > 1 ? 's' : ''}</p></div></div>
        {records.length ? <ul aria-label="Fiches autorisées">{records.map(record => <li key={record.id}><span>{record.display_name}</span><small>{record.reference}</small></li>)}</ul> : <div className="access-empty"><Users size={26}/><h3>Aucune fiche pour le moment</h3><p>Votre accès est valide. Aucune fiche patient n’est disponible dans ce cabinet.</p></div>}
        <Button type="button" onClick={disconnect}><LogOut size={17}/>Se déconnecter</Button>
        {intakeTransport && <Button type="button" variant="primary" onClick={() => setShowIntake(value => !value)}>{showIntake ? 'Masquer les demandes' : 'Ouvrir les demandes du cabinet'}<ArrowRight size={17}/></Button>}
      </section>}
      <footer><LockKeyhole size={15}/><small>Session en mémoire uniquement. Aucun dossier n’est enregistré dans le navigateur par cette application.</small></footer>
    </section>
    {records !== null && intakeTransport && showIntake && <div className="intake-connected-panel"><div className="intake-connected-controls"><p>Session vérifiée · demandes du cabinet actif uniquement</p><Button type="button" onClick={disconnect}><LogOut size={17}/>Se déconnecter</Button></div><IntakeWorkspace transport={intakeTransport} onSessionExpired={() => { setNotice('Votre session a expiré. Les demandes ont été retirées de cet écran.'); void clearSession(); }}/></div>}
  </main>;
}

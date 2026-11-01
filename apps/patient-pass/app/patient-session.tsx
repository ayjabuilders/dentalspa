'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { LockKeyhole, LogOut, ShieldCheck } from 'lucide-react';
import { InquiryCommunicationLanguageSchema, InquiryCommunicationTimeZoneSchema, InquiryContactPreferenceSchema, InquiryCommunicationTimeZoneValues, PatientCommunicationPreferencesResultSchema, PatientCommunicationPreferencesStateSchema, PatientSelfSchema, type PatientSelf, type SetPatientCommunicationPreferences } from '@dental/contracts';
import { loadOwnPatientProfile, PatientProfileError } from './patient-profile';
import './preferences.css';

type SessionState = 'configuration_required' | 'signed_out' | 'loading' | 'connected' | 'error';
type SessionView = {
  state: SessionState;
  profile: PatientSelf | null;
  accessToken: string;
  error: string;
  connect: (email: string, password: string) => Promise<void>;
  disconnect: () => Promise<void>;
};

function isPublicKey(value: string): boolean {
  if (value.startsWith('sb_publishable_')) return true;
  if (!value.startsWith('eyJ')) return false;
  try {
    const payload = value.split('.')[1];
    if (!payload) return false;
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded).role === 'anon';
  } catch {
    return false;
  }
}

function createPatientAuthClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !isPublicKey(key)) return null;
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost' && parsedUrl.hostname !== '127.0.0.1') return null;
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  } catch {
    return null;
  }
}

function isPatientAuthConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && isPublicKey(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''));
}

function apiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const localApi = new URL(window.location.href);
  localApi.port = '4300';
  localApi.pathname = '';
  localApi.search = '';
  localApi.hash = '';
  return localApi.origin;
}

function errorCopy(error: unknown): string {
  if (error instanceof PatientProfileError) {
    if (error.kind === 'unlinked') return 'Le cabinet n’a pas encore relié ce compte à un dossier patient vérifié.';
    if (error.kind === 'ambiguous' || error.kind === 'denied') return 'L’accès à ce compte doit être vérifié par le cabinet.';
    if (error.kind === 'expired') return 'La session a expiré. Connectez-vous à nouveau.';
    if (error.kind === 'offline') return 'Le réseau est indisponible. Vérifiez votre connexion et réessayez.';
  }
  return 'La connexion au cabinet est indisponible. Réessayez plus tard.';
}

function readOwnVerifiedLinks(client: SupabaseClient, userId: string) {
  return async (signal: AbortSignal) => {
    const { data, error } = await client.from('patient_account_links')
      .select('user_id,clinic_id,patient_id,verified_at')
      .eq('user_id', userId)
      .not('verified_at', 'is', null)
      .limit(2)
      .abortSignal(signal);
    if (error) throw new PatientProfileError('unavailable');
    return data;
  };
}

export function usePatientSession(): SessionView {
  const configured = isPatientAuthConfigured();
  const [state, setState] = useState<SessionState>(configured ? 'signed_out' : 'configuration_required');
  const [profile, setProfile] = useState<PatientSelf | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const [error, setError] = useState('');
  const clientRef = useRef<SupabaseClient | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const expiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(true);
  const busyRef = useRef(false);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      requestRef.current?.abort();
      if (expiryRef.current) clearTimeout(expiryRef.current);
      void clientRef.current?.auth.signOut({ scope: 'local' }).catch(() => undefined);
      clientRef.current = null;
    };
  }, []);

  async function disconnect() {
    requestRef.current?.abort();
    requestRef.current = null;
    if (expiryRef.current) clearTimeout(expiryRef.current);
    expiryRef.current = null;
    const client = clientRef.current;
    clientRef.current = null;
    setProfile(null);
    setAccessToken('');
    setError('');
    setState(configured ? 'signed_out' : 'configuration_required');
    await client?.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }

  async function connect(email: string, password: string) {
    if (busyRef.current || !configured) return;
    busyRef.current = true;
    setState('loading');
    setProfile(null);
    setAccessToken('');
    setError('');
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    let client: SupabaseClient | null = null;
    try {
      client = createPatientAuthClient();
      if (!client) throw new Error('configuration');
      const { data, error: authError } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (!activeRef.current || controller.signal.aborted) return;
      if (authError || !data.session || !data.session.user?.id) throw new Error('authentication');
      const expiresAt = data.session.expires_at;
      if (!expiresAt || expiresAt * 1000 <= Date.now()) throw new PatientProfileError('expired');

      clientRef.current = client;
      const patient = await loadOwnPatientProfile({
        api: apiBaseUrl(),
        token: data.session.access_token,
        userId: data.session.user.id,
        readOwnVerifiedLinks: readOwnVerifiedLinks(client, data.session.user.id),
        signal: controller.signal,
      });
      if (!activeRef.current || controller.signal.aborted || expiresAt * 1000 <= Date.now()) throw new PatientProfileError('expired');
      PatientSelfSchema.parse(patient);
      setProfile(patient);
      setAccessToken(data.session.access_token);
      setState('connected');
      window.history.replaceState(null, '', window.location.pathname);
      expiryRef.current = setTimeout(() => { void disconnect(); }, Math.max(0, expiresAt * 1000 - Date.now()));
    } catch (cause) {
      await client?.auth.signOut({ scope: 'local' }).catch(() => undefined);
      if (clientRef.current === client) clientRef.current = null;
      if (activeRef.current && !controller.signal.aborted) {
        setProfile(null);
        setAccessToken('');
        setState('error');
        setError(cause instanceof PatientProfileError ? errorCopy(cause) : 'Connexion refusée ou indisponible. Vérifiez votre adresse et votre mot de passe.');
      }
    } finally {
      if (clientRef.current !== client) await client?.auth.signOut({ scope: 'local' }).catch(() => undefined);
      if (requestRef.current === controller) requestRef.current = null;
      busyRef.current = false;
    }
  }

  return { state, profile, accessToken, error, connect, disconnect };
}

type PreferenceValues = Pick<SetPatientCommunicationPreferences,'contact_preference'|'language'|'time_zone'>;
const emptyPreferences:PreferenceValues={contact_preference:null,language:null,time_zone:null};
const preferenceLabels={
  contact_preference:{phone:'Téléphone',email:'E-mail','no_preference':'Aucune préférence'},
  language:{fr:'Français',ar:'العربية',en:'English',other:'Autre','no_preference':'Aucune préférence'},
  time_zone:{'Africa/Casablanca':'Casablanca (UTC+1)','Africa/Dakar':'Dakar (UTC)','America/New_York':'New York','America/Sao_Paulo':'São Paulo','America/Toronto':'Toronto','Asia/Dubai':'Dubaï','Asia/Riyadh':'Riyad','Asia/Tokyo':'Tokyo','Australia/Sydney':'Sydney','Etc/UTC':'UTC','Europe/London':'Londres','Europe/Paris':'Paris'},
} as const;

export function PatientCommunicationPreferencesForm({profile,token}:{profile?:PatientSelf;token?:string}) {
  const connected=Boolean(profile&&token);
  const enabled=process.env.NEXT_PUBLIC_PATIENT_COMMUNICATION_PREFERENCES_ENABLED==='true';
  const [values,setValues]=useState<PreferenceValues>(emptyPreferences);
  const [revision,setRevision]=useState(0);
  const [loading,setLoading]=useState(connected&&enabled);
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const [error,setError]=useState('');
  const [pending,setPending]=useState<{key:string;input:SetPatientCommunicationPreferences}|null>(null);
  const [demoSaved,setDemoSaved]=useState(false);

  useEffect(()=>{
    if(!connected||!enabled||!profile||!token)return;
    const controller=new AbortController();
    setLoading(true);setError('');
    fetch(`${apiBaseUrl()}/api/v1/me/preferences`,{method:'GET',cache:'no-store',credentials:'omit',headers:{Authorization:`Bearer ${token}`,'X-Clinic-Id':profile.clinic_id},signal:controller.signal})
      .then(async response=>{if(!response.ok)throw new Error();const parsed=PatientCommunicationPreferencesStateSchema.safeParse(await response.json());if(!parsed.success||parsed.data.patient_id!==profile.id||parsed.data.clinic_id!==profile.clinic_id)throw new Error();return parsed.data;})
      .then(state=>{setValues({contact_preference:state.contact_preference,language:state.language,time_zone:state.time_zone});setRevision(state.revision);setSaved(true);})
      .catch(()=>{if(!controller.signal.aborted)setError('Vos préférences ne sont pas disponibles pour le moment.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[connected,enabled,profile?.id,profile?.clinic_id,token]);

  function update<K extends keyof PreferenceValues>(key:K,value:PreferenceValues[K]){setValues(current=>({...current,[key]:value}));setSaved(false);setDemoSaved(false);}
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!connected||!enabled||!profile||!token){setDemoSaved(true);return;}
    if(saving||loading)return;
    let action=pending;
    if(!action){
      if(!crypto.randomUUID){setError('Enregistrement indisponible sur cet appareil.');return;}
      action={key:crypto.randomUUID(),input:{expected_revision:revision,...values}};setPending(action);
    }
    setSaving(true);setError('');
    try{
      const response=await fetch(`${apiBaseUrl()}/api/v1/me/preferences`,{method:'POST',cache:'no-store',credentials:'omit',headers:{Authorization:`Bearer ${token}`,'X-Clinic-Id':profile.clinic_id,'Content-Type':'application/json','Idempotency-Key':action.key},body:JSON.stringify(action.input)});
      if(response.status===409){setPending(null);setSaved(false);setError('Vos préférences ont changé. Actualisez la page avant de réessayer.');return;}
      if(!response.ok){
        const body=await response.json().catch(()=>null) as {code?:unknown}|null;
        if(response.status===503&&body?.code==='patient_preferences_disabled'){setPending(null);setError('Cette fonction n’est pas activée dans cet environnement.');return;}
        throw new Error();
      }
      const parsed=PatientCommunicationPreferencesResultSchema.safeParse(await response.json());
      if(!parsed.success||parsed.data.receipt.patient_id!==profile.id||parsed.data.receipt.clinic_id!==profile.clinic_id)throw new Error();
      setRevision(parsed.data.receipt.revision);setValues({contact_preference:parsed.data.receipt.contact_preference,language:parsed.data.receipt.language,time_zone:parsed.data.receipt.time_zone});setPending(null);setSaved(true);
    }catch{setError('Enregistrement non confirmé. Réessayez pour vérifier le même envoi sans doublon.');}
    finally{setSaving(false);}
  }

  const disabled=loading||saving||Boolean(pending);
  const submitDisabled=loading||saving;
  if(connected&&!enabled)return <section className="pass-card"><h2>Préférences de communication</h2><p>Cette fonction n’est pas activée dans cet environnement.</p></section>;
  return <section className="pass-card patient-preferences-card">
    <span className="pass-tag">{connected?'PRÉFÉRENCES DE VOTRE COMPTE':'APERÇU LOCAL · NON TRANSMIS'}</span>
    <h2>Comment souhaitez-vous échanger&nbsp;?</h2>
    <p>Vous choisissez vos préférences. Elles ne valent pas consentement, ne confirment pas vos coordonnées et n’autorisent pas le cabinet à vous contacter.</p>
    <form className="patient-preferences-form" onSubmit={save}>
      <label>Canal préféré<select value={values.contact_preference??''} disabled={disabled} onChange={event=>update('contact_preference',event.target.value?InquiryContactPreferenceSchema.parse(event.target.value):null)}><option value="">Choisir plus tard</option>{InquiryContactPreferenceSchema.options.map(value=><option key={value} value={value}>{preferenceLabels.contact_preference[value]}</option>)}</select></label>
      <label>Langue préférée<select value={values.language??''} disabled={disabled} onChange={event=>update('language',event.target.value?InquiryCommunicationLanguageSchema.parse(event.target.value):null)}><option value="">Choisir plus tard</option>{InquiryCommunicationLanguageSchema.options.map(value=><option key={value} value={value}>{preferenceLabels.language[value]}</option>)}</select></label>
      <label>Fuseau horaire<select value={values.time_zone??''} disabled={disabled} onChange={event=>update('time_zone',event.target.value?InquiryCommunicationTimeZoneSchema.parse(event.target.value):null)}><option value="">Choisir plus tard</option>{InquiryCommunicationTimeZoneValues.map(value=><option key={value} value={value}>{preferenceLabels.time_zone[value]}</option>)}</select></label>
      {error&&<p role="alert" className="patient-session-error">{error}</p>}
      <button className="pass-primary" disabled={submitDisabled} type="submit">{loading?'Chargement…':saving?'Enregistrement…':pending?'Réessayer l’enregistrement':connected?'Enregistrer mes préférences':'Enregistrer cet aperçu'}</button>
      {connected?(saved&&!error?<small role="status">Préférences enregistrées dans votre espace. Aucun message n’a été envoyé.</small>:null):<small role="status">{demoSaved?'Aperçu gardé en mémoire jusqu’à la sortie de ce compte. Rien n’a été envoyé.':'Les choix restent uniquement sur cet écran et s’effacent dès que vous le quittez.'}</small>}
    </form>
  </section>;
}

export function PatientSessionPanel({ session }: { session: SessionView }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visiblePassword, setVisiblePassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedPassword = password;
    setPassword('');
    setVisiblePassword(false);
    await session.connect(email, submittedPassword);
  }

  if (session.profile) return <>
    <div className="pass-greeting"><span className="eyebrow">VOTRE ESPACE PERSONNEL</span><h1>Mon compte</h1><p>Accès vérifié par le cabinet.</p></div>
    <section className="pass-card patient-session-profile"><span className="pass-tag"><ShieldCheck size={15}/>Profil patient relié</span><h2>{session.profile.display_name}</h2><p>Le cabinet a relié ce compte à ce profil. Seules les informations autorisées pour ce compte pourront apparaître ici.</p><small>Référence patient · {session.profile.reference}</small></section>
    <PatientCommunicationPreferencesForm profile={session.profile} token={session.accessToken}/>
    <button className="pass-primary" onClick={() => void session.disconnect()}><LogOut size={18}/>Se déconnecter</button>
    <p className="pass-footnote">Rendez-vous, documents et messagerie ne sont pas encore reliés à cette version.</p>
  </>;

  return <>
    <div className="pass-greeting"><span className="eyebrow">VOTRE ESPACE PERSONNEL</span><h1>Mon compte</h1><p>Un accès préparé avec votre cabinet.</p></div>
    <div className="patient-account-grid"><div className="patient-account-access">
    {session.state === 'configuration_required' ? <section className="pass-card"><h2>Connexion en préparation</h2><p>L’environnement local doit être configuré par l’équipe avant de pouvoir ouvrir une session.</p></section> : <>
      <section className="pass-card"><h2>Connexion sécurisée</h2><p>Seul un compte déjà vérifié et relié à votre dossier par le cabinet peut ouvrir cet espace. Patient Pass ne crée pas de compte et ne relie pas les dossiers.</p>
        <form className="patient-session-form" onSubmit={submit}>
          <label>Adresse e-mail<input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} /></label>
          <div className="patient-password-control"><label htmlFor="patient-password">Mot de passe</label><span className="patient-password-field"><input id="patient-password" type={visiblePassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required maxLength={256} /><button type="button" aria-label={visiblePassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} onClick={() => setVisiblePassword(value => !value)}>{visiblePassword ? 'Masquer' : 'Afficher'}</button></span></div>
          {session.error && <p className="patient-session-error" role="alert">{session.error}</p>}
          <button className="pass-primary" type="submit" disabled={session.state === 'loading'}>{session.state === 'loading' ? 'Vérification en cours…' : <><LockKeyhole size={17}/>Se connecter</>}</button>
        </form>
      </section>
      <p className="pass-footnote">Les données de connexion restent en mémoire pendant la session. Aucun profil n’est conservé hors ligne.</p>
    </>}
    </div><PatientCommunicationPreferencesForm/></div>
  </>;
}

export function PatientConnectedHome({ profile, onShow }: { profile: PatientSelf; onShow: (tab: string) => void }) {
  return <>
    <div className="pass-greeting"><span className="eyebrow">BIENVENUE DANS VOTRE ESPACE</span><h1>{profile.display_name}</h1><p>Votre compte est relié à votre profil patient.</p></div>
    <section className="pass-card"><span className="pass-tag"><ShieldCheck size={14}/>Profil vérifié par le cabinet</span><h2>Votre espace personnel</h2><p>Les rendez-vous et documents approuvés apparaîtront ici lorsqu’ils seront disponibles dans cette version.</p></section>
    <div className="pass-shortcuts"><button onClick={() => onShow('appointments')}><span><LockKeyhole/></span><strong>Mes rendez-vous</strong><small>Fonction en préparation</small></button><button onClick={() => onShow('documents')}><span><LockKeyhole/></span><strong>Mes documents</strong><small>Partage protégé</small></button></div>
  </>;
}

export function PatientFeatureUnavailable({ title, message, onAccount }: { title: string; message: string; onAccount: () => void }) {
  return <>
    <div className="pass-greeting"><span className="eyebrow">VOTRE ESPACE PERSONNEL</span><h1>{title}</h1><p>Votre compte est connecté au cabinet.</p></div>
    <section className="pass-card"><h2>Cette fonction arrive dans un prochain jalon</h2><p>{message}</p><span className="pass-tag"><LockKeyhole size={13}/>Aucun contenu patient affiché dans cet aperçu</span></section>
    <button className="pass-primary" onClick={onAccount}>Voir mon compte</button>
  </>;
}

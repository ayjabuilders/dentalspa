'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, ArrowRight, Check, FileSearch, Fingerprint, Hash, LoaderCircle, Search, ShieldCheck, UserRound, WifiOff, X } from 'lucide-react';
import { Button } from '@dental/ui-clinic';
import { PatientLookupRequestSchema, type PatientLookupItem, type PatientLookupRequest, type PatientLookupResponse } from '@dental/contracts';
import { PatientLookupError, type PatientLookupFailure, type PatientLookupTransport } from './transport';
import './patient-lookup.css';

type Mode = PatientLookupRequest['mode'];
type Phase = 'initial' | 'loading' | 'complete' | PatientLookupFailure;
const failureCopy: Record<PatientLookupFailure, string> = {
  invalid: 'Vérifiez le mode et la longueur de votre recherche, puis réessayez.',
  expired: 'Votre session a expiré. Reconnectez-vous pour rechercher dans ce cabinet.',
  denied: 'Votre compte ne dispose pas de l’autorisation de rechercher dans ce cabinet.',
  offline: 'La recherche nécessite une connexion. Les résultats précédents ont été retirés ; aucune recherche ne sera envoyée automatiquement.',
  unavailable: 'La réponse du cabinet n’a pas pu être vérifiée. Aucun résultat n’est affiché. Vous pouvez réessayer.',
};

export function PatientLookup({ transport, onSessionExpired }: { transport: PatientLookupTransport; onSessionExpired: () => void }) {
  const [mode, setMode] = useState<Mode | ''>('');
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState<Phase>('initial');
  const [results, setResults] = useState<PatientLookupResponse | null>(null);
  const [preview, setPreview] = useState<PatientLookupItem | null>(null);
  const [online, setOnline] = useState(true);
  const [validation, setValidation] = useState('');
  const active = useRef(true);
  const sequence = useRef(0);
  const request = useRef<AbortController | null>(null);
  const expired = useRef(onSessionExpired);
  expired.current = onSessionExpired;

  useEffect(() => {
    active.current = true;
    const network = () => {
      setOnline(navigator.onLine);
      if (!navigator.onLine) {
        sequence.current++; request.current?.abort();
        setResults(null); setPreview(null); setPhase('offline');
      } else { setPhase(previous => previous === 'offline' ? 'initial' : previous); }
    };
    network(); window.addEventListener('online', network); window.addEventListener('offline', network);
    return () => { active.current = false; sequence.current++; request.current?.abort(); window.removeEventListener('online', network); window.removeEventListener('offline', network); };
  }, [transport]);

  function clearSearchState() {
    sequence.current++; request.current?.abort();
    setResults(null); setPreview(null); setValidation(''); setPhase(online ? 'initial' : 'offline');
  }
  async function search(event?: FormEvent) {
    event?.preventDefault();
    if (!online || phase === 'loading') return;
    const parsed = PatientLookupRequestSchema.safeParse({ mode, query });
    clearSearchState();
    if (!parsed.success) {
      setValidation(!mode ? 'Choisissez un mode de recherche.' : mode === 'reference_exact' ? 'Saisissez une référence de 1 à 256 caractères.' : 'Saisissez un début de nom de 2 à 120 caractères.');
      return;
    }
    const attempt = ++sequence.current;
    const controller = new AbortController(); request.current = controller; setPhase('loading');
    try {
      const response = await transport.lookup(parsed.data, controller.signal);
      if (!active.current || controller.signal.aborted || attempt !== sequence.current) return;
      setResults(response); setPhase('complete');
    } catch (error) {
      if (!active.current || controller.signal.aborted || attempt !== sequence.current) return;
      const kind = error instanceof PatientLookupError ? error.kind : 'unavailable';
      setResults(null); setPreview(null); setPhase(kind);
      if (kind === 'expired') { setQuery(''); setMode(''); expired.current(); }
    }
  }

  return <section className="patient-lookup" aria-labelledby="patient-lookup-title">
    <div className="lookup-heading"><span className="lookup-heading-icon"><FileSearch size={25}/></span><div><p className="eyebrow muted">RETROUVER, AVANT D’ALLER PLUS LOIN</p><h1 id="patient-lookup-title">Rechercher un patient</h1><p>Un aperçu du registre de votre cabinet, en lecture seule.</p></div></div>
    <div className="lookup-context"><ShieldCheck size={19}/><p><strong>Cabinet vérifié · recherche autorisée par le serveur</strong><span>Cette consultation ne sélectionne aucun patient et ne vérifie pas son identité. Aucun lien de compte ni rendez-vous n’est créé.</span></p></div>
    <form className="lookup-form work-panel" aria-label="Recherche de patient" onSubmit={search}>
      <fieldset><legend>Comment souhaitez-vous rechercher ?</legend><div className="lookup-modes"><label data-active={mode === 'reference_exact'}><input type="radio" name="lookup-mode" value="reference_exact" checked={mode === 'reference_exact'} onChange={() => { clearSearchState(); setMode('reference_exact'); }}/><Hash size={18}/><span>Référence exacte<small>La référence complète du cabinet</small></span>{mode === 'reference_exact' && <Check size={16}/>}</label><label data-active={mode === 'name_prefix'}><input type="radio" name="lookup-mode" value="name_prefix" checked={mode === 'name_prefix'} onChange={() => { clearSearchState(); setMode('name_prefix'); }}/><UserRound size={18}/><span>Début du nom<small>Une suggestion, sans vérification d’identité</small></span>{mode === 'name_prefix' && <Check size={16}/>}</label></div></fieldset>
      <label className="lookup-query-label" htmlFor="patient-lookup-query">{mode === 'reference_exact' ? 'Référence complète' : mode === 'name_prefix' ? 'Début du nom' : 'Votre recherche'}</label>
      <div className="lookup-submit-row"><div className="lookup-input"><Search size={19}/><input id="patient-lookup-query" name="lookup-query" value={query} onChange={event => { clearSearchState(); setQuery(event.target.value); }} disabled={!mode} placeholder={mode === 'reference_exact' ? 'Ex. DEMO-001' : mode === 'name_prefix' ? 'Ex. Lina' : 'Choisissez d’abord un mode'} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={!!validation} aria-describedby="lookup-query-help lookup-validation"/>{query && <button type="button" aria-label="Effacer la recherche de patient" onClick={() => { clearSearchState(); setQuery(''); }}><X size={17}/></button>}</div><Button type="submit" variant="primary" disabled={!mode || !online || phase === 'loading'} aria-busy={phase === 'loading'}>{phase === 'loading' ? <><LoaderCircle className="lookup-spin" size={18}/>Recherche…</> : <>Rechercher<ArrowRight size={18}/></>}</Button></div>
      <p id="lookup-query-help" className="lookup-help">{mode === 'name_prefix' ? 'De 2 à 120 caractères. Majuscules, accents, ponctuation et ordre du nom sont conservés.' : mode === 'reference_exact' ? 'De 1 à 256 caractères. La référence doit correspondre exactement, majuscules comprises.' : 'La recherche est envoyée uniquement lorsque vous appuyez sur Rechercher.'}</p>
      <p id="lookup-validation" className="lookup-validation" role={validation ? 'alert' : undefined}>{validation}</p>
    </form>
    <div className="lookup-grid">
      <section className="work-panel lookup-results" aria-label="Résultats de la recherche" aria-busy={phase === 'loading'}>
        <div className="lookup-section-title"><h2>Résultats de la recherche</h2>{results && <span>{results.items.length} affiché{results.items.length > 1 ? 's' : ''}</span>}</div>
        {phase === 'initial' && <div className="lookup-empty"><FileSearch/><h3>Une recherche précise, un aperçu clair.</h3><p>Choisissez un mode et saisissez votre recherche. Aucun registre n’est chargé automatiquement.</p></div>}
        {phase === 'loading' && <div className="lookup-empty" role="status"><LoaderCircle className="lookup-spin"/><h3>Recherche dans votre cabinet…</h3><p>Vous pouvez modifier votre saisie pour interrompre cette recherche.</p></div>}
        {phase !== 'initial' && phase !== 'loading' && phase !== 'complete' && <div className="lookup-empty lookup-problem" role="alert">{phase === 'offline' ? <WifiOff/> : <AlertCircle/>}<h3>{phase === 'denied' ? 'Accès non autorisé' : phase === 'offline' ? 'Vous êtes hors connexion' : phase === 'expired' ? 'Session terminée' : 'Recherche indisponible'}</h3><p>{failureCopy[phase]}</p>{(phase === 'unavailable' || phase === 'invalid') && <Button onClick={() => void search()} disabled={!online}>Réessayer la recherche<ArrowRight size={17}/></Button>}</div>}
        {phase === 'complete' && results && <>
          {results.truncated && <div className="lookup-truncated" role="status"><AlertCircle size={19}/><p><strong>Résultats incomplets : affinez votre recherche.</strong><span>Seuls les 20 premiers résultats sont affichés. Cette liste ne représente pas l’ensemble des correspondances.</span></p></div>}
          {results.items.length === 0 ? <div className="lookup-empty" role="status"><Search/><h3>Aucun résultat pour cette recherche.</h3><p>Ce résultat ne prouve pas l’absence d’un patient dans le registre. Vérifiez votre saisie ou essayez l’autre mode.</p></div> : <><p className="lookup-basis-note">{mode === 'name_prefix' ? 'Suggestions de recherche · identité non vérifiée' : 'Correspondance de référence exacte · identité non vérifiée'}</p><ul className="lookup-result-list">{results.items.map(item => <li key={item.id}><span className="lookup-initial" aria-hidden="true">{[...item.display_name][0]?.toLocaleUpperCase('fr') || '·'}</span><div><strong>{item.display_name || 'Nom non renseigné'}</strong><span>{item.reference || 'Référence vide'}</span></div><button type="button" aria-label={`Voir l’aperçu de ${item.display_name || 'ce patient'}`} onClick={() => setPreview(item)}>Voir l’aperçu<ArrowRight size={17}/></button></li>)}</ul></>}
        </>}
      </section>
      <aside className="work-panel lookup-preview" aria-label="Aperçu du résultat consulté">{preview ? <><div className="lookup-preview-top"><span className="lookup-heading-icon"><UserRound size={24}/></span><button className="icon-button" aria-label="Fermer l’aperçu du résultat" onClick={() => setPreview(null)}><X size={18}/></button></div><p className="eyebrow muted">LECTURE SEULE</p><h2>{preview.display_name || 'Nom non renseigné'}</h2><dl><div><dt>Référence du cabinet</dt><dd>{preview.reference || 'Référence vide'}</dd></div><div><dt>Base de la recherche</dt><dd>{preview.match_basis === 'reference_exact' ? 'Référence exacte' : 'Début du nom'}</dd></div></dl><div className="lookup-identity-note"><Fingerprint size={21}/><p>Identité non vérifiée.<small>Cet aperçu ne sélectionne aucun patient et ne modifie aucun dossier.</small></p></div></> : <div className="lookup-empty"><UserRound/><h3>Consulter un résultat</h3><p>Ouvrez un aperçu pour lire son nom et sa référence. Aucun résultat n’est retenu automatiquement.</p></div>}</aside>
    </div>
  </section>;
}

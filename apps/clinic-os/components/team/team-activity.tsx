'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Button } from '@dental/ui-clinic';
import { ArrowDownLeft, CalendarClock, FilePlus2, History, LoaderCircle, LockKeyhole, MessageSquareText, RefreshCw, ShieldCheck } from 'lucide-react';
import type { TeamActivity, TeamActivityKind } from '@dental/contracts';
import { TeamError, type TeamFailure, type TeamTransport } from './transport';
import './team-activity.css';

const actions: Record<TeamActivityKind, { title: string; icon: typeof History; note: string }> = {
  inquiry_created: { title: 'Demande créée', icon: FilePlus2, note: 'Enregistrement d’une demande' },
  inquiry_follow_up_recorded: { title: 'Suivi consigné', icon: MessageSquareText, note: 'Ne prouve pas un contact réussi' },
  slot_hold_created: { title: 'Option temporaire créée', icon: CalendarClock, note: 'Aucune réservation confirmée' },
  slot_hold_released: { title: 'Option temporaire libérée', icon: ArrowDownLeft, note: 'Action de libération enregistrée' },
};
const failures: Record<TeamFailure, { title: string; detail: string }> = {
  denied: { title: 'Activité non autorisée', detail: 'Un rôle Gestionnaire actif dans ce cabinet est nécessaire. Les événements précédents ont été effacés.' },
  expired: { title: 'Session d’activité expirée', detail: 'Les événements ont été effacés. Connectez-vous à nouveau.' },
  offline: { title: 'Activité hors connexion', detail: 'Les événements ont été retirés. Retrouvez le réseau puis réessayez.' },
  unavailable: { title: 'Activité indisponible', detail: 'La réponse n’a pas pu être vérifiée. Aucun événement antérieur n’est conservé à l’écran.' },
};
export function TeamActivityPanel({ transport, onSessionExpired }: { transport: TeamTransport; onSessionExpired?: () => void }) {
  const [data, setData] = useState<TeamActivity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<TeamFailure | null>(null);
  const [online, setOnline] = useState(true);
  const [zone, setZone] = useState('heure de cet appareil');
  const heading = useRef<HTMLHeadingElement>(null);
  const active = useRef(false);
  const disposed = useRef(false);
  const request = useRef<AbortController | null>(null);
  const expires = useRef(onSessionExpired); expires.current = onSessionExpired;
  async function load() {
    request.current?.abort(); setData(null); setError(null);
    if (disposed.current) { setLoading(false); setError('expired'); return; }
    if (!navigator.onLine) { setLoading(false); setError('offline'); return; }
    const controller = new AbortController(); request.current = controller; setLoading(true);
    try {
      const result = await transport.activity(controller.signal);
      if (active.current && !controller.signal.aborted && !disposed.current) setData(result);
    } catch (failure) {
      if (!active.current || controller.signal.aborted || disposed.current) return;
      const kind = failure instanceof TeamError ? failure.kind : 'unavailable';
      setData(null); setError(kind);
      if (kind === 'expired') expires.current?.();
    } finally { if (active.current && !controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => {
    active.current = true; disposed.current = false; setData(null); setError(null); setLoading(false);
    const offDispose = transport.onDispose(() => {
      disposed.current = true; request.current?.abort();
      if (active.current) { setData(null); setLoading(false); setError('expired'); }
    });
    const network = () => {
      setOnline(navigator.onLine);
      if (!navigator.onLine) { request.current?.abort(); setData(null); setLoading(false); setError('offline'); }
    };
    network(); setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    if (transport.mode === 'demo') void load();
    window.addEventListener('offline', network); window.addEventListener('online', network);
    return () => { active.current = false; request.current?.abort(); offDispose(); window.removeEventListener('offline', network); window.removeEventListener('online', network); };
  }, [transport]);
  function loadFromState() { heading.current?.focus(); void load(); }
  const date = (value: string) => new Intl.DateTimeFormat('fr-MA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  return <section className="team-activity work-panel" aria-labelledby="team-activity-title">
    <div className="team-activity-top"><span className="team-activity-emblem"><History size={24}/></span><span className="team-activity-access"><ShieldCheck size={14}/>Gestionnaire uniquement</span></div>
    <div className="team-activity-heading"><div><p className="eyebrow">LE FIL DES ACTIONS</p><h2 id="team-activity-title" ref={heading} tabIndex={-1}>Activité récente</h2></div>{(data || loading || error) && <Button aria-label="Actualiser l’activité" disabled={loading || !online || disposed.current} onClick={() => void load()}><RefreshCw size={17} className={loading ? 'team-activity-spin' : ''}/></Button>}</div>
    <p className="team-activity-intro">Un aperçu non exhaustif des demandes, suivis et options temporaires. Ni mesure de présence, ni bilan de performance.</p>
    <p className="team-activity-mode">{transport.mode === 'demo' ? 'Événements et noms synthétiques · mémoire temporaire' : 'Lecture seule · cabinet de la session vérifiée'}</p>
    {!data && !loading && !error && <div className="team-activity-state"><LockKeyhole size={25}/><p>Les événements ne sont chargés qu’à votre demande, après vérification de l’accès Gestionnaire.</p><Button onClick={loadFromState} disabled={!online || disposed.current}>Afficher l’activité récente</Button></div>}
    {loading && <div className="team-activity-state" role="status"><LoaderCircle size={25} className="team-activity-spin"/><h3>Lecture de l’activité…</h3><p>Vérification des actions accessibles dans ce cabinet.</p></div>}
    {error && <div className="team-activity-state" role="status"><LockKeyhole size={25}/><h3>{failures[error].title}</h3><p>{failures[error].detail}</p>{error !== 'expired' && <Button disabled={!online} onClick={loadFromState}>Réessayer l’activité</Button>}</div>}
    {data && <>
      <div className="team-activity-count" role="status"><strong>{data.truncated ? '50+' : data.items.length}</strong><span>{data.truncated ? 'actions · aperçu partiel' : `${data.items.length > 1 ? 'actions retournées' : 'action retournée'}`}</span></div>
      {data.truncated && <p className="team-activity-partial">Les 50 dernières actions prises en charge sont affichées. Au moins une autre existe ; le total exact n’est pas disponible.</p>}
      {!data.items.length ? <div className="team-activity-state" role="status"><History size={25}/><h3>Aucune action retournée</h3><p>Cela ne signifie pas qu’aucune activité n’a eu lieu : seules quatre catégories sont couvertes.</p></div> : <div className="team-activity-scroll" role="region" aria-label="Actions récentes, des plus récentes aux plus anciennes" tabIndex={0}><ol className="team-activity-timeline">{data.items.map((item, index) => {
        const action = actions[item.kind]; const Icon = action.icon;
        return <li key={`${data.observed_at}-${index}`} style={{ '--activity-delay': `${Math.min(index, 5) * 45}ms` } as CSSProperties}>
          <span className={`team-activity-action-icon team-activity-${item.kind}`} aria-hidden="true"><Icon size={19}/></span>
          <div><h3>{action.title}</h3><p className="team-activity-actor">{item.actor_display_name ?? 'Membre non affiché'}</p><time dateTime={item.occurred_at}>{date(item.occurred_at)}</time><p className="team-activity-action-note">{action.note}</p></div>
        </li>;
      })}</ol></div>}
      <p className="team-activity-observed">Observé le <time dateTime={data.observed_at}>{date(data.observed_at)}</time><span>Horaires : {zone}</span></p>
    </>}
    <footer className="team-activity-footnote">Les noms actuels sont des repères, pas une preuve d’identité historique. Ce fil ne constitue pas un audit de sécurité ou clinique complet.</footer>
  </section>;
}

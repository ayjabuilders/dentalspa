'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@dental/ui-clinic';
import { ArrowRight, CalendarClock, Clock3, CircleDashed, LoaderCircle, RefreshCw } from 'lucide-react';
import type { Inquiry, InquiryOwnerWorklist } from '@dental/contracts';
import { IntakeError, type IntakeTransport } from './transport';
import { PlannedActionWorklist } from './planned-action-worklist';
import './owner-worklist.css';
type Bucket = 'overdue' | 'upcoming' | 'undated';
const tabs = [{ id: 'overdue' as const, label: 'Échéances passées', icon: Clock3 }, { id: 'upcoming' as const, label: 'À venir', icon: CalendarClock }, { id: 'undated' as const, label: 'Sans date', icon: CircleDashed }];
const sources: Record<string, string> = { phone: 'Téléphone', website: 'Site web', whatsapp: 'WhatsApp', instagram: 'Instagram', email: 'E-mail', google_business: 'Google Business', walk_in: 'Sur place', other: 'Autre' };
const date = (value: string) => new Intl.DateTimeFormat('fr-MA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
function message(error: unknown) {
  const kind = error instanceof IntakeError ? error.kind : 'unavailable';
  return kind === 'expired' ? 'Votre session a expiré. Les échéances ont été effacées.' : kind === 'denied' ? 'Votre compte n’est pas autorisé à consulter ces échéances.' : kind === 'missing' ? 'Cette demande est absente, réattribuée ou inaccessible. Aucun détail n’a été ouvert.' : kind === 'offline' ? 'Hors connexion. Retrouvez le réseau pour consulter vos échéances.' : 'Les échéances sont indisponibles. Réessayez.';
}
export function OwnerWorklist({ transport, freshData, selectionRevision, onSelectionStart, onSelected, onReset, onSessionExpired }: { transport: IntakeTransport; freshData?: InquiryOwnerWorklist | null; selectionRevision: number; onSelectionStart: () => void; onSelected: (item: Inquiry) => void; onReset: () => void; onSessionExpired: () => void }) {
  const [view, setView] = useState<'deadlines'|'intentions'>('deadlines');
  const viewButtons = useRef<(HTMLButtonElement|null)[]>([]);
  const [data, setData] = useState<InquiryOwnerWorklist | null>(null); const [bucket, setBucket] = useState<Bucket>('overdue');
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [detailError, setDetailError] = useState('');
  const [opening, setOpening] = useState<string | null>(null); const [opened, setOpened] = useState<string | null>(null); const [retryId, setRetryId] = useState<string | null>(null);
  const [online, setOnline] = useState(true); const [zone, setZone] = useState('heure de cet appareil');
  const active = useRef(true); const listRequest = useRef<AbortController | null>(null); const detailRequest = useRef<AbortController | null>(null);
  const callbacks = useRef({ onSelectionStart, onSelected, onReset, onSessionExpired }); callbacks.current = { onSelectionStart, onSelected, onReset, onSessionExpired };
  const buttons = useRef<(HTMLButtonElement | null)[]>([]); const id = useId();
  function fail(error: unknown) { if (error instanceof IntakeError && error.kind === 'expired') { setData(null); callbacks.current.onReset(); callbacks.current.onSessionExpired(); } }
  async function load() {
    listRequest.current?.abort(); detailRequest.current?.abort(); callbacks.current.onReset();
    setData(null); setError(''); setDetailError(''); setOpening(null); setOpened(null); setRetryId(null);
    if (!navigator.onLine) { setLoading(false); setError(message(new IntakeError('offline'))); return; }
    const controller = new AbortController(); listRequest.current = controller; setLoading(true);
    try { const result = await transport.ownerWorklist(controller.signal); if (active.current && !controller.signal.aborted) setData(result); }
    catch (error) { if (active.current && !controller.signal.aborted) { setError(message(error)); fail(error); } }
    finally { if (active.current && !controller.signal.aborted) setLoading(false); }
  }
  async function open(id: string) {
    detailRequest.current?.abort(); callbacks.current.onSelectionStart(); setOpened(null); setDetailError(''); setRetryId(id);
    if (!navigator.onLine) { setOpening(null); setDetailError(message(new IntakeError('offline'))); return; }
    const controller = new AbortController(); detailRequest.current = controller; setOpening(id);
    try { const result = await transport.inquiry(id, controller.signal); if (active.current && !controller.signal.aborted) { setOpened(id); setRetryId(null); callbacks.current.onSelected(result); } }
    catch (error) { if (active.current && !controller.signal.aborted) { setDetailError(message(error)); fail(error); } }
    finally { if (active.current && !controller.signal.aborted) setOpening(null); }
  }
  useEffect(() => {
    active.current = true;
    if(view !== 'deadlines'){setData(null);setLoading(false);listRequest.current?.abort();detailRequest.current?.abort();return;}
    const unsubscribe = transport.onPrivateClear(() => { listRequest.current?.abort(); detailRequest.current?.abort(); setData(null); setLoading(false); setOpening(null); setOpened(null); setRetryId(null); setDetailError(''); setError('Accès ou connexion interrompu. Relisez les échéances.'); callbacks.current.onReset(); });
    const network = () => { setOnline(navigator.onLine); if (!navigator.onLine) { listRequest.current?.abort(); detailRequest.current?.abort(); setData(null); setLoading(false); setOpening(null); setOpened(null); setRetryId(null); setDetailError(''); setError(message(new IntakeError('offline'))); callbacks.current.onReset(); } };
    network(); setZone(Intl.DateTimeFormat().resolvedOptions().timeZone); void load();
    window.addEventListener('online', network); window.addEventListener('offline', network);
    return () => { unsubscribe(); active.current = false; listRequest.current?.abort(); detailRequest.current?.abort(); window.removeEventListener('online', network); window.removeEventListener('offline', network); };
  }, [transport,view]);
  useEffect(() => { detailRequest.current?.abort(); setOpening(null); setOpened(null); setRetryId(null); setDetailError(''); }, [selectionRevision]);
  useEffect(() => { if (view === 'deadlines' && freshData) { listRequest.current?.abort(); setData(freshData); setLoading(false); setError(''); } }, [freshData,view]);
  function change(value: Bucket) { detailRequest.current?.abort(); setBucket(value); setOpening(null); setOpened(null); setRetryId(null); setDetailError(''); callbacks.current.onReset(); }
  function switchView(next: 'deadlines'|'intentions'){if(next===view)return;listRequest.current?.abort();detailRequest.current?.abort();callbacks.current.onReset();setOpening(null);setDetailError('');setView(next);}
  const current = data?.[bucket];
  return <section className="owner-worklist work-panel" aria-labelledby={`${id}-title`}>
    <header className="owner-worklist-heading"><div><p className="eyebrow muted">VOTRE FIL DE SUIVI</p><h2 id={`${id}-title`}>Mes échéances</h2></div>{view === 'deadlines' && <Button type="button" onClick={() => void load()} disabled={loading || !online} aria-label="Actualiser mes échéances"><RefreshCw size={17} className={loading ? 'intake-spin' : ''}/><span>Actualiser</span></Button>}</header>
    <div className="owner-worklist-views" role="tablist" aria-label="Vue du suivi personnel">{([{key:'deadlines',label:'Échéances'},{key:'intentions',label:'Intentions enregistrées'}] as const).map((tab,index)=><button key={tab.key} ref={el=>{viewButtons.current[index]=el;}} role="tab" id={id+'-view-'+tab.key} aria-controls={id+'-view-panel'} aria-selected={view===tab.key} tabIndex={view===tab.key?0:-1} onClick={()=>switchView(tab.key)} onKeyDown={event=>{const next=event.key==='ArrowRight'||event.key==='ArrowLeft'?1-index:event.key==='Home'?0:event.key==='End'?1:-1;if(next>=0){event.preventDefault();switchView(next===0?'deadlines':'intentions');viewButtons.current[next]?.focus();}}}>{tab.label}</button>)}</div>
    <div id={id+'-view-panel'} role="tabpanel" aria-labelledby={id+'-view-'+view}>
    {view === 'intentions' ? <PlannedActionWorklist transport={transport} selectionRevision={selectionRevision} onSelectionStart={onSelectionStart} onSelected={onSelected} onReset={onReset} onSessionExpired={onSessionExpired}/> : <>
    <p className="owner-worklist-note">{transport.mode === 'demo' ? 'Simulation synthétique · mémoire locale. ' : 'Vos demandes uniquement. '}Une échéance passée n’indique pas une urgence clinique. Consigner un suivi ne change pas cette date.</p>
    <div className="owner-worklist-tabs" role="tablist" aria-label="Catégories d’échéances">{tabs.map((tab, index) => <button key={tab.id} ref={element => { buttons.current[index] = element; }} role="tab" id={`${id}-${tab.id}`} aria-controls={`${id}-panel`} aria-selected={bucket === tab.id} tabIndex={bucket === tab.id ? 0 : -1} onClick={() => change(tab.id)} onKeyDown={event => { const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1; if (next >= 0) { event.preventDefault(); change(tabs[next]!.id); buttons.current[next]?.focus(); } }}><tab.icon size={17}/><span>{tab.label}</span><strong>{data ? data[tab.id].truncated ? '50+' : data[tab.id].items.length : '—'}</strong></button>)}</div>
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${bucket}`} tabIndex={0} className="owner-worklist-panel">
      {loading ? <p className="owner-worklist-state" role="status"><LoaderCircle size={19} className="intake-spin"/>Lecture des échéances…</p> : error ? <div className="owner-worklist-state" role="status"><p>{error}</p><Button onClick={() => void load()} disabled={!online}>Réessayer les échéances</Button></div> : current && <>
        {current.truncated && <p className="owner-worklist-partial" role="status">Liste partielle : 50 demandes affichées, au moins une autre existe. Aucun total exact n’est disponible.</p>}
        {!current.items.length ? <p className="owner-worklist-state" role="status">Aucune demande dans cette catégorie à la dernière observation.</p> : <ul className="owner-worklist-list">{current.items.map(item => <li key={item.id}><button onClick={() => void open(item.id)} aria-pressed={opened === item.id} aria-label={`Ouvrir la demande ${item.display_name}`}><span className="owner-worklist-initial" aria-hidden="true">{[...item.display_name][0]}</span><span className="owner-worklist-name"><strong>{item.display_name}</strong><small>{sources[item.source]} · source déclarée</small></span><span className="owner-worklist-due">{bucket === 'overdue' ? <Clock3 size={15}/> : bucket === 'upcoming' ? <CalendarClock size={15}/> : <CircleDashed size={15}/>}<span>{item.follow_up_at ? date(item.follow_up_at) : 'Sans date'}</span></span>{opening === item.id ? <LoaderCircle size={17} className="intake-spin"/> : <ArrowRight size={17}/>}</button></li>)}</ul>}
      </>}
    </div>
    {opening && <p className="owner-worklist-notice" role="status">Vérification de l’accès actuel à la demande…</p>}
    {detailError && <div className="owner-worklist-notice" role="alert"><p>{detailError}</p>{retryId && <Button onClick={() => void open(retryId)} disabled={!online}>Réessayer le détail</Button>}</div>}
    {data && <p className="owner-worklist-observed">Observé le <time dateTime={data.observed_at}>{date(data.observed_at)}</time> · {zone}. Catégories calculées à cette observation, sans mise à jour automatique.</p>}
    </>}
    </div>
  </section>;
}

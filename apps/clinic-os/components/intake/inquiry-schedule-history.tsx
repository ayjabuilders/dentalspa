'use client';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Button } from '@dental/ui-clinic';
import { ArrowDown, CalendarClock, ChevronDown, History, LoaderCircle, Minus, RefreshCw, ShieldCheck } from 'lucide-react';
import type { Inquiry, InquiryScheduleHistory as HistoryData } from '@dental/contracts';
import { IntakeError, type IntakeFailure, type IntakeTransport } from './transport';
import './inquiry-schedule-history.css';
const messages: Record<IntakeFailure,string> = {
  offline: 'Hors connexion. L’historique et le détail privé ont été effacés.',
  denied: 'Historique non autorisé. L’accès actuel à cette demande a été refusé.',
  expired: 'Session expirée. Connectez-vous à nouveau pour consulter cet historique.',
  missing: 'Demande absente, réattribuée ou inaccessible. Le détail privé a été effacé.',
  unavailable: 'Historique indisponible. La réponse n’a pas pu être vérifiée.',
  disabled: 'Historique indisponible. La lecture ne dépend pas de l’activation des écritures.',
  invalid: 'Historique indisponible pour cette demande.',
  conflict: 'Historique indisponible. Relisez le détail autorisé.',
};
const stamp = (value: string) => new Intl.DateTimeFormat('fr-MA', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value));
export function InquiryScheduleHistory({ inquiry, transport, revision }: { inquiry: Inquiry | null; transport: IntakeTransport; revision: number }) {
  const [open, setOpen] = useState(false); const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState<IntakeFailure | null>(null);
  const [online, setOnline] = useState(true); const [zone, setZone] = useState('heure de cet appareil');
  const active = useRef(false); const request = useRef<AbortController | null>(null); const invalidated = useRef(false);
  const selected = useRef(inquiry); selected.current = inquiry; const panelId = useId();
  const owned = inquiry?.owner_user_id === transport.currentUserId;
  useEffect(() => {
    active.current = true; setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const off = transport.onPrivateClear(kind => { invalidated.current = true; request.current?.abort(); setData(null); setLoading(false); setError(kind); setOpen(true); });
    const network = () => { setOnline(navigator.onLine); if (!navigator.onLine) transport.clearPrivate('offline'); };
    network(); window.addEventListener('online',network); window.addEventListener('offline',network);
    return () => { active.current = false; request.current?.abort(); transport.scheduleHistoryActive.current = false; off(); window.removeEventListener('online',network); window.removeEventListener('offline',network); };
  }, [transport]);
  useEffect(() => {
    request.current?.abort(); transport.scheduleHistoryActive.current = false; setData(null); setLoading(false);
    if (invalidated.current && !inquiry) return;
    invalidated.current = false; setError(null); setOpen(false);
  }, [inquiry?.id, inquiry?.owner_user_id, transport, revision]);
  async function load() {
    request.current?.abort(); setData(null); setError(null); setOpen(true);
    const target = selected.current;
    if (!target || target.owner_user_id !== transport.currentUserId) return;
    if (!navigator.onLine) { transport.clearPrivate('offline'); return; }
    transport.scheduleHistoryActive.current = true; const controller = new AbortController(); request.current = controller; setLoading(true);
    try {
      const result = await transport.scheduleHistory(target.id,controller.signal);
      if (active.current && !controller.signal.aborted && selected.current?.id === target.id) setData(result);
    } catch (failure) {
      if (!active.current || controller.signal.aborted || selected.current?.id !== target.id) return;
      const kind = failure instanceof IntakeError ? failure.kind : 'unavailable'; setError(kind);
      if (kind === 'expired' || kind === 'denied' || kind === 'missing') transport.clearPrivate(kind);
    } finally { if (active.current && !controller.signal.aborted) setLoading(false); }
  }
  function toggle() { if (open) { request.current?.abort(); transport.scheduleHistoryActive.current = false; setData(null); setLoading(false); setOpen(false); } else void load(); }
  const visible = data?.inquiry_id === inquiry?.id && owned ? data : null;
  if (!owned && !error) return null;
  return <section className="schedule-history" aria-label="Historique des échéances de la demande">
    <button className="schedule-history-disclosure" onClick={toggle} aria-expanded={open} aria-controls={panelId} disabled={!online || (!owned && !open)}><span className="schedule-history-emblem"><History size={20}/></span><span><strong>Historique des échéances</strong><small>Vos actions récentes uniquement</small></span><ChevronDown size={19} className={open ? 'schedule-history-chevron open' : 'schedule-history-chevron'}/></button>
    {open && <div id={panelId} className="schedule-history-content">
      <p className="schedule-history-context"><ShieldCheck size={17}/>{transport.mode === 'demo' ? 'Journal synthétique · mémoire temporaire' : 'Vos commandes pour cette demande actuellement à votre charge.'}</p>
      <p className="schedule-history-note">Résultats historiques, pas l’échéance actuelle. Ils ne prouvent aucun contact ni rendez-vous. Une soumission incertaine doit être vérifiée avec sa commande exacte.</p>
      {loading ? <p className="schedule-history-state" role="status"><LoaderCircle className="intake-spin" size={19}/>Lecture de vos échéances consignées…</p> : error ? <div className="schedule-history-state" role="status"><p>{messages[error]}</p>{owned && !['denied','expired','missing'].includes(error) && <Button onClick={() => void load()} disabled={!online}>Réessayer l’historique des échéances</Button>}</div> : visible && <>
        <div className="schedule-history-toolbar"><p role="status"><strong>{visible.truncated ? '50+' : visible.items.length}</strong> résultats de vos commandes, sans changement inclus</p><Button aria-label="Actualiser l’historique des échéances" onClick={() => void load()} disabled={!online}><RefreshCw size={16}/></Button></div>
        {visible.truncated && <p className="schedule-history-partial">Historique partiel : vos 50 résultats les plus récents sont affichés. Au moins un autre existe ; aucun total exact n’est disponible.</p>}
        {!visible.items.length ? <p className="schedule-history-state" role="status">Aucun résultat de commande pour vous dans cet historique. Cela ne signifie pas que l’échéance n’a jamais changé.</p> : <div className="schedule-history-scroll" role="region" aria-label="Résultats historiques des commandes" tabIndex={0}><ol>{visible.items.map((item,index) => <li key={index} style={{ '--history-delay': `${Math.min(index,4)*40}ms` } as CSSProperties}>
          <div className="schedule-history-entry-heading">{item.changed ? <CalendarClock size={18}/> : <Minus size={18}/>}<strong>{item.changed ? 'Échéance modifiée' : 'Sans changement'}</strong></div>
          <dl><div><dt>Avant cette commande</dt><dd>{item.previous_follow_up_at ? <time dateTime={item.previous_follow_up_at}>{stamp(item.previous_follow_up_at)}</time> : 'Sans date'}</dd></div><ArrowDown size={14} aria-hidden="true"/><div><dt>Résultat de cette commande</dt><dd>{item.follow_up_at ? <time dateTime={item.follow_up_at}>{stamp(item.follow_up_at)}</time> : 'Sans date'}</dd></div></dl>
          <p className="schedule-history-recorded">Consignée le <time dateTime={item.recorded_at}>{stamp(item.recorded_at)}</time></p>
        </li>)}</ol></div>}
        <p className="schedule-history-zone">Horaires : {zone}. Journal personnel non exhaustif ; aucune action n’est relancée depuis cette vue.</p>
      </>}
    </div>}
  </section>;
}

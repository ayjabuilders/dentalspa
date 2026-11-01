'use client';
import {sessionFetch as fetch} from '../../lib/renewing-session';
import {useConnectedNavigationLock} from '../../lib/connected-navigation';
import {useEffect,useRef,useState} from 'react';
import {Inbox,RefreshCw,Search,ArrowLeft,ArrowRight,ArrowUpRight,CalendarDays,Clock3,CheckCircle2,XCircle,X,Mail,Phone} from 'lucide-react';
import {Button,Modal} from '@dental/ui-clinic';
import {ConfiguredBookingPageSchema} from '@dental/contracts';
import './configured-booking-inbox.css';
import {ConfiguredConfirmation} from './configured-confirmation';

type Props={api:string;token:string;clinicId:string;onSessionExpired:()=>void;onOpenAgenda:()=>void};
type Status='all'|'request_received'|'confirmed'|'cancelled';
const statusLabel={request_received:'À examiner',confirmed:'Confirmé',cancelled:'Annulé'};
const stamp=(value:string)=>new Intl.DateTimeFormat('fr-MA',{timeZone:'Africa/Casablanca',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
export function ConfiguredBookingInbox(props:Props){return <List key={`${props.api}:${props.clinicId}:${props.token}`} {...props}/>;}
function List({api,token,clinicId,onSessionExpired,onOpenAgenda}:Props){
  const [result,setResult]=useState<ReturnType<typeof ConfiguredBookingPageSchema.parse>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0),[search,setSearch]=useState('');
  const [selected,setSelected]=useState<string|null>(null),[confirming,setConfirming]=useState(false),[status,setStatus]=useState<Status>('all'),[page,setPage]=useState(1),[success,setSuccess]=useState('');
  useConnectedNavigationLock(selected!==null);
  const expire=useRef(onSessionExpired);expire.current=onSessionExpired;
  useEffect(()=>{const refresh=()=>{if(!selected)setReload(value=>value+1);};window.addEventListener('booking-requests-refresh',refresh);return()=>window.removeEventListener('booking-requests-refresh',refresh);},[selected]);
  useEffect(()=>{const controller=new AbortController();setBusy(true);setResult(null);setError('');
    void(async()=>{try{
      const response=await fetch(`${api.replace(/\/$/,'')}/api/v1/booking-requests/configured/page?${new URLSearchParams({offset:String((page-1)*10),limit:"10",query:search,status})}`,{headers:{Authorization:`Bearer ${token}`,'X-Clinic-Id':clinicId},cache:'no-store',credentials:'omit',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
      if(controller.signal.aborted)return;
      if(response.status===401){expire.current();return;}
      if(!response.ok)throw Error('unavailable');
      const parsed=ConfiguredBookingPageSchema.parse(await response.json());if(!controller.signal.aborted){setResult(parsed);if(page>1&&(page-1)*10>=parsed.total_count)setPage(Math.max(1,Math.ceil(parsed.total_count/10)));}
    }catch{if(!controller.signal.aborted)setError('Les demandes ne sont pas accessibles. Réessayez.');}finally{if(!controller.signal.aborted)setBusy(false);}})();
    return()=>controller.abort();
  },[api,token,clinicId,reload,page,search,status]);
  const loaded=result?.items??[];
  const items=loaded,total=result?.total_count??0;
  const pages=Math.max(1,Math.ceil(total/10)),currentPage=page,visible=items;
  const selectedItem=loaded.find(item=>item.id===selected);
  const canConfirm=selectedItem?.status==='request_received'&&result?.confirmation_enabled&&!!result.current_revision;
  function openRequest(id:string,confirmation=false){setSelected(id);setConfirming(confirmation);}
  return <section className="configured-booking-inbox" aria-labelledby="configured-inbox-title" aria-busy={busy}>
    <header className="configured-inbox-heading"><span className="configured-inbox-mark"><CalendarDays size={23}/></span><div><h1 id="configured-inbox-title">Demandes de rendez-vous</h1><p>Réservations reçues depuis votre lien public</p></div><Button type="button" disabled={!!selected} onClick={onOpenAgenda}><CalendarDays size={17}/>Retour à l’agenda</Button></header>
    {success&&<div className="configured-inbox-success" role="status"><CheckCircle2 size={18}/><span>{success}</span><button type="button" aria-label="Masquer la confirmation du rendez-vous" onClick={()=>setSuccess('')}><X size={16}/></button></div>}
    <div className="configured-inbox-filters" role="group" aria-label="Statut des demandes de rendez-vous">{([{id:'all',label:'Toutes',Icon:Inbox},{id:'request_received',label:'À examiner',Icon:Clock3},{id:'confirmed',label:'Confirmées',Icon:CheckCircle2},{id:'cancelled',label:'Annulées',Icon:XCircle}] as const).map(filter=><button type="button" key={filter.id} data-status={filter.id} aria-pressed={status===filter.id} disabled={!!selected} onClick={()=>{setStatus(filter.id);setPage(1);}}><filter.Icon size={17}/><span>{filter.label}</span><strong>{result?result.counts[filter.id]:'—'}</strong></button>)}</div>
    <section className="configured-inbox-directory" aria-label="Réservations reçues">
      <div className="configured-inbox-tools"><label className="configured-inbox-search"><Search size={18}/><input aria-label="Rechercher une demande" value={search} maxLength={100} disabled={!!selected} onChange={event=>{setSearch(event.target.value);setPage(1);}} placeholder="Nom, téléphone, e-mail ou visite…"/>{search&&<button type="button" aria-label="Effacer la recherche des réservations" onClick={()=>{setSearch('');setPage(1);}}><X size={16}/></button>}</label><button className="configured-inbox-refresh" type="button" aria-label="Actualiser les demandes" title="Actualiser les demandes" disabled={busy||!!selected} onClick={()=>setReload(value=>value+1)}><RefreshCw size={18}/></button></div>
      {busy&&<div className="configured-inbox-empty" role="status"><RefreshCw size={24}/><p>Chargement des demandes…</p></div>}
      {error&&<div className="configured-inbox-empty" role="alert"><Inbox size={25}/><h2>Demandes indisponibles</h2><p>{error}</p><Button onClick={()=>setReload(value=>value+1)}>Réessayer</Button></div>}
      {result&&!items.length&&<div className="configured-inbox-empty"><Search size={25}/><h2>{search||status!=='all'?'Aucune demande correspondante':'Aucune demande reçue'}</h2><p>{search||status!=='all'?'Changez de filtre pour retrouver une réservation.':'Les demandes envoyées depuis le lien public apparaîtront ici.'}</p>{(search||status!=='all')&&<Button onClick={()=>{setSearch('');setStatus('all');setPage(1);}}>Réinitialiser les filtres</Button>}</div>}
      <ul className="configured-inbox-list">{visible.map(item=><li key={item.id} data-configured-request-id={item.id}>
        <button type="button" className="configured-request-open" aria-label={`Ouvrir la demande de ${item.contact_name}`} disabled={!!selected} onClick={()=>openRequest(item.id)}><span className="configured-request-avatar">{item.contact_name.trim().split(/\s+/).map(part=>part[0]).slice(0,2).join('')}</span><span className="configured-request-person"><strong>{item.contact_name}</strong><small>{item.contact_email}</small></span><span className="configured-request-visit"><strong>{item.visit_name}</strong><small><CalendarDays size={14}/>{stamp(item.starts_at)} · {Math.round((Date.parse(item.ends_at)-Date.parse(item.starts_at))/60000)} min</small></span><span className="configured-request-status" data-status={item.status}>{statusLabel[item.status]}</span><ArrowUpRight size={17}/></button>
        {item.status==='request_received'&&result?.confirmation_enabled&&result.current_revision&&<Button className="configured-request-confirm" type="button" variant="primary" disabled={!!selected} onClick={()=>openRequest(item.id,true)}>Confirmer</Button>}
      </li>)}</ul>
      {result&&<footer className="configured-inbox-pagination"><span>{items.length?`${(currentPage-1)*10+1}–${Math.min(currentPage*10,total)} sur ${total}`:'0 résultat'}</span><button type="button" aria-label="Page précédente des réservations" disabled={!!selected||currentPage===1} onClick={()=>setPage(currentPage-1)}><ArrowLeft size={16}/></button><span>{currentPage} / {pages}</span><button type="button" aria-label="Page suivante des réservations" disabled={!!selected||currentPage===pages} onClick={()=>setPage(currentPage+1)}><ArrowRight size={16}/></button></footer>}
    </section>
    <p className="configured-inbox-note">Données fictives · seules les demandes confirmées réservent un créneau. Heure de Casablanca.</p>
    <Modal mobilePresentation="sheet" open={!!selectedItem} onOpenChange={open=>{if(!open&&!confirming)setSelected(null);}} title={confirming?'Confirmer le rendez-vous':'Demande de rendez-vous'} description={selectedItem?.contact_name??''} closeDisabled={confirming}>
      {selectedItem&&<div className="configured-request-detail"><div className="configured-request-detail-top"><span className="configured-request-status" data-status={selectedItem.status}>{statusLabel[selectedItem.status]}</span><span>Lien public</span></div><h3>{selectedItem.visit_name}</h3><dl><div><dt><CalendarDays size={16}/>Créneau demandé</dt><dd>{stamp(selectedItem.starts_at)}<small>{Math.round((Date.parse(selectedItem.ends_at)-Date.parse(selectedItem.starts_at))/60000)} minutes · Casablanca</small></dd></div><div><dt><Mail size={16}/>Contact</dt><dd>{selectedItem.contact_email}</dd></div>{selectedItem.contact_phone&&<div><dt><Phone size={16}/>Téléphone</dt><dd><a href={`tel:${selectedItem.contact_phone}`}>{selectedItem.contact_phone}</a></dd></div>}</dl>
      {confirming&&canConfirm&&result?.current_revision?<ConfiguredConfirmation api={api} token={token} clinicId={clinicId} id={selectedItem.id} revision={result.current_revision} onSessionExpired={onSessionExpired} onClose={()=>setConfirming(false)} onRefresh={()=>{setConfirming(false);setSelected(null);setResult(null);setSuccess('');setReload(value=>value+1);window.dispatchEvent(new Event('booking-requests-changed'));}} onConfirmed={()=>{window.dispatchEvent(new Event('booking-requests-changed'));setSuccess(`Rendez-vous de ${selectedItem.contact_name} confirmé.`);setConfirming(false);setSelected(null);setResult(null);setReload(value=>value+1);}}/>:<div className="configured-request-detail-actions"><Button type="button" onClick={()=>setSelected(null)}>Fermer</Button>{canConfirm&&<Button type="button" variant="primary" onClick={()=>setConfirming(true)}><CheckCircle2 size={17}/>Confirmer</Button>}</div>}
      </div>}
    </Modal>
  </section>;
}

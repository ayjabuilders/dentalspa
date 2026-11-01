'use client';
import {sessionFetch as fetch} from '../../lib/renewing-session';

import { useEffect, useRef, useState } from 'react';
import { FileText, Plus, RefreshCw, Send, Search, ChevronLeft, ChevronRight, FileCheck2, WalletCards, X } from 'lucide-react';
import { Button, Modal } from '@dental/ui-clinic';
import {useConnectedNavigationLock} from '../../lib/connected-navigation';
import { LocalInvoiceListSchema, LocalInvoiceDraftReceiptSchema, LocalInvoiceIssuedReceiptSchema, type PatientHub } from '@dental/contracts';
import './patient-invoices.css';
import { InvoiceCredits } from './invoice-credits';
import { InvoiceDocument } from './invoice-document';
type InvoiceList=ReturnType<typeof LocalInvoiceListSchema.parse>;
type Attempt={kind:'prepare'|'issue';key:string;quoteId?:string;quoteVersion?:number;invoiceId?:string;total:number};
type Props={api:string;token:string;clinicId:string;patientId:string;quotes:PatientHub['quotes'];onSessionExpired:()=>void;onPendingChange:(pending:boolean)=>void};
function requestKey(){const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]!&15)|64;bytes[8]=(bytes[8]!&63)|128;const h=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
const money=(amount:number)=>new Intl.NumberFormat('fr-MA',{style:'currency',currency:'MAD'}).format(amount/100);
export function PatientInvoices(props:Props){return <Invoices key={`${props.clinicId}:${props.patientId}:${props.token}`} {...props}/>;}
function Invoices({api,token,clinicId,patientId,quotes,onSessionExpired,onPendingChange}:Props){
  const [creditInvoice,setCreditInvoice]=useState<string|null>(null);
  const [documentId,setDocumentId]=useState<string|null>(null);
  const [data,setData]=useState<InvoiceList|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reload,setReload]=useState(0),[selected,setSelected]=useState(''),[confirm,setConfirm]=useState<string|null>(null);
  const [prepareOpen,setPrepareOpen]=useState(false),[discard,setDiscard]=useState(false),[query,setQuery]=useState(''),[status,setStatus]=useState<'all'|'draft'|'issued'>('all'),[page,setPage]=useState(1);
  const prepareTrigger=useRef<HTMLButtonElement>(null),sourceSelect=useRef<HTMLSelectElement>(null);
  const restoreAfterSave=useRef(false);
  const operation=useRef<AbortController|null>(null),attempt=useRef<Attempt|null>(null),expire=useRef(onSessionExpired),pendingChanged=useRef(onPendingChange);
  expire.current=onSessionExpired;pendingChanged.current=onPendingChange;
  useEffect(()=>{pendingChanged.current(busy||uncertain||prepareOpen||!!confirm);},[busy,uncertain,prepareOpen,confirm]);
  useConnectedNavigationLock(busy||uncertain||prepareOpen||!!confirm);
  useEffect(()=>{
    if(!busy&&!uncertain&&!(prepareOpen&&selected))return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);
    return()=>window.removeEventListener('beforeunload',warn);
  },[busy,uncertain,prepareOpen,selected]);
  useEffect(()=>{if(prepareOpen&&!discard){const frame=requestAnimationFrame(()=>sourceSelect.current?.focus());return()=>cancelAnimationFrame(frame);}},[prepareOpen,discard]);
  useEffect(()=>()=>{operation.current?.abort();pendingChanged.current(false);},[]);
  const base=`${api.replace(/\/$/,'')}/api/v1/finance/patients/${patientId}/invoices`;
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setData(null);setError('');
    void(async()=>{try{
      const response=await fetch(base,{headers:{Authorization:`Bearer ${token}`,'X-Clinic-Id':clinicId},credentials:'omit',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
      if(response.status===401){if(!controller.signal.aborted)expire.current();return;}
      if(!response.ok)throw Error('unavailable');
      const result=LocalInvoiceListSchema.safeParse(await response.json());
      if(!result.success||result.data.items.some(item=>item.patient_id!==patientId||item.snapshot.clinic.id!==clinicId))throw Error('invalid');
      if(!controller.signal.aborted)setData(result.data);
    }catch{if(!controller.signal.aborted)setError('Factures indisponibles. Vérifiez la connexion et réessayez.');}
    finally{if(!controller.signal.aborted)setLoading(false);}})();return()=>controller.abort();
  },[base,token,clinicId,patientId,reload]);
  useEffect(()=>{
    if(!restoreAfterSave.current||loading||busy||uncertain||prepareOpen)return;
    const frame=requestAnimationFrame(()=>{prepareTrigger.current?.focus();restoreAfterSave.current=false;});
    return()=>cancelAnimationFrame(frame);
  },[loading,busy,uncertain,prepareOpen]);
  const available=quotes.filter(quote=>quote.total_minor>0&&!data?.items.some(item=>item.quote_id===quote.id&&item.quote_version===quote.version));
  async function execute(next?:Attempt){
    if(operation.current)return;
    const command=attempt.current??next;if(!command)return;attempt.current=command;
    const wasUncertain=uncertain,controller=new AbortController();operation.current=controller;setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch(command.kind==='prepare'?base:`${base}/${command.invoiceId}/issue`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'X-Clinic-Id':clinicId,'Content-Type':'application/json','Idempotency-Key':command.key},body:JSON.stringify(command.kind==='prepare'?{quote_id:command.quoteId,quote_version:command.quoteVersion}:{}),credentials:'omit',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
      if(controller.signal.aborted)return;
      if(response.status===401){expire.current();return;}
      if(!response.ok){
        if(!wasUncertain&&[400,403,404,409].includes(response.status)){attempt.current=null;setConfirm(null);setError(response.status===409?'Le devis ou la facture a changé. Actualisez les données avant de réessayer.':'Action refusée. Vérifiez le dossier et vos droits.');return;}
        throw Error('uncertain');
      }
      const value=await response.json();
      const result=command.kind==='prepare'?LocalInvoiceDraftReceiptSchema.safeParse(value):LocalInvoiceIssuedReceiptSchema.safeParse(value);
      if(!result.success||result.data.patient_id!==patientId||result.data.total_minor!==command.total)throw Error('receipt');
      if(command.kind==='prepare'){
        const draft=LocalInvoiceDraftReceiptSchema.parse(result.data);if(draft.quote_id!==command.quoteId||draft.quote_version!==command.quoteVersion)throw Error('receipt');
      }else if(result.data.invoice_id!==command.invoiceId)throw Error('receipt');
      if(controller.signal.aborted)return;
      restoreAfterSave.current=command.kind==='prepare';
      attempt.current=null;setUncertain(false);setConfirm(null);setSelected('');setPrepareOpen(false);setDiscard(false);setQuery('');setStatus(command.kind==='prepare'?'draft':'issued');setPage(1);setNotice(command.kind==='prepare'?'Brouillon de facture enregistré.':'Facture de démonstration émise.');setReload(value=>value+1);
    }catch{if(!controller.signal.aborted){setUncertain(true);setError('Résultat à vérifier. La facture peut déjà être enregistrée : reprenez la même commande.');}}
    finally{if(operation.current===controller)operation.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  const locked=busy||uncertain;
  const browsingLocked=locked||prepareOpen||!!confirm;
  const filtered=data?.items.filter(item=>(status==='all'||item.state===status)&&`${item.number??'Facture brouillon'} ${item.snapshot.payer.display_name} ${item.quote_id} ${item.snapshot.quote.details.lines.map(line=>line.label).join(' ')}`.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr')))??[];
  const pages=Math.max(1,Math.ceil(filtered.length/10)),currentPage=Math.min(page,pages),visible=filtered.slice((currentPage-1)*10,currentPage*10);
  const selectedQuote=available.find(item=>item.id===selected);
  function closePrepare(){if(locked)return;if(selected)setDiscard(true);else{setPrepareOpen(false);setError('');}}
  function selectFilter(next:'all'|'draft'|'issued'){setStatus(next);setPage(1);}
  if(creditInvoice)return <InvoiceCredits api={api} token={token} clinicId={clinicId} patientId={patientId} invoiceId={creditInvoice} onSessionExpired={onSessionExpired} onPendingChange={onPendingChange} onClose={()=>{setCreditInvoice(null);setReload(n=>n+1);}}/>;
  return <section className="patient-invoices" aria-label="Factures du patient" aria-busy={loading||busy}>
    {documentId&&data?.items.find(item=>item.invoice_id===documentId)&&<InvoiceDocument invoice={data.items.find(item=>item.invoice_id===documentId)!} onClose={()=>setDocumentId(null)}/>}
    <header className="invoice-heading"><div><h3><FileText size={21}/>Factures</h3><span>Documents fictifs · MAD</span></div><div className="invoice-heading-actions"><button type="button" className="invoice-refresh" aria-label="Actualiser les factures" title="Actualiser les factures" disabled={loading||browsingLocked} onClick={()=>setReload(value=>value+1)}><RefreshCw size={17}/></button><button ref={prepareTrigger} type="button" className="invoice-new-button" disabled={loading||browsingLocked||!data} onClick={()=>{setSelected('');setDiscard(false);setError('');setPrepareOpen(true);}}><Plus size={17}/>Nouvelle facture</button></div></header>
    {notice&&<p className="invoice-notice" role="status">{notice}</p>}{error&&!prepareOpen&&<p role="alert">{error}</p>}{loading&&<p role="status">Chargement des factures…</p>}
    {uncertain&&!prepareOpen&&<button type="button" disabled={busy} onClick={()=>void execute()}>{busy?'Vérification…':'Réessayer la même commande'}</button>}
    {data&&<><div className="invoice-overview-filters" role="group" aria-label="Statut des factures"><button type="button" disabled={browsingLocked} aria-pressed={status==='all'} onClick={()=>selectFilter('all')}><FileText size={19}/><span>Toutes<strong>{data.items.length}</strong></span></button><button type="button" disabled={browsingLocked} aria-pressed={status==='draft'} onClick={()=>selectFilter('draft')}><FileText size={19}/><span>Brouillons<strong>{data.items.filter(item=>item.state==='draft').length}</strong></span></button><button type="button" disabled={browsingLocked} aria-pressed={status==='issued'} onClick={()=>selectFilter('issued')}><FileCheck2 size={19}/><span>Émises<strong>{data.items.filter(item=>item.state==='issued').length}</strong></span></button></div>
      <div className="invoice-list-toolbar"><label className="invoice-search"><Search size={17}/><input aria-label="Rechercher une facture" placeholder="Numéro, payeur ou prestation…" disabled={browsingLocked} value={query} onChange={event=>{setQuery(event.target.value);setPage(1);}}/>{query&&<button type="button" disabled={browsingLocked} aria-label="Effacer la recherche de facture" onClick={()=>{setQuery('');setPage(1);}}><X size={16}/></button>}</label><span>{filtered.length} résultat{filtered.length>1?'s':''}</span></div>
      {!data.items.length&&<div className="invoice-empty"><FileText size={28}/><h4>Aucune facture enregistrée</h4><p>Choisissez un devis pour préparer un brouillon.</p></div>}
      {data.items.length>0&&filtered.length===0&&<div className="invoice-empty"><Search size={26}/><h4>Aucune facture pour ces filtres</h4><p>Essayez un autre numéro ou une autre prestation.</p><button type="button" onClick={()=>{setQuery('');selectFilter('all');}}>Réinitialiser les filtres</button></div>}
      {data.truncated&&<p role="status">Recherche et compteurs limités aux 50 dernières factures chargées.</p>}
      <div className="invoice-list invoice-register">{visible.map(item=><article key={item.invoice_id} className="invoice-card"><header><div><h4>{item.number??'Facture brouillon'}</h4><span>Devis v{item.quote_version} · {new Intl.DateTimeFormat('fr-MA',{dateStyle:'medium',timeZone:'Africa/Casablanca'}).format(new Date(item.created_at))}</span></div><span className="invoice-badge" data-state={item.state}>{item.state==='issued'?'Émise':'Brouillon'}</span><p className="invoice-total">{money(item.total_minor)}</p></header>
        <div className="invoice-card-toolbar"><p className="invoice-payer">Payeur fictif : {item.snapshot.payer.display_name}</p><div>
        {item.state==='issued'&&<button type="button" disabled={browsingLocked} onClick={()=>setCreditInvoice(item.invoice_id)}><WalletCards size={16}/>Avoirs & solde</button>}
        {item.state==='issued'&&<button type="button" disabled={browsingLocked} onClick={()=>setDocumentId(item.invoice_id)}><FileText size={16}/>Afficher le document</button>}
        </div></div>
        <details><summary>Voir les lignes</summary><div className="invoice-lines">{item.snapshot.quote.details.lines.map(line=><div key={line.line_number}><span><strong>{line.label}</strong><small>{line.quantity} × {money(line.unit_amount_minor)}</small></span><strong>{money(line.total_minor)}</strong></div>)}</div><dl><div><dt>Sous-total</dt><dd>{money(item.snapshot.quote.details.subtotal_minor)}</dd></div><div><dt>Remise</dt><dd>{money(item.snapshot.quote.details.discount_minor)}</dd></div><div><dt>Taxe</dt><dd>{money(item.snapshot.quote.details.tax_minor)}</dd></div></dl></details>
        {item.state==='draft'&&<div className="invoice-issue">{confirm===item.invoice_id?<><p>Émettre ce document de <strong>{money(item.total_minor)}</strong> ? Son numéro et son contenu seront définitifs.</p><button type="button" disabled={locked} onClick={()=>void execute({kind:'issue',key:requestKey(),invoiceId:item.invoice_id,total:item.total_minor})}>Confirmer l’émission</button><button type="button" disabled={locked} onClick={()=>setConfirm(null)}>Retour</button></>:<button type="button" disabled={locked||!!confirm} onClick={()=>setConfirm(item.invoice_id)}><Send size={16}/>Émettre la facture</button>}</div>}
      </article>)}</div>{pages>1&&<nav className="invoice-pagination" aria-label="Pages des factures"><span>{(currentPage-1)*10+1}–{Math.min(currentPage*10,filtered.length)} / {filtered.length}</span><button type="button" aria-label="Factures précédentes" disabled={browsingLocked||currentPage<=1} onClick={()=>setPage(currentPage-1)}><ChevronLeft size={18}/></button><span>{currentPage} / {pages}</span><button type="button" aria-label="Factures suivantes" disabled={browsingLocked||currentPage>=pages} onClick={()=>setPage(currentPage+1)}><ChevronRight size={18}/></button></nav>}<p className="invoice-disclaimer">Démonstration locale · document non fiscal. Aucun encaissement ni envoi au patient.</p>
    </>}
    <Modal mobilePresentation="sheet" open={prepareOpen} title="Préparer une facture" description="Choisissez une version de devis pour créer un brouillon de facture." className="invoice-prepare-modal" returnFocus={prepareTrigger.current??undefined} closeDisabled={locked} onOpenChange={next=>{if(!next)closePrepare();}}>
      {discard?<div className="invoice-prepare-discard" role="alert"><h3>Abandonner cette préparation ?</h3><p>Aucune facture n’a été enregistrée.</p><div><Button onClick={()=>setDiscard(false)}>Continuer la préparation</Button><Button variant="primary" onClick={()=>{setSelected('');setDiscard(false);setPrepareOpen(false);setError('');}}>Abandonner la préparation</Button></div></div>:<form className="invoice-prepare-form" aria-busy={busy} onSubmit={event=>{event.preventDefault();if(selectedQuote&&!locked)void execute({kind:'prepare',key:requestKey(),quoteId:selectedQuote.id,quoteVersion:selectedQuote.version,total:selectedQuote.total_minor});}}>
        {error&&<p role="alert">{error}</p>}
        {available.length===0?<div className="invoice-empty"><FileText size={26}/><strong>Aucun devis disponible</strong><p>Préparez un devis dans l’onglet Devis. Une version déjà facturée ne peut pas être reprise.</p></div>:<label>Devis source<select ref={sourceSelect} aria-label="Devis source" value={selected} disabled={locked} onChange={event=>setSelected(event.target.value)}><option value="">Choisir un devis</option>{available.map(quote=><option key={quote.id} value={quote.id}>Devis {quotes.findIndex(item=>item.id===quote.id)+1} · v{quote.version} · {money(quote.total_minor)}</option>)}</select></label>}
        {selectedQuote&&<div className="invoice-prepare-summary"><span>Montant du brouillon<strong>{money(selectedQuote.total_minor)}</strong></span><small>Version {selectedQuote.version} · création sans émission ni encaissement</small></div>}
        <div className="invoice-prepare-actions"><Button type="button" disabled={locked} onClick={closePrepare}>Annuler</Button>{uncertain?<Button type="button" variant="primary" disabled={busy} onClick={()=>void execute()}>{busy?'Vérification…':'Réessayer la même commande'}</Button>:<Button type="submit" variant="primary" disabled={locked||!selected}>{busy?'Préparation…':'Préparer la facture'}</Button>}</div>
      </form>}
    </Modal>
  </section>;
}

'use client';
import {sessionFetch as fetch} from '../../lib/renewing-session';

import {useConnectedNavigationLock} from '../../lib/connected-navigation';
import { useEffect, useRef, useState } from 'react';
import { FinanceCatalogSchema, FinanceCatalogCommandSchema, FinanceCatalogReceiptSchema } from '@dental/contracts';
import { Archive, BookOpen, Pencil, Plus, RefreshCw, Search, Users, ArrowUpRight, X } from 'lucide-react';
import {Modal} from '@dental/ui-clinic';
import {Badge,Pagination,Feedback} from '@dental/ui-clinic/pearl';
import { parseMadMinorUnits } from './finance-demo-ledger';
import './finance-catalog.css';
type Catalog=ReturnType<typeof FinanceCatalogSchema.parse>;type Command=ReturnType<typeof FinanceCatalogCommandSchema.parse>;
type Draft={service_id:string|null;expected_version:number;code:string;label:string;category:string;amount:string;archived:boolean};
type Props={api:string;token:string;clinicId:string;onSessionExpired:()=>void;onOpenPatients:()=>void};
const serviceCategories=['Consultation','Prévention et hygiène','Soins conservateurs','Endodontie','Parodontologie','Chirurgie orale','Implantologie','Prothèses dentaires','Orthodontie','Dentisterie pédiatrique','Esthétique dentaire','Imagerie','Autre'];
const money=(amount:number)=>new Intl.NumberFormat('fr-MA',{style:'currency',currency:'MAD'}).format(amount/100);
function requestKey(){const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]!&15)|64;b[8]=(b[8]!&63)|128;const h=Array.from(b,v=>v.toString(16).padStart(2,'0')).join('');return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');}
export function FinanceCatalog(props:Props){return <CatalogWorkspace key={props.clinicId+':'+props.token} {...props}/>;}
function CatalogWorkspace({api,token,clinicId,onSessionExpired,onOpenPatients}:Props){
  const [catalog,setCatalog]=useState<Catalog|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[query,setQuery]=useState(''),[status,setStatus]=useState<'active'|'archived'|'all'>('active'),[draft,setDraft]=useState<Draft|null>(null),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[reload,setReload]=useState(0);
  const [category,setCategory]=useState('all'),[page,setPage]=useState(1);
  const restoreFocus=useRef(false);
  const initialDraft=useRef(''),opener=useRef<HTMLElement|null>(null),discardButton=useRef<HTMLButtonElement|null>(null);
  const [confirmClose,setConfirmClose]=useState(false);
  useEffect(()=>{if(confirmClose)discardButton.current?.focus();},[confirmClose]);
  useEffect(()=>{if(restoreFocus.current&&!draft&&!loading){restoreFocus.current=false;const target=opener.current;const available=target?.isConnected&&!target.matches(':disabled');(available?target:document.getElementById('finance-catalog-title'))?.focus({preventScroll:true});}},[draft,loading]);
  function close(){if(saving||uncertain)return;if(draft&&JSON.stringify(draft)!==initialDraft.current){setConfirmClose(true);return;}restoreFocus.current=true;setDraft(null);setError('');}
  useConnectedNavigationLock(saving||uncertain||draft!==null);
  const operation=useRef<AbortController|null>(null),attempt=useRef<{key:string;body:Command}|null>(null),expire=useRef(onSessionExpired);expire.current=onSessionExpired;
  useEffect(()=>()=>{operation.current?.abort();attempt.current=null;},[]);
  useEffect(()=>{
    const controller=new AbortController();setCatalog(null);setLoading(true);setError('');
    void(async()=>{try{
      const response=await fetch(api+'/api/v1/finance/services',{headers:{Authorization:'Bearer '+token,'X-Clinic-Id':clinicId},cache:'no-store',credentials:'omit',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
      if(response.status===401){if(!controller.signal.aborted)expire.current();return;}if(!response.ok)throw Error('read');
      const parsed=FinanceCatalogSchema.safeParse(await response.json());if(!parsed.success)throw Error('read');if(!controller.signal.aborted)setCatalog(parsed.data);
    }catch{if(!controller.signal.aborted)setError('Le catalogue est indisponible. Réessayez.');}finally{if(!controller.signal.aborted)setLoading(false);}})();
    return()=>controller.abort();
  },[api,token,clinicId,reload]);
  function edit(item?:Catalog['items'][number]){
    opener.current=document.activeElement as HTMLElement;setConfirmClose(false);setError('');setNotice('');const next:Draft=item?{service_id:item.service_id,expected_version:item.price_version,code:item.code,label:item.label,category:item.category??'',amount:(item.unit_amount_minor/100).toFixed(2),archived:item.archived}:{service_id:null,expected_version:0,code:'SRV-'+requestKey().toUpperCase(),label:'',category:'',amount:'',archived:false};initialDraft.current=JSON.stringify(next);setDraft(next);
  }
  async function save(){
    if(!draft||operation.current)return;
    if(!attempt.current){try{
      const parsed=FinanceCatalogCommandSchema.safeParse({service_id:draft.service_id,expected_version:draft.expected_version,code:draft.code.trim().toUpperCase(),label:draft.label.trim(),category:draft.category.trim()||null,unit_amount_minor:Number(parseMadMinorUnits(draft.amount.trim().replace(',','.'))),archived:draft.archived});
      if(!parsed.success)throw Error('input');attempt.current={key:requestKey(),body:parsed.data};
    }catch{setError('Vérifiez le libellé et le prix positif (deux décimales maximum).');return;}}
    const command=attempt.current,wasUncertain=uncertain,controller=new AbortController();operation.current=controller;setSaving(true);setError('');
    try{
      const response=await fetch(api+'/api/v1/finance/services',{method:'POST',headers:{Authorization:'Bearer '+token,'X-Clinic-Id':clinicId,'Content-Type':'application/json','Idempotency-Key':command.key},body:JSON.stringify(command.body),cache:'no-store',credentials:'omit',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
      if(controller.signal.aborted)return;if(response.status===401){expire.current();return;}
      if(!response.ok){if(!wasUncertain&&[400,403,404,409].includes(response.status)){attempt.current=null;setError(response.status===409?'La prestation existe déjà ou a changé. Fermez le formulaire, actualisez puis réessayez.':'Enregistrement refusé. Vérifiez vos droits et les champs.');return;}throw Error('uncertain');}
      const parsed=FinanceCatalogReceiptSchema.safeParse(await response.json());const sent=command.body;
      if(!parsed.success)throw Error('receipt');const result=parsed.data;
      if((sent.service_id&&result.service_id!==sent.service_id)||result.price_version!==sent.expected_version+1||result.unit_amount_minor!==sent.unit_amount_minor||result.code!==sent.code||result.label!==sent.label||result.category!==(sent.category||null)||result.archived!==sent.archived)throw Error('receipt');
      if(controller.signal.aborted)return;attempt.current=null;restoreFocus.current=true;setLoading(true);setUncertain(false);setDraft(null);setNotice('Prestation enregistrée · version '+result.price_version);setReload(value=>value+1);
    }catch{if(!controller.signal.aborted){setUncertain(true);setError('Résultat à vérifier : la prestation peut déjà être enregistrée. Réessayez la même commande.');}}
    finally{if(operation.current===controller)operation.current=null;if(!controller.signal.aborted)setSaving(false);}
  }
  const locked=!!draft||saving||uncertain;

  const items=catalog?.items.filter(item=>(status==='all'||item.archived===(status==='archived'))&&(category==='all'||(item.category??'Sans catégorie')===category)&&(item.label+' '+(item.category??'')).toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr')))??[];
  const pages=Math.max(1,Math.ceil(items.length/10)),currentPage=Math.min(page,pages);
  const categories=[...new Set(catalog?.items.map(item=>item.category??'Sans catégorie')??[])].sort((a,b)=>a.localeCompare(b,'fr'));
  const selectStatus=(value:typeof status)=>{setStatus(value);setPage(1);};
  return <section className="finance-catalog" aria-labelledby="finance-catalog-title" aria-busy={loading||saving}>
    <header><div><p className="eyebrow">FINANCE · PRESTATIONS</p><h1 id="finance-catalog-title" tabIndex={-1}>Catalogue tarifaire</h1><p>Vos services, leurs catégories et leurs tarifs en MAD.</p></div><button aria-label="Actualiser le catalogue" title="Actualiser le catalogue" className="catalog-icon-button" disabled={locked||loading} onClick={()=>setReload(value=>value+1)}><RefreshCw size={18}/></button><button className="catalog-primary" disabled={locked||loading} onClick={()=>edit()}><Plus size={18}/>Ajouter une prestation</button></header>
    <div className="catalog-stats">
      <button disabled={locked||loading} aria-pressed={status==='active'} onClick={()=>selectStatus('active')}><BookOpen/><span><strong>{catalog?.items.filter(item=>!item.archived).length??'—'}</strong><span>Prestations actives</span></span><ArrowUpRight size={17}/></button>
      <button disabled={locked||loading} aria-pressed={status==='archived'} onClick={()=>selectStatus('archived')}><Archive/><span><strong>{catalog?.items.filter(item=>item.archived).length??'—'}</strong><span>Archivées</span></span><ArrowUpRight size={17}/></button>
      <button className="catalog-patients-link" disabled={locked} onClick={onOpenPatients}><Users/><span><strong>Dossiers &amp; devis</strong><span>Utiliser le catalogue pour un patient</span></span><ArrowUpRight size={17}/></button>
    </div>
    <section className="catalog-directory" aria-label="Prestations du cabinet">
      <div className="catalog-directory-heading"><h2>Prestations</h2><div className="catalog-status-filter" role="group" aria-label="Statut des prestations">{([['active','Actives'],['archived','Archivées'],['all','Toutes']] as const).map(([value,label])=><button key={value} aria-label={label} disabled={locked} aria-pressed={status===value} onClick={()=>selectStatus(value)}>{label}<span className="catalog-status-count" aria-hidden="true">{catalog?.items.filter(item=>value==='all'||item.archived===(value==='archived')).length??'—'}</span></button>)}</div></div>
      <div className="catalog-toolbar"><label><Search size={18}/><input aria-label="Rechercher une prestation" placeholder="Nom de la prestation…" disabled={locked} value={query} onChange={event=>{setQuery(event.target.value);setPage(1);}}/>{query&&<button className="catalog-clear" aria-label="Effacer la recherche" disabled={locked} onClick={()=>{setQuery('');setPage(1);}}><X size={15}/></button>}</label><select aria-label="Filtrer les prestations par catégorie" value={category} disabled={locked||loading} onChange={event=>{setCategory(event.target.value);setPage(1);}}><option value="all">Toutes les catégories</option>{categories.map(value=><option key={value}>{value}</option>)}</select></div>
      {error&&!draft&&<Feedback title={error} tone="danger"/>}{notice&&<Feedback title={notice} tone="success" onDismiss={()=>setNotice('')}/>}{loading&&<p className="catalog-empty" role="status">Chargement du catalogue…</p>}
    {draft&&<Modal mobilePresentation="sheet" open onOpenChange={open=>{if(!open)close();}} closeDisabled={saving||uncertain} returnFocus={opener.current} title={draft.service_id?'Modifier la prestation':'Nouvelle prestation'} description="Prestation et tarif en MAD. Les anciens devis restent inchangés." wide><form aria-label="Édition de prestation" className="catalog-editor" onSubmit={event=>{event.preventDefault();void save();}}>{error&&<p role="alert">{error}</p>}
      <fieldset disabled={saving||uncertain}><legend>Champs de la prestation</legend>
        <label>Libellé<input required maxLength={160} value={draft.label} onChange={event=>setDraft({...draft,label:event.target.value})}/></label>
        <div className="catalog-category-field"><label htmlFor="service-category">Catégorie</label><select id="service-category" value={draft.category} onChange={event=>setDraft({...draft,category:event.target.value})}><option value="">Choisir une catégorie</option>{draft.category&&!serviceCategories.includes(draft.category)&&<option value={draft.category}>{draft.category}</option>}{serviceCategories.map(category=><option key={category} value={category}>{category}</option>)}</select></div>
        <label>Prix en MAD<input required inputMode="decimal" value={draft.amount} onChange={event=>setDraft({...draft,amount:event.target.value})}/></label>
        {draft.service_id&&<label className="catalog-archived"><input type="checkbox" checked={draft.archived} onChange={event=>setDraft({...draft,archived:event.target.checked})}/>Archiver la prestation</label>}
      </fieldset><p>Les anciens devis conservent leurs montants. Nouveau tarif applicable aux prochains brouillons.</p>
      <div className="catalog-editor-actions"><button className="button button-primary" type="submit" disabled={saving}>{saving?'Enregistrement…':uncertain?'Réessayer la même commande':'Enregistrer la prestation'}</button><button className="button" type="button" disabled={saving||uncertain} onClick={close}>Fermer</button></div>{confirmClose&&<div className="catalog-discard" role="alert"><p>Abandonner les modifications non enregistrées ?</p><div><button className="button" type="button" onClick={()=>setConfirmClose(false)}>Continuer la saisie</button><button className="button" ref={discardButton} type="button" onClick={()=>{setConfirmClose(false);restoreFocus.current=true;setDraft(null);setError('');}}>Abandonner les modifications</button></div></div>}</form></Modal>}

      {!loading&&catalog&&!items.length&&<div className="catalog-empty"><Search size={25}/><h3>Aucune prestation pour ces filtres.</h3><button disabled={locked} onClick={()=>{setQuery('');setCategory('all');selectStatus('all');}}>Réinitialiser les filtres</button></div>}
      <ul className="catalog-list">{items.slice((currentPage-1)*10,currentPage*10).map(item=><li key={item.service_id} data-service-id={item.service_id}><span className="catalog-service-icon"><BookOpen size={21}/></span><div><small>{item.category??'Sans catégorie'}</small><strong>{item.label}</strong><span className="catalog-version">Version {item.price_version}</span></div><Badge tone={item.archived?'neutral':'success'}>{item.archived?'Archivée':'Active'}</Badge><strong className="catalog-price">{money(item.unit_amount_minor)}</strong><button disabled={locked} onClick={()=>edit(item)} aria-label={'Modifier '+item.label}><Pencil size={16}/><span>Modifier</span></button></li>)}</ul>
      {!loading&&catalog&&<div className="catalog-pagination"><span>{items.length} prestations · 10 par page</span><Pagination page={currentPage} totalPages={pages} onPageChange={value=>{if(!locked)setPage(value);}}/></div>}
    </section>
    <button className="catalog-mobile-patients" disabled={locked} onClick={onOpenPatients}><Users size={20}/><span><strong>Dossiers &amp; devis</strong><small>Utiliser le catalogue pour un patient</small></span><ArrowUpRight size={17}/></button>
    <details className="catalog-boundary"><summary>À propos des tarifs</summary><p>Catalogue fictif local · prix sans règle fiscale ni approbation clinique. Les devis existants conservent leurs montants. Aucun paiement effectué ici.</p></details>
  </section>;
}

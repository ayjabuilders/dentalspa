'use client';
import {sessionFetch as fetch} from '../../lib/renewing-session';

import {useConnectedNavigationLock} from '../../lib/connected-navigation';
import { useEffect, useRef, useState } from 'react';
import { QuoteCatalogSchema, QuoteDraftCommandSchema, QuoteDraftReceiptSchema, QuoteRevisionReceiptSchema, type PatientHub, type QuoteCatalog, type QuoteDraftCommand } from '@dental/contracts';
import { Plus, RefreshCw, Search, ChevronLeft, ChevronRight, FileText, LoaderCircle } from 'lucide-react';
import { Button, Modal } from '@dental/ui-clinic';
import './quote-draft-form.css';
type Props={api:string;token:string;clinicId:string;patientId:string;onSaved:()=>void;onSessionExpired:()=>void;revision?:PatientHub['quotes'][number]};
function requestKey(){const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]!&15)|64;bytes[8]=(bytes[8]!&63)|128;const h=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
export function QuoteDraftForm(props:Props){return <Form key={`${props.clinicId}:${props.patientId}:${props.token}:${props.revision?.id??'new'}:${props.revision?.version??0}`} {...props}/>;}
function Form({api,token,clinicId,patientId,onSaved,onSessionExpired,revision}:Props){
  const [open,setOpen]=useState(false),[catalog,setCatalog]=useState<QuoteCatalog|null>(null),[quantities,setQuantities]=useState<Record<string,number>>({}),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState('');
  const [query,setQuery]=useState(''),[page,setPage]=useState(1),[selectedOnly,setSelectedOnly]=useState(false),[dirty,setDirty]=useState(false),[discard,setDiscard]=useState(false);
  const trigger=useRef<HTMLButtonElement>(null),search=useRef<HTMLInputElement>(null);
  useConnectedNavigationLock(open||busy||uncertain);
  const operation=useRef<AbortController|null>(null),attempt=useRef<{key:string;body:QuoteDraftCommand&{expected_version?:number};total:number}|null>(null);
  useEffect(()=>()=>{operation.current?.abort();attempt.current=null;},[]);
  useEffect(()=>{if(open&&!loading&&!discard){const frame=requestAnimationFrame(()=>search.current?.focus());return()=>cancelAnimationFrame(frame);}},[open,loading,discard]);
  const headers={Authorization:`Bearer ${token}`,'X-Clinic-Id':clinicId};
  async function load(){
    if(operation.current||attempt.current)return;
    const controller=new AbortController();operation.current=controller;setLoading(true);setError('');setOpen(true);setCatalog(null);setQuantities({});setQuery('');setPage(1);setSelectedOnly(false);setDirty(false);setDiscard(false);
    try{const response=await fetch(`${api}/api/v1/finance/catalog`,{headers,cache:'no-store',credentials:'omit',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
      if(response.status===401){onSessionExpired();return;}
      if(!response.ok)throw Error('catalog');
      const result=QuoteCatalogSchema.safeParse(await response.json());if(!result.success)throw Error('catalog');
      if(!controller.signal.aborted){
        if(revision){
          const lines=revision.details?.lines;
          if(!lines?.length||lines.some(line=>!line.service_id||!result.data.items.some(item=>item.service_id===line.service_id)))throw Error('catalog');
          setQuantities(Object.fromEntries(lines.map(line=>[line.service_id!,line.quantity])));
        }
        setCatalog(result.data);
      }
    }catch{if(!controller.signal.aborted)setError('Catalogue indisponible. Réessayez.');}
    finally{if(!controller.signal.aborted)setLoading(false);if(operation.current===controller)operation.current=null;}
  }
  const total=catalog?.items.reduce((sum,item)=>sum+item.unit_amount_minor*(quantities[item.service_id]||0),0)??0;
  const selectedCount=catalog?.items.filter(item=>(quantities[item.service_id]??0)>0).length??0;
  const filtered=catalog?.items.filter(item=>(!selectedOnly||!!quantities[item.service_id])&&item.label.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr')))??[];
  const pages=Math.max(1,Math.ceil(filtered.length/6)),currentPage=Math.min(page,pages),visible=filtered.slice((currentPage-1)*6,currentPage*6);
  const locked=loading||busy||uncertain;
  function closeEditor(){if(locked)return;if(dirty)setDiscard(true);else setOpen(false);}
  const money=(amount:number)=>new Intl.NumberFormat('fr-MA',{style:'currency',currency:'MAD'}).format(amount/100);
  async function save(){
    if(operation.current||!catalog)return;
    if(!attempt.current){
      const parsed=QuoteDraftCommandSchema.safeParse({lines:catalog.items.filter(item=>(quantities[item.service_id]??0)>0).map(item=>({service_id:item.service_id,price_version:item.price_version,quantity:quantities[item.service_id]}))});
      if(!parsed.success||total>1000000000000){setError('Sélectionnez des prestations et des quantités de 1 à 100.');return;}
      attempt.current={key:requestKey(),body:revision?{...parsed.data,expected_version:revision.version}:parsed.data,total};
    }
    const command=attempt.current,wasUncertain=uncertain;const controller=new AbortController();operation.current=controller;setBusy(true);setError('');
    try{
      const response=await fetch(`${api}/api/v1/finance/patients/${patientId}/quotes${revision?`/${revision.id}/revisions`:''}`,{method:'POST',headers:{...headers,'Content-Type':'application/json','Idempotency-Key':command.key},body:JSON.stringify(command.body),cache:'no-store',credentials:'omit',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
      if(controller.signal.aborted)return;
      if(response.status===401){onSessionExpired();return;}
      if(!response.ok){
        if(!wasUncertain&&[400,403,404,409].includes(response.status)){attempt.current=null;setUncertain(false);setError(response.status===409?'Le tarif ou la version du devis a changé. Fermez le formulaire et actualisez le dossier.':'Création refusée. Vérifiez les prestations et vos droits.');return;}
        throw Error('uncertain');
      }
      const receipt=(revision?QuoteRevisionReceiptSchema:QuoteDraftReceiptSchema).safeParse(await response.json());
      if(!receipt.success||receipt.data.patient_id!==patientId||receipt.data.total_minor!==command.total||(revision&&(receipt.data.quote_id!==revision.id||receipt.data.version!==revision.version+1)))throw Error('receipt');
      if(controller.signal.aborted)return;
      attempt.current=null;setUncertain(false);setOpen(false);onSaved();
    }catch{if(!controller.signal.aborted){setUncertain(true);setError('Résultat à vérifier : le brouillon peut déjà être enregistré. Réessayez la même commande.');}}
    finally{if(operation.current===controller)operation.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  return <><button ref={trigger} type="button" className="quote-create-button" onClick={()=>void load()}><Plus size={18}/>{revision?'Modifier ce brouillon':'Nouveau devis brouillon'}</button>
    <Modal mobilePresentation="sheet" open={open} wide className="quote-editor-modal" title={revision?'Modifier le devis brouillon':'Nouveau devis brouillon'} description={revision?`Version ${revision.version} · tarifs actuels du catalogue; version précédente conservée.`:'Choisissez les prestations et leurs quantités.'} closeDisabled={locked} returnFocus={trigger.current??undefined} onOpenChange={next=>{if(!next)closeEditor();}}>
      {discard?<div className="quote-editor-discard" role="alert"><FileText size={26}/><h3>Abandonner les modifications ?</h3><p>Votre sélection n’a pas été enregistrée.</p><div><Button type="button" onClick={()=>setDiscard(false)}>Continuer la modification</Button><Button type="button" variant="primary" onClick={()=>{setDiscard(false);setDirty(false);setOpen(false);}}>Abandonner les modifications</Button></div></div>:<section className="quote-draft-form quote-editor" aria-label={revision?'Modifier le devis brouillon':'Nouveau devis brouillon'} aria-busy={loading||busy}>
        <p className="quote-editor-context">Catalogue fictif · MAD · sans remise ni taxe. Aucune émission ni publication.</p>
        <div className="quote-editor-toolbar"><label className="quote-editor-search"><Search size={17}/><input ref={search} aria-label="Rechercher une prestation pour le devis" value={query} disabled={locked} placeholder="Rechercher une prestation…" onChange={event=>{setQuery(event.target.value);setPage(1);}}/></label><button type="button" disabled={locked} className="quote-editor-reload" aria-label="Recharger le catalogue" title="Recharger le catalogue" onClick={()=>{if(dirty)setError('Fermez ou enregistrez le brouillon avant de recharger le catalogue.');else void load();}}><RefreshCw size={17}/></button></div>
        <div className="quote-editor-filters" role="group" aria-label="Afficher les prestations du devis"><button type="button" disabled={locked} aria-pressed={!selectedOnly} onClick={()=>{setSelectedOnly(false);setPage(1);}}>Catalogue <span>{catalog?.items.length??0}</span></button><button type="button" disabled={locked} aria-pressed={selectedOnly} onClick={()=>{setSelectedOnly(true);setPage(1);}}>Sélection <span>{selectedCount}</span></button></div>
        {loading&&<p className="quote-editor-loading" role="status"><LoaderCircle size={20}/>Chargement du catalogue…</p>}{error&&<p className="quote-editor-error" role="alert">{error}</p>}
        {!loading&&catalog&&filtered.length===0&&<div className="quote-editor-empty"><FileText size={24}/><strong>{catalog.items.length===0?'Aucune prestation disponible.':selectedOnly?'Aucune prestation sélectionnée pour ce filtre.':'Aucune prestation trouvée.'}</strong><span>{query?'Essayez un autre terme.':'Choisissez une prestation dans le catalogue.'}</span></div>}
        <fieldset className="quote-editor-list" disabled={locked}><legend>Prestations</legend>{visible.map(item=><div className="quote-draft-line" data-selected={!!quantities[item.service_id]} key={item.service_id}>
          <label><input type="checkbox" checked={!!quantities[item.service_id]} onChange={event=>{setQuantities({...quantities,[item.service_id]:event.target.checked?1:0});setDirty(true);}}/><span>{item.label}<small>{money(item.unit_amount_minor)} · version {item.price_version}</small></span></label>
          {!!quantities[item.service_id]&&<label>Quantité<input type="number" min={1} max={100} step={1} value={quantities[item.service_id]} onChange={event=>{setQuantities({...quantities,[item.service_id]:Math.max(1,Math.min(100,Number(event.target.value)||1))});setDirty(true);}}/></label>}
        </div>)}</fieldset>
        {pages>1&&<nav className="quote-editor-pagination" aria-label="Pages du catalogue de devis"><span>{currentPage} / {pages} · {filtered.length} prestations</span><button type="button" disabled={locked||currentPage<=1} aria-label="Prestations précédentes" onClick={()=>setPage(currentPage-1)}><ChevronLeft size={18}/></button><button type="button" disabled={locked||currentPage>=pages} aria-label="Prestations suivantes" onClick={()=>setPage(currentPage+1)}><ChevronRight size={18}/></button></nav>}
        <footer className="quote-editor-footer"><div className="quote-draft-total"><span>Total du brouillon<small>{selectedCount} prestation{selectedCount>1?'s':''}</small></span><strong>{money(total)}</strong></div><div className="quote-editor-actions"><Button type="button" disabled={locked} onClick={closeEditor}>Annuler</Button><Button type="button" variant="primary" disabled={loading||busy||(!uncertain&&!total)} onClick={()=>void save()}>{busy?<><LoaderCircle size={17}/>Enregistrement…</>:uncertain?'Réessayer la même création':revision?'Enregistrer la nouvelle version':'Enregistrer le brouillon'}</Button></div></footer>
      </section>}
    </Modal></>;
}

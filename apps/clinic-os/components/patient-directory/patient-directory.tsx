'use client';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, ArrowUpRight, Search, Users, CalendarDays, Inbox, LayoutGrid, LoaderCircle, List, RefreshCw, ShieldCheck, SlidersHorizontal, UserRound, WifiOff, X } from 'lucide-react';
import { Button, Modal } from '@dental/ui-clinic';
import type { PatientAdministrativeRecord } from '@dental/contracts';
import { PatientDirectoryError, type PatientDirectoryTransport } from './transport';
import './patient-directory.css';
import {PatientLookupError,type PatientLookupTransport} from '../patient-lookup/transport';
import {useConnectedNavigation} from '../../lib/connected-navigation';

type DirectoryPhase = 'loading' | 'ready' | 'offline' | 'denied' | 'unavailable';
const directoryCopy: Record<Exclude<DirectoryPhase, 'loading' | 'ready'>, string> = {
  offline: 'Connexion interrompue. La liste est masquée pour protéger les dossiers. Réessayez une fois la connexion rétablie.',
  denied: 'Votre session ne peut pas consulter le registre de ce cabinet.',
  unavailable: 'La réponse du cabinet n’a pas pu être vérifiée. Aucun dossier n’est affiché. Vous pouvez recharger le registre.',
};

export function PatientDirectory({ transport, onSessionExpired, renderProfile, initialPatientId, onOpenAgenda, onOpenRequests, lookupTransport, onPatientChange }: { transport: PatientDirectoryTransport; onSessionExpired: () => void; renderProfile?: (record: PatientAdministrativeRecord) => ReactNode; initialPatientId?: string | null; onPatientChange?:(id:string|null)=>void; onOpenAgenda?:()=>void; onOpenRequests?:()=>void; lookupTransport?:PatientLookupTransport|null }) {
  const {locked:navigationLocked}=useConnectedNavigation();
  const listHeading=useRef<HTMLHeadingElement>(null);
  const profileHeading=useRef<HTMLElement>(null);
  const searchInput=useRef<HTMLInputElement>(null);
  const lastRecord=useRef<string|null>(null);
  const listScroll=useRef(0);
  const restorePending=useRef(false);
  const directoryRoot=useRef<HTMLElement>(null);
  const profileOpen=useRef(false);
  const selectedRequest=useRef<string|null>(null);
  const [filtersOpen,setFiltersOpen]=useState(false);
  function scrollSurface(){return window.matchMedia('(max-width: 700px)').matches?directoryRoot.current?.closest<HTMLElement>('.connected-module-content'):null;}
  function restoreList(){document.getElementById('directory-record-'+lastRecord.current)?.focus({preventScroll:true});const surface=scrollSurface();if(surface)surface.scrollTop=listScroll.current;else window.scrollTo({top:listScroll.current,behavior:'instant'});}
  const [phase, setPhase] = useState<DirectoryPhase>('loading');
  const [records, setRecords] = useState<PatientAdministrativeRecord[]>([]);
  const [profile, setProfile] = useState<PatientAdministrativeRecord | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [online, setOnline] = useState(true);
 const [query,setQuery]=useState('');
 const [directoryView,setDirectoryView]=useState<'list'|'cards'>('list');
 const [sort,setSort]=useState<'original'|'name'>('original');
 const [searchMode,setSearchMode]=useState<'loaded'|'name_prefix'|'reference_exact'>('loaded');
 const [searchResults,setSearchResults]=useState<PatientAdministrativeRecord[]|null>(null);
 const [searchBusy,setSearchBusy]=useState(false);const [searchError,setSearchError]=useState('');const [truncated,setTruncated]=useState(false);
 const searchRequest=useRef<AbortController|null>(null);
 function resetSearch(){searchRequest.current?.abort();setSearchResults(null);setSearchBusy(false);setSearchError('');setTruncated(false);setPage(1);}
 async function searchCabinet(){
  if(!lookupTransport||navigationLocked||searchMode==='loaded')return;
  searchRequest.current?.abort();const controller=new AbortController();searchRequest.current=controller;
  setSearchBusy(true);setSearchResults(null);setSearchError('');setTruncated(false);setPage(1);
  try{const result=await lookupTransport.lookup({mode:searchMode,query},controller.signal);
   if(!mounted.current||controller.signal.aborted)return;setSearchResults(result.items);setTruncated(result.truncated);
  }catch(error){if(!mounted.current||controller.signal.aborted)return;
   const kind=error instanceof PatientLookupError?error.kind:'unavailable';
   if(kind==='expired'){setRecords([]);setProfile(null);expiredCallback.current();return;}
   if(kind==='denied'||kind==='offline'){setRecords([]);setProfile(null);setPhase(kind);}
   setSearchError(kind==='invalid'?'Saisissez au moins deux caractères pour le nom, ou une référence complète.':'Recherche indisponible. Réessayez.');
  }finally{if(mounted.current&&!controller.signal.aborted)setSearchBusy(false);}
 }
const [page,setPage]=useState(1);
 const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
 const matching=searchMode!=='loaded'?(searchResults??[]):records.filter(r=>normalize(r.display_name+' '+r.reference).includes(normalize(query.trim())));
 const filtered=sort==='name'?[...matching].sort((a,b)=>a.display_name.localeCompare(b.display_name,'fr')):matching;
 const pages=Math.max(1,Math.ceil(filtered.length/10));const currentPage=Math.min(page,pages);
 const visible=filtered.slice((currentPage-1)*10,currentPage*10);
  const mounted = useRef(false);
  const directoryRequest = useRef<AbortController | null>(null);
  const profileRequest = useRef<AbortController | null>(null);
  const profileSequence = useRef(0);
  const expiredCallback = useRef(onSessionExpired);
  expiredCallback.current = onSessionExpired;

  async function loadDirectory() {
    if(navigationLocked)return;
    resetSearch();
    directoryRequest.current?.abort();
    profileRequest.current?.abort();
    const controller = new AbortController();
    directoryRequest.current = controller;
    setPhase('loading');
    setRecords([]);
    setProfile(null);
    setProfileError('');
    try {
      const result = await transport.list(controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      setRecords(result);
      setPhase('ready');
      selectedRequest.current=initialPatientId??null;
      if (initialPatientId) await openProfile(initialPatientId,false);
    } catch (error) {
      if (!mounted.current || controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
      const kind = error instanceof PatientDirectoryError ? error.kind : 'unavailable';
      if (kind === 'expired') { setRecords([]); setProfile(null); expiredCallback.current(); return; }
      setRecords([]);
      setProfile(null);
      setPhase(kind === 'offline' ? 'offline' : kind === 'denied' ? 'denied' : 'unavailable');
    }
  }

  async function openProfile(patientId: string, notify=true) {
    if(navigationLocked)return;
    if(!profileOpen.current){listScroll.current=scrollSurface()?.scrollTop??window.scrollY;lastRecord.current=patientId;}
    profileOpen.current=true;selectedRequest.current=patientId;
    if(notify)onPatientChange?.(patientId);
    const surface=scrollSurface();if(surface)surface.scrollTop=0;
    profileRequest.current?.abort();
    const controller = new AbortController();
    profileRequest.current = controller;
    const requestNumber = ++profileSequence.current;
    setProfile(null);
    setProfileError('');
    setProfileLoading(true);
    try {
      const result = await transport.find(patientId, controller.signal);
      if (!mounted.current || controller.signal.aborted || requestNumber !== profileSequence.current) return;
      setProfile(result);
    } catch (error) {
      if (!mounted.current || controller.signal.aborted || requestNumber !== profileSequence.current || (error instanceof DOMException && error.name === 'AbortError')) return;
      const kind = error instanceof PatientDirectoryError ? error.kind : 'unavailable';
      if (kind === 'expired') { setRecords([]); setProfile(null); expiredCallback.current(); return; }
      if (kind === 'not_found') {
        setRecords(current => current.filter(item => item.id !== patientId));
        setProfileError('Cette fiche n’est plus disponible dans le cabinet actif. Rechargez le registre pour vérifier son état.');
      } else if (kind === 'denied') setProfileError('Votre accès à cette fiche n’est pas autorisé. Demandez au responsable du cabinet de vérifier vos droits.');
      else if (kind === 'offline') setProfileError('Connexion interrompue. Le dossier est masqué pour le protéger. Réessayez une fois la connexion rétablie.');
      else setProfileError('La réponse de cette fiche n’a pas pu être vérifiée. Aucune donnée n’est affichée.');
      if (kind === 'denied' || kind === 'offline') { setRecords([]); setPhase(kind); }
    } finally {
      if (mounted.current && requestNumber === profileSequence.current) setProfileLoading(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    setQuery('');setSearchMode('loaded');setFiltersOpen(false);listScroll.current=0;lastRecord.current=null;profileOpen.current=false;
    const updateNetwork = () => {
      const nextOnline = navigator.onLine;
      setOnline(nextOnline);
      if (!nextOnline) {
        searchRequest.current?.abort();setSearchResults(null);
        directoryRequest.current?.abort();
        profileRequest.current?.abort();
        setRecords([]);
        setProfile(null);
        setProfileLoading(false);
        setProfileError('');
        setPhase('offline');
      }
    };
    updateNetwork();
    window.addEventListener('offline', updateNetwork);
    window.addEventListener('online', updateNetwork);
    if (navigator.onLine) void loadDirectory();
    return () => {
      mounted.current = false;
      searchRequest.current?.abort();
      directoryRequest.current?.abort();
      profileRequest.current?.abort();
      window.removeEventListener('offline', updateNetwork);
      window.removeEventListener('online', updateNetwork);
    };
  }, [transport]);

  const profileIndex=profile?filtered.findIndex(record=>record.id===profile.id):-1;
  useEffect(()=>{if(profile)profileHeading.current?.focus({preventScroll:true});},[profile]);
  function adjacentProfile(offset:number){
    const next=filtered[profileIndex+offset];if(next&&!profileLoading)void openProfile(next.id);
  }
  function closeProfile(notify=true){
    if(navigationLocked)return;
    restorePending.current=true;
    profileRequest.current?.abort();profileSequence.current++;setProfile(null);setProfileError('');
    setProfileLoading(false);profileOpen.current=false;selectedRequest.current=null;
    if(notify)onPatientChange?.(null);
  }

  useEffect(()=>{
    const requested=initialPatientId??null;
    if(phase!=='ready'||requested===selectedRequest.current||navigationLocked)return;
    if(requested)void openProfile(requested,false);else closeProfile(false);
  },[initialPatientId,phase,navigationLocked]);

  const errorPhase = phase !== 'loading' && phase !== 'ready' ? phase : null;
  const showingProfile=phase==='ready'&&Boolean(profile||profileLoading||profileError);
  // A history-driven close starts in an effect: restore only after React has mounted the list.
  useLayoutEffect(()=>{if(phase==='ready'&&!showingProfile&&restorePending.current){restorePending.current=false;restoreList();}},[phase,showingProfile]);
  const resetDirectory=()=>{resetSearch();setQuery('');setSearchMode('loaded');setPage(1);};
  const initials=(name:string)=>name.replace(/\(FICTIF\)/gi,'').trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();
  const searchTools=<>
              {lookupTransport&&<select aria-label="Mode de recherche patient" value={searchMode} disabled={navigationLocked} onChange={event=>{resetSearch();setSearchMode(event.target.value as typeof searchMode);}}><option value="loaded">Dans la liste</option><option value="name_prefix">Cabinet · début du nom</option><option value="reference_exact">Cabinet · référence exacte</option></select>}
              <select aria-label="Trier les patients" value={sort} disabled={navigationLocked} onChange={event=>{setSort(event.target.value as typeof sort);setPage(1);}}><option value="original">Ordre du registre</option><option value="name">Nom A–Z</option></select>
              {searchMode!=='loaded'&&<Button type="submit" variant="primary" disabled={navigationLocked||searchBusy||!query.trim()}>{searchBusy?'Recherche…':'Rechercher'}</Button>}
  </>;
  return <section ref={directoryRoot} className="patient-directory" aria-label="Espace patients" data-profile={showingProfile}>
    {!showingProfile&&<>
      <header className="patient-directory-heading">
        <div><p className="eyebrow">LE CABINET · PATIENTS</p><h1 id="patient-directory-title">Vos patients</h1><p>Un dossier, toutes les informations utiles.</p></div>
        <Button type="button" variant="secondary" aria-label="Recharger les patients" onClick={() => void loadDirectory()} disabled={navigationLocked || !online || phase === 'loading'}><RefreshCw size={16}/><span>{phase === 'loading' ? 'Chargement…' : 'Recharger'}</span></Button>
      </header>
      {phase==='ready'&&<div className="patient-directory-dashboard">
        <button className="patient-directory-stat" disabled={navigationLocked} onClick={resetDirectory}><span className="directory-stat-icon"><Users size={22}/></span><span><small>Dossiers chargés</small><strong>{records.length}</strong><span>Afficher les patients <ArrowUpRight size={15}/></span></span></button>
        <button className="patient-directory-stat" disabled={navigationLocked} onClick={()=>searchInput.current?.focus()}><span className="directory-stat-icon"><Search size={22}/></span><span><small>Résultats de recherche</small><strong>{filtered.length}</strong><span>Retrouver un dossier <ArrowUpRight size={15}/></span></span></button>
        <div className="patient-directory-context"><ShieldCheck size={20}/><div><strong>Votre cabinet, vos dossiers</strong><p>{searchMode==='loaded'?'Jusqu’à 100 dossiers chargés. Utilisez la recherche cabinet pour retrouver les autres patients.':'Recherche limitée aux dossiers autorisés du cabinet.'}</p></div></div>
      </div>}
    </>}
    {phase === 'loading' && <div className="patient-directory-state" role="status"><LoaderCircle className="patient-directory-spin" size={22}/>Chargement des patients…</div>}
    {errorPhase && <div className="patient-directory-state patient-directory-error" role="alert">{errorPhase === 'offline' ? <WifiOff size={21}/> : <AlertCircle size={21}/>}<p>{directoryCopy[errorPhase]}</p></div>}
    {phase === 'ready' && <div className="patient-directory-layout" data-profile={showingProfile} data-shortcuts={Boolean(onOpenAgenda||onOpenRequests)}>
      {!showingProfile&&<>
        <section className="patient-directory-list" aria-label="Patients autorisés" data-view={directoryView}>
          <header><div><h2 ref={listHeading} tabIndex={-1}>Annuaire patients</h2><span>{filtered.length} résultats</span></div><div className="patient-directory-view" role="group" aria-label="Présentation des patients"><button type="button" aria-pressed={directoryView==='list'} disabled={navigationLocked} onClick={()=>setDirectoryView('list')}><List size={16}/>Liste</button><button type="button" aria-pressed={directoryView==='cards'} disabled={navigationLocked} onClick={()=>setDirectoryView('cards')}><LayoutGrid size={16}/>Cartes</button></div></header>
          <form className="patient-directory-search" onSubmit={event=>{event.preventDefault();void searchCabinet();}}>
            <div className="directory-search-field"><Search size={18}/><input ref={searchInput} aria-label={searchMode==='loaded'?'Rechercher un patient dans les dossiers chargés':'Rechercher un patient dans le cabinet'} placeholder={searchMode==='name_prefix'?'Début du nom…':searchMode==='reference_exact'?'Référence complète…':'Nom ou référence du dossier…'} value={query} disabled={navigationLocked} onChange={e=>{resetSearch();setQuery(e.target.value);}}/>{query&&<button type="button" aria-label="Effacer" disabled={navigationLocked} onClick={()=>{resetSearch();setQuery('');searchInput.current?.focus();}}><X size={16}/></button>}</div>
            <button type="button" className="directory-filter-toggle" aria-label="Recherche et tri" aria-haspopup="dialog" disabled={navigationLocked} onClick={()=>setFiltersOpen(value=>!value)}><SlidersHorizontal size={20}/></button>
            <div id="directory-search-tools" className="directory-search-tools">
              {searchTools}
            </div>
            {searchMode!=='loaded'&&<Button className="directory-mobile-search-submit" type="submit" disabled={navigationLocked||searchBusy||!query.trim()}>{searchBusy?'Recherche…':'Rechercher dans le cabinet'}</Button>}
          </form>
          <p className="directory-mobile-scope">{filtered.length} résultat{filtered.length>1?'s':''} · {searchMode==='loaded'?'dossiers chargés':'recherche cabinet'}</p>
          {(query||searchMode!=='loaded')&&<div className="directory-active-filter"><span>{searchMode==='loaded'?'Liste filtrée':searchMode==='name_prefix'?'Nom dans le cabinet':'Référence exacte'}{query&&(' · « '+query+' »')}</span><button type="button" disabled={navigationLocked} onClick={resetDirectory}>Réinitialiser <X size={13}/></button></div>}
          {searchError&&<p className="patient-directory-search-notice" role="alert">{searchError}</p>}
          {truncated&&<p className="patient-directory-search-notice" role="status">20 premiers résultats. Précisez votre recherche pour retrouver les autres dossiers.</p>}
          {searchBusy&&<p className="patient-directory-search-notice" role="status">Recherche dans le cabinet…</p>}
          {filtered.length===0?<div className="patient-directory-empty" role="status"><UserRound size={28}/><h3>{searchMode!=='loaded'&&searchResults===null?'Recherchez dans le cabinet.':'Aucun dossier trouvé.'}</h3><p>{searchMode!=='loaded'&&searchResults===null?'Saisissez votre recherche puis appuyez sur Rechercher.':'Essayez un autre nom ou une autre référence.'}</p></div>:<>
            {directoryView==='list'&&<div className="directory-column-labels" aria-hidden="true"><span>Patient</span><span>Référence du dossier</span><span/></div>}
            <ul className="directory-records">{visible.map(record=><li key={record.id}><button id={'directory-record-'+record.id} type="button" className="directory-record" aria-label={'Ouvrir la fiche de '+(record.display_name||'ce patient')} disabled={navigationLocked||profileLoading} onClick={()=>void openProfile(record.id)}><span className="patient-directory-avatar" aria-hidden="true">{initials(record.display_name)||'·'}</span><span className="directory-record-name"><strong>{record.display_name||'Nom non renseigné'}</strong><small>Dossier du cabinet</small></span><span className="directory-record-reference">{record.reference||'Référence non renseignée'}</span><span className="directory-record-open"><span>Ouvrir le dossier</span><ArrowUpRight size={18}/></span></button></li>)}</ul>
          </>}
          <footer className="patient-directory-pagination"><span>{filtered.length?((currentPage-1)*10+1)+'–'+Math.min(currentPage*10,filtered.length):'0'} sur {filtered.length}</span><Button variant="secondary" aria-label="Page précédente" disabled={navigationLocked||currentPage<=1} onClick={()=>setPage(currentPage-1)}><ArrowLeft size={16}/></Button><span>{currentPage} / {pages}</span><Button variant="secondary" aria-label="Page suivante" disabled={navigationLocked||currentPage>=pages} onClick={()=>setPage(currentPage+1)}><ArrowRight size={16}/></Button></footer>
        </section>
        {(onOpenAgenda||onOpenRequests)&&<aside className="directory-workflow"><span className="eyebrow">VOTRE ESPACE DE TRAVAIL</span><h2>La suite du parcours</h2><p>Gardez le lien entre les dossiers et l’activité du cabinet.</p><nav aria-label="Actions rapides patients">
          {onOpenAgenda&&<button type="button" aria-label="Agenda" disabled={navigationLocked} onClick={onOpenAgenda}><span className="directory-workflow-icon"><CalendarDays size={22}/></span><span><strong>Agenda</strong><small>Consulter les rendez-vous</small></span><ArrowUpRight size={17}/></button>}
          {onOpenRequests&&<button type="button" aria-label="Demandes" disabled={navigationLocked} onClick={onOpenRequests}><span className="directory-workflow-icon"><Inbox size={22}/></span><span><strong>Demandes</strong><small>Poursuivre les premiers contacts</small></span><ArrowUpRight size={17}/></button>}
        </nav><details className="patient-directory-help"><summary><ShieldCheck size={15}/>Accès aux dossiers</summary><p>Seuls les dossiers autorisés du cabinet sont consultables. Ouvrir une fiche ne vérifie pas l’identité et ne crée aucune association avec une demande.</p></details></aside>}
      </>}
      {showingProfile&&<section className="patient-directory-profile" aria-label="Dossier du patient" ref={profileHeading} tabIndex={-1}>
        <nav className="patient-record-path" aria-label="Parcours des dossiers patients">
          <button type="button" className="directory-back" aria-label="Retour à la liste" disabled={navigationLocked||profileLoading} onClick={()=>closeProfile()}><ArrowLeft size={17}/>Tous les patients</button>
          <span>{profileIndex>=0?(profileIndex+1)+' / '+filtered.length:'Dossier patient'}</span>
          <Button className="record-path-icon" aria-label="Patient précédent" title="Patient précédent" disabled={navigationLocked||profileLoading||profileIndex<=0} onClick={()=>adjacentProfile(-1)}><ArrowLeft size={16}/></Button>
          <Button className="record-path-icon" aria-label="Patient suivant" title="Patient suivant" disabled={navigationLocked||profileLoading||profileIndex<0||profileIndex>=filtered.length-1} onClick={()=>adjacentProfile(1)}><ArrowRight size={16}/></Button>
        </nav>
        {profileLoading?<div className="patient-directory-empty" role="status"><LoaderCircle className="patient-directory-spin"/><p>Chargement du dossier…</p></div>:profile?renderProfile?renderProfile(profile):<div className="directory-minimal-profile"><h1>{profile.display_name||'Nom non renseigné'}</h1><p>{profile.reference||'Référence non renseignée'}</p></div>:profileError?<div className="patient-directory-empty patient-directory-error" role="alert"><AlertCircle size={21}/><p>{profileError}</p></div>:null}
      </section>}
    </div>}
    <Modal open={filtersOpen} title="Recherche et tri" description="Choisissez où rechercher et comment présenter les résultats." mobilePresentation="sheet" onOpenChange={setFiltersOpen}>
      <form className="directory-filter-sheet" onSubmit={event=>{event.preventDefault();if(searchMode!=='loaded')void searchCabinet();setFiltersOpen(false);}}>
        <p>La liste contient jusqu’à 100 dossiers chargés. La recherche cabinet retrouve les autres dossiers autorisés par début du nom ou référence exacte.</p>
        <div className="directory-search-tools">{searchTools}</div>
        <Button type="button" onClick={()=>setFiltersOpen(false)}>Terminer</Button>
      </form>
    </Modal>
  </section>;
}

'use client';
import { useEffect, useRef, useState } from 'react';
import { Download, Monitor, Check } from 'lucide-react';
import { Button, Modal } from '@dental/ui-clinic';
type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
export function InstallControl() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [installing, setInstalling] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const updateRequested = useRef(false);
  useEffect(() => {
    let disposed = false;
    let removeWorkerListeners = () => {};
    const media = matchMedia('(display-mode: standalone)');
    const installedChanged = () => setInstalled(media.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    installedChanged(); media.addEventListener('change', installedChanged);
    const capture = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); };
    const done = () => { setInstalled(true); setPrompt(null); setOpen(false); };
    const controllerChanged = () => { if (updateRequested.current) { updateRequested.current = false; location.reload(); } };
    window.addEventListener('beforeinstallprompt', capture); window.addEventListener('appinstalled', done);
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js').then(registration => {
      if (disposed) return;
      if (registration.waiting) setWaiting(registration.waiting);
      const workerCleanups: Array<() => void> = [];
      const observeInstalling = () => {
        const worker = registration.installing;
        if (!worker) return;
        const changed = () => { if (!disposed && worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(worker); };
        worker.addEventListener('statechange', changed);
        workerCleanups.push(() => worker.removeEventListener('statechange', changed));
        changed();
      };
      registration.addEventListener('updatefound', observeInstalling);
      observeInstalling();
      removeWorkerListeners = () => { registration.removeEventListener('updatefound', observeInstalling); workerCleanups.forEach(remove => remove()); };
    }).catch(() => { /* The online app remains usable; never imply offline readiness. */ });
    return () => { disposed = true; removeWorkerListeners(); media.removeEventListener('change', installedChanged); window.removeEventListener('beforeinstallprompt', capture); window.removeEventListener('appinstalled', done); if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged); };
  }, []);
  async function install() {
    if (!prompt || installing) return;
    setInstalling(true); setError('');
    try { await prompt.prompt(); const result = await prompt.userChoice; if (result.outcome === 'accepted') setOpen(false); }
    catch { setError('L’installation n’a pas pu démarrer. Vous pouvez réessayer depuis le menu de votre navigateur.'); }
    finally { setPrompt(null); setInstalling(false); }
  }
  function update() {
    if (!waiting || updateRequested.current || !window.confirm('Actualiser l’application ? Les saisies non enregistrées seront perdues.')) return;
    updateRequested.current = true; setUpdating(true);
    try { waiting.postMessage({ type: 'ACTIVATE_UPDATE' }); }
    catch { updateRequested.current = false; setUpdating(false); setError('La mise à jour est indisponible. Réessayez après avoir conservé votre travail.'); }
  }
  return <><div className="install-actions">{waiting && <Button onClick={update} disabled={updating}>{updating ? 'Actualisation…' : 'Mise à jour disponible'}</Button>}{!installed && <button className="install-link" onClick={() => setOpen(true)}><Download size={14}/>Installer l’application</button>}</div>{error && !open && <p role="alert">{error}</p>}<Modal open={open} onOpenChange={setOpen} title="Votre cabinet, à portée de clic" description="Retrouvez Dental Spa dans sa propre fenêtre."><div className="install-illustration"><Monitor size={52}/><span>Dental Spa <small>CLINIC OS</small></span></div><p className="muted">L’installation dépend de votre navigateur. Les données patients ne sont jamais mises en cache hors connexion.</p>{error && <p role="alert">{error}</p>}{prompt ? <Button variant="primary" onClick={install} disabled={installing}><Download/>{installing ? 'Installation…' : 'Installer Dental Spa'}</Button> : <div className="install-guidance"><p><Check size={16}/>Chrome / Edge : ouvrez le menu du navigateur et choisissez « Installer » si proposé.</p><p><Check size={16}/>Sur iPhone / iPad : Safari → Partager → Sur l’écran d’accueil.</p><p>Dans un navigateur intégré, ouvrez cette adresse dans votre navigateur habituel.</p></div>}</Modal></>;
}

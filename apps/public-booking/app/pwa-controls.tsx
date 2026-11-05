'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export function InstallControl() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState(false);

  useEffect(() => {
    const mode = matchMedia('(display-mode: standalone)');
    const syncInstalled = () => setInstalled(mode.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    const capturePrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const installedEvent = () => { setInstalled(true); setOpen(false); setPrompt(null); };
    syncInstalled();
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      void navigator.serviceWorker.register('/sw.js').catch(() => { /* Online preview remains available when offline support cannot register. */ });
    }
    mode.addEventListener('change', syncInstalled);
    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', installedEvent);
    return () => {
      mode.removeEventListener('change', syncInstalled);
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', installedEvent);
    };
  }, []);

  async function install() {
    if (!prompt || installing) return;
    setInstalling(true);
    setInstallError(false);
    try {
      await prompt.prompt();
      const result = await prompt.userChoice;
      if (result.outcome === 'accepted') setOpen(false);
    } catch {
      setInstallError(true);
    } finally {
      setPrompt(null);
      setInstalling(false);
    }
  }

  if (installed) return <span className="installed-label">Application installée</span>;
  return <div className="install-control">
    <button className="install-button" type="button" aria-expanded={open} aria-controls="install-guidance" onClick={() => setOpen(value => !value)}><Download size={15}/><span>Installer l’aperçu</span></button>
    {open && <div className="install-guidance" id="install-guidance" role="status">
      {installError && <p role="alert">L’installation n’a pas pu démarrer. Réessayez depuis le menu de votre navigateur.</p>}
      {prompt ? <><strong>Retrouvez Dental Spa dans sa propre fenêtre.</strong><button className="install-confirm" type="button" onClick={() => void install()} disabled={installing}>{installing ? 'Ouverture…' : 'Continuer l’installation'}</button></> : <><strong>Ouvrir comme une application</strong><p>Dans le menu de votre navigateur, choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil » si cette option est proposée.</p><small>L’installation dépend de votre navigateur.</small></>}
    </div>}
  </div>;
}

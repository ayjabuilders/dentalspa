'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Banknote, CircleHelp, FileText, History, LockKeyhole, RotateCcw, WalletCards, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { createFinanceAcceptanceFixture, parseMadMinorUnits, summarizeDemoCollections, type DemoCollectionEvent } from './finance-demo-ledger';
import './finance-demo.css';
import Link from 'next/link';

const examples = [
  {
    id: 'DEMO-001', name: 'Salma Alaoui',
    lines: [{ id: 'example-a', label: 'Prestation d’exemple A', amount: 1200 }, { id: 'example-b', label: 'Prestation d’exemple B', amount: 650 }],
  },
  {
    id: 'DEMO-002', name: 'Youssef Benali',
    lines: [{ id: 'example-c', label: 'Prestation d’exemple C', amount: 950 }, { id: 'example-d', label: 'Prestation d’exemple D', amount: 400 }],
  },
] as const;

const formatMad = (amount: number) => new Intl.NumberFormat('fr-MA', {
  style: 'currency', currency: 'MAD', currencyDisplay: 'code', minimumFractionDigits: 0, maximumFractionDigits: 2,
}).format(amount);
const formatMadMinor = (amount: bigint) => formatMad(Number(amount) / 100);
const financeFixture = createFinanceAcceptanceFixture();

export function DemoFinanceWorkspace() {
  const [profileId, setProfileId] = useState<(typeof examples)[number]['id']>(examples[0].id);
  const [amount, setAmount] = useState('300');
  const [method, setMethod] = useState<DemoCollectionEvent['method']>('cash');
  const [events, setEvents] = useState<DemoCollectionEvent[]>([]);
  const [receipt, setReceipt] = useState(false);
  const [walkthroughStep, setWalkthroughStep] = useState(-1);
  const [activeStep, setActiveStep] = useState<1 | 2>(1);
  const previousStep = useRef(activeStep);
  const [error, setError] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'simulated' | 'pending'>('all');
  const [historyPage, setHistoryPage] = useState(1);
  const profile = examples.find(example => example.id === profileId)!;
  const quoteTotal = profile.lines.reduce((sum, line) => sum + line.amount, 0);
  const totalMinor = BigInt(quoteTotal) * 100n;
  const position = useMemo(() => summarizeDemoCollections(totalMinor, events), [totalMinor, events]);
  const filteredEvents = events.filter(event => historyFilter === 'all' || event.status === historyFilter);
  const historyPages = Math.max(1, Math.ceil(filteredEvents.length / 5));
  const visibleEvents = filteredEvents.slice((Math.min(historyPage, historyPages) - 1) * 5, Math.min(historyPage, historyPages) * 5);
  useEffect(() => {
    if (previousStep.current === activeStep) return;
    previousStep.current = activeStep;
    document.getElementById(activeStep === 1 ? 'finance-demo-patient-title' : 'finance-demo-payment-title')?.focus({ preventScroll: true });
  }, [activeStep]);
  const methodLabels: Record<DemoCollectionEvent['method'], string> = {
    cash: 'Espèces (simulation)',
    'card-terminal': 'Terminal carte (simulation)',
    'bank-transfer': 'Virement (en attente)',
  };
  const walkthroughSteps = [
    { title: 'Devis fictif préparé', detail: `Deux prestations génériques : ${formatMadMinor(financeFixture.quote.subtotalMinor)} de sous-total, remise illustrative de ${formatMadMinor(financeFixture.quote.discountMinor)}, taxe désactivée; total ${formatMadMinor(financeFixture.quote.totalMinor)}.` },
    { title: 'Acompte simulé', detail: `${formatMadMinor(financeFixture.depositMinor)} sont illustrés comme acompte. Le reste calculé est ${formatMadMinor(financeFixture.remainingAfterDepositMinor)}; aucun paiement n’est enregistré.` },
    { title: 'Échéances illustratives', detail: `Le reste est réparti en deux parts de ${formatMadMinor(financeFixture.installmentsMinor[0]!)} et ${formatMadMinor(financeFixture.installmentsMinor[1]!)}. Aucune date d’échéance ni règle du cabinet n’est configurée.` },
    { title: 'Versement partiel simulé', detail: `${formatMadMinor(financeFixture.partialPaymentMinor)} illustrés sur la première part laissent ${formatMadMinor(financeFixture.firstInstallmentRemainingMinor)} sur celle-ci et ${formatMadMinor(financeFixture.remainingAfterPartialMinor)} au total.` },
    { title: 'Nouvel essai idempotent', detail: `Le même versement est présenté deux fois, mais compté une seule fois : ${financeFixture.idempotentPaymentCount} paiements uniques et ${financeFixture.duplicatePaymentRetries} reprise ignorée. Le solde reste ${formatMadMinor(financeFixture.remainingAfterPartialMinor)}.` },
    { title: 'Remboursement distinct', detail: `Un remboursement fictif de ${formatMadMinor(10_000n)} est séparé du paiement et porte le solde illustratif à ${formatMadMinor(financeFixture.remainingAfterRefundMinor)}.` },
    { title: 'Avoir distinct', detail: `Un avoir fictif de ${formatMadMinor(10_000n)} est séparé du remboursement et porte le solde illustratif à ${formatMadMinor(financeFixture.remainingAfterCreditMinor)}.` },
    { title: 'Écart de caisse à expliquer', detail: `Attendu ${formatMadMinor(financeFixture.cashExpectedMinor)}, compté ${formatMadMinor(54_000n)}; l’écart calculé est ${formatMadMinor(financeFixture.cashDiscrepancyMinor)}. Aucune session de caisse n’est ouverte ni clôturée.` },
  ];

  function chooseProfile(nextId: string) {
    setProfileId(nextId as (typeof examples)[number]['id']);
    setEvents([]);
    setAmount('300');
    setError('');
    setReceipt(false);
    setWalkthroughStep(-1);
    setActiveStep(1);
    setHistoryFilter('all'); setHistoryPage(1);
  }

  function resetScenario() {
    setEvents([]);
    setAmount('300');
    setError('');
    setReceipt(false);
    setWalkthroughStep(-1);
    setActiveStep(1);
    setHistoryFilter('all'); setHistoryPage(1);
  }

  function simulateCollection() {
    try {
      const amountMinor = parseMadMinorUnits(amount.trim().replace(',', '.'));
      if (amountMinor <= 0n) throw new Error('Saisissez un montant positif en MAD.');
      setEvents(current => [...current, {
        id: current.length + 1,
        method,
        amountMinor,
        status: method === 'bank-transfer' ? 'pending' : 'simulated',
      }]);
      setError('');
      setReceipt(false);
      setHistoryFilter('all'); setHistoryPage(Math.ceil((events.length + 1) / 5));
    } catch {
      setError('Saisissez un montant positif en MAD, avec au maximum deux décimales (ex. 300,50).');
    }
  }

  const quoteCard = <section className="finance-demo-quote" aria-labelledby="finance-demo-patient-title">
    <div className="finance-demo-card-heading"><span className="finance-demo-icon"><FileText size={18}/></span><div><p className="eyebrow muted">{profile.id} · EXEMPLE</p><h2 id="finance-demo-patient-title" tabIndex={-1}>Devis de {profile.name}</h2></div><span className="finance-demo-status">Brouillon</span></div>
    <div className="finance-demo-line-labels" aria-hidden="true"><span>Prestations</span><span>Montant</span></div>
    <ul className="finance-demo-lines">{profile.lines.map(line => <li key={line.id}><span>{line.label}</span><strong>{formatMad(line.amount)}</strong></li>)}</ul>
    <div className="finance-demo-total"><span>Total indicatif</span><strong>{formatMad(quoteTotal)}</strong></div>
    {activeStep === 1 && <div className="finance-demo-next"><span>Prochaine étape<small>Tester l’effet d’un versement sur le solde.</small></span><button type="button" className="finance-demo-primary finance-demo-continue" onClick={() => setActiveStep(2)} aria-label="Continuer vers la simulation">Simuler un versement<ArrowRight size={17}/></button></div>}
  </section>;

  const paymentCard = <section className="finance-demo-payment" aria-labelledby="finance-demo-payment-title">
    <div className="finance-demo-card-heading"><span className="finance-demo-icon"><WalletCards size={18}/></span><div><p className="eyebrow muted">SIMULATION LOCALE</p><h2 id="finance-demo-payment-title" tabIndex={-1}>Règlements</h2></div><span className="finance-demo-status">{events.length} mouvement{events.length !== 1 ? 's' : ''}</span></div>
    <div className="finance-demo-amounts" aria-label="Situation financière simulée"><div><span>Devis</span><strong>{formatMad(quoteTotal)}</strong></div><div><span>Versements simulés</span><strong>{formatMadMinor(position.simulatedMinor)}</strong></div><div><span>En attente<small>Exclus du solde</small></span><strong>{formatMadMinor(position.pendingMinor)}</strong></div><div className="finance-demo-due"><span>Reste à régler</span><strong>{formatMadMinor(position.dueMinor)}</strong></div>{position.unappliedCreditMinor > 0n && <div><span>Crédit non affecté</span><strong>{formatMadMinor(position.unappliedCreditMinor)}</strong></div>}</div>
    <form className="finance-demo-collection-form" onSubmit={event => { event.preventDefault(); simulateCollection(); }}>
      <label htmlFor="finance-demo-collection-amount">Montant fictif · MAD</label>
      <input id="finance-demo-collection-amount" inputMode="decimal" value={amount} onChange={event => { setAmount(event.target.value); setError(''); }} aria-invalid={Boolean(error)} aria-describedby={error ? 'finance-amount-error' : undefined} />
      <label htmlFor="finance-demo-collection-method">Moyen de règlement fictif</label>
      <select id="finance-demo-collection-method" value={method} onChange={event => setMethod(event.target.value as DemoCollectionEvent['method'])}>
        <option value="cash">Espèces (simulation)</option>
        <option value="card-terminal">Terminal carte (simulation)</option>
        <option value="bank-transfer">Virement (en attente)</option>
      </select>
      <button type="submit" className="finance-demo-primary"><Banknote size={17}/>Simuler le versement</button>
      {error && <p id="finance-amount-error" className="finance-demo-error" role="alert">{error}</p>}
    </form>
    <div className="finance-demo-events" aria-label="Historique fictif des versements"><h3><History size={16}/>Historique des versements<span>{events.length}</span></h3>{events.length > 0 ? <><div className="finance-demo-history-filter" role="group" aria-label="Filtrer les versements fictifs">{(['all', 'simulated', 'pending'] as const).map(filter => <button key={filter} type="button" aria-pressed={historyFilter === filter} onClick={() => { setHistoryFilter(filter); setHistoryPage(1); }}>{filter === 'all' ? 'Tous' : filter === 'simulated' ? 'Simulés' : 'En attente'}</button>)}</div><ol>{visibleEvents.map(event => <li key={event.id}><span>{methodLabels[event.method]}</span><b>{formatMadMinor(event.amountMinor)}</b><strong className={event.status === 'pending' ? 'is-pending' : ''}>{event.status === 'pending' ? 'En attente · non compté' : 'Simulé · non encaissé'}</strong></li>)}</ol>{filteredEvents.length === 0 && <p className="finance-demo-empty">Aucun versement dans cette catégorie.</p>}{historyPages > 1 && <nav className="finance-demo-history-pages" aria-label="Pages de l’historique"><button type="button" disabled={historyPage <= 1} onClick={() => setHistoryPage(value => value - 1)}>Précédent</button><span>{Math.min(historyPage, historyPages)} / {historyPages}</span><button type="button" disabled={historyPage >= historyPages} onClick={() => setHistoryPage(value => value + 1)}>Suivant</button></nav>}</> : <p className="finance-demo-empty">Aucun versement simulé pour ce profil.</p>}</div>
    {position.simulatedMinor > 0n && <button type="button" className="finance-demo-secondary" onClick={() => setReceipt(value => !value)}>{receipt ? 'Masquer le reçu fictif' : 'Prévisualiser le reçu fictif'}</button>}
    {receipt && position.simulatedMinor > 0n && <div className="finance-demo-receipt" role="status" aria-live="polite"><strong>Reçu de démonstration · non comptable</strong><span>{profile.name} · {formatMadMinor(position.simulatedMinor)} · reçu non émis</span><small>Seuls les versements simulés apparaissent. Aucun mouvement d’argent ni document officiel n’a été créé.</small></div>}
  </section>;

  return <div className="finance-demo">
    <header className="finance-demo-heading">
      <div><p className="eyebrow muted">FINANCE · APERÇU</p><h1>Devis & règlements</h1></div>
      <span className="finance-demo-pill"><LockKeyhole size={14}/>Données fictives</span>
    </header>

    <div className="finance-demo-banner" role="note"><span className="finance-demo-demo-dot"/><strong>Simulation fictive · sans paiement réel</strong><details className="finance-demo-about"><summary><CircleHelp size={16}/>Limites de l’aperçu</summary><div><p>Tarifs d’exemple uniquement; aucune facture, dette ou opération n’est créée.</p><p>Aucun moyen de paiement n’est connecté. Les états et montants s’effacent au rechargement ou au changement de profil.</p><p>La facturation, les reçus officiels, les remboursements et le rapprochement restent à connecter.</p></div></details></div>

    <section className="finance-demo-panel" aria-labelledby="finance-demo-patient-title">
      <div className="finance-demo-toolbar">
        <span className="finance-demo-avatar" aria-hidden="true">{profile.name.split(' ').map(name => name[0]).join('')}</span>
        <div className="finance-demo-profile-control"><label htmlFor="finance-demo-profile">Profil d’exemple</label><select id="finance-demo-profile" aria-label="1 · Choisir un scénario fictif" value={profileId} onChange={event => chooseProfile(event.target.value)}>{examples.map(example => <option key={example.id} value={example.id}>{example.name} · FICTIF</option>)}</select></div>
      <div className="finance-demo-steps" role="group" aria-label="Parcours Finance de démonstration">
        <button type="button" aria-label="Relire le devis" aria-current={activeStep === 1 ? 'step' : undefined} onClick={() => setActiveStep(1)}><FileText size={17}/><strong>Devis</strong><span className="finance-demo-nav-tag">Brouillon</span></button>
        <button type="button" aria-label="Simuler un versement" aria-current={activeStep === 2 ? 'step' : undefined} onClick={() => setActiveStep(2)}><WalletCards size={17}/><strong>Règlements</strong><span className="finance-demo-nav-tag">{events.length}</span></button>
      </div>
        <button type="button" className="finance-demo-reset" onClick={resetScenario}><RotateCcw size={15}/>Réinitialiser</button>
      </div>

      <div className={`finance-demo-content${activeStep === 1 ? ' is-quote-step' : ''}`}>
        {quoteCard}
        {activeStep === 1 && <aside className="finance-demo-insight" aria-label="Parcours du devis fictif"><span className="finance-demo-insight-icon"><WalletCards size={22}/></span><p>DE LA PROPOSITION AU RÈGLEMENT</p><h2>Explorez le parcours.</h2><ol><li><CheckCircle2 size={17}/><span><strong>Relire le devis</strong><small>Deux prestations d’exemple</small></span></li><li><Banknote size={17}/><span><strong>Simuler un versement</strong><small>Espèces, carte ou virement en attente</small></span></li><li><History size={17}/><span><strong>Suivre le solde</strong><small>Historique et reçu non comptable</small></span></li></ol></aside>}
        {activeStep === 2 && paymentCard}
      </div>
    </section>
    <section className="finance-connected-entry" aria-label="Accéder à la finance connectée"><div><span className="finance-demo-icon"><LockKeyhole size={18}/></span><div><h2>Finance connectée</h2><p>Ouvrez les outils du cabinet avec votre compte.</p></div></div><nav aria-label="Outils financiers du cabinet"><Link href="/connection?view=finance-catalog">Gérer le catalogue tarifaire <ArrowUpRight size={16}/></Link><Link href="/connection?view=patients">Ouvrir les dossiers et devis <ArrowUpRight size={16}/></Link></nav></section>
    <details className="finance-demo-calculation">
      <summary>Scénario de calcul complet · chiffres fictifs</summary>
      <p>Fixture de vérification uniquement, taxe explicitement désactivée. Aucun devis, reçu, paiement ou solde n’est créé.</p>
      <ol>
        <li>2 prestations génériques × {formatMadMinor(50_000n)} = {formatMadMinor(financeFixture.quote.subtotalMinor)}; remise d’exemple de 10 % : −{formatMadMinor(financeFixture.quote.discountMinor)}; total : <strong>{formatMadMinor(financeFixture.quote.totalMinor)}</strong>.</li>
        <li>Acompte fictif de {formatMadMinor(financeFixture.depositMinor)} : reste {formatMadMinor(financeFixture.remainingAfterDepositMinor)}, réparti en {formatMadMinor(financeFixture.installmentsMinor[0]!)} + {formatMadMinor(financeFixture.installmentsMinor[1]!)}.</li>
        <li>Versement partiel illustratif de {formatMadMinor(financeFixture.partialPaymentMinor)} : {formatMadMinor(financeFixture.firstInstallmentRemainingMinor)} reste sur la première échéance; solde total {formatMadMinor(financeFixture.remainingAfterPartialMinor)}.</li>
        <li>Nouvel essai idempotent compté {financeFixture.duplicatePaymentRetries} fois sans ajouter de paiement; remboursement vérifié fictif de {formatMadMinor(10_000n)} sans avoir : solde {formatMadMinor(financeFixture.remainingAfterRefundMinor)}; avoir distinct de {formatMadMinor(10_000n)} : {formatMadMinor(financeFixture.remainingAfterCreditMinor)}.</li>
        <li>Caisse d’exemple : attendu {formatMadMinor(financeFixture.cashExpectedMinor)}, compté {formatMadMinor(54_000n)}, écart {formatMadMinor(financeFixture.cashDiscrepancyMinor)} à expliquer.</li>
      </ol>
      <section className="finance-demo-walkthrough" aria-label="Parcours financier fictif étape par étape">
        <p className="finance-demo-walkthrough-label">PARCOURS GUIDÉ · SIMULATION SEULEMENT</p>
        {walkthroughStep < 0 ? <button type="button" className="finance-demo-walkthrough-action" onClick={() => setWalkthroughStep(0)}>Parcourir les étapes</button> : <div className="finance-demo-walkthrough-current" role="region" aria-label={`Étape ${walkthroughStep + 1} sur ${walkthroughSteps.length}`} aria-live="polite">
          <div className="finance-demo-walkthrough-progress">
            <div className="finance-demo-walkthrough-track" role="progressbar" aria-label="Progression du parcours financier fictif" aria-valuemin={1} aria-valuemax={walkthroughSteps.length} aria-valuenow={walkthroughStep + 1} aria-valuetext={`Étape ${walkthroughStep + 1} sur ${walkthroughSteps.length}`}>
              <span style={{ width: `${((walkthroughStep + 1) / walkthroughSteps.length) * 100}%` }} />
            </div>
            <span className="finance-demo-walkthrough-count"><strong>{walkthroughStep + 1}</strong><span>sur {walkthroughSteps.length}</span></span>
          </div>
          <h3>{walkthroughSteps[walkthroughStep]!.title}</h3>
          <span>{walkthroughSteps[walkthroughStep]!.detail}</span>
          <div className="finance-demo-walkthrough-actions">
            {walkthroughStep > 0 && <button type="button" className="finance-demo-walkthrough-action secondary" onClick={() => setWalkthroughStep(value => Math.max(0, value - 1))}>Précédent</button>}
            <button type="button" className="finance-demo-walkthrough-action" onClick={() => setWalkthroughStep(value => value + 1 < walkthroughSteps.length ? value + 1 : -1)}>{walkthroughStep + 1 < walkthroughSteps.length ? 'Étape suivante' : 'Terminer le parcours'}</button>
          </div>
        </div>}
        <small>Les étapes ne changent aucun dossier ni solde. Cette fixture numérique ne constitue ni une règle tarifaire, ni un reçu, ni une approbation du cabinet.</small>
      </section>
      <small>Les montants ne sont ni les tarifs du cabinet ni une écriture comptable. Les règles réelles d’approbation, fiscalité, numérotation, remboursement et clôture doivent être configurées et validées avant tout usage connecté.</small>
    </details>
  </div>;
}

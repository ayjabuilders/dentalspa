'use client';
import { createRequestKey } from '../../lib/request-key';

import { useState } from 'react';
import { ArrowRightLeft, RotateCcw } from 'lucide-react';
import type { TeamRoster } from '@dental/contracts';
import { Button } from '@dental/ui-clinic';
import { checkDemoCandidate, demoStaffTasks } from './assignment-demo-fixtures';
import './team-delegation-preview.css';

type Member = TeamRoster['members'][number];
type DelegationStatus = 'pending' | 'accepted' | 'declined';
type DelegationProposal = {
  id: string;
  task: string;
  slot: string;
  owner: string;
  delegate: string;
  status: DelegationStatus;
};

const statusLabels: Record<DelegationStatus, string> = {
  pending: 'En attente dans cet aperçu',
  accepted: 'Acceptée dans cet aperçu',
  declined: 'Refusée dans cet aperçu',
};

export function TeamDelegationPreview({ members }: { members: Member[] }) {
  const [taskId, setTaskId] = useState(demoStaffTasks[0]!.id);
  const [slot, setSlot] = useState(demoStaffTasks[0]!.slots[0]!);
  const [delegateId, setDelegateId] = useState('');
  const [proposal, setProposal] = useState<DelegationProposal | null>(null);
  const task = demoStaffTasks.find(item => item.id === taskId) ?? demoStaffTasks[0]!;
  const owner = members.find(member => member.user_id === task.ownerUserId);
  const delegateChecks = members
    .filter(member => member.user_id !== task.ownerUserId)
    .map(member => checkDemoCandidate(member, task, slot));
  const selectedDelegate = delegateChecks.find(candidate => candidate.member.user_id === delegateId);
  const canPropose = task.delegable && Boolean(selectedDelegate?.matches) && Boolean(owner);

  function changeTask(nextTaskId: string) {
    const nextTask = demoStaffTasks.find(item => item.id === nextTaskId);
    if (!nextTask) return;
    setTaskId(nextTaskId);
    setSlot(nextTask.slots[0]!);
    setDelegateId('');
    setProposal(null);
  }

  function changeSlot(nextSlot: string) {
    setSlot(nextSlot);
    setDelegateId('');
    setProposal(null);
  }

  function propose() {
    if (!canPropose || !selectedDelegate || !owner) return;
    setProposal({
      id: createRequestKey(),
      task: task.label,
      slot,
      owner: owner.display_name,
      delegate: selectedDelegate.member.display_name,
      status: 'pending',
    });
  }

  return <section className="team-delegation-preview work-panel" aria-labelledby="team-delegation-title">
    <div className="team-delegation-heading">
      <span className="team-delegation-icon" aria-hidden="true"><ArrowRightLeft size={20}/></span>
      <div><p className="eyebrow">M16 · DÉMONSTRATION LOCALE</p><h2 id="team-delegation-title">Aperçu de délégation</h2></div>
    </div>
    <p className="team-delegation-intro">Examinez un transfert fictif entre deux membres de démonstration. La simulation vérifie d’abord si la tâche permet une délégation et si le remplaçant correspond aux critères fictifs.</p>
    <div className="team-delegation-caveat" role="note">Aucune délégation n’est envoyée ou enregistrée. Les autorisations, équipes, capacités, horaires et disponibilités sont des données de démo; ce scénario ne définit pas la politique du cabinet ni une suppléance clinique.</div>
    <div className="team-delegation-form">
      <label><span>Tâche d’exemple</span><select aria-label="Tâche de délégation d’exemple" value={taskId} onChange={event => changeTask(event.target.value)}>
        {demoStaffTasks.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label>
      <label><span>Créneau d’exemple</span><select aria-label="Créneau de délégation d’exemple" value={slot} onChange={event => changeSlot(event.target.value)}>
        {task.slots.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <label><span>Membre remplaçant fictif</span><select aria-label="Membre remplaçant fictif" value={delegateId} onChange={event => setDelegateId(event.target.value)} disabled={!task.delegable || !delegateChecks.some(candidate => candidate.matches)}>
        <option value="">Choisir un remplaçant</option>
        {delegateChecks.map(candidate => <option key={candidate.member.user_id} value={candidate.member.user_id} disabled={!candidate.matches}>
          {candidate.member.display_name}{candidate.matches ? ' · correspond au scénario' : ` · ${candidate.reasons[0]}`}
        </option>)}
      </select></label>
      <Button type="button" variant="primary" onClick={propose} disabled={!canPropose}>Simuler la proposition</Button>
    </div>
    <div className="team-delegation-summary" aria-live="polite">
      <p><strong>Responsable fictif :</strong> {task.ownerLabel}</p>
      <p><strong>Délégation dans le scénario :</strong> {task.delegable ? 'possible selon cette règle imaginaire' : 'désactivée pour cette tâche fictive'}</p>
      {!task.delegable && <p role="status">Cette tâche de démonstration ne peut pas être déléguée. Aucune proposition n’est créée.</p>}
      {task.delegable && !delegateChecks.some(candidate => candidate.matches) && <p role="status">Aucun remplaçant fictif ne correspond à ce créneau. Changez le créneau ou la tâche.</p>}
    </div>
    <div className="team-delegation-candidates" aria-label="Critères fictifs des remplaçants">
      <h3>Vérification des remplaçants à {slot}</h3>
      <ul>{delegateChecks.map(candidate => <li key={candidate.member.user_id}>
        <strong>{candidate.member.display_name}</strong>
        <span className={candidate.matches ? 'team-delegation-match' : 'team-delegation-no-match'}>{candidate.matches ? 'Correspond aux critères de démo' : candidate.reasons.join(' · ')}</span>
      </li>)}</ul>
    </div>
    <div className="team-delegation-result" aria-live="polite" aria-label="Résultat fictif de délégation">
      {!proposal ? <p>Aucune proposition de délégation dans cette session.</p> : <div>
        <strong>{proposal.task} · {proposal.slot}</strong>
        <span>{proposal.owner} → {proposal.delegate}</span>
        <span role="status">{statusLabels[proposal.status]}</span>
        {proposal.status === 'pending' && <div className="team-delegation-actions">
          <Button type="button" variant="primary" onClick={() => setProposal(current => current ? { ...current, status: 'accepted' } : null)}>Simuler l’acceptation du remplaçant</Button>
          <Button type="button" onClick={() => setProposal(current => current ? { ...current, status: 'declined' } : null)}>Simuler le refus</Button>
        </div>}
        <Button type="button" className="team-delegation-reset" onClick={() => setProposal(null)}><RotateCcw size={15}/>Effacer cette proposition</Button>
      </div>}
    </div>
  </section>;
}

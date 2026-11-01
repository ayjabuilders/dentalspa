'use client';
import { createRequestKey } from '../../lib/request-key';

import { useState } from 'react';
import { ClipboardCheck, RotateCcw } from 'lucide-react';
import type { TeamRoster } from '@dental/contracts';
import { Button } from '@dental/ui-clinic';
import { checkDemoCandidate, demoAccessRoleLabel, demoStaffTasks } from './assignment-demo-fixtures';
import './team-assignment-preview.css';

type Member = TeamRoster['members'][number];

type PreviewAssignment = {
  id: string;
  task: string;
  time: string;
  team: string;
  delegable: boolean;
  member: string;
  roles: string[];
};

export function TeamAssignmentPreview({ members }: { members: Member[] }) {
  const [taskId, setTaskId] = useState(demoStaffTasks[0]!.id);
  const [slot, setSlot] = useState(demoStaffTasks[0]!.slots[0]!);
  const [memberId, setMemberId] = useState('');
  const [assignments, setAssignments] = useState<PreviewAssignment[]>([]);
  const task = demoStaffTasks.find(item => item.id === taskId) ?? demoStaffTasks[0]!;
  const candidateChecks = members.map(member => checkDemoCandidate(member, task, slot));
  const selectedCheck = candidateChecks.find(candidate => candidate.member.user_id === memberId);

  function addPreview() {
    if (!selectedCheck?.matches) return;
    setAssignments(current => [{
      id: createRequestKey(),
      task: task.label,
      time: slot,
      team: task.teamLabel,
      delegable: task.delegable,
      member: selectedCheck.member.display_name,
      roles: selectedCheck.member.roles,
    }, ...current]);
  }

  function changeTask(nextTaskId: string) {
    const nextTask = demoStaffTasks.find(item => item.id === nextTaskId);
    if (!nextTask) return;
    setTaskId(nextTaskId);
    setSlot(nextTask.slots[0]!);
    setMemberId('');
  }

  return <section className="team-assignment-preview work-panel" aria-labelledby="team-assignment-title">
    <div className="team-assignment-heading">
      <span className="team-assignment-icon" aria-hidden="true"><ClipboardCheck size={20}/></span>
      <div><p className="eyebrow">M16 · DÉMONSTRATION LOCALE</p><h2 id="team-assignment-title">Aperçu d’affectation</h2></div>
    </div>
    <p className="team-assignment-explainer">Comparez les critères d’une proposition administrative fictive, puis choisissez manuellement un membre qui les satisfait dans ce scénario.</p>
    <div className="team-assignment-caveat" role="note">
      Règles, capacités, équipes, horaires et disponibilités entièrement fictifs : ils illustrent un calcul local, sans décrire le cabinet. Une capacité d’exemple ne prouve aucune qualification réelle. La proposition reste en mémoire uniquement, elle n’est ni enregistrée ni transmise; aucune autorisation clinique n’est déduite.
    </div>
    <div className="team-assignment-form">
      <label>
        <span>Tâche d’exemple</span>
        <select aria-label="Tâche d’exemple" value={taskId} onChange={event => changeTask(event.target.value)}>
          {demoStaffTasks.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <label>
        <span>Créneau d’exemple</span>
        <select aria-label="Créneau d’exemple" value={slot} onChange={event => { setSlot(event.target.value); setMemberId(''); }}>
          {task.slots.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label>
        <span>Membre correspondant aux critères fictifs</span>
        <select aria-label="Membre correspondant aux critères fictifs" value={memberId} onChange={event => setMemberId(event.target.value)} disabled={!candidateChecks.some(candidate => candidate.matches)}>
          <option value="">Choisir un membre</option>
          {candidateChecks.map(candidate => <option key={candidate.member.user_id} value={candidate.member.user_id} disabled={!candidate.matches}>
            {candidate.member.display_name}{candidate.matches ? ' · correspond au scénario' : ` · ${candidate.reasons[0]}`}
          </option>)}
        </select>
      </label>
      <Button type="button" variant="primary" onClick={addPreview} disabled={!selectedCheck?.matches}>
        Ajouter à l’aperçu
      </Button>
    </div>
    <dl className="team-assignment-context" aria-label="Critères fictifs de la tâche">
      <div><dt>Équipe de démonstration</dt><dd>{task.teamLabel}</dd></div>
      <div><dt>Capacité de démonstration</dt><dd>{task.capabilityLabel}</dd></div>
      <div><dt>Délégation de la tâche</dt><dd>{task.delegable ? 'Illustrée comme possible' : 'Illustrée comme non permise'}</dd></div>
    </dl>
    <div className="team-assignment-candidates" aria-label="Évaluation locale des candidats">
      <h3>Évaluation fictive à {slot}</h3>
      <ul>{candidateChecks.map(candidate => <li key={candidate.member.user_id}>
        <div><strong>{candidate.member.display_name}</strong><span>{candidate.member.roles.map(demoAccessRoleLabel).join(', ')} · horaire fictif {candidate.shiftLabel}</span></div>
        <span className={candidate.matches ? 'team-assignment-match' : 'team-assignment-no-match'}>{candidate.matches ? 'Correspond aux critères de démo' : candidate.reasons.join(' · ')}</span>
      </li>)}</ul>
      {!candidateChecks.some(candidate => candidate.matches) && <p role="status">Aucun membre ne correspond à ce créneau d’exemple. Changez de tâche ou de créneau; aucune affectation n’est créée.</p>}
    </div>
    <div className="team-assignment-list" aria-live="polite" aria-label="Propositions d’affectation fictives">
      {!assignments.length ? <p className="team-assignment-empty">Aucune proposition dans cette session.</p> : <>
        <div className="team-assignment-list-heading"><h3>Propositions de cette session</h3><Button type="button" onClick={() => setAssignments([])}><RotateCcw size={15}/>Effacer</Button></div>
        <ul>{assignments.map(assignment => <li key={assignment.id}>
          <div><strong>{assignment.task} · {assignment.time}</strong><span>{assignment.member} · {assignment.roles.map(demoAccessRoleLabel).join(', ')} · {assignment.team}</span><span>Délégation fictive : {assignment.delegable ? 'autorisée dans ce scénario' : 'non permise dans ce scénario'}</span></div>
          <span className="team-assignment-status">Non transmise</span>
        </li>)}</ul>
      </>}
    </div>
  </section>;
}

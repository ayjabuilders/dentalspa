'use client';
import { createRequestKey } from '../../lib/request-key';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronRight, CircleAlert, GitBranch, ListOrdered, Plus, RotateCcw, ShieldCheck, Trash2, Users } from 'lucide-react';
import { WorkflowTemplateVersionSchema, WorkflowTaskTemplateSchema, TeamRosterRoleSchema, type WorkflowTemplateVersion } from '@dental/contracts';
import './template-draft-editor.css';

const roleLabels = { assistant: 'Assistant(e)', dentist: 'Dentiste', manager: 'Gestionnaire', reception: 'Accueil' } as const;
const roleOrder = ['assistant', 'dentist', 'manager', 'reception'] as const;
type DraftTask = WorkflowTemplateVersion['tasks'][number] & { id: string };
const blankTask = (sequence: number): DraftTask => ({ id: createRequestKey(), key: `task_${sequence}`, title: '', assignee_roles: [], depends_on: [], required: false });
function describeIssue(path: PropertyKey[], message: string): string {
  if (path.includes('depends_on') && message.includes('Unknown task dependency')) return 'Une dépendance ne correspond plus à une tâche du modèle.';
  if (message.includes('acyclic')) return 'Ces dépendances créent une boucle. Réorganisez-les avant de continuer.';
  if (path.includes('assignee_roles')) return 'Choisissez au moins un rôle à proposer pour chaque tâche.';
  if (path.includes('title')) return 'Ajoutez un titre court à chaque tâche.';
  return message;
}

export function WorkflowTemplateDraftEditor() {
  const [title, setTitle] = useState('');
  const [tasks, setTasks] = useState<DraftTask[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [validated, setValidated] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const titleInput = useRef<HTMLInputElement>(null);
  const taskInput = useRef<HTMLInputElement>(null);
  const selectedButton = useRef<HTMLButtonElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const clearButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const clearDialog = useRef<HTMLDialogElement>(null);
  const pendingFocus = useRef<'title' | 'outline' | 'add' | null>(null);
  useEffect(() => {
    if (pendingFocus.current === 'title') taskInput.current?.focus();
    if (pendingFocus.current === 'outline') selectedButton.current?.focus();
    if (pendingFocus.current === 'add') addButton.current?.focus();
    pendingFocus.current = null;
  }, [selectedId, tasks]);

  const candidate = useMemo(() => {
    const parsedTasks = tasks.map(task => ({ key: task.key, title: task.title, assignee_roles: task.assignee_roles, depends_on: task.depends_on, required: task.required }));
    const taskResult = WorkflowTaskTemplateSchema.array().min(1).max(100).safeParse(parsedTasks);
    if (!taskResult.success) return { success: false as const, issues: taskResult.error.issues };
    const result = WorkflowTemplateVersionSchema.safeParse({ template_id: '00000000-0000-4000-8000-000000000001', clinic_id: null, version: 1, title, status: 'draft', created_by: '00000000-0000-4000-8000-000000000002', created_at: '2026-10-29T12:00:00Z', approved_by: null, approved_at: null, tasks: taskResult.data });
    return result.success ? { success: true as const, value: result.data } : { success: false as const, issues: result.error.issues };
  }, [tasks, title]);
  function invalidate() { setValidated(false); setSavedAt(null); }
  function patchTask(id: string, patch: Partial<DraftTask>) { setTasks(current => current.map(task => task.id === id ? { ...task, ...patch } : task)); invalidate(); }
  function addTask() {
    if (tasks.length >= 100) return;
    const sequence = tasks.reduce((maximum, task) => Math.max(maximum, Number(task.key.match(/^task_(\d+)$/)?.[1] ?? 0)), 0) + 1;
    const task = blankTask(sequence);
    pendingFocus.current = 'title'; setTasks(current => [...current, task]); setSelectedId(task.id); invalidate();
  }
  function selectTask(id: string) { if (id === selectedId) { taskInput.current?.focus(); return; } pendingFocus.current = 'title'; setSelectedId(id); }
  function removeTask(id: string) {
    const index = tasks.findIndex(task => task.id === id);
    const removed = tasks[index];
    const remaining = tasks.filter(task => task.id !== id).map(task => ({ ...task, depends_on: task.depends_on.filter(key => key !== removed?.key) }));
    pendingFocus.current = remaining.length ? 'outline' : 'add';
    setTasks(remaining); setSelectedId(remaining[Math.min(index, remaining.length - 1)]?.id ?? null); invalidate();
    setAnnouncement('Tâche supprimée. Ses dépendances ont été retirées du brouillon.');
  }
  function moveTask(id: string, direction: -1 | 1) {
    const index = tasks.findIndex(task => task.id === id), target = index + direction;
    if (index < 0 || target < 0 || target >= tasks.length) return;
    const next = [...tasks]; [next[index], next[target]] = [next[target]!, next[index]!];
    pendingFocus.current = 'outline'; setTasks(next); invalidate(); setAnnouncement(`Tâche déplacée en position ${target + 1}. Les dépendances sont inchangées.`);
  }
  function toggleRole(task: DraftTask, role: (typeof TeamRosterRoleSchema.options)[number]) { patchTask(task.id, { assignee_roles: task.assignee_roles.includes(role) ? task.assignee_roles.filter(current => current !== role) : [...task.assignee_roles, role].sort((a, b) => roleOrder.indexOf(a) - roleOrder.indexOf(b)) }); }
  function validateDraft() { setValidated(true); if (candidate.success) setSavedAt(new Date().toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })); }
  function clearDraft() { setTitle(''); setTasks([]); setSelectedId(null); invalidate(); setAnnouncement('Brouillon effacé.'); clearDialog.current?.close(); titleInput.current?.focus(); }
  function requestClear() { if (!title && !tasks.length) return; clearDialog.current?.showModal(); cancelButton.current?.focus(); }
  function cancelClear() { clearDialog.current?.close(); clearButton.current?.focus(); }
  const uniqueErrors = [...new Set(validated && !candidate.success ? candidate.issues.map(issue => describeIssue(issue.path, issue.message)) : [])];
  const selectedTask = tasks.find(task => task.id === selectedId);
  const selectedIndex = tasks.findIndex(task => task.id === selectedId);
  const dependencyCount = tasks.reduce((sum, task) => sum + task.depends_on.length, 0);

  return <div className="workflow-draft">
    <header className="workflow-draft-heading"><div><p className="workflow-draft-eyebrow">PLAYBOOK · CONSTRUCTION LOCALE</p><h1>Modèles de tâches</h1><p>Un plan de travail clair, une tâche à la fois.</p></div><span className="workflow-draft-badge"><GitBranch size={15}/>Brouillon uniquement</span></header>
    <div className="workflow-draft-callout" role="note"><ShieldCheck size={19}/><p><strong>Cette version ne démarre aucun parcours.</strong><span>Le brouillon reste dans cette page et s’efface au rechargement.</span></p></div>
    <section className="workflow-draft-panel" aria-labelledby="workflow-template-title">
      <div className="workflow-draft-panel-heading"><div><h2 id="workflow-template-title">Votre modèle</h2><p>Tâches opérationnelles uniquement, sans protocole clinique.</p></div><button ref={clearButton} type="button" className="workflow-draft-secondary" disabled={!title && !tasks.length} onClick={requestClear}><RotateCcw size={16}/>Effacer</button></div>
      <label className="workflow-draft-title">Nom du modèle<input ref={titleInput} value={title} onChange={event => { setTitle(event.target.value); invalidate(); }} maxLength={120} placeholder="Ex. Organisation administrative" /></label>
      <div className="workflow-draft-task-heading"><div className="workflow-draft-counts"><span><ListOrdered size={16}/>{tasks.length} tâche{tasks.length > 1 ? 's' : ''}</span><span><GitBranch size={15}/>{dependencyCount} dépendance{dependencyCount > 1 ? 's' : ''}</span></div><button ref={addButton} type="button" className="workflow-draft-primary" disabled={tasks.length >= 100} onClick={addTask}><Plus size={17}/>Ajouter une tâche</button></div>
      {!tasks.length ? <div className="workflow-draft-empty"><span><GitBranch size={28}/></span><h3>Commencez par une tâche</h3><p>Ajoutez une étape, puis choisissez ses rôles et ses dépendances.</p></div> : <div className="workflow-draft-workbench">
        <nav className="workflow-draft-outline" aria-label="Plan des tâches"><div className="workflow-draft-outline-heading"><h3>Ordre du modèle</h3><span>{tasks.length}/100</span></div><ol className="workflow-draft-tasks">{tasks.map((task, index) => <li key={task.id}><button ref={task.id === selectedId ? selectedButton : undefined} type="button" className="workflow-draft-task-select" aria-current={task.id === selectedId ? 'true' : undefined} aria-controls="workflow-task-editor" onClick={() => selectTask(task.id)}><span className="workflow-draft-step">{String(index + 1).padStart(2, '0')}</span><span className="workflow-draft-task-caption"><strong>{task.title.trim() || `Tâche ${index + 1}`}</strong><small>{task.assignee_roles.length ? task.assignee_roles.map(role => roleLabels[role]).join(' · ') : 'Rôle à choisir'}{task.required && <span className="workflow-draft-required-tag">Requise</span>}</small></span><ChevronRight size={16}/></button></li>)}</ol><p>L’ordre d’affichage et les dépendances se règlent séparément.</p></nav>
        {selectedTask && <section id="workflow-task-editor" className="workflow-draft-task" aria-labelledby="workflow-task-editor-title"><div className="workflow-draft-editor-heading"><div><span className="workflow-draft-eyebrow">TÂCHE {selectedIndex + 1} / {tasks.length}</span><h3 id="workflow-task-editor-title">Détails de la tâche</h3></div><div className="workflow-draft-task-actions"><button type="button" aria-label={`Monter ${selectedTask.title || `la tâche ${selectedIndex + 1}`}`} disabled={selectedIndex === 0} onClick={() => moveTask(selectedTask.id, -1)}><ArrowUp size={16}/></button><button type="button" aria-label={`Descendre ${selectedTask.title || `la tâche ${selectedIndex + 1}`}`} disabled={selectedIndex === tasks.length - 1} onClick={() => moveTask(selectedTask.id, 1)}><ArrowDown size={16}/></button><button className="workflow-draft-delete" type="button" aria-label={`Supprimer ${selectedTask.title || `la tâche ${selectedIndex + 1}`}`} onClick={() => removeTask(selectedTask.id)}><Trash2 size={16}/></button></div></div>
          <label className="workflow-draft-task-name">Titre de tâche<input ref={taskInput} value={selectedTask.title} onChange={event => patchTask(selectedTask.id, { title: event.target.value })} maxLength={120} placeholder="Décrire une tâche non clinique" /></label>
          <fieldset className="workflow-draft-roles"><legend><Users size={16}/>Rôles pressentis</legend><p>Propositions à valider séparément.</p><div>{TeamRosterRoleSchema.options.map(role => <label key={role} data-checked={selectedTask.assignee_roles.includes(role)}><input type="checkbox" checked={selectedTask.assignee_roles.includes(role)} onChange={() => toggleRole(selectedTask, role)}/>{roleLabels[role]}</label>)}</div></fieldset>
          <fieldset className="workflow-draft-dependencies"><legend><GitBranch size={16}/>À faire après</legend>{tasks.length > 1 ? <div>{tasks.filter(task => task.id !== selectedTask.id).map(task => <label key={task.id}><input type="checkbox" checked={selectedTask.depends_on.includes(task.key)} onChange={event => patchTask(selectedTask.id, { depends_on: event.target.checked ? [...selectedTask.depends_on, task.key] : selectedTask.depends_on.filter(key => key !== task.key) })}/><span>{task.title.trim() || `Tâche ${tasks.indexOf(task) + 1}`}</span></label>)}</div> : <p>Ajoutez une autre tâche pour définir une dépendance.</p>}</fieldset>
          <label className="workflow-draft-required"><input type="checkbox" checked={selectedTask.required} onChange={event => patchTask(selectedTask.id, { required: event.target.checked })}/><span>Cette étape est marquée comme requise dans le brouillon</span></label>
        </section>}
      </div>}
      {validated && uniqueErrors.length > 0 && <div className="workflow-draft-errors" role="alert"><strong><CircleAlert size={17}/>Le brouillon a besoin d’ajustements</strong><ul>{uniqueErrors.map(error => <li key={error}>{error}</li>)}</ul></div>}
      <div className="workflow-draft-footer"><div>{savedAt && candidate.success ? <p role="status" className="workflow-draft-success"><Check size={18}/>Brouillon valide sur cette page à {savedAt}. Rien n’a été transmis ni enregistré durablement.</p> : <p>La validation vérifie la structure du brouillon. Elle ne l’approuve pas pour le cabinet.</p>}</div><button type="button" className="workflow-draft-primary" onClick={validateDraft}><Check size={17}/>Valider ce brouillon</button></div>
    </section>
    <details className="workflow-draft-note"><summary>Portée de cette construction locale</summary><p>Aucun protocole clinique ni parcours affecté. Les définitions partagées, versions approuvées, instances actives, autorisations, historique et audit restent à construire avant tout usage du cabinet.</p></details>
    <span className="sr-only" aria-live="polite">{announcement}</span>
    <dialog ref={clearDialog} className="workflow-draft-dialog" aria-labelledby="workflow-clear-title" aria-describedby="workflow-clear-description" onCancel={event => { event.preventDefault(); cancelClear(); }}><span className="workflow-draft-dialog-icon"><Trash2 size={25}/></span><h2 id="workflow-clear-title">Effacer le brouillon ?</h2><p id="workflow-clear-description">Le nom du modèle et ses {tasks.length} tâche{tasks.length > 1 ? 's' : ''} seront retirés de cette page. Cette action ne peut pas être annulée.</p><div><button ref={cancelButton} type="button" className="workflow-draft-secondary" onClick={cancelClear}>Conserver le brouillon</button><button type="button" className="workflow-draft-danger" onClick={clearDraft}>Effacer le brouillon</button></div></dialog>
  </div>;
}

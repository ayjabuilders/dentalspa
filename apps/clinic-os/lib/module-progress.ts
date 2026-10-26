export type CriterionState = 'done' | 'partial' | 'planned';
export type ProgressLedger = { version: number; reviewedAt: string; method: string; modules: { id: string; source: string; criteria: { id: string; label: string; state: CriterionState; taskIds: string[]; evidence: string }[] }[] };
export type ModuleProgress = { percent: number; points: number; total: number; source: string; criteria: { id: string; label: string; state: CriterionState | 'awaiting'; evidence: string }[] };

export function calculateProgress(ledger: ProgressLedger, tasks: { id: string; state: string }[], moduleIds: string[]): Record<string, ModuleProgress> {
  if (ledger.version !== 1 || ledger.modules.length !== moduleIds.length || new Set(ledger.modules.map(module => module.id)).size !== moduleIds.length) throw new Error('Invalid module progress scope.');
  const taskStates = new Map(tasks.map(task => [task.id, task.state]));
  return Object.fromEntries(ledger.modules.map(module => {
    if (!moduleIds.includes(module.id) || module.criteria.length !== 6 || new Set(module.criteria.map(item => item.id)).size !== 6) throw new Error('Each PRD module must have six distinct criteria.');
    let points = 0;
    const criteria = module.criteria.map(item => {
      if (!['done', 'partial', 'planned'].includes(item.state) || !item.label || !item.id) throw new Error('Invalid progress criterion.');
      if (item.state !== 'planned' && (!item.evidence.trim() || item.taskIds.length === 0)) throw new Error('Credited progress requires delivery evidence.');
      if (item.taskIds.some(id => !taskStates.has(id))) throw new Error('Unknown progress evidence task.');
      const verified = item.taskIds.every(id => taskStates.get(id) === 'done');
      points += verified ? item.state === 'done' ? 1 : item.state === 'partial' ? .5 : 0 : 0;
      return { id: item.id, label: item.label, evidence: item.evidence, state: !verified && item.state !== 'planned' ? 'awaiting' as const : item.state };
    });
    return [module.id, { percent: Math.round(points / module.criteria.length * 100), points, total: module.criteria.length, source: module.source, criteria }];
  }));
}

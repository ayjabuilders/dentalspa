import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { calculateProgress, type ProgressLedger } from '../../apps/clinic-os/lib/module-progress';

const ledger = JSON.parse(readFileSync('docs/MODULE_PROGRESS.json', 'utf8')) as ProgressLedger;
const queue = JSON.parse(readFileSync('docs/WORK_QUEUE.json', 'utf8')) as { tasks: { id: string; state: string }[] };
const ids = Array.from({ length: 21 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`);
describe('module progress evidence', () => {
  it('covers all PRD modules and gives no functional points to UI-only previews', () => {
    const result = calculateProgress(ledger, queue.tasks, ids);
    expect(Object.keys(result)).toHaveLength(21);
    expect(result.M01?.percent).toBe(33);
    // The first-real-booking goal is now explicitly linked to M02-1 and remains
    // active. Synthetic delivery/pagination must not credit its real-use gate.
    expect(result.M02?.percent).toBe(33);
    expect(result.M02?.criteria.find(item => item.id === 'M02-1')?.state).toBe('awaiting');
    expect(result.M02?.criteria.find(item => item.id === 'M02-3')?.state).toBe('awaiting');
    expect(result.M16?.percent).toBe(50);
    // Catalogue and recorded local payments each earn partial credit;
    // active installment work and quote issuance do not earn points.
    expect(result.M14?.percent).toBe(17);
    expect(result.M14?.criteria.find(item => item.id === 'M14-4')?.state).toBe('partial');
    expect(result.M14?.criteria.find(item => item.id === 'M14-5')?.state).toBe('awaiting');
    // Private document import earns partial imaging-reference credit only.
    expect(result.M04?.percent).toBe(8);
    expect(result.M04?.criteria.find(item => item.id === 'M04-2')?.state).toBe('partial');
    for (const id of ['M06', 'M09', 'M17', 'M21']) expect(result[id]?.percent).toBe(0);
  });
  it('does not credit a task that is blocked or merely in verification', () => {
    for (const state of ['blocked', 'verification']) {
      const tasks = queue.tasks.map(task => ({ ...task, state }));
      const result = calculateProgress(ledger, tasks, ids);
      expect(result.M01?.points).toBe(0);
      expect(result.M01?.criteria[0]?.state).toBe('awaiting');
    }
  });
  it('rejects missing scope, fabricated evidence and unknown tasks', () => {
    const missing = structuredClone(ledger); missing.modules.pop();
    expect(() => calculateProgress(missing, queue.tasks, ids)).toThrow();
    const noEvidence = structuredClone(ledger); noEvidence.modules[0]!.criteria[0]!.evidence = '';
    expect(() => calculateProgress(noEvidence, queue.tasks, ids)).toThrow(/evidence/);
    const unknown = structuredClone(ledger); unknown.modules[0]!.criteria[0]!.taskIds = ['invented'];
    expect(() => calculateProgress(unknown, queue.tasks, ids)).toThrow(/Unknown/);
  });
  it('changes points only when recorded criterion status and delivery evidence support it', () => {
    const updated = structuredClone(ledger);
    const firstCriterion = updated.modules[0]!.criteria[0]!;
    firstCriterion.state = 'done';
    const baseline = calculateProgress(ledger, queue.tasks, ids).M01!;
    const tasksById = new Map(queue.tasks.map(task => [task.id, task.state]));
    const isVerified = firstCriterion.taskIds.every(taskId => tasksById.get(taskId) === 'done');
    const expectedPoints = baseline.points + (isVerified ? .5 : 0);
    const result = calculateProgress(updated, queue.tasks, ids);
    expect(result.M01?.points).toBe(expectedPoints);
    expect(result.M01?.percent).toBe(Math.round(expectedPoints / 6 * 100));
    expect(baseline.percent).toBe(33);
  });
});

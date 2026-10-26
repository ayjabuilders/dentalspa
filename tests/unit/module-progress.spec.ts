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
    expect(result.M01?.percent).toBe(25);
    expect(result.M02?.percent).toBe(17);
    expect(result.M16?.percent).toBe(17);
    for (const id of ['M03', 'M04', 'M06', 'M09', 'M14', 'M17', 'M21']) expect(result[id]?.percent).toBe(0);
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
    updated.modules[0]!.criteria[0]!.state = 'done';
    const result = calculateProgress(updated, queue.tasks, ids);
    expect(result.M01?.points).toBe(2);
    expect(result.M01?.percent).toBe(33);
    expect(calculateProgress(ledger, queue.tasks, ids).M01?.percent).toBe(25);
  });
});

import { describe, expect, it } from 'vitest';
import { OutboxWorker, type TransactionalDatabase, type WorkerPolicy } from '../../apps/dental-api/src/audit/worker/outbox-worker';
const db: TransactionalDatabase = { transaction: async () => { throw new Error('not invoked'); } };
const policy: WorkerPolicy = { consumer:'test',eventTypes:['FoundationTest'],maxAttempts:3,leaseSeconds:30,retrySeconds:10 };
describe('bounded worker configuration', () => {
  for (const patch of [{maxAttempts:11},{maxAttempts:0},{leaseSeconds:301},{retrySeconds:0},{consumer:'untrusted value'},{eventTypes:[]}]) {
    it(`rejects ${JSON.stringify(patch)}`, () => { expect(()=>new OutboxWorker(db,{...policy,...patch},async()=>{})).toThrow(); });
  }
});

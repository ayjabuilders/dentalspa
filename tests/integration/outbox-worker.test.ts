import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OutboxWorker, type SqlTransaction, type TransactionalDatabase, type WorkerPolicy } from '../../apps/dental-api/src/audit/worker/outbox-worker';
import { A, STAFF, P1, P3 } from '../fixtures';

describe('outbox worker transactional foundation', () => {
  let db: PGlite;
  let adapter: TransactionalDatabase;
  const policy: WorkerPolicy = { consumer:'foundation-test',eventTypes:['FoundationTest'],maxAttempts:2,leaseSeconds:30,retrySeconds:1 };
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    await db.exec(readFileSync('supabase/migrations/20261026131434_foundation.sql','utf8'));
    const migration = readdirSync('supabase/migrations').find(file=>file.endsWith('_outbox_worker_foundation.sql'))!;
    await db.exec(readFileSync(`supabase/migrations/${migration}`,'utf8'));
    await db.exec(`insert into public.clinics(id,name) values('${A}','Synthetic'); create table private.test_effects(event_id uuid primary key, count integer not null);`);
    adapter = { transaction: work => db.transaction(tx=>work(tx as SqlTransaction)) };
  },30000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec('delete from private.outbox_attempts; delete from private.outbox_deliveries; delete from private.consumed_events; delete from private.outbox_events; delete from private.test_effects;');
    await db.query(`insert into private.outbox_events(event_id,clinic_id,event_type,event_version,aggregate_id,correlation_id,actor_ref) values($1,$2,'FoundationTest',1,$1,$3,$4)`,[P1,A,P3,STAFF]);
  });
  const effect = async (event: {event_id:string}, tx: SqlTransaction) => { await tx.query(`insert into private.test_effects(event_id,count) values($1,1) on conflict(event_id) do update set count=test_effects.count+1`,[event.event_id]); };
  it('commits handler changes and consumption together, then skips replays', async () => {
    const worker = new OutboxWorker(adapter,policy,effect);
    expect(await worker.runOnce()).toBe('delivered');
    expect(await worker.runOnce()).toBe('idle');
    expect((await db.query<{count:number}>('select count from private.test_effects')).rows[0]?.count).toBe(1);
    expect((await db.query('select * from private.consumed_events')).rows).toHaveLength(1);
    expect((await db.query<{outcome:string}>('select outcome from private.outbox_attempts')).rows[0]?.outcome).toBe('delivered');
  });
  it('rolls back failed effects/consumption, backs off and dead-letters at the bound', async () => {
    const worker = new OutboxWorker(adapter,policy,async (event,tx)=>{ await effect(event,tx); throw new Error('synthetic sensitive detail must not persist'); });
    expect(await worker.runOnce()).toBe('retry');
    expect((await db.query('select * from private.test_effects')).rows).toHaveLength(0);
    expect((await db.query('select * from private.consumed_events')).rows).toHaveLength(0);
    expect(await worker.runOnce()).toBe('idle');
    await db.exec("update private.outbox_deliveries set next_attempt_at=now()-interval '1 second'");
    expect(await worker.runOnce()).toBe('dead');
    expect(await worker.runOnce()).toBe('idle');
    const delivery = (await db.query<{attempts:number;last_failure_code:string}>('select attempts,last_failure_code from private.outbox_deliveries')).rows[0];
    expect(delivery).toEqual({attempts:2,last_failure_code:'handler_failed'});
    expect((await db.query('select * from private.outbox_attempts')).rows).toHaveLength(2);
  });
  it('tracks idempotency independently for each subscribed consumer', async () => {
    expect(await new OutboxWorker(adapter,policy,effect).runOnce()).toBe('delivered');
    expect(await new OutboxWorker(adapter,{...policy,consumer:'second-consumer'},effect).runOnce()).toBe('delivered');
    expect((await db.query('select * from private.consumed_events')).rows).toHaveLength(2);
    expect((await db.query<{count:number}>('select count from private.test_effects')).rows[0]?.count).toBe(2);
  });
  it('does not claim active leases and recovers abandoned work with a new attempt', async () => {
    await db.query(`insert into private.outbox_deliveries(consumer_id,event_id,status,attempts,lease_token,lease_until) values($1,$2,'processing',1,$3,now()+interval '1 minute')`,[policy.consumer,P1,P3]);
    await db.query(`insert into private.outbox_attempts(consumer_id,event_id,attempt) values($1,$2,1)`,[policy.consumer,P1]);
    const worker = new OutboxWorker(adapter,policy,effect);
    expect(await worker.runOnce()).toBe('idle');
    await db.exec("update private.outbox_deliveries set lease_until=now()-interval '1 second'");
    expect(await worker.runOnce()).toBe('delivered');
    expect((await db.query<{outcome:string}>('select outcome from private.outbox_attempts order by attempt')).rows.map(r=>r.outcome)).toEqual(['lease_expired','delivered']);
  });
  it('bounds crashed attempts and ignores unsubscribed event types', async () => {
    await db.query(`insert into private.outbox_deliveries(consumer_id,event_id,status,attempts,lease_token,lease_until) values($1,$2,'processing',2,$3,now()-interval '1 minute')`,[policy.consumer,P1,P3]);
    await db.query(`insert into private.outbox_attempts(consumer_id,event_id,attempt) values($1,$2,2)`,[policy.consumer,P1]);
    expect(await new OutboxWorker(adapter,policy,effect).runOnce()).toBe('dead');
    expect(await new OutboxWorker(adapter,{...policy,consumer:'other',eventTypes:['OtherType']},effect).runOnce()).toBe('idle');
    expect((await db.query('select * from private.test_effects')).rows).toHaveLength(0);
  });
  it('keeps worker state and history inaccessible to authenticated clients', async () => {
    await db.exec('begin; set local role authenticated');
    try { await expect(db.query('select * from private.outbox_deliveries')).rejects.toThrow(/permission denied/); }
    finally { await db.exec('rollback'); }
  });
  it('interleaved workers for one consumer apply a local effect once', async () => {
    const results = await Promise.all([new OutboxWorker(adapter,policy,effect).runOnce(),new OutboxWorker(adapter,policy,effect).runOnce()]);
    expect(results.sort()).toEqual(['delivered','idle']);
    expect((await db.query<{count:number}>('select count from private.test_effects')).rows[0]?.count).toBe(1);
  });
  it('fences a stale claimant before running its handler', async () => {
    let calls = 0;
    const replacedLease: TransactionalDatabase = { transaction: async work => {
      if (++calls === 2) await db.exec('update private.outbox_deliveries set lease_token=gen_random_uuid()');
      return adapter.transaction(work);
    } };
    expect(await new OutboxWorker(replacedLease,policy,effect).runOnce()).toBe('stale');
    expect((await db.query('select * from private.test_effects')).rows).toHaveLength(0);
    expect((await db.query('select * from private.consumed_events')).rows).toHaveLength(0);
  });
});

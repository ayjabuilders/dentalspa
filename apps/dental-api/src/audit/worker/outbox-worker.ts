// Not registered in Nest or started by the API. Local transactional handlers only.
export interface SqlTransaction {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export interface TransactionalDatabase {
  transaction<T>(work: (tx: SqlTransaction) => Promise<T>): Promise<T>;
}
export interface OutboxEnvelope {
  event_id: string; clinic_id: string; event_type: string; event_version: number;
  aggregate_id: string; correlation_id: string; actor_ref: string; occurred_at: string;
}
export interface WorkerPolicy { consumer: string; eventTypes: string[]; maxAttempts: number; leaseSeconds: number; retrySeconds: number }
type Claim = { event_id: string; lease_token: string; attempts: number };
export type OutboxHandler = (event: Readonly<OutboxEnvelope>, tx: SqlTransaction) => Promise<void>;
export class OutboxWorker {
  constructor(private readonly db: TransactionalDatabase, private readonly policy: WorkerPolicy, private readonly handler: OutboxHandler) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(policy.consumer) || !policy.eventTypes.length || policy.eventTypes.length > 20 || policy.eventTypes.some(t => !/^[A-Za-z][A-Za-z0-9]{0,79}$/.test(t))) throw new Error('Invalid consumer configuration');
    if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1 || policy.maxAttempts > 10 || !Number.isInteger(policy.leaseSeconds) || policy.leaseSeconds < 1 || policy.leaseSeconds > 300 || !Number.isInteger(policy.retrySeconds) || policy.retrySeconds < 1 || policy.retrySeconds > 3600) throw new Error('Invalid bounded retry policy');
    this.policy = { ...policy, eventTypes: [...policy.eventTypes] };
  }
  async runOnce(): Promise<'idle' | 'delivered' | 'retry' | 'dead' | 'stale'> {
    const { consumer, eventTypes, maxAttempts, leaseSeconds, retrySeconds } = this.policy;
    const claim = await this.db.transaction(async tx => {
      // Materialize only a bounded batch of explicitly subscribed event types.
      await tx.query(`insert into private.outbox_deliveries(consumer_id,event_id)
        select $1,e.event_id from private.outbox_events e where e.event_type=any($2::text[])
        and not exists(select 1 from private.outbox_deliveries d where d.consumer_id=$1 and d.event_id=e.event_id)
        and not exists(select 1 from private.consumed_events c where c.consumer_id=$1 and c.event_id=e.event_id)
        order by e.occurred_at,e.event_id limit 100 on conflict do nothing`,[consumer,eventTypes]);
      const candidate = (await tx.query<Claim>(`select event_id,lease_token,attempts from private.outbox_deliveries
        where consumer_id=$1 and status in ('pending','processing') and next_attempt_at<=clock_timestamp()
        and (lease_until is null or lease_until<=clock_timestamp()) order by next_attempt_at,event_id
        for update skip locked limit 1`,[consumer])).rows[0];
      if (!candidate) return null;
      if (candidate.lease_token) await tx.query(`update private.outbox_attempts set outcome='lease_expired',finished_at=clock_timestamp() where consumer_id=$1 and event_id=$2 and attempt=$3`,[consumer,candidate.event_id,candidate.attempts]);
      if (candidate.attempts >= maxAttempts) {
        await tx.query(`update private.outbox_deliveries set status='dead',lease_token=null,lease_until=null,last_failure_code='lease_expired' where consumer_id=$1 and event_id=$2`,[consumer,candidate.event_id]);
        return 'dead' as const;
      }
      const leased = (await tx.query<Claim>(`update private.outbox_deliveries set status='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+$3*interval '1 second'
        where consumer_id=$1 and event_id=$2 returning event_id,lease_token,attempts`,[consumer,candidate.event_id,leaseSeconds])).rows[0]!;
      await tx.query(`insert into private.outbox_attempts(consumer_id,event_id,attempt) values($1,$2,$3)`,[consumer,leased.event_id,leased.attempts]);
      return leased;
    });
    if (!claim) return 'idle';
    if (claim === 'dead') return 'dead';
    try {
      return await this.db.transaction(async tx => {
        const live = (await tx.query(`select event_id from private.outbox_deliveries where consumer_id=$1 and event_id=$2 and lease_token=$3 and lease_until>clock_timestamp() for update`,[consumer,claim.event_id,claim.lease_token])).rows;
        if (!live.length) return 'stale' as const;
        const consumed = (await tx.query(`insert into private.consumed_events(consumer_id,event_id) values($1,$2) on conflict do nothing returning event_id`,[consumer,claim.event_id])).rows;
        if (consumed.length) {
          const event = (await tx.query<OutboxEnvelope>(`select event_id,clinic_id,event_type,event_version,aggregate_id,correlation_id,actor_ref,occurred_at from private.outbox_events where event_id=$1`,[claim.event_id])).rows[0]!;
          await this.handler(Object.freeze(event),tx);
        }
        const completed = (await tx.query(`update private.outbox_deliveries set status='delivered',completed_at=clock_timestamp(),lease_token=null,lease_until=null,last_failure_code=null
          where consumer_id=$1 and event_id=$2 and lease_token=$3 and lease_until>clock_timestamp() returning event_id`,[consumer,claim.event_id,claim.lease_token])).rows;
        if (!completed.length) throw new Error('Lease expired');
        await tx.query(`update private.outbox_attempts set outcome='delivered',finished_at=clock_timestamp() where consumer_id=$1 and event_id=$2 and attempt=$3`,[consumer,claim.event_id,claim.attempts]);
        return 'delivered' as const;
      });
    } catch {
      // Never persist exception text, envelope content, credentials or clinical data.
      return this.db.transaction(async tx => {
        const dead = claim.attempts >= maxAttempts;
        const changed = (await tx.query(`update private.outbox_deliveries set status=$4,lease_token=null,lease_until=null,last_failure_code='handler_failed',next_attempt_at=clock_timestamp()+$5*interval '1 second'
          where consumer_id=$1 and event_id=$2 and lease_token=$3 returning event_id`,[consumer,claim.event_id,claim.lease_token,dead ? 'dead':'pending',Math.min(3600,retrySeconds * 2 ** (claim.attempts-1))])).rows;
        if (!changed.length) return 'stale' as const;
        await tx.query(`update private.outbox_attempts set outcome='handler_failed',finished_at=clock_timestamp() where consumer_id=$1 and event_id=$2 and attempt=$3`,[consumer,claim.event_id,claim.attempts]);
        return dead ? 'dead' as const : 'retry' as const;
      });
    }
  }
}

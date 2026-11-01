import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

describe('agenda settings SQL (isolated PGlite fixture)', () => {
  const db = new PGlite();
  const clinic = '10000000-0000-4000-8000-000000000001';
  const other = '10000000-0000-4000-8000-000000000002';
  const actor = '76000000-0000-4000-8000-000000000001';
  const key = '76000000-0000-4000-8000-000000000002';
  const key2 = '76000000-0000-4000-8000-000000000003';
  const config = { schema_version: 1, revision: 1, visit_types: [], closures: [] };
  beforeAll(async () => {
    await db.exec(`create role anon; create role authenticated; create schema private; create schema auth;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
      create table public.clinics(id uuid primary key);
      create table public.clinic_memberships(clinic_id uuid,user_id uuid,active boolean,role text);
      create table private.scheduling_resources(id uuid,clinic_id uuid,active boolean,synthetic_only boolean,kind text);
      create table private.scheduling_windows(clinic_id uuid,resource_id uuid,starts_at timestamptz,ends_at timestamptz);
      create table private.scheduling_holds(id uuid,clinic_id uuid,status text,expires_at timestamptz);
      create table private.scheduling_occupancy(clinic_id uuid,resource_id uuid,hold_id uuid,active boolean,period tstzrange);
      create table private.audit_events(clinic_id uuid,actor_ref uuid,action text,aggregate_id uuid,correlation_id uuid,occurred_at timestamptz);
      create table private.outbox_events(clinic_id uuid,event_type text,event_version integer,aggregate_type text,aggregate_id uuid,correlation_id uuid,actor_ref uuid,occurred_at timestamptz,payload jsonb);`);
    await db.query('insert into public.clinics values($1),($2)', [clinic, other]);
    await db.query("insert into public.clinic_memberships values($1,$2,true,'manager')", [clinic, actor]);
    await db.query("select set_config('test.actor',$1,false)", [actor]);
    await db.exec(await readFile('supabase/migrations/20261031090000_local_agenda_settings.sql', 'utf8'));
    await db.query("insert into private.agenda_configuration_gates(clinic_id,enabled,api_gate_key) values($1,true,'test-gate')", [clinic]);
  });
  afterAll(() => db.close());
  const save = (revision: number, configuration: unknown, requestKey = key) => db.query<{ receipt: { replayed: boolean } }>(
    'select public.save_local_agenda_configuration($1,$2,$3::jsonb,$4,$5) as receipt', [clinic, revision, JSON.stringify(configuration), requestKey, 'test-gate']);

  it('saves once, replays without new events and preserves the original revision', async () => {
    expect((await save(0, config)).rows[0]?.receipt.replayed).toBe(false);
    expect((await save(0, config)).rows[0]?.receipt.replayed).toBe(true);
    const counts = await db.query<{ versions: number; events: number; audits: number }>(`select
      (select count(*)::int from private.agenda_configuration_versions) versions,
      (select count(*)::int from private.outbox_events) events,
      (select count(*)::int from private.audit_events) audits`);
    expect(counts.rows[0]).toEqual({ versions: 1, events: 1, audits: 1 });
    await expect(save(0, { ...config, closures: [{ date: '2026-11-03', resource_id: null }] })).rejects.toMatchObject({ code: 'SH410' });
    await expect(save(0, config, key2)).rejects.toMatchObject({ code: 'SH409' });
  });

  it('denies other clinics, disabled gates, anonymous callers and inactive staff', async () => {
    await expect(db.query('select public.read_local_agenda_configuration($1,$2)', [other, 'test-gate'])).rejects.toMatchObject({ code: '42501' });
    await expect(db.query('select public.read_local_agenda_configuration($1,$2)', [clinic, 'wrong'])).rejects.toMatchObject({ code: 'PT503' });
    await db.exec("select set_config('test.actor','',false)");
    await expect(save(1, { ...config, revision: 2 }, key2)).rejects.toMatchObject({ code: '28000' });
    await db.query("select set_config('test.actor',$1,false)", [actor]);
    await db.exec('update public.clinic_memberships set active=false');
    await expect(save(1, { ...config, revision: 2 }, key2)).rejects.toMatchObject({ code: '42501' });
    await db.exec('update public.clinic_memberships set active=true');
  });

  it('rejects foreign resources even when the caller is a manager', async () => {
    const foreign = { ...config, revision: 2, visit_types: [{ resource_pairs: [{ provider_id: key, chair_id: key2 }] }] };
    await expect(save(1, foreign, key2)).rejects.toMatchObject({ code: '42501' });
  });

  it('projects only same-clinic resources and live occupancy, denying anonymous and foreign reads', async () => {
    await db.query("insert into private.scheduling_resources values($1,$2,true,true,'provider'),($3,$4,true,true,'chair')", [key, clinic, key2, other]);
    await db.query("insert into private.scheduling_windows values($1,$2,'2026-11-02T08:00Z','2026-11-02T18:00Z')", [clinic, key]);
    await db.query("insert into private.scheduling_holds values($1,$2,'held',now()+interval '1 hour'),($3,$2,'held',now()-interval '1 hour')", [key, clinic, key2]);
    await db.query("insert into private.scheduling_occupancy values($1,$2,$2,true,tstzrange('2026-11-02T09:00Z','2026-11-02T09:30Z','[)')),($1,$2,$3,true,tstzrange('2026-11-02T10:00Z','2026-11-02T10:30Z','[)'))", [clinic, key, key2]);
    const read = (tenant = clinic) => db.query<{ snapshot: { clinic_id: string; resources: Array<{ id: string; windows: unknown[] }>; occupancy: unknown[] } }>('select public.read_local_agenda_availability_snapshot($1,$2,$3) snapshot', [tenant, '2026-11-02', 'test-gate']);
    const result = (await read()).rows[0]!.snapshot;
    expect(result.clinic_id).toBe(clinic);
    expect(result.resources.map(resource => resource.id)).toEqual([key]);
    expect(result.resources[0]!.windows).toHaveLength(1);
    expect(result.occupancy).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('hold_id');
    await expect(read(other)).rejects.toMatchObject({ code: '42501' });
    await db.exec("select set_config('test.actor','',false)");
    await expect(read()).rejects.toMatchObject({ code: '28000' });
    await db.query("select set_config('test.actor',$1,false)", [actor]);
    const grants = await db.query<{ allowed: boolean }>("select has_function_privilege('anon','public.read_local_agenda_availability_snapshot(uuid,date,text)','execute') allowed");
    expect(grants.rows[0]?.allowed).toBe(false);
  });

  it('rolls back the version and audit if outbox insertion fails', async () => {
    await db.exec("alter table private.outbox_events add constraint fail_new_revision check ((payload->>'revision')::int < 2)");
    await expect(save(1, { ...config, revision: 2 }, key2)).rejects.toMatchObject({ code: '23514' });
    expect((await db.query<{ count: number }>('select count(*)::int as count from private.agenda_configuration_versions')).rows[0]?.count).toBe(1);
    expect((await db.query<{ count: number }>('select count(*)::int as count from private.audit_events')).rows[0]?.count).toBe(1);
  });

  it('requires a separate enabled public capability and denies direct private snapshot execution', async () => {
    const read = (tenant = clinic, gate = 'public-test-gate') => db.query<{ snapshot: { clinic_id: string } }>('select public.read_local_public_agenda_snapshot($1,$2,$3) snapshot', [tenant, '2026-11-02', gate]);
    await expect(read()).rejects.toMatchObject({ code: 'PT503' });
    await db.query("update private.agenda_configuration_gates set public_discovery_enabled=true,public_api_gate_key='public-test-gate' where clinic_id=$1", [clinic]);
    await expect(read(clinic, 'test-gate')).rejects.toMatchObject({ code: 'PT503' });
    await expect(read(other)).rejects.toMatchObject({ code: 'PT503' });
    await db.exec("select set_config('test.actor','',false); set role anon");
    try {
      expect((await read()).rows[0]?.snapshot.clinic_id).toBe(clinic);
      await expect(db.query('select private.agenda_availability_snapshot($1,$2)', [clinic, '2026-11-02'])).rejects.toMatchObject({ code: '42501' });
    } finally {
      await db.exec('reset role');
      await db.query("select set_config('test.actor',$1,false)", [actor]);
      await db.query('update private.agenda_configuration_gates set public_discovery_enabled=false where clinic_id=$1', [clinic]);
    }
    await expect(read()).rejects.toMatchObject({ code: 'PT503' });
  });
});

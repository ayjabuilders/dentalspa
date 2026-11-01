import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Applies the complete local migration history in an embedded PostgreSQL
 * instance. Supabase Auth/Storage are minimal schema stubs; this is migration
 * integration evidence, not acceptance of the Supabase runtime or RLS engine.
 */
describe('full synthetic migration chain on embedded PostgreSQL', () => {
  let db: PGlite;
  const migrationFiles = readdirSync('supabase/migrations')
    .filter(name => name.endsWith('.sql'))
    .sort();

  beforeAll(async () => {
    db = new PGlite({ extensions: { btree_gist, pgcrypto } });
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key);
      create table auth.sessions(id uuid primary key, user_id uuid not null, not_after timestamptz);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create function auth.jwt() returns jsonb language sql stable as $$
        select nullif(current_setting('request.jwt.claims', true), '')::jsonb
      $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      grant execute on function auth.jwt() to anon, authenticated;
      create schema storage;
      create table storage.buckets(
        id text primary key,
        name text,
        public boolean,
        file_size_limit bigint,
        allowed_mime_types text[]
      );
    `);

    for (const migration of migrationFiles) {
      try {
        await db.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'));
      } catch (error) {
        throw new Error(`Migration failed in full sequence: ${migration}`, { cause: error });
      }
    }
    await db.exec(readFileSync('supabase/seed.sql', 'utf8'));
  }, 60_000);

  afterAll(async () => { await db?.close(); });

  it('denies direct table reads after session revocation while retaining tenant isolation', async () => {
    const user = '90000000-0000-4000-8000-000000000081';
    const session = '90000000-0000-4000-8000-000000000082';
    const clinic = '10000000-0000-4000-8000-000000000001';
    const tables = ['profiles', 'clinic_memberships', 'patient_account_links', 'clinics', 'patients', 'inquiries'];
    await db.exec('begin');
    try {
      await db.query('insert into auth.users(id) values($1)', [user]);
      await db.query("insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '1 hour')", [session, user]);
      await db.query("insert into public.profiles(user_id,display_name) values($1,'Synthetic session test')", [user]);
      await db.query("insert into public.clinic_memberships(clinic_id,user_id,role,active) values($1,$2,'reception',true)", [clinic, user]);
      await db.query("insert into public.patient_account_links(user_id,clinic_id,patient_id,verified_at,verified_by) values($1,$2,'20000000-0000-4000-8000-000000000001',now(),$1)", [user, clinic]);
      await db.query("insert into public.inquiries(clinic_id,owner_user_id,display_name,source) values($1,$2,'Synthetic session inquiry','website')", [clinic, user]);
      await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [user, JSON.stringify({ sub: user, session_id: session })]);
      await db.exec('set local role authenticated');
      for (const table of tables) {
        expect((await db.query<{ n: number }>(`select count(*)::int n from public.${table}`)).rows[0]!.n, table).toBeGreaterThan(0);
      }
      expect((await db.query("select id from public.patients where clinic_id='10000000-0000-4000-8000-000000000002'")).rows).toHaveLength(0);
      await db.exec('reset role');
      await db.query('delete from auth.sessions where id=$1', [session]);
      await db.exec('set local role authenticated');
      for (const table of tables) expect((await db.query(`select * from public.${table}`)).rows, table).toHaveLength(0);
    } finally { await db.exec('reset role; rollback'); }
  });

  it('checks the current session owner, expiry and deletion without exposing session rows', async () => {
    const user = '90000000-0000-4000-8000-000000000091';
    const other = '90000000-0000-4000-8000-000000000092';
    const session = '90000000-0000-4000-8000-000000000093';
    await db.exec('begin');
    try {
      await db.query('insert into auth.users(id) values($1),($2)', [user, other]);
      await db.query("insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '1 hour')", [session, user]);
      const check = async (actor: string, id: string | null) => {
        await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [actor, JSON.stringify({ sub: actor, session_id: id })]);
        return (await db.query<{ active: boolean }>('select public.is_current_session_active() active')).rows[0]!.active;
      };
      expect(await check(user, session)).toBe(true);
      expect(await check(other, session)).toBe(false);
      expect(await check(user, null)).toBe(false);
      await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1", [session]);
      expect(await check(user, session)).toBe(false);
      await db.query('delete from auth.sessions where id=$1', [session]);
      expect(await check(user, session)).toBe(false);
      const permissions = (await db.query<{ anon: boolean; authenticated: boolean }>("select has_function_privilege('anon','public.is_current_session_active()','EXECUTE') anon,has_function_privilege('authenticated','public.is_current_session_active()','EXECUTE') authenticated")).rows[0];
      expect(permissions).toEqual({ anon: false, authenticated: true });
    } finally { await db.exec('rollback'); }
  });

  it('applies every migration in filename order and the synthetic clinic seed', async () => {
    expect(migrationFiles).toHaveLength(87);
    expect(migrationFiles.at(-1)).toBe('20261101083949_configured_booking_phone.sql');
    const clinics = await db.query<{ name: string }>('select name from public.clinics order by name');
    expect(clinics.rows.map(row => row.name)).toEqual([
      'Cabinet Dentaire Atlas - Casablanca (FICTIF)',
      'Cabinet Sourire de Sale (FICTIF)',
      'Synthetic scheduling sandbox',
    ]);
    expect((await db.query('select * from auth.users')).rows).toHaveLength(0);
    const patients = await db.query<{ display_name: string }>('select display_name from public.patients order by display_name');
    expect(patients.rows.map(row => row.display_name)).toEqual([
      'Hamza Chraibi (FICTIF)',
      'Imane El Idrissi (FICTIF)',
      'Nadia El Fassi (FICTIF)',
      'Oumaima Berrada (FICTIF)',
      'Salma Alaoui (FICTIF)',
      'Youssef Benali (FICTIF)',
    ]);
  });

  it('creates the CRM domains and keeps every public/private table RLS-enabled', async () => {
    const counts = await db.query<{ table_schema: string; count: number }>(`
      select n.nspname as table_schema, count(*)::int as count
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'private') and c.relkind = 'r'
      group by n.nspname order by n.nspname
    `);
    expect(counts.rows).toEqual([
      { table_schema: 'private', count: 102 },
      { table_schema: 'public', count: 6 },
    ]);

    const expected = await db.query<{ table_schema: string; table_name: string }>(`
      select table_schema, table_name
      from information_schema.tables
      where table_schema in ('public', 'private') and table_name in (
        'clinics', 'clinic_memberships', 'patients', 'inquiries',
        'audit_events', 'outbox_events', 'scheduling_holds',
        'inquiry_contact_outcomes', 'patient_admin_document_checklist',
        'demo_booking_request_settings', 'demo_booking_requests', 'demo_booking_confirmation_settings',
        'demo_booking_sample_resources', 'demo_confirmed_appointments', 'demo_booking_confirmation_idempotency',
        'demo_fake_inbox_settings',
        'demo_fake_conversations', 'demo_fake_inbound_messages',
        'local_team_access_settings','local_team_provisioning_reservations','team_access_member_state','team_access_command_receipts',
        'finance_catalog_services', 'finance_catalog_price_versions', 'finance_quotes',
        'finance_quote_versions', 'finance_quote_lines',
        'configured_appointments', 'configured_booking_confirmations'
        ,'patient_documents_settings','patient_document_templates','patient_document_uploads','patient_document_drafts',
        'patient_document_draft_history','patient_document_versions','patient_document_command_receipts','patient_document_library_catalog'
      )
    `);
    expect(new Set(expected.rows.map(row => `${row.table_schema}.${row.table_name}`))).toEqual(new Set([
      'private.configured_appointments',
      'private.configured_booking_confirmations',
      'public.clinics',
      'public.clinic_memberships',
      'public.patients',
      'public.inquiries',
      'private.audit_events',
      'private.outbox_events',
      'private.scheduling_holds',
      'private.inquiry_contact_outcomes',
      'private.patient_admin_document_checklist',
      'private.demo_booking_request_settings',
      'private.demo_booking_requests',
      'private.demo_booking_confirmation_settings',
      'private.demo_booking_sample_resources',
      'private.demo_confirmed_appointments',
      'private.demo_booking_confirmation_idempotency',
      'private.demo_fake_inbox_settings',
      'private.demo_fake_conversations',
      'private.demo_fake_inbound_messages',
      'private.local_team_access_settings',
      'private.local_team_provisioning_reservations',
      'private.team_access_member_state',
      'private.team_access_command_receipts',
      'private.finance_catalog_services',
      'private.finance_catalog_price_versions',
      'private.finance_quotes',
      'private.finance_quote_versions',
      'private.finance_quote_lines',
      'private.patient_documents_settings',
      'private.patient_document_templates',
      'private.patient_document_uploads',
      'private.patient_document_drafts',
      'private.patient_document_draft_history',
      'private.patient_document_versions',
      'private.patient_document_command_receipts',
      'private.patient_document_library_catalog',
    ]));

    const unsecured = await db.query<{ table_schema: string; table_name: string }>(`
      select n.nspname as table_schema, c.relname as table_name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'private') and c.relkind = 'r' and not c.relrowsecurity
      order by n.nspname, c.relname
    `);
    expect(unsecured.rows).toEqual([]);

    const confirmationGate = await db.query<{ enabled: boolean }>(`select enabled from private.demo_booking_confirmation_settings where singleton`);
    expect(confirmationGate.rows).toEqual([{ enabled: false }]);
  });

  it('keeps the search RPC distinct and limited to authenticated execution', async () => {
    const privileges = await db.query<{
      existing_auth: boolean;
      search_auth: boolean;
      search_anon: boolean;
      search_service: boolean;
      search_signatures: number;
    }>(`
      select
        has_function_privilege('authenticated', 'public.read_local_installment_reminder_queue(uuid,date,uuid,text)', 'EXECUTE') as existing_auth,
        has_function_privilege('authenticated', 'public.read_local_installment_reminder_queue_search(uuid,date,uuid,text,text)', 'EXECUTE') as search_auth,
        has_function_privilege('anon', 'public.read_local_installment_reminder_queue_search(uuid,date,uuid,text,text)', 'EXECUTE') as search_anon,
        has_function_privilege('service_role', 'public.read_local_installment_reminder_queue_search(uuid,date,uuid,text,text)', 'EXECUTE') as search_service,
        (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='read_local_installment_reminder_queue_search') as search_signatures
    `);
    expect(privileges.rows).toEqual([{
      existing_auth: true,
      search_auth: true,
      search_anon: false,
      search_service: false,
      search_signatures: 1,
    }]);
  });

  it('keeps patient-document storage and commands private and default-off', async () => {
    const state = await db.query<{ enabled:boolean; storage_public:boolean; bucket_limit:number }>(`
      select s.enabled,b.public as storage_public,b.file_size_limit::int as bucket_limit
      from private.patient_documents_settings s join storage.buckets b on b.id='patient-documents' where s.singleton
    `);
    expect(state.rows).toEqual([{enabled:false,storage_public:false,bucket_limit:20*1024*1024}]);
    const privileges = await db.query<{ list_auth:boolean; list_anon:boolean; list_service:boolean; upload_auth:boolean; upload_anon:boolean; upload_service:boolean }>(`
      select
       has_function_privilege('authenticated','public.list_patient_documents(uuid,uuid,text,text,text,integer,text)','EXECUTE') list_auth,
       has_function_privilege('anon','public.list_patient_documents(uuid,uuid,text,text,text,integer,text)','EXECUTE') list_anon,
       has_function_privilege('service_role','public.list_patient_documents(uuid,uuid,text,text,text,integer,text)','EXECUTE') list_service,
       has_function_privilege('authenticated','public.register_patient_document_upload(uuid,uuid,uuid,text,text,text,date,text,integer,text,text,uuid,uuid,text)','EXECUTE') upload_auth,
       has_function_privilege('anon','public.register_patient_document_upload(uuid,uuid,uuid,text,text,text,date,text,integer,text,text,uuid,uuid,text)','EXECUTE') upload_anon,
       has_function_privilege('service_role','public.register_patient_document_upload(uuid,uuid,uuid,text,text,text,date,text,integer,text,text,uuid,uuid,text)','EXECUTE') upload_service
    `);
    expect(privileges.rows).toEqual([{list_auth:true,list_anon:false,list_service:false,upload_auth:true,upload_anon:false,upload_service:false}]);
    const directRead = await db.query<{ permitted:boolean }>(`select has_table_privilege('authenticated','private.patient_document_uploads','SELECT') permitted`);
    expect(directRead.rows).toEqual([{permitted:false}]);
  });

  it('keeps team access writes default-off and authenticated-manager RPCs private', async () => {
    const settings = await db.query<{ enabled: boolean; gate: string }>(`select enabled,api_gate_key as gate from private.local_team_access_settings where singleton`);
    expect(settings.rows).toEqual([{ enabled: false, gate: '' }]);
    const grants = await db.query<{ list_auth: boolean; list_anon: boolean; reserve_auth: boolean; reserve_anon: boolean; update_service: boolean }>(`
      select
        has_function_privilege('authenticated','public.list_team_access_members(uuid,text,text,text)','EXECUTE') list_auth,
        has_function_privilege('anon','public.list_team_access_members(uuid,text,text,text)','EXECUTE') list_anon,
        has_function_privilege('authenticated','public.reserve_local_team_member(uuid,text,text,text,text[],uuid,text)','EXECUTE') reserve_auth,
        has_function_privilege('anon','public.reserve_local_team_member(uuid,text,text,text,text[],uuid,text)','EXECUTE') reserve_anon,
        has_function_privilege('service_role','public.update_team_access_member(uuid,uuid,integer,text[],boolean,uuid,text,text)','EXECUTE') update_service
    `);
    expect(grants.rows).toEqual([{ list_auth: true, list_anon: false, reserve_auth: true, reserve_anon: false, update_service: false }]);
    const privateState = await db.query<{ reservation_readable: boolean; member_state_readable: boolean }>(`
      select has_table_privilege('authenticated','private.local_team_provisioning_reservations','SELECT') reservation_readable,
        has_table_privilege('authenticated','private.team_access_member_state','SELECT') member_state_readable
    `);
    expect(privateState.rows).toEqual([{ reservation_readable: false, member_state_readable: false }]);
  });

  it('keeps the document library catalog private and soft archive metadata-only', async () => {
    const library = await db.query<{ category_count: number; direct_read: boolean; register_auth: boolean; register_anon: boolean; archive_auth: boolean; archive_service: boolean }>(`
      select
        (select count(*)::int from private.patient_document_library_catalog) category_count,
        has_table_privilege('authenticated','private.patient_document_library_catalog','SELECT') direct_read,
        has_function_privilege('authenticated','public.register_patient_document_library_upload(uuid,uuid,uuid,text,text,text,date,text,uuid,text,text,integer,text,text,uuid,uuid,text)','EXECUTE') register_auth,
        has_function_privilege('anon','public.register_patient_document_library_upload(uuid,uuid,uuid,text,text,text,date,text,uuid,text,text,integer,text,text,uuid,uuid,text)','EXECUTE') register_anon,
        has_function_privilege('authenticated','public.archive_patient_document_library_item(uuid,uuid,uuid,integer,uuid,uuid,text)','EXECUTE') archive_auth,
        has_function_privilege('service_role','public.archive_patient_document_library_item(uuid,uuid,uuid,integer,uuid,uuid,text)','EXECUTE') archive_service
    `);
    expect(library.rows).toEqual([{ category_count: 14, direct_read: false, register_auth: true, register_anon: false, archive_auth: true, archive_service: false }]);
    const fields = await db.query<{ deleted_at: string | null; deleted_by: string | null; library_version: number }>(`select deleted_at::text,deleted_by::text,library_version from private.patient_document_uploads limit 0`);
    expect(fields.rows).toEqual([]);
  });
});


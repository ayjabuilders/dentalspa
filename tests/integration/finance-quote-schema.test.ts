import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('tenant-scoped finance quote schema', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key);
      create schema private;
      create table public.clinics(id uuid primary key);
      create table public.patients(
        id uuid not null,
        clinic_id uuid not null references public.clinics(id),
        primary key (clinic_id, id)
      );
    `);
    await db.exec(readFileSync('supabase/migrations/20261030220000_finance_quote_foundation.sql', 'utf8'));
  });

  afterAll(async () => { await db?.close(); });

  it('keeps each finance table private with RLS and no Data API table grants', async () => {
    const access = await db.query<{ table_name: string; relrowsecurity: boolean; anon_select: boolean; authenticated_select: boolean; service_select: boolean }>(`
      select c.relname as table_name, c.relrowsecurity,
        has_table_privilege('anon', c.oid, 'select') as anon_select,
        has_table_privilege('authenticated', c.oid, 'select') as authenticated_select,
        has_table_privilege('service_role', c.oid, 'select') as service_select
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'private' and c.relname like 'finance_%' and c.relkind = 'r'
      order by c.relname
    `);
    expect(access.rows).toHaveLength(5);
    expect(access.rows.every(row => row.relrowsecurity && !row.anon_select && !row.authenticated_select && !row.service_select)).toBe(true);
  });

  it('enforces clinic-scoped references and immutable integer price/quote snapshots', async () => {
    await db.exec(`
      insert into auth.users values ('89100000-0000-4000-8000-000000000001');
      insert into public.clinics values
        ('89000000-0000-4000-8000-000000000001'),
        ('89000000-0000-4000-8000-000000000002');
      insert into public.patients values
        ('89200000-0000-4000-8000-000000000001', '89000000-0000-4000-8000-000000000001'),
        ('89200000-0000-4000-8000-000000000002', '89000000-0000-4000-8000-000000000002');
      insert into private.finance_catalog_services(clinic_id, id, service_code, service_name) values
        ('89000000-0000-4000-8000-000000000001', '89300000-0000-4000-8000-000000000001', 'SAMPLE', 'Fictional service');
      insert into private.finance_catalog_price_versions(clinic_id, service_id, version, unit_amount_minor, currency_code, effective_from, created_by) values
        ('89000000-0000-4000-8000-000000000001', '89300000-0000-4000-8000-000000000001', 1, 17, 'MAD', now(), '89100000-0000-4000-8000-000000000001');
      insert into private.finance_quotes(clinic_id, id, patient_id, created_by) values
        ('89000000-0000-4000-8000-000000000001', '89400000-0000-4000-8000-000000000001', '89200000-0000-4000-8000-000000000001', '89100000-0000-4000-8000-000000000001');
      insert into private.finance_quote_versions(clinic_id, quote_id, version, currency_code, subtotal_minor, discount_minor, tax_minor, created_by) values
        ('89000000-0000-4000-8000-000000000001', '89400000-0000-4000-8000-000000000001', 1, 'MAD', 34, 3, 1, '89100000-0000-4000-8000-000000000001');
      insert into private.finance_quote_lines(clinic_id, quote_id, quote_version, line_number, service_id, price_version, label_snapshot, quantity, unit_amount_minor, discount_minor, tax_minor) values
        ('89000000-0000-4000-8000-000000000001', '89400000-0000-4000-8000-000000000001', 1, 1, '89300000-0000-4000-8000-000000000001', 1, 'Fictional snapshot', 2, 17, 3, 1);
    `);

    expect((await db.query<{ total_minor: number }>(`select total_minor from private.finance_quote_versions where version = 1`)).rows).toEqual([{ total_minor: 32 }]);
    await expect(db.query(`insert into private.finance_quotes(clinic_id, id, patient_id, created_by) values ('89000000-0000-4000-8000-000000000001', '89400000-0000-4000-8000-000000000002', '89200000-0000-4000-8000-000000000002', '89100000-0000-4000-8000-000000000001')`)).rejects.toThrow();
    await expect(db.query(`update private.finance_catalog_price_versions set unit_amount_minor = 18 where version = 1`)).rejects.toThrow('finance_snapshot_is_immutable');
    await expect(db.query(`insert into private.finance_quote_versions(clinic_id, quote_id, version, state, currency_code, subtotal_minor, discount_minor, tax_minor, created_by) values ('89000000-0000-4000-8000-000000000001', '89400000-0000-4000-8000-000000000001', 2, 'approved', 'MAD', 1, 0, 0, '89100000-0000-4000-8000-000000000001')`)).rejects.toThrow();
  });
});

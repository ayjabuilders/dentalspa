import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

describe('public synthetic availability SQL projection (PGlite, not native acceptance)', () => {
  const db = new PGlite();
  let date: string;
  beforeAll(async () => {
    await db.exec(`create role anon; create role authenticated; create schema private;
      create table private.demo_booking_confirmation_settings(singleton boolean, enabled boolean, api_gate_key text);
      insert into private.demo_booking_confirmation_settings values(true, true, 'synthetic-gate');
      create table private.demo_booking_sample_resources(id uuid, clinic_id uuid, kind text, active boolean);
      create table private.demo_confirmed_appointments(clinic_id uuid, provider_resource_id uuid, chair_resource_id uuid, starts_at timestamptz, ends_at timestamptz, status text);
      insert into private.demo_booking_sample_resources values
        ('73000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','provider',true),
        ('73000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','provider',true),
        ('73000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','chair',true),
        ('73000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','chair',true);`);
    await db.exec(await readFile('supabase/migrations/20261031080000_demo_booking_availability.sql', 'utf8'));
    const result = await db.query<{ date: string }>(`select to_char(current_date + (8-extract(isodow from current_date))::int, 'YYYY-MM-DD') as date`);
    if (!result.rows[0]) throw new Error('Database did not return the fixture date');
    date = result.rows[0].date;
  });
  afterAll(() => db.close());

  async function slots() {
    return (await db.query<{ starts_at: Date; ends_at: Date; resource_pair: string }>(
      'select * from public.list_demo_booking_availability($1::date, $2)', [date, 'synthetic-gate'])).rows;
  }

  it('returns only available times/pairs, skips lunch and uses Casablanca wall time', async () => {
    const result = await slots();
    expect(result).toHaveLength(48);
    expect(Object.keys(result[0]!).sort()).toEqual(['ends_at', 'resource_pair', 'starts_at']);
    const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Casablanca', hour: '2-digit', minute: '2-digit' });
    expect(formatter.format(result[0]!.starts_at)).toBe('09:00');
    for (const slot of result) {
      expect(+slot.ends_at - +slot.starts_at).toBe(45 * 60000);
      const start = formatter.format(slot.starts_at);
      const end = formatter.format(slot.ends_at);
      expect((start >= '09:00' && end <= '12:00') || (start >= '14:00' && end <= '18:00')).toBe(true);
    }
  });

  it('excludes provider/chair conflicts and inactive resources without leaking their records', async () => {
    const first = (await slots())[0];
    if (!first) throw new Error('Expected a slot for the conflict fixture');
    await db.query(`insert into private.demo_confirmed_appointments values
      ('10000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000003',$1,$2,'confirmed')`, [first.starts_at, first.ends_at]);
    const remaining = await slots();
    expect(remaining.some(slot => slot.resource_pair === 'a' && +slot.starts_at < +first.ends_at)).toBe(false);
    expect(remaining.some(slot => slot.resource_pair === 'b' && +slot.starts_at === +first.starts_at)).toBe(true);
    expect(remaining.some(slot => slot.resource_pair === 'a' && +slot.starts_at === +first.ends_at)).toBe(true);
    await db.exec("update private.demo_booking_sample_resources set active=false where kind='chair'");
    expect(await slots()).toEqual([]);
  });

  it('rejects invalid ranges and gates, and closes Sunday', async () => {
    await expect(db.query("select * from public.list_demo_booking_availability(current_date - 1, 'synthetic-gate')")).rejects.toMatchObject({ code: '22023' });
    await expect(db.query("select * from public.list_demo_booking_availability(current_date + 92, 'synthetic-gate')")).rejects.toMatchObject({ code: '22023' });
    await expect(db.query("select * from public.list_demo_booking_availability(current_date + 1, 'wrong')")).rejects.toMatchObject({ code: 'PT503' });
    await db.exec('update private.demo_booking_sample_resources set active=true');
    const sunday = await db.query('select * from public.list_demo_booking_availability($1::date + 6, $2)', [date, 'synthetic-gate']);
    expect(sunday.rows).toEqual([]);
  });
});

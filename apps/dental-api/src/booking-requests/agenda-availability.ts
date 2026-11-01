import { z } from 'zod';
import { AgendaSettingsSchema } from '@dental/contracts';

const interval = z.object({ starts_at: z.iso.datetime({ offset: true }), ends_at: z.iso.datetime({ offset: true }) }).strict()
  .refine(value => Date.parse(value.starts_at) < Date.parse(value.ends_at));
const inputSchema = z.object({
  clinic_id: z.uuid(), date: z.iso.date(), visit_type_id: z.uuid(), now: z.iso.datetime({ offset: true }),
  settings: AgendaSettingsSchema,
  resources: z.array(z.object({
    id: z.uuid(), clinic_id: z.uuid(), kind: z.enum(['provider', 'chair']), active: z.boolean(),
    windows: z.array(interval).max(1000),
  }).strict()).max(200),
  occupancy: z.array(z.object({
    clinic_id: z.uuid(), resource_id: z.uuid(), period: interval,
  }).strict()).max(10000),
}).strict();

const minute = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
const clock = (value: number) => `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
const overlaps = (start: number, end: number, otherStart: number, otherEnd: number) => start < otherEnd && otherStart < end;

/** Domain calculation only. Caller must load one complete authorized snapshot;
 * never accept resources/occupancy/settings supplied by a public browser.
 * Confirmation must revalidate under database locks; discovery is informational.
 */
export function calculatePublicAgendaSlots(raw: unknown) {
  const input = inputSchema.parse(raw);
  const settings = input.settings;
  if (input.resources.some(resource => resource.clinic_id !== input.clinic_id)
    || input.occupancy.some(occupied => occupied.clinic_id !== input.clinic_id)
    || new Set(input.resources.map(resource => resource.id)).size !== input.resources.length) throw new Error('invalid_agenda_snapshot');
  const visit = settings.visit_types.find(type => type.id === input.visit_type_id && type.active && type.public_bookable);
  const result: Array<{ starts_at: string; ends_at: string; provider_id: string; chair_id: string }> = [];
  if (!visit) return result;
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: settings.time_zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const local = (time: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(time).map(part => [part.type, part.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
  };
  const now = Date.parse(input.now);
  const nominalDay = Date.parse(`${input.date}T00:00:00Z`);
  const dayDistance = (nominalDay - Date.parse(`${local(now).date}T00:00:00Z`)) / 86400000;
  if (dayDistance < 0 || dayDistance > settings.booking_horizon_days) return result;
  const weekday = new Date(nominalDay).getUTCDay() || 7;

  // Resolve wall times through the timezone database. Missing or repeated wall
  // minutes around clock changes are not silently guessed.
  const instants = new Map<string, number[]>();
  for (let time = nominalDay - 3 * 3600000; time <= nominalDay + 27 * 3600000; time += 60000) {
    const wall = local(time);
    if (wall.date === input.date) instants.set(wall.time, [...(instants.get(wall.time) ?? []), time]);
  }
  const instant = (value: number) => {
    const candidates = instants.get(clock(value));
    return candidates?.length === 1 ? candidates[0] : undefined;
  };
  const seen = new Set<string>();
  for (const window of visit.weekly_windows.filter(window => window.weekday === weekday)) {
    for (let start = minute(window.start); start + visit.duration_minutes <= minute(window.end); start += settings.slot_step_minutes) {
      const end = start + visit.duration_minutes;
      const occupiedStart = start - visit.buffer_before_minutes;
      const occupiedEnd = end + visit.buffer_after_minutes;
      if (!settings.weekly_windows.some(open => open.weekday === weekday && minute(open.start) <= occupiedStart && minute(open.end) >= occupiedEnd)) continue;
      const startUtc = instant(start), endUtc = instant(end), fromUtc = instant(occupiedStart), toUtc = instant(occupiedEnd);
      if (startUtc === undefined || endUtc === undefined || fromUtc === undefined || toUtc === undefined
        || endUtc - startUtc !== visit.duration_minutes * 60000
        || toUtc - fromUtc !== (visit.duration_minutes + visit.buffer_before_minutes + visit.buffer_after_minutes) * 60000
        || startUtc < now + settings.minimum_notice_minutes * 60000) continue;
      for (const pair of visit.resource_pairs) {
        const resourceIds = [pair.provider_id, pair.chair_id];
        const provider = input.resources.find(resource => resource.id === pair.provider_id && resource.kind === 'provider' && resource.active);
        const chair = input.resources.find(resource => resource.id === pair.chair_id && resource.kind === 'chair' && resource.active);
        if (!provider || !chair || ![provider, chair].every(resource => resource.windows.some(open => Date.parse(open.starts_at) <= fromUtc && Date.parse(open.ends_at) >= toUtc))) continue;
        if (settings.closures.some(closed => closed.date === input.date && (closed.resource_id === null || resourceIds.includes(closed.resource_id))
          && overlaps(occupiedStart, occupiedEnd, minute(closed.start), minute(closed.end)))) continue;
        if (input.occupancy.some(occupied => resourceIds.includes(occupied.resource_id)
          && overlaps(fromUtc, toUtc, Date.parse(occupied.period.starts_at), Date.parse(occupied.period.ends_at)))) continue;
        const key = `${startUtc}:${pair.provider_id}:${pair.chair_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ starts_at: new Date(startUtc).toISOString(), ends_at: new Date(endUtc).toISOString(), provider_id: pair.provider_id, chair_id: pair.chair_id });
      }
    }
  }
  return result.sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.provider_id.localeCompare(b.provider_id) || a.chair_id.localeCompare(b.chair_id));
}

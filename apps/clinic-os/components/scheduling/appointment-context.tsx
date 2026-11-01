import { CalendarClock } from 'lucide-react';

export type AppointmentContext = { name: string; startsAt: string; endsAt: string };
export const appointmentLocalDate = (startsAt: string) => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(startsAt));

export function AppointmentContextSummary({ context }: { context: AppointmentContext }) {
  const date = new Intl.DateTimeFormat('fr-MA', { timeZone: 'Africa/Casablanca', weekday: 'long', day: 'numeric', month: 'long' });
  const time = new Intl.DateTimeFormat('fr-MA', { timeZone: 'Africa/Casablanca', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return <div className="appointment-context" aria-label="Rendez-vous actuel">
    <CalendarClock size={20} aria-hidden="true" />
    <div><strong>{context.name}</strong><span>{date.format(new Date(context.startsAt))} · {time.format(new Date(context.startsAt))}–{time.format(new Date(context.endsAt))} · Casablanca</span></div>
  </div>;
}

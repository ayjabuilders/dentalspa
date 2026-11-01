'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function BookingCalendar({ date, today, onChange }: { date: string; today: string; onChange: (value: string) => void }) {
  const [browsed, setBrowsed] = useState('');
  const month = browsed || date.slice(0, 7);
  if (!month || !today) return null;
  const first = new Date(`${month}-01T12:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const move = (delta: number) => { const next = new Date(first); next.setUTCMonth(next.getUTCMonth() + delta); setBrowsed(next.toISOString().slice(0, 7)); };
  return <div className="booking-calendar" aria-label="Calendrier de visite">
    <div className="booking-calendar-heading"><button className="booking-icon-button" type="button" aria-label="Mois précédent" disabled={month <= today.slice(0, 7)} onClick={() => move(-1)}><ChevronLeft size={16}/></button><strong>{new Intl.DateTimeFormat('fr-MA', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first)}</strong><button className="booking-icon-button" type="button" aria-label="Mois suivant" onClick={() => move(1)}><ChevronRight size={16}/></button></div>
    <div className="booking-calendar-grid">{['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(day => <span key={day} className="booking-calendar-weekday">{day}</span>)}{Array.from({ length: offset }, (_, index) => <span key={`empty-${index}`} aria-hidden="true"/>)}{Array.from({ length: count }, (_, index) => { const value = `${month}-${String(index + 1).padStart(2, '0')}`; return <button type="button" key={value} disabled={value < today} aria-pressed={value === date} aria-label={new Intl.DateTimeFormat('fr-MA', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))} onClick={() => onChange(value)}>{index + 1}</button>; })}</div>
  </div>;
}

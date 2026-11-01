import {Stethoscope,Sparkles,Smile,HeartPulse,ClipboardCheck,CalendarCheck} from 'lucide-react';
// Presentation only; names never authorize a treatment or a booking.
export function agendaServiceStyle(name:string){
 const n=name.toLocaleLowerCase('fr');
 if(/détartr|hygiène/.test(n))return {Icon:Sparkles,color:'#0f766e',background:'#e0f2ef'};
 if(/esthétique/.test(n))return {Icon:Sparkles,color:'#7e22ce',background:'#f3e8ff'};
 if(/enfant|pédiatr/.test(n))return {Icon:Smile,color:'#b45309',background:'#fef3c7'};
 if(/contrôle|suivi/.test(n))return {Icon:CalendarCheck,color:'#0369a1',background:'#e0f2fe'};
 if(/soins|traitement/.test(n))return {Icon:HeartPulse,color:'#be185d',background:'#fce7f3'};
 if(/orthodont/.test(n))return {Icon:ClipboardCheck,color:'#4338ca',background:'#e0e7ff'};
 return {Icon:Stethoscope,color:'#1d4ed8',background:'#dbeafe'};
}

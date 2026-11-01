import { Globe2, Instagram, Mail, MapPin, MessageCircle, MoreHorizontal, Phone, Store, type LucideIcon } from 'lucide-react';
import type { CreateInquiry } from '@dental/contracts';
import './inquiry-source-badge.css';

const sourcePresentation: Record<CreateInquiry['source'], { label: string; icon: LucideIcon }> = {
  phone: { label: 'Téléphone', icon: Phone },
  website: { label: 'Site web', icon: Globe2 },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
  instagram: { label: 'Instagram', icon: Instagram },
  email: { label: 'E-mail', icon: Mail },
  google_business: { label: 'Google Business', icon: MapPin },
  walk_in: { label: 'Sur place', icon: Store },
  other: { label: 'Autre', icon: MoreHorizontal },
};

/** A declared origin, never a connection or delivery status for a third-party service. */
export function InquirySourceBadge({ source }: { source: CreateInquiry['source'] }) {
  const { label, icon: Icon } = sourcePresentation[source];
  return <span className="inquiry-source-badge" data-source={source} title={`Source déclarée : ${label}`}>
    <Icon size={14} aria-hidden="true" focusable="false"/><span>{label}</span>
  </span>;
}

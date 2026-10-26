'use client';
import type { Inquiry } from '@dental/contracts';
import type { IntakeTransport } from './transport';
import { InquiryContactPreference } from './inquiry-contact-preference';
import { InquiryCommunicationLanguage } from './inquiry-communication-language';
import './inquiry-qualification.css';
export function InquiryQualification({inquiry,transport}:{inquiry:Inquiry|null;transport:IntakeTransport}) {
 return <section className="inquiry-qualification" aria-label="Informations déclarées"><h3>Informations déclarées</h3><InquiryContactPreference inquiry={inquiry} transport={transport}/><InquiryCommunicationLanguage inquiry={inquiry} transport={transport}/></section>;
}

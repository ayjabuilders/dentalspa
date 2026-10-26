import type { InquiryContactPreferenceState,InquiryContactPreferenceResult,SetInquiryContactPreference } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
export const CONTACT_PREFERENCE_REPOSITORY=Symbol('CONTACT_PREFERENCE_REPOSITORY');
export interface ContactPreferenceRepository {
 get(actor:Actor,id:string):Promise<InquiryContactPreferenceState>;
 set(actor:Actor,id:string,input:SetInquiryContactPreference,key:string,correlationId:string):Promise<InquiryContactPreferenceResult>;
}

import type { InquiryCommunicationLanguageState,InquiryCommunicationLanguageResult,SetInquiryCommunicationLanguage } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
export const COMMUNICATION_LANGUAGE_REPOSITORY=Symbol('COMMUNICATION_LANGUAGE_REPOSITORY');
export interface CommunicationLanguageRepository {
 get(actor:Actor,id:string):Promise<InquiryCommunicationLanguageState>;
 set(actor:Actor,id:string,input:SetInquiryCommunicationLanguage,key:string,correlationId:string):Promise<InquiryCommunicationLanguageResult>;
}

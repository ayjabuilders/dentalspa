import type { InquiryCommunicationTimeZoneState,InquiryCommunicationTimeZoneResult,SetInquiryCommunicationTimeZone } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
export const COMMUNICATION_TIME_ZONE_REPOSITORY=Symbol('COMMUNICATION_TIME_ZONE_REPOSITORY');
export interface CommunicationTimeZoneRepository {
 get(actor:Actor,id:string):Promise<InquiryCommunicationTimeZoneState>;
 set(actor:Actor,id:string,input:SetInquiryCommunicationTimeZone,key:string,correlationId:string):Promise<InquiryCommunicationTimeZoneResult>;
}

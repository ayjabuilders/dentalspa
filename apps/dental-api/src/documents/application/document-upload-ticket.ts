import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { LibraryUploadStartSchema } from '@dental/contracts';
import { z } from 'zod';

const Payload=z.object({version:z.literal(1),user_id:z.uuid(),clinic_id:z.uuid(),patient_id:z.uuid(),request_key:z.uuid(),expires_at:z.number().int(),path:z.string().regex(/^_staging\/[0-9]+\/[0-9a-f-]{36}$/),input:LibraryUploadStartSchema}).strict();
export type UploadTicketPayload=z.infer<typeof Payload>;
const key=(secret:string)=>createHash('sha256').update('dental-document-upload-v1\0').update(secret).digest();
const aad=Buffer.from('dental-document-upload-v1');
export function sealUploadTicket(payload:UploadTicketPayload,secret:string) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);cipher.setAAD(aad);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(Payload.parse(payload)),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
}
export function openUploadTicket(ticket:string,secret:string,now=Date.now()):UploadTicketPayload|null {
  try {
    if(ticket.length>20000||!/^[A-Za-z0-9_-]+$/.test(ticket))return null;
    const data=Buffer.from(ticket,'base64url');if(data.length<29)return null;
    const decipher=createDecipheriv('aes-256-gcm',key(secret),data.subarray(0,12));decipher.setAAD(aad);decipher.setAuthTag(data.subarray(12,28));
    const payload=Payload.parse(JSON.parse(Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8')));
    if(payload.expires_at<=now||payload.expires_at>now+1800000)return null;
    return payload;
  } catch {return null;}
}

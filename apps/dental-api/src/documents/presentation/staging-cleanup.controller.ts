import { timingSafeEqual } from 'node:crypto';
import { supabaseAdminKey } from '../../identity/infrastructure/supabase-admin-key';
import { BadRequestException, Controller, Get, Header, Headers, Inject, Query, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Access } from '../../identity/presentation/policy.guard';
import { PRIVATE_DOCUMENT_STORAGE } from '../domain/private-document-storage';
import { cleanupDocumentStaging, type StagingCleanupStorage } from '../application/staging-cleanup';

export function stagingCleanupConfigured(env:Readonly<Record<string,string|undefined>>=process.env) {
  if(env.ENABLE_DOCUMENT_STAGING_CLEANUP!=='true'||!supabaseAdminKey(env))return false;
  try {
    const url=new URL(env.SUPABASE_URL??'');
    if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)return false;
    if(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&url.port==='54321')return true;
    return /^[a-z0-9]{20}$/.test(env.HOSTED_SUPABASE_PROJECT_REF??'')&&url.origin===`https://${env.HOSTED_SUPABASE_PROJECT_REF}.supabase.co`;
  }catch{return false;}
}
@Controller('internal/document-staging-cleanup')
export class StagingCleanupController {
  constructor(@Inject(PRIVATE_DOCUMENT_STORAGE) private readonly storage:StagingCleanupStorage) {}
  // Vercel Cron authenticates with its server-only CRON_SECRET, never a staff JWT.
  @Get() @Access('public') @Header('Cache-Control','no-store')
  async run(@Headers('authorization') authorization:string|undefined,@Query() query:Record<string,unknown>) {
    const secret=process.env.CRON_SECRET;
    if(!secret||secret.length<32)throw new ServiceUnavailableException('Maintenance unavailable');
    const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(authorization??'');
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new UnauthorizedException();
    if(Object.keys(query).length)throw new BadRequestException('Unexpected maintenance parameters');
    if(!stagingCleanupConfigured())throw new ServiceUnavailableException('Maintenance unavailable');
    const result=await cleanupDocumentStaging(this.storage);
    console.log(JSON.stringify({event:'document.staging.cleanup',removed:result.removed,partial:result.partial}));
    return result;
  }
}

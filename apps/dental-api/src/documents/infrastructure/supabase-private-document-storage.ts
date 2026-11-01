import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdminKey } from '../../identity/infrastructure/supabase-admin-key';
import type { PrivateDocumentStorage } from '../domain/private-document-storage';
import type { StagingEntry } from '../application/staging-cleanup';

@Injectable()
export class SupabasePrivateDocumentStorage implements PrivateDocumentStorage {
  private client() {
    const url=process.env.SUPABASE_URL, key=supabaseAdminKey();
    if(!url||!key) throw new ServiceUnavailableException('Private document storage is not configured');
    // The privileged key stays on the API server. Download capabilities are short-lived.
    return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  }
  async upload(path:string,bytes:Buffer,contentType:string) {
    const {error}=await this.client().storage.from('patient-documents').upload(path,bytes,{contentType,upsert:false,cacheControl:'0'});
    return !error;
  }
  async remove(path:string) {
    await this.client().storage.from('patient-documents').remove([path]);
  }
  async download(path:string) {
    const {data,error}=await this.client().storage.from('patient-documents').download(path);
    if(error||!data) return null;
    return Buffer.from(await data.arrayBuffer());
  }
  async signedDownload(path:string,expiresIn:number) {
    if(expiresIn!==30) throw new ServiceUnavailableException('Invalid download lifetime');
    const {data,error}=await this.client().storage.from('patient-documents').createSignedUrl(path,expiresIn);
    if(error||!data?.signedUrl)return null;
    const url=new URL(data.signedUrl),provider=new URL(process.env.SUPABASE_URL!);
    if(url.origin!==provider.origin||url.username||url.password||url.hash||url.pathname!==`/storage/v1/object/sign/patient-documents/${path}`)return null;
    return url.toString();
  }
  async signedUpload(path:string) {
    if(!/^_staging\/[0-9]+\/[0-9a-f-]{36}$/.test(path))throw new ServiceUnavailableException('Invalid staging path');
    const {data,error}=await this.client().storage.from('patient-documents').createSignedUploadUrl(path,{upsert:false});
    if(error||!data?.signedUrl)return null;
    const url=new URL(data.signedUrl),provider=new URL(process.env.SUPABASE_URL!);
    if(url.origin!==provider.origin||url.username||url.password||url.hash||url.pathname!==`/storage/v1/object/upload/sign/patient-documents/${path}`)return null;
    return url.toString();
  }
  async listStaging(prefix:string,offset:number):Promise<StagingEntry[]> {
    if(!/^_staging(?:\/\d{13})?$/.test(prefix)||!Number.isSafeInteger(offset)||offset<0)throw new ServiceUnavailableException('Invalid staging scan');
    const {data,error}=await this.client().storage.from('patient-documents').list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}});
    if(error||!data)throw new ServiceUnavailableException('Staging scan unavailable');
    return data.map(entry=>({name:entry.name,id:entry.id??null,created_at:entry.created_at??null}));
  }
  async removeStaging(paths:string[]) {
    if(paths.length>100||paths.some(path=>!/^_staging\/\d{13}\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(path)))throw new ServiceUnavailableException('Invalid staging cleanup');
    if(!paths.length)return;
    const {error}=await this.client().storage.from('patient-documents').remove(paths);
    if(error)throw new ServiceUnavailableException('Staging cleanup unavailable');
  }
}

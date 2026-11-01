import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupDocumentStaging, type StagingEntry } from '../../apps/dental-api/src/documents/application/staging-cleanup';
import { stagingCleanupConfigured, StagingCleanupController } from '../../apps/dental-api/src/documents/presentation/staging-cleanup.controller';
const now=1800000000000,old=String(now-4*3600000),active=String(now+1800000);
const id='10000000-0000-4000-8000-000000000001';
const folder=(name:string):StagingEntry=>({name,id:null,created_at:null});
const object=(name=id,created=now-4*3600000):StagingEntry=>({name,id:'storage-object',created_at:new Date(created).toISOString()});
afterEach(()=>vi.unstubAllEnvs());
describe('private staging cleanup',()=>{
 it('only selects expired temporary UUID objects with an old creation timestamp',async()=>{
   const listStaging=vi.fn(async(prefix:string)=>prefix==='_staging'?[folder(old),folder(active),folder('../patients'),folder('123')]:[object(),object('20000000-0000-4000-8000-000000000002',now),object('../final'),folder(id)]);
   const removeStaging=vi.fn(async()=>{});
   expect(await cleanupDocumentStaging({listStaging,removeStaging},now)).toEqual({removed:1,partial:false});
   expect(listStaging.mock.calls.map(call=>call[0])).toEqual(['_staging',`_staging/${old}`]);
   expect(removeStaging).toHaveBeenCalledWith([`_staging/${old}/${id}`]);
 });
 it('snapshots pages before deleting and caps a maintenance batch at 500',async()=>{
   const events:string[]=[];
   const listStaging=vi.fn(async(prefix:string,offset:number)=>{events.push('list');return prefix==='_staging'?[folder(old)]:Array.from({length:100},(_,i)=>object(`${(offset+i).toString(16).padStart(8,'0')}-0000-4000-8000-000000000001`));});
   const removeStaging=vi.fn(async()=>{events.push('delete');});
   expect(await cleanupDocumentStaging({listStaging,removeStaging},now)).toEqual({removed:500,partial:true});
   expect(removeStaging).toHaveBeenCalledTimes(5);
   expect(events.slice(0,6)).toEqual(Array(6).fill('list'));expect(events.slice(6)).toEqual(Array(5).fill('delete'));
 });
 it('does not delete anything after a failed scan',async()=>{
   const listStaging=vi.fn().mockResolvedValueOnce([folder(old)]).mockRejectedValueOnce(new Error('storage unavailable')),removeStaging=vi.fn();
   await expect(cleanupDocumentStaging({listStaging,removeStaging},now)).rejects.toThrow();expect(removeStaging).not.toHaveBeenCalled();
 });
 it('requires an explicit switch and exact configured provider',()=>{
   const env={ENABLE_DOCUMENT_STAGING_CLEANUP:'true',SUPABASE_SERVICE_ROLE_KEY:'test-only',SUPABASE_URL:'https://giufpdppsunryyhfnzps.supabase.co',HOSTED_SUPABASE_PROJECT_REF:'giufpdppsunryyhfnzps'};
   expect(stagingCleanupConfigured(env)).toBe(true);
   for(const SUPABASE_URL of ['https://evil.test','https://giufpdppsunryyhfnzps.supabase.co/path','https://user@giufpdppsunryyhfnzps.supabase.co','http://giufpdppsunryyhfnzps.supabase.co'])expect(stagingCleanupConfigured({...env,SUPABASE_URL})).toBe(false);
   expect(stagingCleanupConfigured({...env,ENABLE_DOCUMENT_STAGING_CLEANUP:'false'})).toBe(false);
 });
 it('denies staff tokens, missing secrets and caller-controlled scope before storage',async()=>{
   const listStaging=vi.fn().mockResolvedValue([]),removeStaging=vi.fn(),controller=new StagingCleanupController({listStaging,removeStaging});
   vi.stubEnv('CRON_SECRET','x'.repeat(32));
   await expect(controller.run('Bearer staff-token',{})).rejects.toMatchObject({status:401});
   await expect(controller.run('Bearer '+'x'.repeat(32),{prefix:'patients'})).rejects.toMatchObject({status:400});
   vi.stubEnv('ENABLE_DOCUMENT_STAGING_CLEANUP','false');
   await expect(controller.run('Bearer '+'x'.repeat(32),{})).rejects.toMatchObject({status:503});
   vi.stubEnv('CRON_SECRET','');await expect(controller.run(undefined,{})).rejects.toMatchObject({status:503});
   expect(listStaging).not.toHaveBeenCalled();expect(removeStaging).not.toHaveBeenCalled();
 });
});

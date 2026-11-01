export type StagingEntry={name:string;id:string|null;created_at:string|null};
export interface StagingCleanupStorage {
  listStaging(prefix:string,offset:number):Promise<StagingEntry[]>;
  removeStaging(paths:string[]):Promise<void>;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const grace=2*60*60*1000;
export async function cleanupDocumentStaging(storage:StagingCleanupStorage,now=Date.now()) {
  // A folder stores the app ticket expiry (issued +30min). Waiting another two
  // hours also outlasts Supabase's two-hour signed-upload capability plus margin.
  const folders:StagingEntry[]=[];let partial=false;
  for(let offset=0;offset<2000;offset+=100){
    const page=await storage.listStaging('_staging',offset);folders.push(...page);
    if(page.length<100)break;
    if(offset===1900)partial=true;
  }
  const paths:string[]=[];
  for(const folder of folders){
    if(folder.id!==null||!/^\d{13}$/.test(folder.name)||Number(folder.name)>now-grace)continue;
    const prefix=`_staging/${folder.name}`;
    for(let offset=0;offset<1000;offset+=100){
      const page=await storage.listStaging(prefix,offset);
      for(const entry of page){
        const created=Date.parse(entry.created_at??'');
        if(entry.id&&UUID.test(entry.name)&&Number.isFinite(created)&&created<=now-grace)paths.push(`${prefix}/${entry.name}`);
        if(paths.length>=500){partial=true;break;}
      }
      if(paths.length>=500||page.length<100)break;
      if(offset===900)partial=true;
    }
    if(paths.length>=500)break;
  }
  // Snapshot first: deleting during offset pagination would skip pending objects.
  for(let offset=0;offset<paths.length;offset+=100)await storage.removeStaging(paths.slice(offset,offset+100));
  return {removed:paths.length,partial};
}

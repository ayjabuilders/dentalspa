import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { throwIntakeDatabaseError } from '../../apps/dental-api/src/intake/infrastructure/intake.repository';
describe('sanitized intake SQLSTATE mapping',()=>{
  for(const [code,status] of [['28000',401],['PGRST301',401],['PGRST302',401],['42501',403],['22023',400],['22P02',400],['22007',400],['22008',400],['PT409',409],['PT503',503],['23505',503],['unknown',503]] as const){
    it(`${code} maps to ${status} without propagating provider text`,()=>{
      try{throwIntakeDatabaseError({code,...{message:'private@example.test',details:'sensitive detail'}});}
      catch(error){expect(error).toBeInstanceOf(HttpException);expect((error as HttpException).getStatus()).toBe(status);expect(JSON.stringify((error as HttpException).getResponse())).not.toMatch(/private@|sensitive/);expect((error as HttpException).getResponse()).toMatchObject(code==='PT503'?{code:'intake_disabled'}:{});if(code!=='PT503')expect(JSON.stringify((error as HttpException).getResponse())).not.toContain('intake_disabled');}
    });
  }
});

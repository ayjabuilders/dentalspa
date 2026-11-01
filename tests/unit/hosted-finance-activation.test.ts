import {describe,expect,it} from 'vitest';
import {financeActivationKey,type FinanceModule} from '../../apps/dental-api/src/identity/infrastructure/module-activation';
const modules:FinanceModule[]=['quotes','invoices','payments','installments'];
const flags=['QUOTE_DRAFTS','INVOICES','PAYMENTS','INSTALLMENTS'];
const hosted={SUPABASE_URL:'https://giufpdppsunryyhfnzps.supabase.co',HOSTED_SUPABASE_PROJECT_REF:'giufpdppsunryyhfnzps',HOSTED_FINANCE_GATE_KEY:'hosted-private-gate'};
describe('hosted finance module activation',()=>{
 for(const [i,module]of modules.entries()){
   it(`requires explicit hosted activation for ${module}, never inherited local switches`,()=>{
     const local={[`ENABLE_LOCAL_${flags[i]}`]:'true',LOCAL_QUOTE_DRAFT_GATE_KEY:'local-private-gate'};
     expect(financeActivationKey(module,{...hosted,...local})).toBeNull();
     expect(financeActivationKey(module,{...hosted,[`ENABLE_HOSTED_${flags[i]}`]:'true'})).toBe('hosted-private-gate');
     expect(financeActivationKey(module,{...hosted,[`ENABLE_HOSTED_${flags[i]}`]:'true',HOSTED_FINANCE_GATE_KEY:undefined})).toBeNull();
     expect(financeActivationKey(module,{...local,SUPABASE_URL:'http://127.0.0.1:54321'})).toBe('local-private-gate');
   });
 }
 it.each(['http://giufpdppsunryyhfnzps.supabase.co','https://giufpdppsunryyhfnzps.supabase.co.evil.test','https://anotherproject000000.supabase.co','https://user:password@giufpdppsunryyhfnzps.supabase.co','https://giufpdppsunryyhfnzps.supabase.co:444','https://giufpdppsunryyhfnzps.supabase.co/rest/v1','https://giufpdppsunryyhfnzps.supabase.co?key=x','https://giufpdppsunryyhfnzps.supabase.co#hash','http://127.0.0.1:54322'])('rejects unpinned or malformed provider %s',SUPABASE_URL=>{
   expect(financeActivationKey('quotes',{...hosted,SUPABASE_URL,ENABLE_HOSTED_QUOTE_DRAFTS:'true',ENABLE_LOCAL_QUOTE_DRAFTS:'true',LOCAL_QUOTE_DRAFT_GATE_KEY:'local'})).toBeNull();
 });
 it('does not activate adjacent modules or accept missing project binding',()=>{
   expect(financeActivationKey('payments',{...hosted,ENABLE_HOSTED_INVOICES:'true'})).toBeNull();
   expect(financeActivationKey('quotes',{...hosted,ENABLE_HOSTED_QUOTE_DRAFTS:'true',HOSTED_SUPABASE_PROJECT_REF:undefined})).toBeNull();
 });
});

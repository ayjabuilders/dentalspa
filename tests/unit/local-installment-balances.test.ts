import {describe,it,expect} from 'vitest';
import {AllocateLocalInstallmentSchema,LocalInstallmentBalancesSchema} from '../../packages/contracts/src/local-installment';
import {A,P1,P2} from '../fixtures';
const line={line_id:P1,invoice_id:P2,due_on:'2026-01-01',amount_minor:5000,paid_minor:3000,remaining_minor:2000,payment_state:'partial',overdue:true};
const invoice={invoice_id:P2,invoice_remaining_minor:2000,scheduled_remaining_minor:2000,requires_revision:false};
const value={clinic_id:A,patient_id:P1,plan_id:P2,version:1,active:true,as_of_date:'2026-10-31',time_zone:'Africa/Casablanca',synthetic_only:true,requires_revision:false,invoices:[invoice],lines:[line]};
describe('installment derived balances',()=>{
 it('rejects fractional or caller-authorized commands',()=>{const body={version:1,line_id:P1,payment_id:P2,amount_minor:2000};expect(AllocateLocalInstallmentSchema.safeParse(body).success).toBe(true);for(const change of [{amount_minor:1.5},{amount_minor:0},{clinic_id:A},{version:0}])expect(AllocateLocalInstallmentSchema.safeParse({...body,...change}).success).toBe(false);});
 it('reconciles invoice totals and line states',()=>{expect(LocalInstallmentBalancesSchema.safeParse(value).success).toBe(true);for(const change of [{paid_minor:2999},{remaining_minor:2001},{payment_state:'paid'},{overdue:false},{invoice_id:A}])expect(LocalInstallmentBalancesSchema.safeParse({...value,lines:[{...line,...change}]}).success).toBe(false);});
 it('requires revisions to reflect actual invoice differences',()=>{expect(LocalInstallmentBalancesSchema.safeParse({...value,invoices:[{...invoice,invoice_remaining_minor:1000}]}).success).toBe(false);expect(LocalInstallmentBalancesSchema.safeParse({...value,requires_revision:true,invoices:[{...invoice,invoice_remaining_minor:1000,requires_revision:true}]}).success).toBe(true);});
 it('does not mark inactive or paid lines overdue and rejects duplicate identities',()=>{expect(LocalInstallmentBalancesSchema.safeParse({...value,active:false}).success).toBe(false);expect(LocalInstallmentBalancesSchema.safeParse({...value,active:false,lines:[{...line,overdue:false}]}).success).toBe(true);expect(LocalInstallmentBalancesSchema.safeParse({...value,lines:[line,line]}).success).toBe(false);expect(LocalInstallmentBalancesSchema.safeParse({...value,invoices:[invoice,invoice]}).success).toBe(false);});
});

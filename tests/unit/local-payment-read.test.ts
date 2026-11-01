import {describe,it,expect} from 'vitest';
import {LocalPatientPaymentsSchema,LocalPaymentDocumentSchema} from '../../packages/contracts/src/local-payment';
import {A,P1,P2,STAFF} from '../fixtures';
const method={id:STAFF,version:1,code:'TRANSFER',label:'Virement fictif',kind:'bank_transfer',reference_required:true,settlement_behavior:'separate_verification',receiving_account:{id:A,label:'Banque fictive',kind:'bank'}};
const payer={id:P1,reference:'QA-1',display_name:'Salma FICTIF'};
const payment={payment_id:P2,patient_id:P1,version:3,state:'confirmed',settlement:'settled',amount_minor:15000,currency_code:'MAD',reference:'DEMO-QA',effective_at:'2026-10-31T12:00:00Z',created_at:'2026-10-31T12:00:00Z',method,payer,payer_basis:'patient_self_synthetic_fixture',refunded_minor:0,allocated_minor:10000,unallocated_minor:5000,available_minor:5000,receipt:null};
const list={clinic_id:A,patient_id:P1,synthetic_only:true,payments:[payment],invoices:[{invoice_id:STAFF,patient_id:P1,number:'DEMO-1',total_minor:25100,currency_code:'MAD',allocated_minor:10000,credited_minor:0,remaining_minor:15100,overpaid_minor:0}],methods:[method],payments_truncated:false,invoices_truncated:false,methods_truncated:false};
describe('payment read arithmetic and historical receipts',()=>{
  it('reconciles current balances and excludes uncleared funds',()=>{
    expect(LocalPatientPaymentsSchema.safeParse(list).success).toBe(true);
    for(const changed of [{available_minor:5001},{unallocated_minor:0},{allocated_minor:15001},{settlement:'pending'},{patient_id:P2},{reference:null}])expect(LocalPatientPaymentsSchema.safeParse({...list,payments:[{...payment,...changed}]}).success).toBe(false);
    expect(LocalPatientPaymentsSchema.safeParse({...list,payments:[{...payment,settlement:'pending',allocated_minor:0,unallocated_minor:15000,available_minor:0}]}).success).toBe(true);
    expect(LocalPatientPaymentsSchema.safeParse({...list,invoices:[{...list.invoices[0],remaining_minor:15101}]}).success).toBe(false);
  });
  it('subtracts verified refunds from current funds and checks receipt versions',()=>{
    const corrected={...payment,refunded_minor:5000,allocated_minor:5000,unallocated_minor:5000,available_minor:5000};
    expect(LocalPatientPaymentsSchema.safeParse({...list,payments:[corrected]}).success).toBe(true);
    expect(LocalPatientPaymentsSchema.safeParse({...list,payments:[{...corrected,available_minor:10000}]}).success).toBe(false);
    expect(LocalPatientPaymentsSchema.safeParse({...list,payments:[{...corrected,refunded_minor:undefined}]}).success).toBe(false);
  });
  it('separates invoice credits from refunds and reports overpayment explicitly',()=>{
    const invoice=list.invoices[0];expect(LocalPatientPaymentsSchema.safeParse({...list,invoices:[{...invoice,credited_minor:5000,remaining_minor:10100}]}).success).toBe(true);
    expect(LocalPatientPaymentsSchema.safeParse({...list,invoices:[{...invoice,credited_minor:20000,remaining_minor:0,overpaid_minor:4900}]}).success).toBe(true);
    expect(LocalPatientPaymentsSchema.safeParse({...list,invoices:[{...invoice,credited_minor:20000,remaining_minor:0,overpaid_minor:0}]}).success).toBe(false);
  });
  it('rejects duplicate IDs and hidden fields',()=>{
    expect(LocalPatientPaymentsSchema.safeParse({...list,payments:[payment,payment]}).success).toBe(false);
    expect(LocalPatientPaymentsSchema.safeParse({...list,methods:[method,method]}).success).toBe(false);
    expect(LocalPatientPaymentsSchema.safeParse({...list,payments:[{...payment,collected_by:STAFF}]}).success).toBe(false);
  });
  it('validates immutable allocation sums separately from current payment state',()=>{
    const snapshot={schema_version:1,synthetic_only:true,clinic:{id:A,name:'Cabinet QA'},payment_id:P2,patient_id:P1,payer,payer_basis:'patient_self_synthetic_fixture',method,amount_minor:15000,currency_code:'MAD',reference:'DEMO-QA',effective_at:'2026-10-31T12:00:00Z',payment_version:2,state:'confirmed',settlement:'pending',allocations:[],allocated_minor:0,unapplied_minor:15000,disclaimer:'LOCAL SYNTHETIC RECEIPT - NOT A STATUTORY DOCUMENT'};
    const document={receipt_id:STAFF,patient_id:P1,payment_id:P2,number:'DEMO-R-1',issued_at:'2026-10-31T12:00:00Z',snapshot};
    expect(LocalPaymentDocumentSchema.safeParse(document).success).toBe(true);
    for(const changed of [{unapplied_minor:1},{payer:{...payer,id:P2}},{settlement:'failed'},{allocated_minor:1}])expect(LocalPaymentDocumentSchema.safeParse({...document,snapshot:{...snapshot,...changed}}).success).toBe(false);
    const v2={...document,snapshot:{...snapshot,schema_version:2,settlement:'settled',refunded_minor:5000,unapplied_minor:10000}};
    expect(LocalPaymentDocumentSchema.safeParse(v2).success).toBe(true);
    for(const changed of [{refunded_minor:undefined},{schema_version:1},{settlement:'pending'},{unapplied_minor:15000}])expect(LocalPaymentDocumentSchema.safeParse({...v2,snapshot:{...v2.snapshot,...changed}}).success).toBe(false);
    const allocation={allocation_id:A,invoice_id:STAFF,invoice_number:'DEMO-1',amount_minor:10000};
    expect(LocalPaymentDocumentSchema.safeParse({...document,snapshot:{...snapshot,settlement:'settled',allocations:[allocation],allocated_minor:10000,unapplied_minor:5000}}).success).toBe(true);
    expect(LocalPaymentDocumentSchema.safeParse({...document,snapshot:{...snapshot,settlement:'settled',allocations:[allocation,allocation],amount_minor:25000,allocated_minor:20000,unapplied_minor:5000}}).success).toBe(false);
  });
});

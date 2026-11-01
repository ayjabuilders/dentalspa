import { describe, expect, it } from 'vitest';
import { PatientHubQuoteSchema } from '../../packages/contracts/src/patient-hub';
const quote = () => ({
  id: '78000000-0000-4000-8000-000000000001', version: 1, state: 'draft', currency_code: 'MAD', total_minor: 57000,
  details: { subtotal_minor: 60000, discount_minor: 3000, tax_minor: 0, valid_until: null,
    lines: [{ line_number: 1, label: 'Prestation fictive', quantity: 2, unit_amount_minor: 30000, subtotal_minor: 60000, discount_minor: 3000, tax_minor: 0, total_minor: 57000 }] },
});
describe('persisted quote detail contract', () => {
  it('accepts exact minor-unit calculations and compatible summary-only responses', () => {
    expect(PatientHubQuoteSchema.safeParse(quote()).success).toBe(true);
    const summary = {...quote(), details: undefined};
    expect(PatientHubQuoteSchema.safeParse(summary).success).toBe(true);
  });
  it('rejects wrong quantity extensions, duplicate lines and inconsistent header totals', () => {
    const wrong = quote(); wrong.details.lines[0]!.quantity = 3;
    expect(PatientHubQuoteSchema.safeParse(wrong).success).toBe(false);
    const duplicate = quote(); duplicate.details.lines.push({...duplicate.details.lines[0]!});
    expect(PatientHubQuoteSchema.safeParse(duplicate).success).toBe(false);
    const total = quote(); total.total_minor += 1;
    expect(PatientHubQuoteSchema.safeParse(total).success).toBe(false);
    const header = quote(); header.details.discount_minor = 0;
    expect(PatientHubQuoteSchema.safeParse(header).success).toBe(false);
  });
  it('rejects fractional and unsafe money, excessive discounts and non-draft states', () => {
    for (const amount of [0.1, Number.MAX_SAFE_INTEGER + 1, -1]) {
      const value = quote(); value.details.lines[0]!.unit_amount_minor = amount;
      expect(PatientHubQuoteSchema.safeParse(value).success).toBe(false);
    }
    const discount = quote(); discount.details.lines[0]!.discount_minor = 60001;
    expect(PatientHubQuoteSchema.safeParse(discount).success).toBe(false);
    expect(PatientHubQuoteSchema.safeParse({...quote(), state: 'issued'}).success).toBe(false);
  });
  it('rejects foreign, duplicate or current-version history', () => {
    const prior=quote();const latest={...quote(),version:2,history:[prior]};
    expect(PatientHubQuoteSchema.safeParse(latest).success).toBe(true);
    for(const history of [[prior,prior],[{...prior,version:2}],[{...prior,id:'78000000-0000-4000-8000-000000000099'}]])expect(PatientHubQuoteSchema.safeParse({...latest,history}).success).toBe(false);
  });
});

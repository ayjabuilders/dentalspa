import { describe, expect, it } from 'vitest';
import {
  allocatePayment,
  balancePosition,
  calculateQuote,
  cashSession,
  createFinanceAcceptanceFixture,
  parseMadMinorUnits,
  remainingBalance,
  splitInstallments,
  summarizeDemoCollections,
  sumIdempotentPayments,
} from '../../apps/clinic-os/components/finance/finance-demo-ledger';

describe('fictional finance acceptance arithmetic', () => {
  it('calculates the specification quote with integer minor units and explicit tax', () => {
    expect(calculateQuote([{ quantity: 2, unitPriceMinor: parseMadMinorUnits('500.00') }], 1_000, 0)).toEqual({
      subtotalMinor: 100_000n,
      discountMinor: 10_000n,
      taxMinor: 0n,
      totalMinor: 90_000n,
    });
  });

  it('rejects malformed decimal money and invalid quote lines', () => {
    expect(() => parseMadMinorUnits('1.005')).toThrow();
    expect(() => parseMadMinorUnits('-1.00')).toThrow();
    expect(() => calculateQuote([{ quantity: 0, unitPriceMinor: 100n }])).toThrow();
    expect(() => calculateQuote([{ quantity: 1, unitPriceMinor: 100n }], 10_001)).toThrow();
  });

  it('counts a retried payment request once and rejects a key reused for a different amount', () => {
    const result = sumIdempotentPayments([
      { idempotencyKey: 'payment-1', amountMinor: 20_000n },
      { idempotencyKey: 'payment-1', amountMinor: 20_000n },
    ]);
    expect(result).toEqual({ totalMinor: 20_000n, uniqueCount: 1, duplicateCount: 1 });
    expect(() => sumIdempotentPayments([
      { idempotencyKey: 'payment-1', amountMinor: 20_000n },
      { idempotencyKey: 'payment-1', amountMinor: 19_999n },
    ])).toThrow();
  });

  it('splits installments without losing minor units and prevents over-allocation', () => {
    expect(splitInstallments(60_000n, 2)).toEqual([30_000n, 30_000n]);
    expect(splitInstallments(10n, 3)).toEqual([4n, 3n, 3n]);
    expect(allocatePayment(20_000n, 0n, 20_000n)).toBe(20_000n);
    expect(() => allocatePayment(20_000n, 10_000n, 10_001n)).toThrow();
  });

  it('preserves payment, refund and credit history in the derived balance', () => {
    expect(remainingBalance(90_000n, [30_000n, 20_000n])).toBe(40_000n);
    expect(remainingBalance(90_000n, [30_000n, 20_000n], [10_000n])).toBe(50_000n);
    expect(remainingBalance(90_000n, [30_000n, 20_000n], [10_000n], [10_000n])).toBe(40_000n);
    expect(() => remainingBalance(90_000n, [-1n])).toThrow();
  });

  it('keeps overpayment as unapplied credit instead of a negative invoice balance', () => {
    expect(balancePosition(90_000n, [100_000n])).toEqual({ dueMinor: 0n, unappliedCreditMinor: 10_000n });
    expect(remainingBalance(90_000n, [100_000n])).toBe(0n);
  });

  it('excludes pending transfers from simulated paid totals and derives credit safely', () => {
    expect(summarizeDemoCollections(100_000n, [
      { id: 1, method: 'bank-transfer', amountMinor: 50_000n, status: 'pending' },
      { id: 2, method: 'cash', amountMinor: 30_000n, status: 'simulated' },
    ])).toEqual({ simulatedMinor: 30_000n, pendingMinor: 50_000n, dueMinor: 70_000n, unappliedCreditMinor: 0n });
    expect(summarizeDemoCollections(10_000n, [
      { id: 1, method: 'card-terminal', amountMinor: 15_000n, status: 'simulated' },
    ])).toEqual({ simulatedMinor: 15_000n, pendingMinor: 0n, dueMinor: 0n, unappliedCreditMinor: 5_000n });
    expect(() => summarizeDemoCollections(10_000n, [
      { id: 1, method: 'cash', amountMinor: 0n, status: 'simulated' },
    ])).toThrow();
  });

  it('computes expected cash and discrepancy independently', () => {
    expect(cashSession(10_000n, [50_000n], [5_000n], 54_000n)).toEqual({ expectedMinor: 55_000n, discrepancyMinor: -1_000n });
    expect(() => cashSession(0n, [], [1n], 0n)).toThrow();
  });

  it('matches every numeric value in the CRM MVP acceptance fixture', () => {
    expect(createFinanceAcceptanceFixture()).toEqual({
      quote: { subtotalMinor: 100_000n, discountMinor: 10_000n, taxMinor: 0n, totalMinor: 90_000n },
      depositMinor: 30_000n,
      remainingAfterDepositMinor: 60_000n,
      installmentsMinor: [30_000n, 30_000n],
      partialPaymentMinor: 20_000n,
      firstInstallmentRemainingMinor: 10_000n,
      remainingAfterPartialMinor: 40_000n,
      idempotentPaymentCount: 2,
      duplicatePaymentRetries: 1,
      remainingAfterRefundMinor: 50_000n,
      remainingAfterCreditMinor: 40_000n,
      cashExpectedMinor: 55_000n,
      cashDiscrepancyMinor: -1_000n,
    });
  });
});

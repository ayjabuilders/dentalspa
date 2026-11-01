export type MadLine = { quantity: number; unitPriceMinor: bigint };
export type PaymentEvent = { idempotencyKey: string; amountMinor: bigint };
export type DemoCollectionEvent = {
  id: number;
  method: 'cash' | 'card-terminal' | 'bank-transfer';
  amountMinor: bigint;
  status: 'simulated' | 'pending';
};

export function summarizeDemoCollections(totalMinor: bigint, events: DemoCollectionEvent[]) {
  if (totalMinor < 0n || events.some(event => event.amountMinor <= 0n)) throw new Error('Invalid demo collection.');
  const simulatedMinor = events.filter(event => event.status === 'simulated').reduce((sum, event) => sum + event.amountMinor, 0n);
  const pendingMinor = events.filter(event => event.status === 'pending').reduce((sum, event) => sum + event.amountMinor, 0n);
  const position = balancePosition(totalMinor, [simulatedMinor]);
  return { simulatedMinor, pendingMinor, dueMinor: position.dueMinor, unappliedCreditMinor: position.unappliedCreditMinor };
}

const minorUnitsPerMad = 100n;

export function parseMadMinorUnits(value: string): bigint {
  const match = /^(0|[1-9]\d{0,8})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error('Enter a non-negative MAD amount with up to two decimal places.');
  return BigInt(match[1]!) * minorUnitsPerMad + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
}

export function calculateQuote(lines: MadLine[], discountBasisPoints = 0, taxBasisPoints = 0) {
  if (lines.length === 0 || !Number.isInteger(discountBasisPoints) || discountBasisPoints < 0 || discountBasisPoints > 10_000 || !Number.isInteger(taxBasisPoints) || taxBasisPoints < 0 || taxBasisPoints > 10_000) {
    throw new Error('Invalid quote inputs.');
  }
  const subtotalMinor = lines.reduce((sum, line) => {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0 || line.unitPriceMinor < 0n) throw new Error('Invalid quote line.');
    return sum + BigInt(line.quantity) * line.unitPriceMinor;
  }, 0n);
  const discountMinor = (subtotalMinor * BigInt(discountBasisPoints) + 5_000n) / 10_000n;
  const taxableMinor = subtotalMinor - discountMinor;
  const taxMinor = (taxableMinor * BigInt(taxBasisPoints) + 5_000n) / 10_000n;
  return { subtotalMinor, discountMinor, taxMinor, totalMinor: taxableMinor + taxMinor };
}

export function sumIdempotentPayments(events: PaymentEvent[]) {
  const byKey = new Map<string, bigint>();
  let duplicateCount = 0;
  for (const event of events) {
    if (!event.idempotencyKey.trim() || event.amountMinor <= 0n) throw new Error('Payment events need a key and a positive amount.');
    const existing = byKey.get(event.idempotencyKey);
    if (existing !== undefined) {
      if (existing !== event.amountMinor) throw new Error('An idempotency key cannot identify different payment amounts.');
      duplicateCount++;
      continue;
    }
    byKey.set(event.idempotencyKey, event.amountMinor);
  }
  return { totalMinor: [...byKey.values()].reduce((sum, amount) => sum + amount, 0n), uniqueCount: byKey.size, duplicateCount };
}

export function splitInstallments(totalMinor: bigint, count: number): bigint[] {
  if (totalMinor < 0n || !Number.isInteger(count) || count < 1 || count > 60) throw new Error('Invalid installment schedule.');
  const divisor = BigInt(count);
  const base = totalMinor / divisor;
  const extra = totalMinor % divisor;
  return Array.from({ length: count }, (_, index) => base + (BigInt(index) < extra ? 1n : 0n));
}

export function balancePosition(totalMinor: bigint, paymentsMinor: bigint[], verifiedRefundsMinor: bigint[] = [], postedCreditsMinor: bigint[] = []) {
  if (totalMinor < 0n || [...paymentsMinor, ...verifiedRefundsMinor, ...postedCreditsMinor].some(amount => amount < 0n)) throw new Error('Ledger amounts cannot be negative.');
  const netDue = totalMinor - paymentsMinor.reduce((sum, amount) => sum + amount, 0n)
    + verifiedRefundsMinor.reduce((sum, amount) => sum + amount, 0n)
    - postedCreditsMinor.reduce((sum, amount) => sum + amount, 0n);
  return { dueMinor: netDue > 0n ? netDue : 0n, unappliedCreditMinor: netDue < 0n ? -netDue : 0n };
}

export function remainingBalance(totalMinor: bigint, paymentsMinor: bigint[], verifiedRefundsMinor: bigint[] = [], postedCreditsMinor: bigint[] = []): bigint {
  return balancePosition(totalMinor, paymentsMinor, verifiedRefundsMinor, postedCreditsMinor).dueMinor;
}

export function allocatePayment(paymentMinor: bigint, alreadyAllocatedMinor: bigint, requestedMinor: bigint): bigint {
  if (paymentMinor <= 0n || alreadyAllocatedMinor < 0n || requestedMinor <= 0n || alreadyAllocatedMinor + requestedMinor > paymentMinor) {
    throw new Error('Allocation exceeds the confirmed available payment.');
  }
  return alreadyAllocatedMinor + requestedMinor;
}

export function cashSession(openingMinor: bigint, receiptsMinor: bigint[], refundsMinor: bigint[], countedMinor: bigint) {
  if ([openingMinor, ...receiptsMinor, ...refundsMinor, countedMinor].some(amount => amount < 0n)) throw new Error('Cash session amounts cannot be negative.');
  const expectedMinor = openingMinor + receiptsMinor.reduce((sum, amount) => sum + amount, 0n) - refundsMinor.reduce((sum, amount) => sum + amount, 0n);
  if (expectedMinor < 0n) throw new Error('Refunds cannot exceed the available cash session amount.');
  return { expectedMinor, discrepancyMinor: countedMinor - expectedMinor };
}

export function createFinanceAcceptanceFixture() {
  const quote = calculateQuote([{ quantity: 2, unitPriceMinor: parseMadMinorUnits('500.00') }], 1_000, 0);
  const deposit = parseMadMinorUnits('300.00');
  const remainingAfterDeposit = quote.totalMinor - deposit;
  const installments = splitInstallments(remainingAfterDeposit, 2);
  const partialPayment = parseMadMinorUnits('200.00');
  const firstInstallmentRemaining = installments[0]! - partialPayment;
  const confirmedPayments = sumIdempotentPayments([
    { idempotencyKey: 'deposit', amountMinor: deposit },
    { idempotencyKey: 'partial-installment', amountMinor: partialPayment },
    { idempotencyKey: 'partial-installment', amountMinor: partialPayment },
  ]);
  const refund = parseMadMinorUnits('100.00');
  const credit = parseMadMinorUnits('100.00');
  const cash = cashSession(parseMadMinorUnits('100.00'), [parseMadMinorUnits('500.00')], [parseMadMinorUnits('50.00')], parseMadMinorUnits('540.00'));

  return {
    quote,
    depositMinor: deposit,
    remainingAfterDepositMinor: remainingAfterDeposit,
    installmentsMinor: installments,
    partialPaymentMinor: partialPayment,
    firstInstallmentRemainingMinor: firstInstallmentRemaining,
    remainingAfterPartialMinor: remainingBalance(quote.totalMinor, [confirmedPayments.totalMinor]),
    idempotentPaymentCount: confirmedPayments.uniqueCount,
    duplicatePaymentRetries: confirmedPayments.duplicateCount,
    remainingAfterRefundMinor: remainingBalance(quote.totalMinor, [confirmedPayments.totalMinor], [refund]),
    remainingAfterCreditMinor: remainingBalance(quote.totalMinor, [confirmedPayments.totalMinor], [refund], [credit]),
    cashExpectedMinor: cash.expectedMinor,
    cashDiscrepancyMinor: cash.discrepancyMinor,
  };
}

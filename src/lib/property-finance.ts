type MoneyValue = { toString(): string } | string | number | null | undefined;

export type PropertyFinanceInput = {
  purchasePrice?: MoneyValue;
  expectedPurchasePrice?: MoneyValue;
  outstandingLoan?: MoneyValue;
};

export function propertyFinance(input: PropertyFinanceInput) {
  const purchasePrice = moneyNumber(input.purchasePrice);
  const expectedPurchasePrice = moneyNumber(input.expectedPurchasePrice);
  const outstandingLoan = moneyNumber(input.outstandingLoan);

  return {
    purchasePrice,
    expectedPurchasePrice,
    outstandingLoan,
    valueGain: purchasePrice !== null && expectedPurchasePrice !== null
      ? expectedPurchasePrice - purchasePrice
      : null,
    equity: expectedPurchasePrice !== null && outstandingLoan !== null
      ? expectedPurchasePrice - outstandingLoan
      : null
  };
}

export function moneyNumber(value: MoneyValue) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function decimalString(value: number | null) {
  return value === null ? null : value.toFixed(2);
}

export function withPropertyFinance<T extends PropertyFinanceInput>(property: T) {
  const finance = propertyFinance(property);
  return {
    ...property,
    valueGain: decimalString(finance.valueGain),
    equity: decimalString(finance.equity)
  };
}

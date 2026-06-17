export type RentSource = {
  rentAmount?: unknown;
  garageRent?: unknown;
  serviceCharges?: unknown;
  warmRent?: unknown;
};

export function asMoneyNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calculateColdRent(source: RentSource) {
  return asMoneyNumber(source.rentAmount) + asMoneyNumber(source.garageRent);
}

export function calculateWarmRent(source: RentSource) {
  return calculateColdRent(source) + asMoneyNumber(source.serviceCharges);
}

export function withCalculatedWarmRent<T extends RentSource>(data: T): T & { warmRent: number } {
  return { ...data, warmRent: calculateWarmRent(data) };
}

export function money(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

export function monthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

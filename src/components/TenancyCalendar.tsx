"use client";

import { useMemo, useState } from "react";

type CalendarTenant = {
  id: string;
  firstName: string;
  lastName: string;
  moveInDate: Date | string | null;
  moveOutDate: Date | string | null;
  isCurrent: boolean;
};

type CalendarUnit = {
  id: string;
  unitNumber: string;
  isSharedHousing: boolean;
  tenants: CalendarTenant[];
};

const colors = [
  "bg-emerald-500",
  "bg-sky-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-lime-600"
];

const monthNames = ["Jan", "Feb", "Maerz", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export function TenancyCalendar({ units }: { units: CalendarUnit[] }) {
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    const available = new Set<number>([currentYear]);
    units.forEach((unit) => calendarYears(unit.tenants, currentYear).forEach((year) => available.add(year)));
    return Array.from(available).sort((a, b) => b - a);
  }, [currentYear, units]);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  return (
    <section className="rounded-lg border border-line p-4 sm:p-5">
      <div className="grid gap-1 sm:flex sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Mietverlauf</h2>
          <p className="text-sm text-muted">Jahreskalender pro Einheit. Farbige Tage sind belegt, helle Felder sind frei.</p>
        </div>
        <label className="grid gap-1 text-xs font-semibold text-muted">
          Jahr
          <select className="min-w-28 bg-white text-sm" value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-4 grid gap-4">
        {units.map((unit) => {
          return (
            <details className="overflow-hidden rounded-md border border-line bg-white" key={unit.id} open={unit.tenants.some((tenant) => overlapsYear(tenant, selectedYear))}>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 bg-panel px-4 py-3">
                <span>
                  <span className="font-bold">{unit.unitNumber}</span>
                  {unit.isSharedHousing ? <span className="ml-2 rounded-full bg-white px-2 py-1 text-xs font-semibold text-muted">WG</span> : null}
                </span>
                <span className="text-xs font-semibold text-muted">{unit.tenants.length} Mieterprofile</span>
              </summary>
              <div className="grid gap-4 p-4">
                <YearCalendar tenants={unit.tenants} year={selectedYear} />
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function YearCalendar({ tenants, year }: { tenants: CalendarTenant[]; year: number }) {
  const tenantColors = new Map(tenants.map((tenant, index) => [tenant.id, colors[index % colors.length]]));
  const activeTenants = tenants.filter((tenant) => overlapsYear(tenant, year));
  return (
    <div className="rounded-md bg-panel p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">{year}</h3>
        <div className="flex flex-wrap gap-2 text-xs">
          {activeTenants.map((tenant) => (
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 font-semibold text-muted" key={tenant.id}>
              <span className={`h-2.5 w-2.5 rounded-full ${tenantColors.get(tenant.id)}`} />
              {tenantName(tenant)}
            </span>
          ))}
          {activeTenants.length ? null : <span className="text-muted">keine belegten Zeitraeume</span>}
        </div>
      </div>
      <div className="grid gap-1">
        {monthNames.map((month, monthIndex) => (
          <div className="grid grid-cols-[54px_repeat(31,minmax(0,1fr))] items-center gap-1" key={month}>
            <div className="text-xs font-semibold text-muted">{month}</div>
            {Array.from({ length: 31 }, (_, dayIndex) => {
              const day = dayIndex + 1;
              const valid = day <= daysInMonth(year, monthIndex);
              const occupyingTenant = valid ? tenantForDay(tenants, year, monthIndex, day) : null;
              return (
                <div
                  className={`h-3 min-w-2 rounded-[2px] ${!valid ? "bg-transparent" : occupyingTenant ? tenantColors.get(occupyingTenant.id) : "bg-white"}`}
                  key={day}
                  title={valid ? `${day}.${monthIndex + 1}.${year}${occupyingTenant ? ` - ${tenantName(occupyingTenant)}` : " - frei"}` : ""}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function calendarYears(tenants: CalendarTenant[], currentYear: number) {
  const years = new Set<number>();
  for (const tenant of tenants) {
    const start = dateValue(tenant.moveInDate);
    if (!start) continue;
    const end = dateValue(tenant.moveOutDate) || new Date(Date.UTC(currentYear, 11, 31));
    for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year += 1) years.add(year);
  }
  return Array.from(years).sort((a, b) => b - a);
}

function tenantForDay(tenants: CalendarTenant[], year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month, day));
  return tenants.find((tenant) => {
    const start = dateValue(tenant.moveInDate);
    if (!start || date < start) return false;
    const end = dateValue(tenant.moveOutDate);
    return !end || date < end;
  }) || null;
}

function overlapsYear(tenant: CalendarTenant, year: number) {
  const start = dateValue(tenant.moveInDate);
  if (!start) return false;
  const end = dateValue(tenant.moveOutDate) || new Date(Date.UTC(year, 11, 31));
  return start.getUTCFullYear() <= year && end.getUTCFullYear() >= year;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function dateValue(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function tenantName(tenant: CalendarTenant) {
  return `${tenant.firstName} ${tenant.lastName}`.trim() || "Mieter";
}

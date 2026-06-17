import { Role } from "@prisma/client";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { RentIncomeTable } from "@/components/RentIncomeTable";
import { requireUser } from "@/lib/auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { asMoneyNumber, calculateColdRent, calculateWarmRent, money, monthLabel } from "@/lib/rent";

export const dynamic = "force-dynamic";

export default async function RentIncomePage({ searchParams }: { searchParams?: { year?: string; month?: string } }) {
  const user = await requireUser([Role.ADMIN]);
  const today = new Date();
  const year = Number(searchParams?.year || today.getFullYear());
  const month = Number(searchParams?.month || today.getMonth() + 1);
  const [units, payments, contractDocuments] = await Promise.all([
    prisma.unit.findMany({
      where: { property: portalWhere(user), tenants: { some: { isCurrent: true } } },
      include: {
        property: true,
        tenants: { where: { isCurrent: true }, orderBy: { moveInDate: "desc" }, take: 1 },
        contracts: { orderBy: { createdAt: "desc" }, take: 1 }
      },
      orderBy: [{ property: { name: "asc" } }, { unitNumber: "asc" }]
    }),
    prisma.rentPayment.findMany({ where: { year, month, unit: { property: portalWhere(user) } } }),
    prisma.document.findMany({
      where: { ...portalWhere(user), scope: "CONTRACT" },
      include: { permissions: true },
      orderBy: { createdAt: "desc" }
    })
  ]);
  const paymentByUnit = new Map(payments.map((payment) => [payment.unitId, payment]));
  const contractsByUnit = new Map<string, (typeof contractDocuments)[number]>();
  for (const document of contractDocuments) {
    if (document.unitId && !contractsByUnit.has(document.unitId)) contractsByUnit.set(document.unitId, document);
  }
  const rows = units.map((unit) => {
    const tenant = unit.tenants[0] || null;
    const rentSource = {
      rentAmount: tenant?.rentAmount ?? unit.rentAmount,
      garageRent: tenant?.garageRent ?? unit.garageRent,
      serviceCharges: tenant?.serviceCharges ?? unit.serviceCharges
    };
    const coldRent = calculateColdRent(rentSource);
    const charges = asMoneyNumber(rentSource.serviceCharges);
    const total = calculateWarmRent(rentSource);
    const payment = paymentByUnit.get(unit.id);
    const contract = contractsByUnit.get(unit.id);
    const generatedContract = unit.contracts[0];
    return {
      unitId: unit.id,
      tenantProfileId: tenant?.id || null,
      propertyId: unit.propertyId,
      propertyName: unit.property.name,
      unitNumber: unit.unitNumber,
      tenantName: tenant ? `${tenant.firstName} ${tenant.lastName}`.trim() : "",
      tenantHref: tenant ? `/users?tenantId=${tenant.id}` : "",
      contractHref: contract ? `/documents?documentId=${contract.id}&propertyId=${unit.propertyId}&unitId=${unit.id}` : generatedContract ? `/api/contracts/${generatedContract.id}/preview` : "",
      contractLabel: contract?.title || (generatedContract ? "Generierter Mietvertrag" : ""),
      expectedColdRent: coldRent,
      expectedServiceCharges: charges,
      expectedTotalRent: total,
      paidColdRent: asMoneyNumber(payment?.paidColdRent),
      paidServiceCharges: asMoneyNumber(payment?.paidServiceCharges),
      paidTotalRent: asMoneyNumber(payment?.paidTotalRent),
      status: payment?.status || "OPEN",
      paidAt: payment?.paidAt?.toISOString().slice(0, 10) || ""
    };
  });
  const previous = addMonth(year, month, -1);
  const next = addMonth(year, month, 1);
  const yearTotals = await prisma.rentPayment.findMany({ where: { year, unit: { property: portalWhere(user) } } });
  const expectedYear = rows.reduce((sum, row) => sum + row.expectedTotalRent, 0) * 12;
  const paidYear = yearTotals.reduce((sum, payment) => sum + asMoneyNumber(payment.paidTotalRent), 0);
  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Mieteinnahmen</h1>
          <p className="mt-2 text-muted">Soll/Ist-Abgleich fuer laufend vermietete Einheiten.</p>
        </div>
        <div className="flex gap-2">
          <Link className="button-secondary" href={`/rent-income?year=${previous.year}&month=${previous.month}`}>Voriger Monat</Link>
          <Link className="button-secondary" href={`/rent-income?year=${next.year}&month=${next.month}`}>Naechster Monat</Link>
        </div>
      </div>
      <div className="mt-6 rounded-lg border border-line bg-[linear-gradient(135deg,#f7fcf8,#eef4ff)] p-5">
        <div className="text-sm font-bold uppercase text-accent">Angezeigter Monat: {monthLabel(year, month)}</div>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <div className="rounded-md bg-white p-3"><div className="text-xs font-bold text-muted">Jahres-SOLL</div><div className="text-2xl font-bold">{money(expectedYear)}</div></div>
          <div className="rounded-md bg-white p-3"><div className="text-xs font-bold text-muted">Jahres-IST</div><div className="text-2xl font-bold">{money(paidYear)}</div></div>
        </div>
      </div>
      <div className="mt-6">
        <RentIncomeTable rows={rows} year={year} month={month} />
      </div>
    </AppShell>
  );
}

function addMonth(year: number, month: number, delta: number) {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

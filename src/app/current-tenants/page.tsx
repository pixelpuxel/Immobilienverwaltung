import { Role } from "@prisma/client";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { DocumentThumbnail } from "@/components/DocumentThumbnail";
import { RentIncomeTable } from "@/components/RentIncomeTable";
import { requireUser } from "@/lib/auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { asMoneyNumber, calculateColdRent, calculateWarmRent, money, monthLabel } from "@/lib/rent";

export const dynamic = "force-dynamic";

export default async function CurrentTenantsPage({ searchParams }: { searchParams?: { year?: string; month?: string } }) {
  const user = await requireUser([Role.ADMIN]);
  const today = new Date();
  const year = Number(searchParams?.year || today.getFullYear());
  const month = Number(searchParams?.month || today.getMonth() + 1);
  const [tenants, payments, contractDocuments] = await Promise.all([
    prisma.tenantProfile.findMany({
      where: { isCurrent: true, user: portalWhere(user), unitId: { not: null } },
      include: { user: true, contracts: { orderBy: { createdAt: "desc" }, take: 1 }, unit: { include: { property: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    }),
    prisma.rentPayment.findMany({ where: { year, month, unit: { property: portalWhere(user) } } }),
    prisma.document.findMany({
      where: { ...portalWhere(user), scope: "CONTRACT" },
      include: { permissions: true },
      orderBy: { createdAt: "desc" }
    })
  ]);
  const paymentByUnit = new Map(payments.map((payment) => [payment.unitId, payment]));
  const contractByTenant = new Map<string, (typeof contractDocuments)[number]>();
  const contractByUnit = new Map<string, (typeof contractDocuments)[number]>();
  for (const document of contractDocuments) {
    for (const permission of document.permissions) {
      const tenant = tenants.find((item) => item.userId === permission.userId);
      if (tenant && !contractByTenant.has(tenant.id)) contractByTenant.set(tenant.id, document);
    }
    if (document.unitId && !contractByUnit.has(document.unitId)) contractByUnit.set(document.unitId, document);
  }
  const rows = tenants.flatMap((tenant) => {
    if (!tenant.unit) return [];
    const rentSource = {
      rentAmount: tenant.rentAmount ?? tenant.unit.rentAmount,
      garageRent: tenant.garageRent ?? tenant.unit.garageRent,
      serviceCharges: tenant.serviceCharges ?? tenant.unit.serviceCharges
    };
    const payment = paymentByUnit.get(tenant.unit.id);
    const contract = contractByTenant.get(tenant.id) || contractByUnit.get(tenant.unit.id);
    const generatedContract = tenant.contracts[0];
    return [{
      unitId: tenant.unit.id,
      tenantProfileId: tenant.id,
      propertyId: tenant.unit.propertyId,
      propertyName: tenant.unit.property.name,
      unitNumber: tenant.unit.unitNumber,
      tenantName: `${tenant.firstName} ${tenant.lastName}`.trim(),
      tenantHref: `/users?tenantId=${tenant.id}`,
      contractHref: contract ? `/documents?documentId=${contract.id}&propertyId=${tenant.unit.propertyId}&unitId=${tenant.unit.id}` : generatedContract ? `/api/contracts/${generatedContract.id}/preview` : "",
      contractLabel: contract?.title || (generatedContract ? "Generierter Mietvertrag" : ""),
      expectedColdRent: calculateColdRent(rentSource),
      expectedServiceCharges: asMoneyNumber(rentSource.serviceCharges),
      expectedTotalRent: calculateWarmRent(rentSource),
      paidColdRent: asMoneyNumber(payment?.paidColdRent),
      paidServiceCharges: asMoneyNumber(payment?.paidServiceCharges),
      paidTotalRent: asMoneyNumber(payment?.paidTotalRent),
      status: payment?.status || "OPEN",
      paidAt: payment?.paidAt?.toISOString().slice(0, 10) || ""
    }];
  });

  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Aktuelle Mieterliste</h1>
          <p className="mt-2 text-muted">Aktive Mietverhältnisse, aktuelle Miete und Zahlungsstatus fuer {monthLabel(year, month)}.</p>
        </div>
        <Link className="button-secondary" href="/rent-income">Zur Mieteinnahmen-Ansicht</Link>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tenants.map((tenant) => {
          const unit = tenant.unit;
          if (!unit) return null;
          const contract = contractByTenant.get(tenant.id) || contractByUnit.get(unit.id);
          const generatedContract = tenant.contracts[0];
          const rentSource = {
            rentAmount: tenant.rentAmount ?? unit.rentAmount,
            garageRent: tenant.garageRent ?? unit.garageRent,
            serviceCharges: tenant.serviceCharges ?? unit.serviceCharges
          };
          const payment = paymentByUnit.get(unit.id);
          return (
            <section className="rounded-lg border border-line bg-white p-4" key={tenant.id}>
              <div className="flex gap-3">
                  {contract ? (
                  <Link href={`/documents?documentId=${contract.id}&propertyId=${unit.propertyId}&unitId=${unit.id}`}><DocumentThumbnail id={contract.id} title={contract.title} mimeType={contract.mimeType} hasFile={Boolean(contract.storagePath)} compact /></Link>
                ) : null}
                <div className="min-w-0">
                  <Link className="text-lg font-bold hover:underline" href={`/users?tenantId=${tenant.id}`}>{tenant.firstName} {tenant.lastName}</Link>
                  <div className="text-sm text-muted">{unit.property.name} / {unit.unitNumber}</div>
                  {contract ? <Link className="mt-2 inline-flex text-sm font-semibold text-accent hover:underline" href={`/documents?documentId=${contract.id}&propertyId=${unit.propertyId}&unitId=${unit.id}`}>Mietvertrag öffnen</Link> : generatedContract ? <a className="mt-2 inline-flex text-sm font-semibold text-accent hover:underline" href={`/api/contracts/${generatedContract.id}/preview`}>Generierten Mietvertrag öffnen</a> : <div className="mt-2 text-sm text-muted">Kein Mietvertrag verfügbar</div>}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-md bg-panel p-2"><div className="text-xs text-muted">Kalt</div><strong>{money(calculateColdRent(rentSource))}</strong></div>
                <div className="rounded-md bg-panel p-2"><div className="text-xs text-muted">NK</div><strong>{money(asMoneyNumber(rentSource.serviceCharges))}</strong></div>
                <div className="rounded-md bg-panel p-2"><div className="text-xs text-muted">Warm</div><strong>{money(calculateWarmRent(rentSource))}</strong></div>
              </div>
              <div className="mt-3 rounded-md bg-panel p-2 text-sm">
                <span className="font-semibold">Zahlungsstatus:</span> {statusLabel(payment?.status || "OPEN")}
              </div>
            </section>
          );
        })}
      </div>
      <div className="mt-8">
        <RentIncomeTable rows={rows} year={year} month={month} />
      </div>
    </AppShell>
  );
}

function statusLabel(status: string) {
  if (status === "PAID") return "bezahlt";
  if (status === "PARTIAL") return "Teilzahlung";
  return "nicht bezahlt";
}

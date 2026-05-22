import { Role } from "@prisma/client";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { DocumentThumbnail } from "@/components/DocumentThumbnail";
import { requireUser } from "@/lib/auth";
import { brokerPropertyIds } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function BrokerPage() {
  const user = await requireUser([Role.BROKER, Role.ADMIN]);
  const propertyIds = user.role === Role.ADMIN ? undefined : await brokerPropertyIds(user.id);
  const properties = await prisma.property.findMany({
    where: propertyIds ? { id: { in: propertyIds } } : undefined,
    include: {
      units: {
        orderBy: { unitNumber: "asc" },
        include: {
          tenants: { where: { isCurrent: true }, include: { user: true }, orderBy: { moveInDate: "desc" } },
          contracts: { include: { tenantProfile: true }, orderBy: { createdAt: "desc" } },
          documents: { include: { category: true }, orderBy: { createdAt: "desc" } }
        }
      },
      documents: {
        where: user.role === Role.ADMIN ? undefined : { permissions: { some: { userId: user.id, canView: true } } },
        include: { category: true, permissions: true }
      }
    }
  });
  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <h1 className="text-3xl font-bold">Immobilien</h1>
      <div className="mt-6 grid gap-4">
        {properties.map((property) => (
          <article className="rounded-lg border border-line p-5" key={property.id}>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div>
                <h2 className="text-xl font-bold">{property.name}</h2>
                <p className="text-muted">{property.address}</p>
              </div>
              <Link className="button text-center" href={`/properties/${property.id}`}>Detail ansehen</Link>
            </div>

            <section className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Info label="Typ" value={property.objectType || "offen"} />
              <Info label="Baujahr" value={property.constructionYear?.toString() || "offen"} />
              <Info label="Wohnflaeche" value={property.livingArea ? `${property.livingArea} qm` : "offen"} />
              <Info label="Status" value={property.rentalStatus || "offen"} />
            </section>

            <section className="mt-6">
              <h3 className="font-bold">Einheiten und aktuelle Mieter</h3>
              <div className="mt-3 grid gap-3">
                {property.units.map((unit) => (
                  <div className="rounded-md bg-panel p-3 text-sm" key={unit.id}>
                    <div className="font-semibold">{unit.unitNumber} · {unit.livingArea?.toString() || "?"} qm · {unit.status || "offen"}</div>
                    <div className="mt-1 text-muted">
                      Kaltmiete: {money(unit.rentAmount)} · Nebenkosten: {money(unit.serviceCharges)} · Warmmiete: {money(unit.warmRent)}
                    </div>
                    {unit.tenants.length ? unit.tenants.map((tenant) => (
                      <div className="mt-2 grid gap-1 text-muted sm:grid-cols-3" key={tenant.id}>
                        <span>{tenant.firstName} {tenant.lastName}</span>
                        <a href={`mailto:${tenant.email}`}>{tenant.email}</a>
                        <span>{tenant.phone || "keine Telefonnummer"}</span>
                      </div>
                    )) : <div className="mt-2 text-muted">Kein aktueller Mieter hinterlegt.</div>}
                    {unit.contracts.length ? (
                      <div className="mt-2 text-muted">Vertraege: {unit.contracts.map((contract) => contract.tenantProfile.lastName).join(", ")}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <section>
                <h3 className="font-bold">Verkaufsunterlagen</h3>
                <div className="mt-3 grid gap-2">
                  {property.documents.length ? property.documents.map((doc) => (
                    <div key={doc.id} className="grid gap-3 rounded-md bg-panel p-3 text-sm sm:grid-cols-[92px_minmax(0,1fr)_130px]">
                      <DocumentThumbnail id={doc.id} title={doc.title} mimeType={doc.mimeType} hasFile={Boolean(doc.storagePath)} compact />
                      <span>{doc.title} · {doc.category?.name || "ohne Kategorie"} · {doc.status}</span>
                      <a className="button text-center" href={`/api/documents/${doc.id}/download`}>Download</a>
                    </div>
                  )) : <div className="text-sm text-muted">Keine Unterlagen freigegeben.</div>}
                </div>
              </section>
              <section className="rounded-md bg-panel p-4">
                <h3 className="font-bold">Kontakt zum Eigentuemer</h3>
                <p className="mt-2 text-sm text-muted">Fehlende Unterlagen oder Informationen zur Immobilie anfordern.</p>
                <div className="mt-4 grid gap-2">
                  <a className="button text-center" href={`mailto:admin@meinedomain.de?subject=Rueckfrage%20${encodeURIComponent(property.name)}`}>Nachricht senden</a>
                  <a className="button-secondary text-center" href={`mailto:admin@meinedomain.de?subject=Unterlagen%20anfordern%20${encodeURIComponent(property.name)}`}>Unterlagen anfordern</a>
                </div>
              </section>
            </div>
          </article>
        ))}
      </div>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-panel p-3">
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

function money(value: unknown) {
  if (value === null || value === undefined) return "offen";
  return `${Number(value).toFixed(2)} EUR`;
}

import { Role } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { PropertyMap } from "@/components/PropertyMap";
import { requireUser } from "@/lib/auth";
import { brokerPropertyIds } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { formatPropertyAddress } from "@/lib/property-address";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const user = await requireUser([Role.ADMIN, Role.BROKER]);
  const allowedPropertyIds = user.role === Role.BROKER ? await brokerPropertyIds(user.id) : null;
  const where = {
    ...portalWhere(user),
    ...(allowedPropertyIds ? { id: { in: allowedPropertyIds } } : {})
  };
  const properties = await prisma.property.findMany({
    where,
    include: { documents: true, units: true },
    orderBy: { name: "asc" }
  });
  const mappedProperties = properties
    .filter((property) => property.latitude !== null && property.longitude !== null)
    .map((property) => ({
      id: property.id,
      name: property.name,
      address: formatPropertyAddress(property) || property.address,
      latitude: property.latitude as number,
      longitude: property.longitude as number,
      rentalStatus: property.rentalStatus,
      unitCount: property.units.length || property.unitCount,
      primaryImageId: property.documents.find((document) => document.isPropertyImage && document.isPrimaryImage)?.id
        || property.documents.find((document) => document.isPropertyImage)?.id
        || ""
    }));
  const missingProperties = properties.filter((property) => property.latitude === null || property.longitude === null);

  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-normal text-accent">Standorte</p>
          <h1 className="text-3xl font-bold">Immobilienkarte</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Alle Immobilien mit hinterlegten Koordinaten werden auf OpenStreetMap angezeigt. Pins öffnen zuerst eine Objektkarte mit Details.
          </p>
        </div>
        <a className="button-secondary px-3 py-2 text-sm" href="/properties">Zur Immobilienliste</a>
      </div>
      <div className="mt-6">
        <PropertyMap properties={mappedProperties} />
      </div>
      {missingProperties.length ? (
        <section className="mt-6 rounded-lg border border-line bg-panel p-4">
          <h2 className="text-lg font-bold">Ohne Kartenposition</h2>
          <p className="mt-1 text-sm text-muted">Diese Immobilien haben noch keine Koordinaten und erscheinen deshalb nicht als Pin.</p>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {missingProperties.map((property) => (
              <a className="rounded-md bg-white p-3 text-sm font-semibold hover:text-accent" href={`/properties/${property.id}`} key={property.id}>
                {property.name}
                <span className="mt-1 block font-normal text-muted">{formatPropertyAddress(property) || property.address || "Keine Adresse hinterlegt"}</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}

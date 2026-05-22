import { Role } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { JsonForm } from "@/components/JsonForm";
import { PropertyManager } from "@/components/PropertyManager";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PropertiesPage() {
  const user = await requireUser([Role.ADMIN]);
  const properties = await prisma.property.findMany({ include: { units: true, documents: true }, orderBy: { createdAt: "desc" } });
  const propertyItems = properties.map((property) => ({
    id: property.id,
    name: property.name,
    address: property.address,
    objectType: property.objectType || "",
    constructionYear: property.constructionYear?.toString() || "",
    livingArea: property.livingArea?.toString() || "",
    unitCount: property.unitCount.toString(),
    rentalStatus: property.rentalStatus || "",
    internalNotes: property.internalNotes || "",
    documents: property.documents.length
  }));
  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <h1 className="text-3xl font-bold">Immobilien</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_420px]">
        <PropertyManager properties={propertyItems} />
        <JsonForm endpoint="/api/properties" submitLabel="Immobilie anlegen">
          <label>Objektname<input name="name" required /></label>
          <label>Adresse<input name="address" required /></label>
          <label>Objekttyp<input name="objectType" /></label>
          <label>Baujahr<input name="constructionYear" type="number" /></label>
          <label>Wohnflaeche<input name="livingArea" type="number" step="0.01" /></label>
          <label>Nutzflaeche<input name="usableArea" type="number" step="0.01" /></label>
          <label>Grundstuecksflaeche<input name="plotArea" type="number" step="0.01" /></label>
          <label>Anzahl Zimmer<input name="rooms" type="number" step="0.5" /></label>
          <label>Anzahl Einheiten<input name="unitCount" type="number" /></label>
          <label>Etage<input name="floor" /></label>
          <label>Stellplaetze<input name="parkingSpaces" type="number" /></label>
          <label>Energieausweis<input name="energyCertificate" /></label>
          <label>Heizungsart<input name="heatingType" /></label>
          <label>Zustand<input name="condition" /></label>
          <label>Modernisierungen<textarea name="modernizations" /></label>
          <label>Vermietungsstatus<input name="rentalStatus" /></label>
          <label>Kaufpreisvorstellung<input name="expectedPurchasePrice" type="number" step="0.01" /></label>
          <label>Interne Notizen<textarea name="internalNotes" /></label>
        </JsonForm>
      </div>
    </AppShell>
  );
}

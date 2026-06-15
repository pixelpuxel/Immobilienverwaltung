import { Role } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { ContractGenerateForm } from "@/components/ContractGenerateForm";
import { ContractThumbnail } from "@/components/ContractThumbnail";
import { ContractTabs } from "@/components/ContractTabs";
import { DeleteContractButton } from "@/components/DeleteContractButton";
import { SteppedRentPlanner } from "@/components/SteppedRentPlanner";
import { TemplateManager } from "@/components/TemplateManager";
import { TenantCreateForm } from "@/components/TenantCreateForm";
import { UploadForm } from "@/components/UploadForm";
import { requireUser } from "@/lib/auth";
import { contractPlaceholders } from "@/lib/contracts";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ContractsPage({ searchParams }: { searchParams?: { propertyId?: string } }) {
  const user = await requireUser();
  const selectedPropertyId = searchParams?.propertyId || "";
  const [contracts, tenants, units, templates, properties] = await Promise.all([
    prisma.leaseContract.findMany({ where: { unit: { property: portalWhere(user) } }, include: { tenantProfile: true, unit: { include: { property: true } }, template: true }, orderBy: { createdAt: "desc" } }),
    prisma.tenantProfile.findMany({ where: { user: portalWhere(user) }, orderBy: { lastName: "asc" } }),
    prisma.unit.findMany({ where: { property: portalWhere(user) }, include: { property: true }, orderBy: { unitNumber: "asc" } }),
    prisma.contractTemplate.findMany({ where: portalWhere(user), include: { property: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.property.findMany({ where: portalWhere(user), orderBy: { name: "asc" }, select: { id: true, name: true } })
  ]);
  const visibleContracts = user.role === Role.TENANT ? contracts.filter((contract) => contract.tenantProfile.userId === user.id) : contracts;
  const contractGroups = groupContracts(visibleContracts);
  const tenantOptions = tenants.map((tenant) => ({ id: tenant.id, label: `${tenant.firstName} ${tenant.lastName}` }));
  const filteredUnits = selectedPropertyId ? units.filter((unit) => unit.propertyId === selectedPropertyId) : units;
  const unitOptions = filteredUnits.map((unit) => ({ id: unit.id, label: `${unit.property.name} / ${unit.unitNumber}` }));
  const tenantUnitOptions = filteredUnits.map((unit) => ({
    id: unit.id,
    label: `${unit.property.name} / ${unit.unitNumber}`,
    rentAmount: unit.rentAmount?.toString() || "",
    garageRent: unit.garageRent?.toString() || "",
    serviceCharges: unit.serviceCharges?.toString() || ""
  }));
  const templateOptions = templates.map((template) => ({ id: template.id, label: `${template.name}${template.property ? ` (${template.property.name})` : template.isGlobalTemplate ? " (allgemein)" : ""}` }));
  const propertyOptions = properties.map((property) => ({ id: property.id, label: property.name }));
  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <h1 className="text-3xl font-bold">{user.role === Role.ADMIN ? "Vertragsgenerator" : "Meine Verträge"}</h1>
      {user.role === Role.ADMIN ? (
        <section className="mt-4 rounded-lg border border-line bg-panel p-4 text-sm">
          <h2 className="text-lg font-bold">So funktionieren Vorlagen</h2>
          <p className="mt-2 text-muted">
            Eine Vertragsvorlage ist eine normale DOCX-Datei. Der feste Vertragstext bleibt unveraendert; nur variable Stellen werden durch Platzhalter ersetzt, zum Beispiel <strong>{"{{tenant_name}}"}</strong> fuer den Mieternamen, <strong>{"{{rent_amount}}"}</strong> fuer die Kaltmiete oder <strong>{"{{garage_rent}}"}</strong> fuer die Tiefgarage.
          </p>
          <p className="mt-2 text-muted">
            Beim Generieren kopiert das Portal die Vorlage, ersetzt die Platzhalter mit den Daten aus Mieter, Einheit und Immobilie und erzeugt daraus DOCX und PDF. Wenn keine Vorlage ausgewaehlt ist, wird der interne Standardvertrag verwendet.
          </p>
          <details className="mt-3">
            <summary className="cursor-pointer font-semibold">Verfuegbare Platzhalter anzeigen</summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {contractPlaceholders.map((placeholder) => (
                <code className="rounded-md bg-white px-2 py-1 text-xs" key={placeholder}>{`{{${placeholder}}}`}</code>
              ))}
            </div>
          </details>
        </section>
      ) : null}
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <ContractTabs
          contractsLabel={`Generierte Verträge (${visibleContracts.length})`}
          steppedRent={user.role === Role.ADMIN ? <SteppedRentPlanner /> : null}
          templatesLabel={`Vorlagen (${templates.length})`}
          templates={user.role === Role.ADMIN ? (
            <section className="rounded-b-lg rounded-tr-lg border border-line bg-white p-4">
              <h2 className="text-xl font-bold">Vertragsvorlagen</h2>
              <div className="mt-4 grid gap-3">
                {templates.map((template) => (
                  <div key={template.id} className="grid gap-3 rounded-md bg-panel p-3 md:grid-cols-[120px_minmax(0,1fr)]">
                    <a className="h-20 w-24 overflow-hidden rounded-md border border-line bg-white" href={`/api/templates/${template.id}/preview`} target="_blank" rel="noreferrer">
                      <img src={`/api/templates/${template.id}/thumbnail`} alt={`Vorschau ${template.name}`} className="h-full w-full object-cover" loading="lazy" />
                    </a>
                    <TemplateManager template={template} properties={propertyOptions} />
                  </div>
                ))}
                {!templates.length ? <div className="text-sm text-muted">Noch keine Vorlagen hochgeladen.</div> : null}
              </div>
            </section>
          ) : null}
        >
          <div className="overflow-hidden rounded-b-lg rounded-tr-lg border border-line bg-white">
            {contractGroups.map((propertyGroup) => (
              <section className="border-b border-line last:border-b-0" key={propertyGroup.propertyId}>
                <div className="bg-gradient-to-r from-emerald-50 via-white to-sky-50 px-4 py-3">
                  <h2 className="text-lg font-bold">{propertyGroup.propertyName}</h2>
                  <p className="text-xs font-semibold text-muted">{propertyGroup.contractCount} Verträge</p>
                </div>
                <div className="grid gap-3 p-3">
                  {propertyGroup.units.map((unitGroup) => (
                    <div className="rounded-md border border-line bg-panel p-3" key={unitGroup.unitId}>
                      {propertyGroup.units.length > 1 ? <h3 className="mb-3 text-sm font-bold text-muted">{unitGroup.unitNumber}</h3> : null}
                      <div className="grid gap-3">
                        {unitGroup.contracts.map((contract) => (
                          <div key={contract.id} className="grid gap-4 rounded-md bg-white p-3 text-sm md:grid-cols-[104px_minmax(0,1fr)]">
                            <div className="w-24">
                              <ContractThumbnail id={contract.id} title={`${contract.tenantProfile.firstName} ${contract.tenantProfile.lastName}`} compact />
                            </div>
                            <div className="min-w-0">
                              <strong className="block truncate text-base">{contract.tenantProfile.firstName} {contract.tenantProfile.lastName}</strong>
                              <div className="mt-1 break-words text-muted">{unitGroup.unitNumber} · {new Intl.DateTimeFormat("de-DE").format(contract.createdAt)}</div>
                              <div className="mt-3 min-w-0 rounded-md bg-panel px-3 py-2">
                                <div className="text-xs font-semibold text-muted">Vorlage</div>
                                <div className="mt-1 break-words font-semibold">{contract.template?.name || "Standard"}</div>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <a className="button-secondary flex min-h-11 min-w-28 flex-none items-center justify-center text-center" href={`/api/contracts/${contract.id}/preview`} target="_blank" rel="noreferrer">Vorschau</a>
                                <a className="button flex min-h-11 min-w-24 flex-none items-center justify-center text-center" href={`/api/contracts/${contract.id}/download?format=docx`}>DOCX</a>
                                <a className="button-secondary flex min-h-11 min-w-24 flex-none items-center justify-center text-center" href={`/api/contracts/${contract.id}/download?format=pdf`}>PDF</a>
                                {user.role === Role.ADMIN ? <DeleteContractButton contractId={contract.id} /> : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {!visibleContracts.length ? <div className="p-4 text-sm text-muted">Noch keine Vertraege erzeugt.</div> : null}
          </div>
        </ContractTabs>
        {user.role === Role.ADMIN ? (
          <aside className="grid content-start gap-6 self-start">
            <UploadForm endpoint="/api/templates" submitLabel="Vorlage hochladen">
              <label>Name<input name="name" /></label>
              <label>Immobilie<select name="propertyId"><option value="">Keine bestimmte Immobilie</option>{propertyOptions.map((property) => <option key={property.id} value={property.id}>{property.label}</option>)}</select></label>
              <label className="flex items-center gap-2 text-sm font-semibold"><input name="isGlobalTemplate" type="checkbox" defaultChecked /> Allgemeine Vorlage</label>
            </UploadForm>
            <ContractGenerateForm tenants={tenantOptions} units={unitOptions} templates={templateOptions} defaultUnitId={unitOptions[0]?.id || ""} />
            <TenantCreateForm units={tenantUnitOptions} defaultUnitId={unitOptions[0]?.id || ""} compact />
          </aside>
        ) : null}
      </div>
    </AppShell>
  );
}

function groupContracts(contracts: Array<{
  id: string;
  unit: { id: string; unitNumber: string; property: { id: string; name: string } };
  tenantProfile: { firstName: string; lastName: string };
  template: { name: string } | null;
  createdAt: Date;
}>) {
  const groups: Array<{
    propertyId: string;
    propertyName: string;
    contractCount: number;
    units: Array<{ unitId: string; unitNumber: string; contracts: typeof contracts }>;
  }> = [];

  for (const contract of contracts) {
    let propertyGroup = groups.find((group) => group.propertyId === contract.unit.property.id);
    if (!propertyGroup) {
      propertyGroup = { propertyId: contract.unit.property.id, propertyName: contract.unit.property.name, contractCount: 0, units: [] };
      groups.push(propertyGroup);
    }
    propertyGroup.contractCount += 1;

    let unitGroup = propertyGroup.units.find((group) => group.unitId === contract.unit.id);
    if (!unitGroup) {
      unitGroup = { unitId: contract.unit.id, unitNumber: contract.unit.unitNumber, contracts: [] };
      propertyGroup.units.push(unitGroup);
    }
    unitGroup.contracts.push(contract);
  }

  return groups;
}

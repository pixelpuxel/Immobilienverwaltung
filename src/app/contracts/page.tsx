import { Role } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { ContractGenerateForm } from "@/components/ContractGenerateForm";
import { ContractThumbnail } from "@/components/ContractThumbnail";
import { DeleteContractButton } from "@/components/DeleteContractButton";
import { TemplateManager } from "@/components/TemplateManager";
import { UploadForm } from "@/components/UploadForm";
import { requireUser } from "@/lib/auth";
import { contractPlaceholders } from "@/lib/contracts";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  const user = await requireUser();
  const [contracts, tenants, units, templates] = await Promise.all([
    prisma.leaseContract.findMany({ include: { tenantProfile: true, unit: { include: { property: true } }, template: true }, orderBy: { createdAt: "desc" } }),
    prisma.tenantProfile.findMany({ orderBy: { lastName: "asc" } }),
    prisma.unit.findMany({ include: { property: true }, orderBy: { unitNumber: "asc" } }),
    prisma.contractTemplate.findMany({ orderBy: { createdAt: "desc" } })
  ]);
  const visibleContracts = user.role === Role.TENANT ? contracts.filter((contract) => contract.tenantProfile.userId === user.id) : contracts;
  const tenantOptions = tenants.map((tenant) => ({ id: tenant.id, label: `${tenant.firstName} ${tenant.lastName}` }));
  const unitOptions = units.map((unit) => ({ id: unit.id, label: `${unit.property.name} / ${unit.unitNumber}` }));
  const templateOptions = templates.map((template) => ({ id: template.id, label: template.name }));
  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <h1 className="text-3xl font-bold">Vertragsgenerator</h1>
      <p className="mt-2 text-muted">Unterstuetzte Platzhalter: {contractPlaceholders.map((p) => `{{${p}}}`).join(", ")}</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="grid gap-6">
        <div className="overflow-hidden rounded-lg border border-line">
          {visibleContracts.map((contract) => (
            <div key={contract.id} className="grid gap-3 border-b border-line p-4 text-sm md:grid-cols-[120px_minmax(0,1fr)_150px_120px_120px_120px]">
              <ContractThumbnail id={contract.id} title={`${contract.tenantProfile.firstName} ${contract.tenantProfile.lastName}`} compact />
              <div>
                <strong>{contract.tenantProfile.firstName} {contract.tenantProfile.lastName}</strong>
                <div className="text-muted">{contract.unit.property.name} / {contract.unit.unitNumber}</div>
                <div className="text-muted">{new Intl.DateTimeFormat("de-DE").format(contract.createdAt)}</div>
              </div>
              <div>{contract.template?.name || "Standard"}</div>
              <a className="button-secondary block text-center" href={`/api/contracts/${contract.id}/preview`} target="_blank" rel="noreferrer">Vorschau</a>
              <a className="button block text-center" href={`/api/contracts/${contract.id}/download?format=docx`}>DOCX</a>
              <div className="grid gap-2">
                <a className="button button-secondary block text-center" href={`/api/contracts/${contract.id}/download?format=pdf`}>PDF</a>
                {user.role === Role.ADMIN ? <DeleteContractButton contractId={contract.id} /> : null}
              </div>
            </div>
          ))}
          {!visibleContracts.length ? <div className="p-4 text-sm text-muted">Noch keine Vertraege erzeugt.</div> : null}
        </div>
        {user.role === Role.ADMIN ? (
          <section className="rounded-lg border border-line p-4">
            <h2 className="text-xl font-bold">Vertragsvorlagen</h2>
            <div className="mt-4 grid gap-3">
              {templates.map((template) => (
                <div key={template.id} className="grid gap-3 md:grid-cols-[120px_minmax(0,1fr)]">
                  <a className="h-20 w-24 overflow-hidden rounded-md border border-line bg-panel" href={`/api/templates/${template.id}/preview`} target="_blank" rel="noreferrer">
                    <img src={`/api/templates/${template.id}/thumbnail`} alt={`Vorschau ${template.name}`} className="h-full w-full object-cover" loading="lazy" />
                  </a>
                  <TemplateManager template={template} />
                </div>
              ))}
              {!templates.length ? <div className="text-sm text-muted">Noch keine Vorlagen hochgeladen.</div> : null}
            </div>
          </section>
        ) : null}
        </div>
        {user.role === Role.ADMIN ? (
          <div className="grid gap-6">
            <UploadForm endpoint="/api/templates" submitLabel="Vorlage hochladen">
              <label>Name<input name="name" /></label>
            </UploadForm>
            <ContractGenerateForm tenants={tenantOptions} units={unitOptions} templates={templateOptions} />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

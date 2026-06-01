import { createHash } from "crypto";
import fs from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["backup:export"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const includeFiles = request.nextUrl.searchParams.get("includeFiles") !== "false";
  const [
    users,
    properties,
    units,
    documentCategories,
    documents,
    accessPermissions,
    brokerRequests,
    brokerValuations,
    tenantProfiles,
    contractTemplates,
    leaseContracts,
    auditLogs,
    portalInstances
  ] = await Promise.all([
    prisma.user.findMany({ where: portalWhere(user) }),
    prisma.property.findMany({ where: portalWhere(user) }),
    prisma.unit.findMany({ where: { property: portalWhere(user) } }),
    prisma.documentCategory.findMany({ where: portalWhere(user) }),
    prisma.document.findMany({ where: portalWhere(user) }),
    prisma.accessPermission.findMany({ where: { document: portalWhere(user) } }),
    prisma.brokerRequest.findMany({ where: { property: portalWhere(user) } }),
    prisma.brokerValuation.findMany({ where: { property: portalWhere(user) } }),
    prisma.tenantProfile.findMany({ where: { user: portalWhere(user) } }),
    prisma.contractTemplate.findMany({ where: portalWhere(user) }),
    prisma.leaseContract.findMany({ where: { unit: { property: portalWhere(user) } } }),
    prisma.auditLog.findMany({ where: portalWhere(user) }),
    prisma.portalInstance.findMany({ where: user.portalInstanceId ? { id: user.portalInstanceId } : {} })
  ]);
  const filePaths = Array.from(new Set([
    ...documents.map((document) => document.storagePath),
    ...contractTemplates.map((template) => template.storagePath),
    ...leaseContracts.flatMap((contract) => [contract.docxPath, contract.pdfPath].filter(Boolean) as string[])
  ]));
  const fileResults = includeFiles ? await Promise.all(filePaths.map(readBackupFile)) : [];
  const tables = { users, properties, units, documentCategories, documents, accessPermissions, brokerRequests, brokerValuations, tenantProfiles, contractTemplates, leaseContracts, auditLogs, portalInstances };
  const backup = {
    format: "immobilienportal.backup.v1",
    exportedAt: new Date().toISOString(),
    app: "Immobilienportal",
    includeFiles,
    tables,
    files: fileResults.flatMap((result) => result.file ? [result.file] : []),
    missingFiles: fileResults.flatMap((result) => result.missingPath ? [result.missingPath] : [])
  };
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="immobilienportal-backup-${new Date().toISOString().slice(0, 10)}.json"`
    }
  });
}

async function readBackupFile(filePath: string) {
  try {
    const data = await fs.readFile(filePath);
    return { file: { path: filePath, sha256: createHash("sha256").update(data).digest("hex"), base64: data.toString("base64") }, missingPath: null };
  } catch {
    return { file: null, missingPath: filePath };
  }
}


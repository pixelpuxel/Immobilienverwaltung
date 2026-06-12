import { createHash } from "crypto";
import fs from "fs/promises";
import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });

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
    portalInstances,
    mailTemplates
  ] = await Promise.all([
    prisma.user.findMany({ where: portalWhere(user) }),
    prisma.property.findMany({ where: portalWhere(user) }),
    prisma.unit.findMany({ where: { property: portalWhere(user) } }),
    prisma.documentCategory.findMany(),
    prisma.document.findMany({ where: portalWhere(user) }),
    prisma.accessPermission.findMany({ where: { document: portalWhere(user) } }),
    prisma.brokerRequest.findMany({ where: { property: portalWhere(user) } }),
    prisma.brokerValuation.findMany({ where: { property: portalWhere(user) } }),
    prisma.tenantProfile.findMany({ where: { user: portalWhere(user) } }),
    prisma.contractTemplate.findMany({ where: portalWhere(user) }),
    prisma.leaseContract.findMany({ where: { unit: { property: portalWhere(user) } } }),
    prisma.auditLog.findMany({ where: portalWhere(user) }),
    prisma.portalInstance.findMany({ where: user.portalInstanceId ? { id: user.portalInstanceId } : {} }),
    prisma.mailTemplate.findMany({ where: portalWhere(user) })
  ]);

  const filePaths = Array.from(new Set([
    ...documents.map((document) => document.storagePath),
    ...contractTemplates.map((template) => template.storagePath),
    ...leaseContracts.flatMap((contract) => [contract.docxPath, contract.pdfPath].filter(Boolean) as string[])
  ].filter(Boolean)));

  const fileResults = includeFiles ? await Promise.all(filePaths.map(readBackupFile)) : [];
  const files = fileResults.flatMap((result) => result.file ? [result.file] : []);
  const missingFiles = fileResults.flatMap((result) => result.missingPath ? [result.missingPath] : []);
  const tables = {
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
    portalInstances,
    mailTemplates
  };

  const backup = {
    format: "immobilienportal.backup.v1",
    exportedAt: new Date().toISOString(),
    app: "Immobilienportal",
    includeFiles,
    notes: "JSON ist absichtlich lesbar und feldtolerant. IDs bleiben erhalten, damit Relationen beim Import zuordenbar sind.",
    summary: {
      records: Object.values(tables).reduce((sum, rows) => sum + rows.length, 0),
      referencedFiles: filePaths.length,
      includedFiles: files.length,
      missingFiles: missingFiles.length
    },
    tables,
    files,
    missingFiles
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
    return {
      file: {
        path: filePath,
        sha256: createHash("sha256").update(data).digest("hex"),
        base64: data.toString("base64")
      },
      missingPath: null
    };
  } catch {
    return { file: null, missingPath: filePath };
  }
}

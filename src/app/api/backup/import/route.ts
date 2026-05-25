import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";
import { Prisma, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Bitte Backup-JSON auswählen." }, { status: 400 });

    const importFiles = form.get("importFiles") === "true";
    const replaceExisting = form.get("replaceExisting") === "true";
    const backup = JSON.parse(await file.text()) as BackupFile;
    if (backup.format !== "immobilienportal.backup.v1") {
      return NextResponse.json({ error: "Backup-Format wird nicht erkannt." }, { status: 400 });
    }

    const t = backup.tables || {};
    let importedFiles = 0;

    if (replaceExisting) {
      await prisma.$executeRawUnsafe(`
        TRUNCATE
          "AccessPermission",
          "AuditLog",
          "BrokerRequest",
          "BrokerValuation",
          "Document",
          "DocumentCategory",
          "LeaseContract",
          "ContractTemplate",
          "TenantProfile",
          "Unit",
          "Property",
          "User"
        RESTART IDENTITY CASCADE
      `);
    }

    if (importFiles) {
      for (const fileEntry of backup.files || []) {
        if (!fileEntry.path || !fileEntry.base64) continue;
        const bytes = Buffer.from(fileEntry.base64, "base64");
        const hash = createHash("sha256").update(bytes).digest("hex");
        if (fileEntry.sha256 && hash !== fileEntry.sha256) {
          return NextResponse.json({ error: `Dateiprüfsumme stimmt nicht: ${fileEntry.path}` }, { status: 400 });
        }
        await fs.mkdir(path.dirname(fileEntry.path), { recursive: true });
        await fs.writeFile(fileEntry.path, bytes);
        importedFiles += 1;
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const row of t.portalInstances || []) await tx.portalInstance.upsert({ where: { id: row.id }, update: row as any, create: row as any });
      for (const row of t.users || []) await tx.user.upsert({ where: { id: row.id }, update: withPortal(row, user.portalInstanceId) as any, create: withPortal(row, user.portalInstanceId) as any });
      for (const row of t.properties || []) await tx.property.upsert({ where: { id: row.id }, update: withPortal(row, user.portalInstanceId) as any, create: withPortal(row, user.portalInstanceId) as any });
      for (const row of t.units || []) await tx.unit.upsert({ where: { id: row.id }, update: row as any, create: row as any });
      for (const row of t.documentCategories || []) {
        await tx.documentCategory.upsert({
          where: { id: row.id },
          update: row as any,
          create: row as any
        }).catch(async (error) => {
          if (!isUniqueConstraint(error)) throw error;
          await tx.documentCategory.update({ where: { name: String(row.name) }, data: withoutId(row) as any });
        });
      }
      for (const row of t.documents || []) await tx.document.upsert({ where: { id: row.id }, update: withPortal(row, user.portalInstanceId) as any, create: withPortal(row, user.portalInstanceId) as any });
      for (const row of t.tenantProfiles || []) await tx.tenantProfile.upsert({ where: { id: row.id }, update: row as any, create: row as any });
      for (const row of t.contractTemplates || []) await tx.contractTemplate.upsert({ where: { id: row.id }, update: withPortal(row, user.portalInstanceId) as any, create: withPortal(row, user.portalInstanceId) as any });
      for (const row of t.leaseContracts || []) await tx.leaseContract.upsert({ where: { id: row.id }, update: row as any, create: row as any });
      for (const row of t.brokerRequests || []) {
        await tx.brokerRequest.upsert({ where: { id: row.id }, update: row as any, create: row as any }).catch(async (error) => {
          if (!isUniqueConstraint(error)) throw error;
          await tx.brokerRequest.update({ where: { userId_propertyId: { userId: String(row.userId), propertyId: String(row.propertyId) } }, data: withoutId(row) as any });
        });
      }
      for (const row of t.brokerValuations || []) {
        await tx.brokerValuation.upsert({ where: { id: row.id }, update: row as any, create: row as any }).catch(async (error) => {
          if (!isUniqueConstraint(error)) throw error;
          await tx.brokerValuation.update({ where: { userId_propertyId: { userId: String(row.userId), propertyId: String(row.propertyId) } }, data: withoutId(row) as any });
        });
      }
      for (const row of t.accessPermissions || []) {
        await tx.accessPermission.upsert({ where: { id: row.id }, update: row as any, create: row as any }).catch(async (error) => {
          if (!isUniqueConstraint(error)) throw error;
          await tx.accessPermission.update({ where: { userId_documentId: { userId: String(row.userId), documentId: String(row.documentId) } }, data: withoutId(row) as any });
        });
      }
      for (const row of t.auditLogs || []) await tx.auditLog.upsert({ where: { id: row.id }, update: withPortal(row, user.portalInstanceId) as any, create: withPortal(row, user.portalInstanceId) as any });
    }, { timeout: 120_000 });

    return NextResponse.json({
      ok: true,
      summary: {
        records: Object.values(t).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0),
        files: importedFiles
      }
    });
  } catch (error) {
    console.error("Backup import failed", error);
    return NextResponse.json({ error: backupErrorMessage(error) }, { status: 500 });
  }
}

function withPortal(row: Record<string, unknown>, portalInstanceId?: string | null) {
  return row.portalInstanceId || !portalInstanceId ? row : { ...row, portalInstanceId };
}

function withoutId(row: Record<string, unknown>) {
  const { id: _id, ...data } = row;
  return data;
}

function isUniqueConstraint(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function backupErrorMessage(error: unknown) {
  if (error instanceof SyntaxError) return "Die Backup-Datei ist kein gültiges JSON.";
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const target = Array.isArray(error.meta?.target) ? ` (${error.meta?.target.join(", ")})` : "";
    return `Datenbankfehler ${error.code}${target}: ${error.message.split("\n").at(-1) || error.message}`;
  }
  if (error instanceof Error) return error.message;
  return "Import fehlgeschlagen.";
}

type BackupFile = {
  format?: string;
  tables?: Record<string, Array<Record<string, unknown> & { id: string }>>;
  files?: Array<{ path: string; sha256?: string; base64: string }>;
};

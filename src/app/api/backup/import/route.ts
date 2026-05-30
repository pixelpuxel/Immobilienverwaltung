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
      if (replaceExisting) await deletePortalData(tx, user.portalInstanceId, user.id);
      for (const row of t.portalInstances || []) await upsertPortalInstance(tx, row);
      for (const row of t.users || []) await upsertUser(tx, withPortal(row, user.portalInstanceId) as typeof row);
      for (const row of t.properties || []) await tx.property.upsert({ where: { id: row.id }, update: withPortal(row, user.portalInstanceId) as any, create: withPortal(row, user.portalInstanceId) as any });
      for (const row of t.units || []) await tx.unit.upsert({ where: { id: row.id }, update: row as any, create: row as any });
      for (const row of t.documentCategories || []) {
        await upsertDocumentCategory(tx, withPortal(row, user.portalInstanceId));
      }
      for (const row of t.documents || []) await tx.document.upsert({ where: { id: row.id }, update: withPortal(row, user.portalInstanceId) as any, create: withPortal(row, user.portalInstanceId) as any });
      for (const row of t.tenantProfiles || []) await upsertTenantProfile(tx, row);
      for (const row of t.contractTemplates || []) await tx.contractTemplate.upsert({ where: { id: row.id }, update: withPortal(row, user.portalInstanceId) as any, create: withPortal(row, user.portalInstanceId) as any });
      for (const row of t.leaseContracts || []) await tx.leaseContract.upsert({ where: { id: row.id }, update: row as any, create: row as any });
      for (const row of t.brokerRequests || []) {
        await upsertBrokerRequest(tx, row);
      }
      for (const row of t.brokerValuations || []) {
        await upsertBrokerValuation(tx, row);
      }
      for (const row of t.accessPermissions || []) {
        await upsertAccessPermission(tx, row);
      }
      for (const row of t.auditLogs || []) await upsertAuditLog(tx, withPortal(row, user.portalInstanceId));
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

async function upsertPortalInstance(tx: Prisma.TransactionClient, row: Record<string, unknown> & { id: string }) {
  const byId = await tx.portalInstance.findUnique({ where: { id: row.id }, select: { id: true } });
  if (byId) {
    await tx.portalInstance.update({ where: { id: row.id }, data: row as any });
    return;
  }
  if (row.slug) {
    const bySlug = await tx.portalInstance.findUnique({ where: { slug: String(row.slug) }, select: { id: true } });
    if (bySlug) {
      await tx.portalInstance.update({ where: { id: bySlug.id }, data: withoutId(row) as any });
      return;
    }
  }
  await tx.portalInstance.create({ data: row as any });
}

async function upsertUser(tx: Prisma.TransactionClient, row: Record<string, unknown> & { id: string }) {
  const byId = await tx.user.findUnique({ where: { id: row.id }, select: { id: true } });
  if (byId) {
    await tx.user.update({ where: { id: row.id }, data: row as any });
    return;
  }
  if (row.email) {
    const byEmail = await tx.user.findUnique({ where: { email: String(row.email) }, select: { id: true } });
    if (byEmail) {
      await tx.user.update({ where: { id: byEmail.id }, data: withoutId(row) as any });
      return;
    }
  }
  await tx.user.create({ data: row as any });
}

async function upsertDocumentCategory(tx: Prisma.TransactionClient, row: Record<string, unknown> & { id: string }) {
  const byId = await tx.documentCategory.findUnique({ where: { id: row.id }, select: { id: true } });
  if (byId) {
    await tx.documentCategory.update({ where: { id: row.id }, data: row as any });
    return;
  }
  if (row.portalInstanceId && row.name) {
    const byName = await tx.documentCategory.findUnique({
      where: { portalInstanceId_name: { portalInstanceId: String(row.portalInstanceId), name: String(row.name) } },
      select: { id: true }
    });
    if (byName) {
      await tx.documentCategory.update({ where: { id: byName.id }, data: withoutId(row) as any });
      return;
    }
  }
  await tx.documentCategory.create({ data: row as any });
}

async function upsertTenantProfile(tx: Prisma.TransactionClient, row: Record<string, unknown> & { id: string }) {
  const byId = await tx.tenantProfile.findUnique({ where: { id: row.id }, select: { id: true } });
  if (byId) {
    await tx.tenantProfile.update({ where: { id: row.id }, data: row as any });
    return;
  }
  if (row.userId) {
    const byUser = await tx.tenantProfile.findUnique({ where: { userId: String(row.userId) }, select: { id: true } });
    if (byUser) {
      await tx.tenantProfile.update({ where: { id: byUser.id }, data: withoutId(row) as any });
      return;
    }
  }
  await tx.tenantProfile.create({ data: row as any });
}

async function upsertBrokerRequest(tx: Prisma.TransactionClient, row: Record<string, unknown> & { id: string }) {
  const byId = await tx.brokerRequest.findUnique({ where: { id: row.id }, select: { id: true } });
  if (byId) {
    await tx.brokerRequest.update({ where: { id: row.id }, data: row as any });
    return;
  }
  if (row.userId && row.propertyId) {
    const byLink = await tx.brokerRequest.findUnique({
      where: { userId_propertyId: { userId: String(row.userId), propertyId: String(row.propertyId) } },
      select: { id: true }
    });
    if (byLink) {
      await tx.brokerRequest.update({ where: { id: byLink.id }, data: withoutId(row) as any });
      return;
    }
  }
  await tx.brokerRequest.create({ data: row as any });
}

async function upsertBrokerValuation(tx: Prisma.TransactionClient, row: Record<string, unknown> & { id: string }) {
  const byId = await tx.brokerValuation.findUnique({ where: { id: row.id }, select: { id: true } });
  if (byId) {
    await tx.brokerValuation.update({ where: { id: row.id }, data: row as any });
    return;
  }
  if (row.userId && row.propertyId) {
    const byLink = await tx.brokerValuation.findUnique({
      where: { userId_propertyId: { userId: String(row.userId), propertyId: String(row.propertyId) } },
      select: { id: true }
    });
    if (byLink) {
      await tx.brokerValuation.update({ where: { id: byLink.id }, data: withoutId(row) as any });
      return;
    }
  }
  await tx.brokerValuation.create({ data: row as any });
}

async function upsertAccessPermission(tx: Prisma.TransactionClient, row: Record<string, unknown> & { id: string }) {
  const byId = await tx.accessPermission.findUnique({ where: { id: row.id }, select: { id: true } });
  if (byId) {
    await tx.accessPermission.update({ where: { id: row.id }, data: row as any });
    return;
  }
  if (row.userId && row.documentId) {
    const byLink = await tx.accessPermission.findUnique({
      where: { userId_documentId: { userId: String(row.userId), documentId: String(row.documentId) } },
      select: { id: true }
    });
    if (byLink) {
      await tx.accessPermission.update({ where: { id: byLink.id }, data: withoutId(row) as any });
      return;
    }
  }
  await tx.accessPermission.create({ data: row as any });
}

async function upsertAuditLog(tx: Prisma.TransactionClient, row: Record<string, unknown> & { id: string }) {
  const data = { ...row };
  if (data.userId) {
    const user = await tx.user.findUnique({ where: { id: String(data.userId) }, select: { id: true } });
    if (!user) data.userId = null;
  }
  await tx.auditLog.upsert({ where: { id: row.id }, update: data as any, create: data as any });
}

async function deletePortalData(tx: Prisma.TransactionClient, portalInstanceId?: string | null, actorUserId?: string) {
  if (!portalInstanceId) return;
  await tx.accessPermission.deleteMany({
    where: { document: { portalInstanceId } }
  });
  await tx.auditLog.deleteMany({ where: { portalInstanceId } });
  await tx.brokerValuation.deleteMany({ where: { property: { portalInstanceId } } });
  await tx.brokerRequest.deleteMany({ where: { property: { portalInstanceId } } });
  await tx.leaseContract.deleteMany({ where: { template: { portalInstanceId } } });
  await tx.contractTemplate.deleteMany({ where: { portalInstanceId } });
  await tx.tenantProfile.deleteMany({ where: { user: { portalInstanceId } } });
  await tx.document.deleteMany({ where: { portalInstanceId } });
  await tx.unit.deleteMany({ where: { property: { portalInstanceId } } });
  await tx.property.deleteMany({ where: { portalInstanceId } });
  await tx.user.deleteMany({
    where: {
      portalInstanceId,
      ...(actorUserId ? { id: { not: actorUserId } } : {})
    }
  });
  await tx.documentCategory.deleteMany({ where: { portalInstanceId } });
}

function withPortal<T extends Record<string, unknown>>(row: T, portalInstanceId?: string | null): T {
  return portalInstanceId ? ({ ...row, portalInstanceId } as T) : row;
}

function withoutId(row: Record<string, unknown>) {
  const { id: _id, ...data } = row;
  return data;
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

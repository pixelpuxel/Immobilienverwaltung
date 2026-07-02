import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { brokerPropertyIds, tenantUnitId } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { formatPropertyAddress } from "@/lib/property-address";
import { renderTenancyCalendarPdf, tenancyCalendarPdfFilename } from "@/lib/tenancy-calendar-pdf";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  const year = parseYear(request.nextUrl.searchParams.get("year"));
  const property = await prisma.property.findFirst({
    where: { id: params.id, ...portalWhere(user) },
    include: {
      units: {
        orderBy: { unitNumber: "asc" },
        include: {
          tenants: { orderBy: [{ moveInDate: "asc" }, { createdAt: "asc" }] }
        }
      }
    }
  });

  if (!property) return NextResponse.json({ error: "Immobilie wurde nicht gefunden." }, { status: 404 });

  if (user.role === Role.BROKER) {
    const allowedIds = await brokerPropertyIds(user.id);
    if (!allowedIds.includes(property.id)) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  }

  let units = property.units;
  if (user.role === Role.TENANT) {
    const ownUnitId = await tenantUnitId(user.id);
    units = units.filter((unit) => unit.id === ownUnitId);
    if (!units.length) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  }

  const pdf = renderTenancyCalendarPdf({
    color: request.nextUrl.searchParams.get("mode") === "color",
    propertyName: property.name,
    propertyAddress: formatPropertyAddress(property) || property.address,
    year,
    units
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(tenancyCalendarPdfFilename(property.name, year))}"`,
      "Cache-Control": "no-store"
    }
  });
}

function parseYear(value: string | null) {
  const parsed = Number(value);
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(parsed) || parsed < 1900 || parsed > currentYear + 20) return currentYear;
  return parsed;
}

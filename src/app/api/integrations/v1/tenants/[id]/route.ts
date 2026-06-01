import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const tenantUpdateSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().optional(),
  currentAddress: z.string().nullable().optional(),
  moveInDate: z.string().nullable().optional(),
  moveOutDate: z.string().nullable().optional(),
  isCurrent: z.boolean().optional(),
  rentAmount: z.coerce.number().nullable().optional(),
  garageRent: z.coerce.number().nullable().optional(),
  serviceCharges: z.coerce.number().nullable().optional()
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:tenants"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const body = tenantUpdateSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Ungueltige Daten.", issues: body.error.issues } }, { status: 400 });
  const existing = await prisma.tenantProfile.findFirst({ where: { id: params.id, user: portalWhere(user) } });
  if (!existing) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Mieter nicht gefunden." } }, { status: 404 });
  const tenant = await prisma.tenantProfile.update({
    where: { id: params.id },
    data: {
      ...body.data,
      moveInDate: body.data.moveInDate === undefined ? undefined : body.data.moveInDate ? new Date(body.data.moveInDate) : null,
      moveOutDate: body.data.moveOutDate === undefined ? undefined : body.data.moveOutDate ? new Date(body.data.moveOutDate) : null
    }
  });
  return NextResponse.json(tenant);
}


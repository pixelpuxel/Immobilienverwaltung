import { Role, type Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationUser } from "@/lib/integration-auth";
import { brokerPropertyIds } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["read:contracts"]);
  if (!user) return response;
  const tenantId = request.nextUrl.searchParams.get("tenantId");
  const where: Prisma.LeaseContractWhereInput = {
    AND: [
      await contractAccessWhere(user),
      tenantId ? { tenantProfileId: tenantId } : {}
    ]
  };
  const contracts = await prisma.leaseContract.findMany({
    where,
    include: { tenantProfile: true, unit: { include: { property: { select: { id: true, name: true } } } }, template: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json({
    items: contracts.map((contract) => ({
      id: contract.id,
      tenantProfileId: contract.tenantProfileId,
      unitId: contract.unitId,
      template: contract.template,
      tenantProfile: contract.tenantProfile,
      unit: contract.unit,
      createdAt: contract.createdAt,
      previewUrl: `/api/contracts/${contract.id}/preview`,
      downloadUrl: `/api/contracts/${contract.id}/download`
    })),
    nextCursor: null
  });
}

async function contractAccessWhere(user: { id: string; role: Role; portalInstanceId: string | null }) {
  if (user.role === Role.ADMIN) return { unit: { property: portalWhere(user) } };
  if (user.role === Role.BROKER) return { unit: { propertyId: { in: await brokerPropertyIds(user.id) } } };
  return { tenantProfile: { userId: user.id } };
}


import { NextRequest, NextResponse } from "next/server";
import { activityLabelMap, activityTitle } from "@/lib/activity-display";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["read:properties"]);
  if (!user) return response;

  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;

  const limitParam = Number(request.nextUrl.searchParams.get("limit") || "8");
  const limit = Math.min(50, Math.max(1, Number.isFinite(limitParam) ? limitParam : 8));
  const logs = await prisma.auditLog.findMany({
    where: portalWhere(user),
    include: { user: { select: { id: true, name: true, email: true, username: true } } },
    orderBy: { createdAt: "desc" },
    take: limit
  });
  const labels = await activityLabelMap(logs);

  return NextResponse.json({
    items: logs.map((log) => ({
      id: log.id,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      title: activityTitle(log.action, log.entity, log.entityId, labels),
      actorName: log.user?.name || log.user?.username || log.user?.email || "System",
      createdAt: log.createdAt,
      detail: log.detail
    })),
    nextCursor: null
  });
}

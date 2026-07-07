import { prisma } from "./prisma";

export const DEFAULT_TIME_ZONE = "Europe/Berlin";

export const TIME_ZONE_OPTIONS = [
  "Europe/Berlin",
  "Europe/Vienna",
  "Europe/Zurich",
  "Europe/London",
  "UTC"
];

export function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("de-DE", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export async function getPortalTimeZone(portalInstanceId?: string | null) {
  if (!portalInstanceId) return DEFAULT_TIME_ZONE;
  const portal = await prisma.portalInstance.findUnique({
    where: { id: portalInstanceId },
    select: { timeZone: true }
  });
  return portal?.timeZone && isValidTimeZone(portal.timeZone) ? portal.timeZone : DEFAULT_TIME_ZONE;
}

export function formatPortalDateTime(value: Date, timeZone: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("de-DE", options ? { timeZone, ...options } : {
    dateStyle: "short",
    timeStyle: "short",
    timeZone
  }).format(value);
}

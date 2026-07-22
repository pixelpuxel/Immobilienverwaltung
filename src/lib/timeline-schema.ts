import { z } from "zod";
import { TIMELINE_EVENT_TYPES, TIMELINE_STATUS } from "@/lib/timeline";

const optionalDate = z.preprocess((value) => value === "" || value === null || value === undefined ? null : value, z.coerce.date().nullable().optional());
const optionalMoney = z.preprocess((value) => value === "" || value === null || value === undefined ? null : value, z.coerce.number().nullable().optional());
const optionalString = z.preprocess((value) => value === "" || value === undefined ? null : value, z.string().trim().nullable().optional());

export const timelineEventCreateSchema = z.object({
  propertyId: optionalString,
  unitId: optionalString,
  tenantProfileId: optionalString,
  brokerUserId: optionalString,
  eventType: z.enum(TIMELINE_EVENT_TYPES.map((item) => item.value) as [string, ...string[]]).default("NOTE"),
  title: z.string().trim().min(1).max(500),
  description: optionalString,
  status: z.enum(TIMELINE_STATUS).default("INFO"),
  eventDate: z.coerce.date(),
  endDate: optionalDate,
  dueDate: optionalDate,
  costAmount: optionalMoney,
  costCurrency: z.string().trim().default("EUR"),
  costCategory: optionalString,
  isInternal: z.boolean().default(false),
  documentIds: z.array(z.string().trim().min(1)).default([]),
  metadata: z.unknown().optional()
});

export const timelineEventUpdateSchema = timelineEventCreateSchema.partial().extend({
  documentIds: z.array(z.string().trim().min(1)).optional()
});

import { z } from "zod";

const optionalNumber = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return null;
  return value;
}, z.coerce.number().optional().nullable());

export const unitSchema = z.object({
  propertyId: z.string().min(1),
  unitNumber: z.string().min(1),
  floor: z.string().optional(),
  rooms: optionalNumber,
  livingArea: optionalNumber,
  rentAmount: optionalNumber,
  garageRent: optionalNumber,
  serviceCharges: optionalNumber,
  warmRent: optionalNumber,
  status: z.string().optional(),
  isSharedHousing: z.preprocess((value) => value === true || value === "true" || value === "on", z.boolean()).optional()
});

export const unitUpdateSchema = unitSchema.omit({ propertyId: true }).partial();

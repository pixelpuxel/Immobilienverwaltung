import { z } from "zod";

const optionalNumber = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return null;
  return value;
}, z.coerce.number().optional().nullable());

const optionalInt = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return null;
  return value;
}, z.coerce.number().int().optional().nullable());

const optionalText = z.preprocess((value) => {
  if (value === null || value === undefined) return "";
  return value;
}, z.coerce.string().optional().default(""));

export const propertySchema = z.object({
  name: z.string().min(1),
  address: optionalText,
  street: z.string().optional(),
  houseNumber: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  latitude: optionalNumber,
  longitude: optionalNumber,
  objectType: z.string().optional(),
  constructionYear: optionalInt,
  livingArea: optionalNumber,
  usableArea: optionalNumber,
  plotArea: optionalNumber,
  rooms: optionalNumber,
  unitCount: z.preprocess((value) => value === "" || value === undefined ? 0 : value, z.coerce.number().int().default(0)),
  floor: z.string().optional(),
  parkingSpaces: optionalInt,
  energyCertificate: z.string().optional(),
  heatingType: z.string().optional(),
  condition: z.string().optional(),
  modernizations: z.string().optional(),
  rentalStatus: z.string().optional(),
  expectedPurchasePrice: optionalNumber,
  outstandingLoan: optionalNumber,
  internalNotes: z.string().optional()
});

export const propertyUpdateSchema = propertySchema.partial();

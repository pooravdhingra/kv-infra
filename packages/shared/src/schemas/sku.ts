import { z } from "zod";

export const skuUnits = ["pcs", "kg", "roll", "meter", "set"] as const;
export const skuOems = ["Bajaj", "TVS", "Piaggio", "Other"] as const;

export const skuCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9._-]+$/, "Use letters, numbers, ., _ or -"));

export const skuSchema = z.object({
  sku: skuCodeSchema,
  itemDescription: z.string().trim().min(1).max(200),
  quantityPerCarton: z.number().positive(),
  unit: z.enum(skuUnits),
  weightPerCarton: z.number().nonnegative(),
  length: z.number().nonnegative(),
  breadth: z.number().nonnegative(),
  height: z.number().nonnegative(),
});

export const createSkuRequestSchema = skuSchema
  .omit({ sku: true })
  .extend({ oem: z.enum(skuOems) });
export const updateSkuRequestSchema = skuSchema.omit({ sku: true });

export const skuResponseSchema = z.object({ data: skuSchema });
export const skuListResponseSchema = z.object({ data: z.array(skuSchema) });

export type Sku = z.infer<typeof skuSchema>;
export type SkuOem = (typeof skuOems)[number];
export type CreateSkuRequest = z.input<typeof createSkuRequestSchema>;
export type UpdateSkuRequest = z.input<typeof updateSkuRequestSchema>;

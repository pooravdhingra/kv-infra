import { z } from "zod";

import { skuCodeSchema } from "./sku.js";

export const supplierSchema = z.object({
  sku: skuCodeSchema,
  itemDescription: z.string(),
  name: z.string().min(1),
  number: z.string().min(1),
  priority: z.number().positive(),
});

export const supplierListResponseSchema = z.object({
  data: z.array(supplierSchema),
});

export type Supplier = z.infer<typeof supplierSchema>;

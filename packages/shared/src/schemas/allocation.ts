import { z } from "zod";

import { skuCodeSchema, skuUnits } from "./sku.js";

export const createAllocationRequestSchema = z.object({
  orderLineId: z.string().trim().min(1),
  quantity: z.number().positive().max(1_000_000_000),
  notes: z.string().trim().max(1000).default(""),
});

export const cancelAllocationRequestSchema = z.object({
  notes: z.string().trim().min(2).max(1000),
});

export const allocationSchema = z.object({
  allocationId: z.string(),
  orderId: z.string(),
  orderLineId: z.string(),
  sku: skuCodeSchema,
  itemDescription: z.string(),
  quantityAssigned: z.number().positive(),
  unit: z.enum(skuUnits),
  notes: z.string(),
  cancelled: z.boolean(),
  cancellationId: z.string().nullable(),
});

export const allocationResponseSchema = z.object({ data: allocationSchema });
export const allocationListResponseSchema = z.object({
  data: z.array(allocationSchema),
});

export type CreateAllocationRequest = z.input<
  typeof createAllocationRequestSchema
>;
export type CancelAllocationRequest = z.input<
  typeof cancelAllocationRequestSchema
>;
export type Allocation = z.infer<typeof allocationSchema>;

import { z } from "zod";

import { skuCodeSchema, skuUnits } from "./sku.js";

const optionalOrderLink = z
  .object({
    orderId: z.string().trim().optional(),
    orderLineId: z.string().trim().optional(),
  })
  .refine((value) => Boolean(value.orderId) === Boolean(value.orderLineId), {
    message: "Order and order line must be linked together",
  });

export const startPackingRequestSchema = z
  .object({
    date: z.string().date(),
    sku: skuCodeSchema,
    quantityTaken: z.number().positive().max(1_000_000_000),
    notes: z.string().trim().max(1000).default(""),
  })
  .and(optionalOrderLink);

export const finishPackingRequestSchema = z.object({
  date: z.string().date(),
  goodQuantity: z.number().nonnegative().default(0),
  packedCartons: z.number().int().nonnegative().default(0),
  defectiveQuantity: z.number().nonnegative().default(0),
  shortQuantity: z.number().nonnegative().default(0),
  notes: z.string().trim().max(1000).default(""),
});

export const packingSessionSchema = z.object({
  packingId: z.string(),
  date: z.string().date(),
  sku: skuCodeSchema,
  itemDescription: z.string(),
  unit: z.enum(skuUnits),
  quantityPerCarton: z.number().nonnegative(),
  quantityTaken: z.number().positive(),
  goodQuantity: z.number().nonnegative(),
  packedCartons: z.number().nonnegative(),
  defectiveQuantity: z.number().nonnegative(),
  shortQuantity: z.number().nonnegative(),
  assignedQuantity: z.number().nonnegative(),
  orderId: z.string().nullable(),
  orderLineId: z.string().nullable(),
  status: z.enum(["IN PACKING", "FINISHED"]),
  notes: z.string(),
});

export const packingListResponseSchema = z.object({
  data: z.object({
    sessions: z.array(packingSessionSchema),
    unpackedInventory: z.array(
      z.object({
        sku: skuCodeSchema,
        itemDescription: z.string(),
        unit: z.enum(skuUnits),
        unpackedQuantity: z.number().positive(),
      }),
    ),
  }),
});
export const packingSessionResponseSchema = z.object({
  data: packingSessionSchema,
});

export type StartPackingRequest = z.input<typeof startPackingRequestSchema>;
export type FinishPackingRequest = z.input<typeof finishPackingRequestSchema>;
export type PackingSession = z.infer<typeof packingSessionSchema>;

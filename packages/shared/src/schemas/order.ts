import { z } from "zod";

import { skuCodeSchema, skuUnits } from "./sku.js";
import { orderActions } from "../lib/calculations.js";

export const orderStockStatuses = [
  "READY_TO_RESERVE",
  "NEEDS_PACKING",
  "NEEDS_SUPPLIER",
] as const;

export const createOrderRequestSchema = z.object({
  customerName: z.string().trim().min(2).max(120),
  dateReceived: z.string().date(),
  orderNotes: z.string().trim().max(1000).default(""),
  items: z
    .array(
      z.object({
        sku: skuCodeSchema,
        cartons: z.number().int().positive().max(1_000_000),
      }),
    )
    .min(1)
    .max(200),
});

export const orderLineSchema = z.object({
  orderLineId: z.string(),
  sku: skuCodeSchema,
  itemDescription: z.string(),
  quantityPerCarton: z.number().positive(),
  unit: z.enum(skuUnits),
  cartons: z.number().positive(),
  totalQuantity: z.number().nonnegative(),
  weightPerCarton: z.number().nonnegative(),
  grossWeight: z.number().nonnegative(),
  volume: z.number().nonnegative(),
  length: z.number().nonnegative(),
  breadth: z.number().nonnegative(),
  height: z.number().nonnegative(),
  availableQuantity: z.number().nonnegative(),
  unpackedQuantity: z.number().nonnegative(),
  assignedQuantity: z.number().nonnegative(),
  reservedQuantity: z.number().nonnegative(),
  remainingQuantity: z.number().nonnegative(),
  shortfallQuantity: z.number().nonnegative(),
  stockStatus: z.enum(orderStockStatuses),
  supplierRequestStatus: z.enum(["SENT", "CONFIRMED", "RECEIVED"]).nullable(),
  suggestedAction: z.enum(orderActions),
  alternativeActions: z.array(z.enum(orderActions)),
});

export const orderSchema = z.object({
  orderId: z.string(),
  customerName: z.string(),
  dateReceived: z.string().date(),
  orderNotes: z.string(),
  sheetTitle: z.string(),
  sheetUrl: z.string().url(),
  totalCartons: z.number().nonnegative(),
  totalQuantity: z.number().nonnegative(),
  grossWeight: z.number().nonnegative(),
  volume: z.number().nonnegative(),
  items: z.array(orderLineSchema),
});

export const orderResponseSchema = z.object({ data: orderSchema });
export const orderListResponseSchema = z.object({ data: z.array(orderSchema) });

export type CreateOrderRequest = z.input<typeof createOrderRequestSchema>;
export type Order = z.infer<typeof orderSchema>;
export type OrderLine = z.infer<typeof orderLineSchema>;

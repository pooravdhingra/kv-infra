import { z } from "zod";

import { orderLineSchema } from "./order.js";
import { skuCodeSchema, skuUnits } from "./sku.js";

export const createReceiptRequestSchema = z
  .object({
    date: z.string().date(),
    sku: skuCodeSchema,
    quantityReceived: z.number().positive().max(1_000_000_000),
    supplier: z.string().trim().min(1).max(120),
    warehouseLocation: z.string().trim().max(120).default(""),
    receivedBy: z
      .string()
      .trim()
      .min(2)
      .max(120)
      .transform((value) => value.toUpperCase()),
    notes: z.string().trim().max(1000).default(""),
    orderId: z.string().trim().optional(),
    orderLineId: z.string().trim().optional(),
    markSupplierRequestReceived: z.boolean().default(false),
    sendDeliveryConfirmation: z.boolean().default(false),
  })
  .refine((value) => Boolean(value.orderId) === Boolean(value.orderLineId), {
    message: "Order and order line must be linked together",
  })
  .refine(
    (value) =>
      !value.sendDeliveryConfirmation || value.markSupplierRequestReceived,
    {
      message: "Delivery confirmation requires marking the request received",
    },
  );

export const receiptSchema = z.object({
  receiptId: z.string(),
  date: z.string().date(),
  sku: skuCodeSchema,
  itemDescription: z.string(),
  quantityReceived: z.number().positive(),
  unit: z.enum(skuUnits),
  supplier: z.string(),
  warehouseLocation: z.string(),
  receivedBy: z.string(),
  notes: z.string(),
  itemCheckStatus: z.enum(["UNCHECKED", "CHECKED"]),
  orderId: z.string().nullable(),
  orderLineId: z.string().nullable(),
});

export const openOrderOptionSchema = z.object({
  orderId: z.string(),
  orderLineId: z.string(),
  customerName: z.string(),
  requiredQuantity: z.number().nonnegative(),
  reservedQuantity: z.number().nonnegative(),
  remainingQuantity: z.number().positive(),
  line: orderLineSchema,
});

export const receiptResponseSchema = z.object({ data: receiptSchema });
export const receiptListResponseSchema = z.object({
  data: z.array(receiptSchema),
});
export const openOrderOptionsResponseSchema = z.object({
  data: z.array(openOrderOptionSchema),
});

export type CreateReceiptRequest = z.input<typeof createReceiptRequestSchema>;
export type Receipt = z.infer<typeof receiptSchema>;
export type OpenOrderOption = z.infer<typeof openOrderOptionSchema>;

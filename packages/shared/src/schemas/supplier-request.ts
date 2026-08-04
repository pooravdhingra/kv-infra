import { z } from "zod";

import { skuCodeSchema, skuUnits } from "./sku.js";

export const supplierRequestStatuses = [
  "SENT",
  "SEND FAILED",
  "CONFIRMED",
  "RECEIVED",
] as const;

export const supplierRequestSchema = z.object({
  requestId: z.string(),
  orderId: z.string(),
  orderLineId: z.string(),
  sku: skuCodeSchema,
  itemDescription: z.string(),
  unit: z.enum(skuUnits),
  requiredQuantity: z.number().nonnegative(),
  availableQuantity: z.number().nonnegative(),
  shortfallQuantity: z.number().positive(),
  selectedSupplier: z.string(),
  supplierNumber: z.string(),
  supplierPriority: z.number().int().positive(),
  lastMessageAt: z.string().datetime().nullable(),
  nextFollowUpAt: z.string().datetime().nullable(),
  status: z.enum(supplierRequestStatuses),
  autoFollowUpEnabled: z.boolean(),
  notes: z.string(),
  followUpNumber: z.number().int().nonnegative(),
});

export const createSupplierRequestSchema = z.object({
  orderId: z.string().trim().min(1),
  orderLineId: z.string().trim().min(1),
  supplierNumber: z.string().trim().min(5).max(30),
  quantity: z.number().positive().max(1_000_000_000),
  messageBody: z.string().trim().min(1).max(4000).optional(),
  autoFollowUpEnabled: z.boolean().default(true),
  notes: z.string().trim().max(1000).default(""),
});

export const bulkCreateSupplierRequestsSchema = z.object({
  requests: z.array(createSupplierRequestSchema).min(1).max(200),
});

export const updateSupplierRequestNotesSchema = z.object({
  notes: z.string().trim().max(1000).default(""),
});

export const sendWhatsAppMessageSchema = z.object({
  supplierNumber: z.string().trim().min(5).max(30),
  messageBody: z.string().trim().min(1).max(4000),
});

export const whatsappStatusSchema = z.object({
  data: z.object({
    status: z.enum(["DISCONNECTED", "CONNECTING", "QR READY", "CONNECTED"]),
    connected: z.boolean(),
    qrAvailable: z.boolean(),
    accountId: z.string().nullable(),
    lastError: z.string().nullable(),
  }),
});

export const whatsappQrSchema = z.object({
  data: z.object({ qr: z.string().nullable() }),
});

export const supplierRequestResponseSchema = z.object({
  data: supplierRequestSchema,
});
export const supplierRequestListResponseSchema = z.object({
  data: z.array(supplierRequestSchema),
});

export type SupplierRequest = z.infer<typeof supplierRequestSchema>;
export type CreateSupplierRequest = z.input<typeof createSupplierRequestSchema>;
export type BulkCreateSupplierRequests = z.input<
  typeof bulkCreateSupplierRequestsSchema
>;
export type WhatsAppStatus = z.infer<typeof whatsappStatusSchema>["data"];

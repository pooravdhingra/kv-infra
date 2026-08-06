import { z } from "zod";

import { createOrderRequestSchema } from "./order.js";
import { skuSchema } from "./sku.js";

export const createClientOrderLinkRequestSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .transform((value) => value.toUpperCase()),
});

export const publicOrderSubmissionSchema = createOrderRequestSchema.pick({
  orderNotes: true,
  items: true,
});

export const clientOrderLinkStatusSchema = z.enum([
  "OPEN",
  "SUBMITTED",
  "SHIPPED",
  "DISABLED",
]);

export const clientOrderLinkSchema = z.object({
  linkId: z.string(),
  customerName: z.string(),
  createdAt: z.string().datetime(),
  orderId: z.string().nullable(),
  submittedAt: z.string().datetime().nullable(),
  disabledAt: z.string().datetime().nullable(),
  status: clientOrderLinkStatusSchema,
  url: z.string().url(),
});

export const clientOrderLinkResponseSchema = z.object({
  data: clientOrderLinkSchema,
});
export const clientOrderLinkListResponseSchema = z.object({
  data: z.array(clientOrderLinkSchema),
});

const publicOrderLineSchema = z.object({
  sku: z.string(),
  itemDescription: z.string(),
  unit: z.string(),
  cartons: z.number().nonnegative(),
  totalQuantity: z.number().nonnegative(),
  grossWeight: z.number().nonnegative(),
  volume: z.number().nonnegative(),
});

export const publicOrderSummarySchema = z.object({
  orderId: z.string(),
  customerName: z.string(),
  dateReceived: z.string().date(),
  totalCartons: z.number().nonnegative(),
  totalQuantity: z.number().nonnegative(),
  grossWeight: z.number().nonnegative(),
  volume: z.number().nonnegative(),
  items: z.array(publicOrderLineSchema),
});

export const publicOrderStateSchema = z.object({
  data: z.discriminatedUnion("status", [
    z.object({
      status: z.literal("OPEN"),
      customerName: z.string(),
      skus: z.array(skuSchema),
    }),
    z.object({
      status: z.literal("SUBMITTED"),
      customerName: z.string(),
      summary: publicOrderSummarySchema,
    }),
  ]),
});

export const publicSkuFormStatusSchema = z.object({
  data: z.object({ enabled: z.literal(true) }),
});

export const publicToolsSchema = z.object({
  data: z.object({ skuFormUrl: z.string().url().nullable() }),
});

export type ClientOrderLink = z.infer<typeof clientOrderLinkSchema>;
export type PublicOrderState = z.infer<typeof publicOrderStateSchema>["data"];
export type PublicOrderSubmission = z.input<typeof publicOrderSubmissionSchema>;

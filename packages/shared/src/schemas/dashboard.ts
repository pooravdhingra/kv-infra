import { z } from "zod";

export const dashboardActionSchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  href: z.string(),
  tone: z.enum(["URGENT", "ATTENTION", "READY", "ROUTINE"]),
});

export const dashboardOrderSchema = z.object({
  orderId: z.string(),
  customerName: z.string(),
  dateReceived: z.string().date(),
  lineCount: z.number().int().positive(),
  totalCartons: z.number().nonnegative(),
  totalQuantity: z.number().nonnegative(),
  readiness: z.enum([
    "READY_TO_SHIP",
    "NEEDS_SUPPLIER",
    "NEEDS_PACKING",
    "READY_TO_RESERVE",
    "IN_PROGRESS",
  ]),
});

export const dashboardActivitySchema = z.object({
  id: z.string(),
  kind: z.enum(["RECEIVING", "PACKING"]),
  date: z.string().date(),
  title: z.string(),
  detail: z.string(),
  href: z.string(),
});

export const dashboardSchema = z.object({
  summary: z.object({
    pendingOrders: z.number().int().nonnegative(),
    completedOrders: z.number().int().nonnegative(),
    readyToShipOrders: z.number().int().nonnegative(),
    supplierShortfallLines: z.number().int().nonnegative(),
    activePackingSessions: z.number().int().nonnegative(),
    unpackedSkus: z.number().int().nonnegative(),
    dueFollowUps: z.number().int().nonnegative(),
    sendFailures: z.number().int().nonnegative(),
  }),
  actions: z.array(dashboardActionSchema),
  orders: z.array(dashboardOrderSchema),
  activity: z.array(dashboardActivitySchema),
});

export const dashboardResponseSchema = z.object({ data: dashboardSchema });

export type Dashboard = z.infer<typeof dashboardSchema>;

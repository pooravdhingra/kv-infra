import { z } from "zod";

import { skuCodeSchema, skuUnits } from "./sku.js";

const optionalSheetText = z.string().nullable();

export const inventoryItemSchema = z.object({
  sku: skuCodeSchema,
  itemDescription: z.string(),
  quantityPerCarton: z.number().positive(),
  unit: z.enum(skuUnits),
  unpackedQuantity: z.number().nonnegative(),
  inPackingQuantity: z.number().nonnegative(),
  packedCartons: z.number().nonnegative(),
  packedTotalQuantity: z.number().nonnegative(),
  totalAssigned: z.number().nonnegative(),
  availableQuantity: z.number().nonnegative(),
  defectiveShortQuantity: z.number().nonnegative(),
  lastReceivedDate: optionalSheetText,
  lastPackedDate: optionalSheetText,
  warehouseLocation: z.string(),
  notes: z.string(),
  lastUpdated: optionalSheetText,
});

export const inventoryListResponseSchema = z.object({
  data: z.array(inventoryItemSchema),
});
export const inventoryItemResponseSchema = z.object({
  data: inventoryItemSchema,
});

export const manualInventoryAdjustmentSchema = z
  .object({
    sku: skuCodeSchema,
    unpackedDelta: z.number().default(0),
    inPackingDelta: z.number().default(0),
    packedCartonsDelta: z.number().default(0),
    totalAssignedDelta: z.number().default(0),
    defectiveShortDelta: z.number().default(0),
    warehouseLocation: z.string().trim().max(120).optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .refine(
    (value) =>
      value.unpackedDelta !== 0 ||
      value.inPackingDelta !== 0 ||
      value.packedCartonsDelta !== 0 ||
      value.totalAssignedDelta !== 0 ||
      value.defectiveShortDelta !== 0 ||
      value.warehouseLocation !== undefined,
    "At least one inventory field must change",
  );

export type InventoryItem = z.infer<typeof inventoryItemSchema>;
export type ManualInventoryAdjustment = z.input<
  typeof manualInventoryAdjustmentSchema
>;

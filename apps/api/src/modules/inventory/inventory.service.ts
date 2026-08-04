import {
  calculateInventoryTotals,
  inventoryItemSchema,
  manualInventoryAdjustmentSchema,
  skuCodeSchema,
  type InventoryItem,
} from "@kv-infra/shared";

import { AppError } from "../../lib/app-error.js";
import type {
  InventoryRepository,
  InventorySourceRecord,
} from "./inventory.repository.js";

const active = (record: InventorySourceRecord) =>
  !record.sku.startsWith("DELETED-");

export const toInventoryItem = (
  record: InventorySourceRecord,
): InventoryItem => {
  let totals: ReturnType<typeof calculateInventoryTotals>;
  try {
    totals = calculateInventoryTotals(
      record.quantityPerCarton,
      record.packedCartons,
      record.totalAssigned,
    );
  } catch {
    throw new AppError(
      409,
      "INVALID_INVENTORY_STATE",
      `TOTAL ASSIGNED exceeds packed stock for ${record.sku}`,
    );
  }
  const { rowNumber: _rowNumber, ...source } = record;
  return inventoryItemSchema.parse({ ...source, ...totals });
};

export class InventoryService {
  constructor(private readonly repository: InventoryRepository) {}

  async list() {
    return (await this.repository.list()).filter(active).map(toInventoryItem);
  }

  async get(rawSku: string) {
    const sku = skuCodeSchema.parse(rawSku);
    const record = (await this.repository.list()).find(
      (item) => active(item) && item.sku === sku,
    );
    if (!record)
      throw new AppError(
        404,
        "INVENTORY_NOT_FOUND",
        `Inventory for ${sku} was not found`,
      );
    return toInventoryItem(record);
  }

  async adjust(input: unknown) {
    const adjustment = manualInventoryAdjustmentSchema.parse(input);
    const records = await this.repository.list();
    const record = records.find(
      (item) => active(item) && item.sku === adjustment.sku,
    );
    if (!record) {
      throw new AppError(
        404,
        "INVENTORY_NOT_FOUND",
        `Inventory for ${adjustment.sku} was not found`,
      );
    }

    const next: InventorySourceRecord = {
      ...record,
      unpackedQuantity: record.unpackedQuantity + adjustment.unpackedDelta,
      inPackingQuantity: record.inPackingQuantity + adjustment.inPackingDelta,
      packedCartons: record.packedCartons + adjustment.packedCartonsDelta,
      totalAssigned: record.totalAssigned + adjustment.totalAssignedDelta,
      defectiveShortQuantity:
        record.defectiveShortQuantity + adjustment.defectiveShortDelta,
      warehouseLocation:
        adjustment.warehouseLocation ?? record.warehouseLocation,
      notes: [
        record.notes,
        `[${new Date().toISOString()}] MANUAL ADJUSTMENT: ${adjustment.reason}`,
      ]
        .filter(Boolean)
        .join("\n"),
      lastUpdated: new Date().toISOString(),
    };

    const quantities = [
      next.unpackedQuantity,
      next.inPackingQuantity,
      next.packedCartons,
      next.totalAssigned,
      next.defectiveShortQuantity,
    ];
    if (quantities.some((value) => value < 0)) {
      throw new AppError(
        409,
        "NEGATIVE_INVENTORY",
        "A manual adjustment cannot make inventory negative",
      );
    }
    const item = toInventoryItem(next);
    await this.repository.update(next);
    return item;
  }
}

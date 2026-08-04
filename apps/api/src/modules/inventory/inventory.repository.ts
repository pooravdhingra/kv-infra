import { INVENTORY_HEADERS, type InventoryItem } from "@kv-infra/shared";

import { env } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";
import {
  assertExactHeaders,
  type GoogleSheetsClient,
} from "../sheets/google-sheets.client.js";

export type InventorySourceRecord = Omit<
  InventoryItem,
  "packedTotalQuantity" | "availableQuantity"
> & { rowNumber: number };

export interface InventoryRepository {
  list(): Promise<InventorySourceRecord[]>;
  update(record: InventorySourceRecord): Promise<void>;
}

export const inventoryRecordValues = (record: InventorySourceRecord) => [
  record.sku,
  record.itemDescription,
  record.quantityPerCarton,
  record.unit,
  record.unpackedQuantity,
  record.inPackingQuantity,
  record.packedCartons,
  `=G${record.rowNumber}*C${record.rowNumber}`,
  record.totalAssigned,
  `=H${record.rowNumber}-I${record.rowNumber}`,
  record.defectiveShortQuantity,
  record.lastReceivedDate ?? "",
  record.lastPackedDate ?? "",
  record.warehouseLocation,
  record.notes,
  record.lastUpdated ?? new Date().toISOString(),
];

const spreadsheetId = () => {
  if (!env.MASTER_SPREADSHEET_ID) {
    throw new AppError(
      503,
      "GOOGLE_NOT_CONFIGURED",
      "MASTER_SPREADSHEET_ID is not configured",
    );
  }
  return env.MASTER_SPREADSHEET_ID;
};

const numeric = (value: unknown, label: string, rowNumber: number) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new AppError(
      409,
      "INVALID_SHEET_DATA",
      `${label} must be a non-negative number on Inventory row ${rowNumber}`,
    );
  }
  return parsed;
};

const text = (value: unknown) => String(value ?? "").trim();
const nullableText = (value: unknown) => text(value) || null;

export class GoogleSheetsInventoryRepository implements InventoryRepository {
  constructor(private readonly sheets: GoogleSheetsClient) {}

  async list(): Promise<InventorySourceRecord[]> {
    const rows = await this.sheets.readRows(
      spreadsheetId(),
      env.INVENTORY_SHEET_NAME,
    );
    assertExactHeaders(
      rows[0] ?? [],
      INVENTORY_HEADERS,
      env.INVENTORY_SHEET_NAME,
    );

    return rows.slice(1).flatMap((row, index) => {
      if (!row[0]) return [];
      const rowNumber = index + 2;
      return [
        {
          rowNumber,
          sku: text(row[0]).toUpperCase(),
          itemDescription: text(row[1]),
          quantityPerCarton: numeric(row[2], "QTY / CARTON", rowNumber),
          unit: text(row[3]) as InventoryItem["unit"],
          unpackedQuantity: numeric(row[4], "UNPACKED QTY", rowNumber),
          inPackingQuantity: numeric(row[5], "IN PACKING QTY", rowNumber),
          packedCartons: numeric(row[6], "PACKED CTNS", rowNumber),
          totalAssigned: numeric(row[8], "TOTAL ASSIGNED", rowNumber),
          defectiveShortQuantity: numeric(
            row[10],
            "DEFECTIVE / SHORT QTY",
            rowNumber,
          ),
          lastReceivedDate: nullableText(row[11]),
          lastPackedDate: nullableText(row[12]),
          warehouseLocation: text(row[13]),
          notes: text(row[14]),
          lastUpdated: nullableText(row[15]),
        },
      ];
    });
  }

  async update(record: InventorySourceRecord) {
    await this.sheets.updateRow(
      spreadsheetId(),
      env.INVENTORY_SHEET_NAME,
      record.rowNumber,
      inventoryRecordValues(record),
    );
  }
}

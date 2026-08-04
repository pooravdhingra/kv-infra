import { ORDER_ALLOCATION_HEADERS } from "@kv-infra/shared";

import { env } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";
import {
  inventoryRecordValues,
  type InventorySourceRecord,
} from "../inventory/inventory.repository.js";
import {
  assertExactHeaders,
  type GoogleSheetsClient,
} from "../sheets/google-sheets.client.js";

const spreadsheetId = () => {
  if (!env.MASTER_SPREADSHEET_ID)
    throw new AppError(
      503,
      "GOOGLE_NOT_CONFIGURED",
      "MASTER_SPREADSHEET_ID is not configured",
    );
  return env.MASTER_SPREADSHEET_ID;
};

const quote = (name: string) => `'${name.replaceAll("'", "''")}'`;
const text = (value: unknown) => String(value ?? "").trim();
const numeric = (value: unknown, rowNumber: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed === 0)
    throw new AppError(
      409,
      "INVALID_ALLOCATION_LOG",
      `QTY ASSIGNED must be non-zero on allocation row ${rowNumber}`,
    );
  return parsed;
};

export type AllocationEvent = {
  allocationId: string;
  orderId: string;
  orderLineId: string;
  sku: string;
  itemDescription: string;
  quantity: number;
  notes: string;
};

export interface AllocationRepository {
  snapshot(): Promise<{
    events: AllocationEvent[];
    nextRowNumber: number;
  }>;
  commit(
    row: unknown[],
    rowNumber: number,
    inventory: InventorySourceRecord,
  ): Promise<void>;
}

export class GoogleSheetsAllocationRepository implements AllocationRepository {
  constructor(private readonly sheets: GoogleSheetsClient) {}

  async snapshot() {
    const rows = await this.sheets.readRows(
      spreadsheetId(),
      env.ORDER_ALLOCATIONS_SHEET_NAME,
    );
    assertExactHeaders(
      rows[0] ?? [],
      ORDER_ALLOCATION_HEADERS,
      env.ORDER_ALLOCATIONS_SHEET_NAME,
    );
    return {
      events: rows.slice(1).flatMap((row, index) =>
        row[0]
          ? [
              {
                allocationId: text(row[0]),
                orderId: text(row[1]),
                orderLineId: text(row[2]),
                sku: text(row[3]).toUpperCase(),
                itemDescription: text(row[4]),
                quantity: numeric(row[5], index + 2),
                notes: text(row[6]),
              },
            ]
          : [],
      ),
      nextRowNumber: rows.length + 1,
    };
  }

  async commit(
    row: unknown[],
    rowNumber: number,
    inventory: InventorySourceRecord,
  ) {
    await this.sheets.batchUpdateRanges(spreadsheetId(), [
      {
        range: `${quote(env.INVENTORY_SHEET_NAME)}!A${inventory.rowNumber}`,
        values: [inventoryRecordValues(inventory)],
      },
      {
        range: `${quote(env.ORDER_ALLOCATIONS_SHEET_NAME)}!A${rowNumber}`,
        values: [row],
      },
    ]);
  }
}

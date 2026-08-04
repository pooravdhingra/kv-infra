import {
  RECEIVING_LOG_HEADERS,
  receiptSchema,
  type Receipt,
} from "@kv-infra/shared";

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

export interface ReceivingRepository {
  snapshot(): Promise<{
    ids: string[];
    receipts: Receipt[];
    nextRowNumber: number;
  }>;
  commit(
    receiptRow: unknown[],
    receiptRowNumber: number,
    inventory: InventorySourceRecord,
  ): Promise<void>;
}

export class GoogleSheetsReceivingRepository implements ReceivingRepository {
  constructor(private readonly sheets: GoogleSheetsClient) {}

  private async rows() {
    const rows = await this.sheets.readRows(
      spreadsheetId(),
      env.RECEIVING_LOG_SHEET_NAME,
    );
    assertExactHeaders(
      rows[0] ?? [],
      RECEIVING_LOG_HEADERS,
      env.RECEIVING_LOG_SHEET_NAME,
    );
    return rows;
  }

  async snapshot() {
    const rows = await this.rows();
    const dataRows = rows.slice(1).filter((row) => row[0]);
    return {
      ids: dataRows.map((row) => String(row[0]).trim()),
      receipts: dataRows.map((row) =>
        receiptSchema.parse({
          receiptId: String(row[0]).trim(),
          date: String(row[1] ?? "").trim(),
          sku: String(row[2] ?? "").trim(),
          itemDescription: String(row[3] ?? "").trim(),
          quantityReceived: Number(row[4]),
          unit: String(row[5] ?? "").trim(),
          supplier: String(row[6] ?? "").trim(),
          warehouseLocation: String(row[7] ?? "").trim(),
          receivedBy: String(row[8] ?? "").trim(),
          notes: String(row[9] ?? "").trim(),
          itemCheckStatus: String(row[10] ?? "UNCHECKED")
            .trim()
            .toUpperCase(),
          orderId: String(row[11] ?? "").trim() || null,
          orderLineId: String(row[12] ?? "").trim() || null,
        }),
      ),
      nextRowNumber: rows.length + 1,
    };
  }

  async commit(
    receiptRow: unknown[],
    receiptRowNumber: number,
    inventory: InventorySourceRecord,
  ) {
    await this.sheets.batchUpdateRanges(spreadsheetId(), [
      {
        range: `${quote(env.INVENTORY_SHEET_NAME)}!A${inventory.rowNumber}`,
        values: [inventoryRecordValues(inventory)],
      },
      {
        range: `${quote(env.RECEIVING_LOG_SHEET_NAME)}!A${receiptRowNumber}`,
        values: [receiptRow],
      },
    ]);
  }
}

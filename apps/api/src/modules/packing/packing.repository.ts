import { ORDER_ALLOCATION_HEADERS, QA_LOG_HEADERS } from "@kv-infra/shared";

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
const numeric = (value: unknown, label: string) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0)
    throw new AppError(409, "INVALID_QA_LOG", `${label} must be non-negative`);
  return parsed;
};

export type PackingEvent = {
  packingId: string;
  date: string;
  sku: string;
  itemDescription: string;
  quantityTaken: number;
  goodQuantity: number;
  packedCartons: number;
  defectiveQuantity: number;
  shortQuantity: number;
  leftUnpackedQuantity: number;
  assignedToOrder: boolean;
  orderId: string | null;
  orderLineId: string | null;
  status: "IN PACKING" | "FINISHED";
  notes: string;
};

export interface PackingRepository {
  listEvents(): Promise<PackingEvent[]>;
  listAllocationIds(): Promise<string[]>;
  commitStart(
    eventRow: unknown[],
    inventory: InventorySourceRecord,
  ): Promise<void>;
  commitFinish(
    eventRow: unknown[],
    inventory: InventorySourceRecord,
    allocationRow?: unknown[],
  ): Promise<void>;
  appendEvents(eventRows: unknown[][]): Promise<void>;
}

export class GoogleSheetsPackingRepository implements PackingRepository {
  constructor(private readonly sheets: GoogleSheetsClient) {}

  private async qaRows() {
    const rows = await this.sheets.readRows(
      spreadsheetId(),
      env.QA_LOG_SHEET_NAME,
    );
    assertExactHeaders(rows[0] ?? [], QA_LOG_HEADERS, env.QA_LOG_SHEET_NAME);
    return rows;
  }

  private async allocationRows() {
    const rows = await this.sheets.readRows(
      spreadsheetId(),
      env.ORDER_ALLOCATIONS_SHEET_NAME,
    );
    assertExactHeaders(
      rows[0] ?? [],
      ORDER_ALLOCATION_HEADERS,
      env.ORDER_ALLOCATIONS_SHEET_NAME,
    );
    return rows;
  }

  async listEvents() {
    return (await this.qaRows()).slice(1).flatMap((row) => {
      if (!row[0]) return [];
      const status = text(row[12]);
      if (status !== "IN PACKING" && status !== "FINISHED")
        throw new AppError(
          409,
          "INVALID_QA_LOG",
          `Unknown QA status ${status}`,
        );
      const parsedStatus: PackingEvent["status"] = status;
      return [
        {
          packingId: text(row[0]),
          date: text(row[1]),
          sku: text(row[2]).toUpperCase(),
          itemDescription: text(row[3]),
          quantityTaken: numeric(row[4], "QTY TAKEN"),
          goodQuantity: numeric(row[5], "GOOD QTY"),
          packedCartons: numeric(row[6], "PACKED CTNS"),
          defectiveQuantity: numeric(row[7], "DEFECTIVE QTY"),
          shortQuantity: numeric(row[8], "SHORT QTY"),
          leftUnpackedQuantity: numeric(row[14], "LEFT UNPACKED"),
          assignedToOrder: text(row[9]).toUpperCase() === "YES",
          orderId: text(row[10]) || null,
          orderLineId: text(row[11]) || null,
          status: parsedStatus,
          notes: text(row[13]),
        },
      ];
    });
  }

  async listAllocationIds() {
    return (await this.allocationRows())
      .slice(1)
      .flatMap((row) => (row[0] ? [text(row[0])] : []));
  }

  private inventoryUpdate(inventory: InventorySourceRecord) {
    return {
      range: `${quote(env.INVENTORY_SHEET_NAME)}!A${inventory.rowNumber}`,
      values: [inventoryRecordValues(inventory)],
    };
  }

  async commitStart(eventRow: unknown[], inventory: InventorySourceRecord) {
    const qa = await this.qaRows();
    await this.sheets.batchUpdateRanges(spreadsheetId(), [
      this.inventoryUpdate(inventory),
      {
        range: `${quote(env.QA_LOG_SHEET_NAME)}!A${qa.length + 1}`,
        values: [eventRow],
      },
    ]);
  }

  async commitFinish(
    eventRow: unknown[],
    inventory: InventorySourceRecord,
    allocationRow?: unknown[],
  ) {
    const [qa, allocations] = await Promise.all([
      this.qaRows(),
      allocationRow ? this.allocationRows() : Promise.resolve([]),
    ]);
    await this.sheets.batchUpdateRanges(spreadsheetId(), [
      this.inventoryUpdate(inventory),
      {
        range: `${quote(env.QA_LOG_SHEET_NAME)}!A${qa.length + 1}`,
        values: [eventRow],
      },
      ...(allocationRow
        ? [
            {
              range: `${quote(env.ORDER_ALLOCATIONS_SHEET_NAME)}!A${allocations.length + 1}`,
              values: [allocationRow],
            },
          ]
        : []),
    ]);
  }

  async appendEvents(eventRows: unknown[][]) {
    if (eventRows.length === 0) return;
    const qa = await this.qaRows();
    await this.sheets.batchUpdateRanges(
      spreadsheetId(),
      eventRows.map((row, index) => ({
        range: `${quote(env.QA_LOG_SHEET_NAME)}!A${qa.length + index + 1}`,
        values: [row],
      })),
    );
  }
}

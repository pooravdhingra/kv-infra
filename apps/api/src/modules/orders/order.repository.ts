import { ORDER_HEADERS, type OrderLine } from "@kv-infra/shared";

import { env } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";
import type { GoogleSheetsClient } from "../sheets/google-sheets.client.js";

export type OrderSheetSnapshot = {
  sheetId: number;
  title: string;
  rows: unknown[][];
};

export interface OrderRepository {
  snapshot(): Promise<OrderSheetSnapshot[]>;
  create(
    title: string,
    values: unknown[][],
  ): Promise<{ sheetId: number; title: string }>;
  updateStockCheck(title: string, items: OrderLine[]): Promise<void>;
  completeOrder(
    title: string,
    lineCount: number,
    completedAt: string,
  ): Promise<void>;
  updateLineState(
    title: string,
    rowNumber: number,
    input: {
      status: string;
      reservedQuantity?: number;
      supplierRequestStatus?: string;
    },
  ): Promise<void>;
}

const spreadsheetId = () => {
  if (!env.ORDERS_SPREADSHEET_ID) {
    throw new AppError(
      503,
      "GOOGLE_NOT_CONFIGURED",
      "ORDERS_SPREADSHEET_ID is not configured",
    );
  }
  return env.ORDERS_SPREADSHEET_ID;
};

export const isOrderHeader = (row: unknown[]) =>
  row.length === ORDER_HEADERS.length &&
  row.every((value, index) => String(value) === ORDER_HEADERS[index]);

export class GoogleSheetsOrderRepository implements OrderRepository {
  constructor(private readonly sheets: GoogleSheetsClient) {}

  async snapshot() {
    const id = spreadsheetId();
    const sheets = await this.sheets.listSheets(id);
    const rows = await this.sheets.readMultipleRows(
      id,
      sheets.map((sheet) => sheet.title),
    );
    return sheets.map((sheet, index) => ({
      ...sheet,
      rows: rows[index] ?? [],
    }));
  }

  async create(title: string, values: unknown[][]) {
    const id = spreadsheetId();
    const created = await this.sheets.createOrderTab(id, title);
    const range = `'${created.title.replaceAll("'", "''")}'!A1`;
    await this.sheets.updateRange(id, range, values);
    await this.sheets.formatOrderTab(
      id,
      created.sheetId,
      13,
      ORDER_HEADERS.length,
    );
    return created;
  }

  async updateStockCheck(title: string, items: OrderLine[]) {
    const escaped = title.replaceAll("'", "''");
    const timestamp = new Date().toISOString();
    await this.sheets.batchUpdateRanges(
      spreadsheetId(),
      items.flatMap((item, index) => {
        const row = index + 2;
        const status =
          item.remainingQuantity === 0
            ? "FULLY RESERVED"
            : item.stockStatus.replaceAll("_", " ");
        return [
          { range: `'${escaped}'!J${row}`, values: [[status]] },
          {
            range: `'${escaped}'!R${row}`,
            values: [[item.reservedQuantity]],
          },
          {
            range: `'${escaped}'!S${row}`,
            values: [[item.shortfallQuantity]],
          },
          { range: `'${escaped}'!U${row}`, values: [[timestamp]] },
        ];
      }),
    );
  }

  async completeOrder(title: string, lineCount: number, completedAt: string) {
    const escaped = title.replaceAll("'", "''");
    await this.sheets.batchUpdateRanges(spreadsheetId(), [
      {
        range: `'${escaped}'!J2:J${lineCount + 1}`,
        values: Array.from({ length: lineCount }, () => ["SHIPPED"]),
      },
      {
        range: `'${escaped}'!U2:U${lineCount + 1}`,
        values: Array.from({ length: lineCount }, () => [completedAt]),
      },
    ]);
  }

  async updateLineState(
    title: string,
    rowNumber: number,
    input: {
      status: string;
      reservedQuantity?: number;
      supplierRequestStatus?: string;
    },
  ) {
    const escaped = title.replaceAll("'", "''");
    const updates: Array<{ range: string; values: unknown[][] }> = [
      { range: `'${escaped}'!J${rowNumber}`, values: [[input.status]] },
      {
        range: `'${escaped}'!U${rowNumber}`,
        values: [[new Date().toISOString()]],
      },
    ];
    if (input.reservedQuantity !== undefined) {
      updates.push({
        range: `'${escaped}'!R${rowNumber}`,
        values: [[input.reservedQuantity]],
      });
    }
    if (input.supplierRequestStatus !== undefined) {
      updates.push({
        range: `'${escaped}'!T${rowNumber}`,
        values: [[input.supplierRequestStatus]],
      });
    }
    await this.sheets.batchUpdateRanges(spreadsheetId(), updates);
  }
}

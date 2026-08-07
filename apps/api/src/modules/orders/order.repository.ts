import {
  CUBIC_INCH_TO_CUBIC_METRE,
  LEGACY_ORDER_HEADERS,
  ORDER_HEADERS,
  calculateCartonsFromTotalQuantity,
  type OrderLine,
  type Sku,
} from "@kv-infra/shared";

import { env } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";
import type { GoogleSheetsClient } from "../sheets/google-sheets.client.js";

export type OrderSheetSnapshot = {
  sheetId: number;
  title: string;
  rows: unknown[][];
};

export type OrderSkuPackingUpdate = {
  title: string;
  rowNumber: number;
  totalQuantity: number;
  sku: Sku;
};

export interface OrderRepository {
  snapshot(): Promise<OrderSheetSnapshot[]>;
  create(
    title: string,
    values: unknown[][],
  ): Promise<{ sheetId: number; title: string }>;
  update(
    title: string,
    rows: Array<{ orderLineId: string; values: unknown[] }>,
    actualGrossWeight: number | null,
    actualVolume: number | null,
  ): Promise<void>;
  cancelLine(
    title: string,
    rowNumber: number,
    timestamp: string,
  ): Promise<void>;
  updateStockCheck(title: string, items: OrderLine[]): Promise<void>;
  updateSkuPackingDetails(updates: OrderSkuPackingUpdate[]): Promise<void>;
  completeOrder(
    title: string,
    orderLineIds: string[],
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

const isLegacyOrderHeader = (row: unknown[]) =>
  row.length === LEGACY_ORDER_HEADERS.length &&
  row.every((value, index) => String(value) === LEGACY_ORDER_HEADERS[index]);

export const orderVolumeFormula = (row: number) =>
  `=K${row}*L${row}*M${row}*E${row}*${CUBIC_INCH_TO_CUBIC_METRE}`;

export class GoogleSheetsOrderRepository implements OrderRepository {
  constructor(private readonly sheets: GoogleSheetsClient) {}

  async snapshot() {
    const id = spreadsheetId();
    const sheets = await this.sheets.listSheets(id);
    const rows = await this.sheets.readMultipleRows(
      id,
      sheets.map((sheet) => sheet.title),
    );
    const snapshots = sheets.map((sheet, index) => ({
      ...sheet,
      rows: rows[index] ?? [],
    }));
    const legacy = snapshots.filter((sheet) =>
      isLegacyOrderHeader(sheet.rows[0] ?? []),
    );
    if (legacy.length > 0) {
      await this.sheets.batchUpdateRanges(
        id,
        legacy.map((sheet) => ({
          range: `'${sheet.title.replaceAll("'", "''")}'!X1:Y1`,
          values: [["ACTUAL GROSS WT", "ACTUAL VOLUME"]],
        })),
      );
      legacy.forEach((sheet) => {
        sheet.rows[0] = [...ORDER_HEADERS];
      });
      await this.sheets.formatOrderTabs(
        id,
        legacy.map((sheet) => ({
          sheetId: sheet.sheetId,
          hiddenColumnStart: 13,
          hiddenColumnEnd: ORDER_HEADERS.length,
        })),
      );
    }
    return snapshots;
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

  async update(
    title: string,
    updates: Array<{ orderLineId: string; values: unknown[] }>,
    actualGrossWeight: number | null,
    actualVolume: number | null,
  ) {
    const escaped = title.replaceAll("'", "''");
    const rows = await this.sheets.readRows(spreadsheetId(), title);
    const rowByLineId = new Map(
      rows.flatMap((row, index) =>
        index > 0 && row[14]
          ? [[String(row[14]).trim(), index + 1] as const]
          : [],
      ),
    );
    let nextRowNumber = rows.length + 1;
    await this.sheets.batchUpdateRanges(spreadsheetId(), [
      ...updates.map((update) => {
        const rowNumber =
          rowByLineId.get(update.orderLineId) ?? nextRowNumber++;
        const values = [...update.values];
        if (Number(values[2]) > 0) {
          values[5] = `=E${rowNumber}*C${rowNumber}`;
          values[7] = `=E${rowNumber}*G${rowNumber}`;
          values[8] = orderVolumeFormula(rowNumber);
        }
        values[16] = `=F${rowNumber}`;
        return {
          range: `'${escaped}'!A${rowNumber}:W${rowNumber}`,
          values: [values.slice(0, 23)],
        };
      }),
      {
        range: `'${escaped}'!X2:Y2`,
        values: [[actualGrossWeight ?? "", actualVolume ?? ""]],
      },
    ]);
  }

  async cancelLine(title: string, rowNumber: number, timestamp: string) {
    const escaped = title.replaceAll("'", "''");
    await this.sheets.batchUpdateRanges(spreadsheetId(), [
      { range: `'${escaped}'!J${rowNumber}`, values: [["CANCELLED"]] },
      {
        range: `'${escaped}'!R${rowNumber}:T${rowNumber}`,
        values: [[0, 0, ""]],
      },
      { range: `'${escaped}'!U${rowNumber}`, values: [[timestamp]] },
    ]);
  }

  async updateStockCheck(title: string, items: OrderLine[]) {
    const escaped = title.replaceAll("'", "''");
    const timestamp = new Date().toISOString();
    const rows = await this.sheets.readRows(spreadsheetId(), title);
    const rowByLineId = new Map(
      rows.flatMap((row, index) =>
        index > 0 && row[14]
          ? [[String(row[14]).trim(), index + 1] as const]
          : [],
      ),
    );
    await this.sheets.batchUpdateRanges(
      spreadsheetId(),
      items.flatMap((item) => {
        const row = rowByLineId.get(item.orderLineId);
        if (!row) return [];
        const status =
          item.remainingQuantity === 0
            ? "FULLY RESERVED"
            : item.stockStatus.replaceAll("_", " ");
        return [
          {
            range: `'${escaped}'!I${row}`,
            values: [
              [item.quantityPerCarton > 0 ? orderVolumeFormula(row) : ""],
            ],
          },
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

  async updateSkuPackingDetails(updates: OrderSkuPackingUpdate[]) {
    if (updates.length === 0) return;
    const timestamp = new Date().toISOString();
    await this.sheets.batchUpdateRanges(
      spreadsheetId(),
      updates.flatMap(({ title, rowNumber, totalQuantity, sku }) => {
        const escaped = title.replaceAll("'", "''");
        const cartons = calculateCartonsFromTotalQuantity(
          totalQuantity,
          sku.quantityPerCarton,
        );
        return [
          {
            range: `'${escaped}'!C${rowNumber}`,
            values: [[sku.quantityPerCarton]],
          },
          {
            range: `'${escaped}'!E${rowNumber}:I${rowNumber}`,
            values: [
              [
                cartons,
                `=E${rowNumber}*C${rowNumber}`,
                sku.weightPerCarton,
                `=E${rowNumber}*G${rowNumber}`,
                orderVolumeFormula(rowNumber),
              ],
            ],
          },
          {
            range: `'${escaped}'!K${rowNumber}:M${rowNumber}`,
            values: [[sku.length, sku.breadth, sku.height]],
          },
          {
            range: `'${escaped}'!U${rowNumber}`,
            values: [[timestamp]],
          },
        ];
      }),
    );
  }

  async completeOrder(
    title: string,
    orderLineIds: string[],
    completedAt: string,
  ) {
    const escaped = title.replaceAll("'", "''");
    const rows = await this.sheets.readRows(spreadsheetId(), title);
    const targets = rows.flatMap((row, index) =>
      index > 0 && orderLineIds.includes(String(row[14] ?? "").trim())
        ? [index + 1]
        : [],
    );
    await this.sheets.batchUpdateRanges(
      spreadsheetId(),
      targets.flatMap((row) => [
        { range: `'${escaped}'!J${row}`, values: [["SHIPPED"]] },
        { range: `'${escaped}'!U${row}`, values: [[completedAt]] },
      ]),
    );
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

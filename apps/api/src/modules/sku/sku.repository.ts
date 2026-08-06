import {
  INVENTORY_HEADERS,
  LEGACY_PACKING_MASTER_HEADERS,
  PACKING_MASTER_HEADERS,
  skuSchema,
  type Sku,
  type SkuOem,
} from "@kv-infra/shared";

import { env } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";
import type { GoogleSheetsClient } from "../sheets/google-sheets.client.js";

export type InventoryRecord = {
  rowNumber: number;
  sku: string;
};

export type SkuRecord = Sku & { rowNumber: number; oem?: SkuOem };

export interface SkuRepository {
  listSkus(): Promise<SkuRecord[]>;
  listInventory(): Promise<InventoryRecord[]>;
  appendSku(sku: Sku, oem: SkuOem): Promise<void>;
  appendInventory(sku: Sku, rowNumber: number): Promise<void>;
  updateSku(rowNumber: number, sku: Sku, oem?: SkuOem): Promise<void>;
  updateInventoryIdentity(rowNumber: number, sku: Sku): Promise<void>;
  archiveSku(
    skuRowNumber: number,
    inventoryRowNumber: number | undefined,
    sku: Sku,
    oem?: SkuOem,
  ): Promise<void>;
}

const requiredSpreadsheetId = () => {
  if (!env.MASTER_SPREADSHEET_ID) {
    throw new AppError(
      503,
      "GOOGLE_NOT_CONFIGURED",
      "MASTER_SPREADSHEET_ID is not configured",
    );
  }
  return env.MASTER_SPREADSHEET_ID;
};

const numberCell = (value: unknown, label: string, rowNumber: number) => {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new AppError(
      409,
      "INVALID_SHEET_DATA",
      `${label} is not numeric on row ${rowNumber}`,
    );
  }
  return number;
};

export const inferSkuOem = (rawSku: string): SkuOem => {
  const sku = rawSku.replace(/^DELETED-/, "").toUpperCase();
  if (/^KV-B\d{4,}$/.test(sku)) return "Bajaj";
  if (/^KV-T\d{4,}$/.test(sku)) return "TVS";
  if (/^KV-P\d{4,}$/.test(sku)) return "Piaggio";
  return "Other";
};

export class GoogleSheetsSkuRepository implements SkuRepository {
  constructor(private readonly sheets: GoogleSheetsClient) {}

  async listSkus(): Promise<SkuRecord[]> {
    let rows = await this.sheets.readRows(
      requiredSpreadsheetId(),
      env.PACKING_MASTER_SHEET_NAME,
    );
    const headers = (rows[0] ?? []).map(String);
    if (
      headers.length === LEGACY_PACKING_MASTER_HEADERS.length &&
      headers.every(
        (header, index) => header === LEGACY_PACKING_MASTER_HEADERS[index],
      )
    ) {
      const escaped = env.PACKING_MASTER_SHEET_NAME.replaceAll("'", "''");
      await this.sheets.updateRange(
        requiredSpreadsheetId(),
        `'${escaped}'!I1:I${Math.max(rows.length, 1)}`,
        [
          ["OEM"],
          ...rows.slice(1).map((row) => [inferSkuOem(String(row[0] ?? ""))]),
        ],
      );
      rows = rows.map((row, index) =>
        index === 0
          ? [...row, "OEM"]
          : [...row, inferSkuOem(String(row[0] ?? ""))],
      );
    }
    this.assertHeaders(
      rows[0] ?? [],
      PACKING_MASTER_HEADERS,
      env.PACKING_MASTER_SHEET_NAME,
    );
    return rows.slice(1).flatMap((row, index) => {
      if (!row[0]) return [];
      const rowNumber = index + 2;
      const parsed = skuSchema.safeParse({
        rowNumber,
        sku: String(row[0]).trim().toUpperCase(),
        itemDescription: String(row[1] ?? "").trim(),
        quantityPerCarton: numberCell(row[2], "QUANTITY/CTN", rowNumber),
        unit: String(row[3] ?? "") as Sku["unit"],
        weightPerCarton: numberCell(row[4], "WEIGHT/CTN", rowNumber),
        length: numberCell(row[5], "LENGTH", rowNumber),
        breadth: numberCell(row[6], "BREADTH", rowNumber),
        height: numberCell(row[7], "HEIGHT", rowNumber),
      });
      if (!parsed.success) {
        throw new AppError(
          409,
          "INVALID_SHEET_DATA",
          `Packing Master row ${rowNumber} does not match the SKU contract`,
          parsed.error.flatten(),
        );
      }
      const oem = String(row[8] ?? "").trim();
      return [
        {
          ...parsed.data,
          rowNumber,
          oem: (["Bajaj", "TVS", "Piaggio", "Other"] as const).includes(
            oem as SkuOem,
          )
            ? (oem as SkuOem)
            : inferSkuOem(parsed.data.sku),
        },
      ];
    });
  }

  async listInventory(): Promise<InventoryRecord[]> {
    const rows = await this.sheets.readRows(
      requiredSpreadsheetId(),
      env.INVENTORY_SHEET_NAME,
    );
    this.assertHeaders(
      rows[0] ?? [],
      INVENTORY_HEADERS,
      env.INVENTORY_SHEET_NAME,
    );
    return rows
      .slice(1)
      .flatMap((row, index) =>
        row[0]
          ? [{ rowNumber: index + 2, sku: String(row[0]).trim().toUpperCase() }]
          : [],
      );
  }

  async appendSku(sku: Sku, oem: SkuOem) {
    await this.sheets.appendRow(
      requiredSpreadsheetId(),
      env.PACKING_MASTER_SHEET_NAME,
      [
        sku.sku,
        sku.itemDescription,
        sku.quantityPerCarton,
        sku.unit,
        sku.weightPerCarton,
        sku.length,
        sku.breadth,
        sku.height,
        oem,
      ],
    );
  }

  async appendInventory(sku: Sku, rowNumber: number) {
    const timestamp = new Date().toISOString();
    await this.sheets.appendRow(
      requiredSpreadsheetId(),
      env.INVENTORY_SHEET_NAME,
      [
        sku.sku,
        sku.itemDescription,
        sku.quantityPerCarton,
        sku.unit,
        0,
        0,
        0,
        `=G${rowNumber}*C${rowNumber}`,
        0,
        `=H${rowNumber}-I${rowNumber}`,
        0,
        "",
        "",
        "",
        "",
        timestamp,
      ],
    );
  }

  async updateSku(rowNumber: number, sku: Sku, oem?: SkuOem) {
    await this.sheets.updateRow(
      requiredSpreadsheetId(),
      env.PACKING_MASTER_SHEET_NAME,
      rowNumber,
      [
        sku.sku,
        sku.itemDescription,
        sku.quantityPerCarton,
        sku.unit,
        sku.weightPerCarton,
        sku.length,
        sku.breadth,
        sku.height,
        oem ?? inferSkuOem(sku.sku),
      ],
    );
  }

  async updateInventoryIdentity(rowNumber: number, sku: Sku) {
    const range = `'${env.INVENTORY_SHEET_NAME.replaceAll("'", "''")}'!B${rowNumber}:D${rowNumber}`;
    await this.sheets.updateRange(requiredSpreadsheetId(), range, [
      [sku.itemDescription, sku.quantityPerCarton, sku.unit],
    ]);
  }

  async archiveSku(
    skuRowNumber: number,
    inventoryRowNumber: number | undefined,
    sku: Sku,
    oem?: SkuOem,
  ) {
    const archivedSku = `DELETED-${sku.sku}`;
    const archivedDescription = `[DELETED] ${sku.itemDescription}`;
    const packingRange = `'${env.PACKING_MASTER_SHEET_NAME.replaceAll("'", "''")}'!A${skuRowNumber}:I${skuRowNumber}`;
    const updates: Array<{ range: string; values: unknown[][] }> = [
      {
        range: packingRange,
        values: [
          [
            archivedSku,
            archivedDescription,
            sku.quantityPerCarton,
            sku.unit,
            sku.weightPerCarton,
            sku.length,
            sku.breadth,
            sku.height,
            oem ?? inferSkuOem(sku.sku),
          ],
        ],
      },
    ];

    if (inventoryRowNumber !== undefined) {
      updates.push({
        range: `'${env.INVENTORY_SHEET_NAME.replaceAll("'", "''")}'!A${inventoryRowNumber}:B${inventoryRowNumber}`,
        values: [[archivedSku, archivedDescription]],
      });
    }

    await this.sheets.batchUpdateRanges(requiredSpreadsheetId(), updates);
  }

  private assertHeaders(
    actual: unknown[],
    expected: readonly string[],
    sheetName: string,
  ) {
    const normalized = actual.map(String);
    if (
      normalized.length !== expected.length ||
      normalized.some((header, index) => header !== expected[index])
    ) {
      throw new AppError(
        409,
        "SHEET_HEADERS_MISMATCH",
        `${sheetName} headers do not match the contract`,
        {
          expected,
          actual: normalized,
        },
      );
    }
  }
}

import {
  SUPPLIER_MASTER_HEADERS,
  supplierSchema,
  type Supplier,
} from "@kv-infra/shared";

import { env } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";
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

export interface SupplierRepository {
  list(): Promise<Supplier[]>;
}

export class GoogleSheetsSupplierRepository implements SupplierRepository {
  constructor(private readonly sheets: GoogleSheetsClient) {}

  async list() {
    const rows = await this.sheets.readRows(
      spreadsheetId(),
      env.SUPPLIER_MASTER_SHEET_NAME,
    );
    assertExactHeaders(
      rows[0] ?? [],
      SUPPLIER_MASTER_HEADERS,
      env.SUPPLIER_MASTER_SHEET_NAME,
    );
    return rows.slice(1).flatMap((row, index) => {
      if (!row[0]) return [];
      const parsed = supplierSchema.safeParse({
        sku: String(row[0]).trim(),
        itemDescription: String(row[1] ?? "").trim(),
        name: String(row[2] ?? "").trim(),
        number: String(row[3] ?? "").trim(),
        priority:
          String(row[4] ?? "").trim() === "" ? Number.NaN : Number(row[4]),
      });
      if (!parsed.success)
        throw new AppError(
          409,
          "INVALID_SHEET_DATA",
          `Supplier Master row ${index + 2} does not match the contract`,
          parsed.error.flatten(),
        );
      return [parsed.data];
    });
  }
}

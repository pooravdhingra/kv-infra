import { SUPPLIER_REQUEST_HEADERS } from "@kv-infra/shared";

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

const text = (value: unknown) => String(value ?? "").trim();
const numeric = (value: unknown, label: string, rowNumber: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0)
    throw new AppError(
      409,
      "INVALID_SUPPLIER_REQUEST_LOG",
      `${label} is invalid on Supplier Requests row ${rowNumber}`,
    );
  return parsed;
};

export type SupplierRequestRecord = {
  rowNumber: number;
  requestId: string;
  orderId: string;
  orderLineId: string;
  sku: string;
  itemDescription: string;
  requiredQuantity: number;
  availableQuantity: number;
  shortfallQuantity: number;
  selectedSupplier: string;
  supplierNumber: string;
  supplierPriority: number;
  lastMessageAt: string | null;
  nextFollowUpAt: string | null;
  status: "SENT" | "SEND FAILED" | "CONFIRMED" | "RECEIVED" | "UNLINKED";
  autoFollowUpEnabled: boolean;
  notes: string;
};

export const supplierRequestValues = (record: SupplierRequestRecord) => [
  record.requestId,
  record.orderId,
  record.orderLineId,
  record.sku,
  record.itemDescription,
  record.requiredQuantity,
  record.availableQuantity,
  record.shortfallQuantity,
  record.selectedSupplier,
  record.supplierNumber,
  record.supplierPriority,
  record.lastMessageAt ?? "",
  record.nextFollowUpAt ?? "",
  record.status,
  record.autoFollowUpEnabled ? "TRUE" : "FALSE",
  record.notes,
];

export interface SupplierRequestRepository {
  snapshot(): Promise<{
    records: SupplierRequestRecord[];
    nextRowNumber: number;
  }>;
  append(record: SupplierRequestRecord): Promise<void>;
  appendMany(records: SupplierRequestRecord[]): Promise<void>;
  update(record: SupplierRequestRecord): Promise<void>;
}

export class GoogleSheetsSupplierRequestRepository implements SupplierRequestRepository {
  constructor(private readonly sheets: GoogleSheetsClient) {}

  async snapshot() {
    const rows = await this.sheets.readRows(
      spreadsheetId(),
      env.SUPPLIER_REQUESTS_SHEET_NAME,
    );
    assertExactHeaders(
      rows[0] ?? [],
      SUPPLIER_REQUEST_HEADERS,
      env.SUPPLIER_REQUESTS_SHEET_NAME,
    );
    const statuses = [
      "SENT",
      "SEND FAILED",
      "CONFIRMED",
      "RECEIVED",
      "UNLINKED",
    ];
    return {
      records: rows.slice(1).flatMap((row, index) => {
        if (!row[0]) return [];
        const rowNumber = index + 2;
        const status = text(row[13]);
        if (!statuses.includes(status))
          throw new AppError(
            409,
            "INVALID_SUPPLIER_REQUEST_LOG",
            `Unknown status ${status} on Supplier Requests row ${rowNumber}`,
          );
        return [
          {
            rowNumber,
            requestId: text(row[0]),
            orderId: text(row[1]),
            orderLineId: text(row[2]),
            sku: text(row[3]).toUpperCase(),
            itemDescription: text(row[4]),
            requiredQuantity: numeric(row[5], "REQUIRED QTY", rowNumber),
            availableQuantity: numeric(row[6], "AVAILABLE QTY", rowNumber),
            shortfallQuantity: numeric(row[7], "SHORTFALL QTY", rowNumber),
            selectedSupplier: text(row[8]),
            supplierNumber: text(row[9]),
            supplierPriority: numeric(row[10], "SUPPLIER PRIORITY", rowNumber),
            lastMessageAt: text(row[11]) || null,
            nextFollowUpAt: text(row[12]) || null,
            status: status as SupplierRequestRecord["status"],
            autoFollowUpEnabled: text(row[14]).toUpperCase() === "TRUE",
            notes: text(row[15]),
          },
        ];
      }),
      nextRowNumber: rows.length + 1,
    };
  }

  async append(record: SupplierRequestRecord) {
    await this.sheets.appendRow(
      spreadsheetId(),
      env.SUPPLIER_REQUESTS_SHEET_NAME,
      supplierRequestValues(record),
    );
  }

  async appendMany(records: SupplierRequestRecord[]) {
    await this.sheets.batchUpdateRanges(
      spreadsheetId(),
      records.map((record) => ({
        range: `'${env.SUPPLIER_REQUESTS_SHEET_NAME.replaceAll("'", "''")}'!A${record.rowNumber}`,
        values: [supplierRequestValues(record)],
      })),
    );
  }

  async update(record: SupplierRequestRecord) {
    await this.sheets.updateRow(
      spreadsheetId(),
      env.SUPPLIER_REQUESTS_SHEET_NAME,
      record.rowNumber,
      supplierRequestValues(record),
    );
  }
}

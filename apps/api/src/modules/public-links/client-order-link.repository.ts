import {
  CLIENT_ORDER_LINK_HEADERS,
  createClientOrderLinkRequestSchema,
} from "@kv-infra/shared";

import { env } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";
import {
  assertExactHeaders,
  type GoogleSheetsClient,
} from "../sheets/google-sheets.client.js";

export type ClientOrderLinkRecord = {
  linkId: string;
  customerName: string;
  createdAt: string;
  orderId: string | null;
  submittedAt: string | null;
  disabledAt: string | null;
  rowNumber: number;
};

export interface ClientOrderLinkRepository {
  list(): Promise<ClientOrderLinkRecord[]>;
  append(record: Omit<ClientOrderLinkRecord, "rowNumber">): Promise<void>;
  markSubmitted(
    rowNumber: number,
    orderId: string,
    submittedAt: string,
  ): Promise<void>;
  disable(rowNumber: number, disabledAt: string): Promise<void>;
}

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

export class GoogleSheetsClientOrderLinkRepository implements ClientOrderLinkRepository {
  private ensuringSheet: Promise<void> | null = null;

  constructor(private readonly sheets: GoogleSheetsClient) {}

  async list() {
    await this.ensureSheet();
    const rows = await this.sheets.readRows(
      spreadsheetId(),
      env.CLIENT_ORDER_LINKS_SHEET_NAME,
    );
    assertExactHeaders(
      rows[0] ?? [],
      CLIENT_ORDER_LINK_HEADERS,
      env.CLIENT_ORDER_LINKS_SHEET_NAME,
    );
    return rows.slice(1).flatMap((row, index) => {
      if (!row[0]) return [];
      const parsedCustomer = createClientOrderLinkRequestSchema.safeParse({
        customerName: row[1],
      });
      const createdAt = text(row[2]);
      if (!parsedCustomer.success || !createdAt) {
        throw new AppError(
          409,
          "INVALID_SHEET_DATA",
          `Client Order Links row ${index + 2} does not match the contract`,
        );
      }
      return [
        {
          linkId: text(row[0]),
          customerName: parsedCustomer.data.customerName,
          createdAt,
          orderId: text(row[3]) || null,
          submittedAt: text(row[4]) || null,
          disabledAt: text(row[5]) || null,
          rowNumber: index + 2,
        },
      ];
    });
  }

  async append(record: Omit<ClientOrderLinkRecord, "rowNumber">) {
    await this.ensureSheet();
    await this.sheets.appendRow(
      spreadsheetId(),
      env.CLIENT_ORDER_LINKS_SHEET_NAME,
      [
        record.linkId,
        record.customerName,
        record.createdAt,
        record.orderId ?? "",
        record.submittedAt ?? "",
        record.disabledAt ?? "",
      ],
      "RAW",
    );
  }

  async markSubmitted(rowNumber: number, orderId: string, submittedAt: string) {
    const escaped = env.CLIENT_ORDER_LINKS_SHEET_NAME.replaceAll("'", "''");
    await this.sheets.updateRange(
      spreadsheetId(),
      `'${escaped}'!D${rowNumber}:E${rowNumber}`,
      [[orderId, submittedAt]],
      "RAW",
    );
  }

  async disable(rowNumber: number, disabledAt: string) {
    const escaped = env.CLIENT_ORDER_LINKS_SHEET_NAME.replaceAll("'", "''");
    await this.sheets.updateRange(
      spreadsheetId(),
      `'${escaped}'!F${rowNumber}`,
      [[disabledAt]],
      "RAW",
    );
  }

  private async ensureSheet() {
    if (this.ensuringSheet) return this.ensuringSheet;
    this.ensuringSheet = this.ensureSheetOnce().finally(() => {
      this.ensuringSheet = null;
    });
    return this.ensuringSheet;
  }

  private async ensureSheetOnce() {
    const id = spreadsheetId();
    const sheets = await this.sheets.listSheets(id);
    if (
      !sheets.some((sheet) => sheet.title === env.CLIENT_ORDER_LINKS_SHEET_NAME)
    ) {
      await this.sheets.createOrderTab(id, env.CLIENT_ORDER_LINKS_SHEET_NAME);
      const escaped = env.CLIENT_ORDER_LINKS_SHEET_NAME.replaceAll("'", "''");
      await this.sheets.updateRange(
        id,
        `'${escaped}'!A1`,
        [[...CLIENT_ORDER_LINK_HEADERS]],
        "RAW",
      );
    }
  }
}

import { WHATSAPP_LOG_HEADERS } from "@kv-infra/shared";

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

export interface WhatsAppLogRepository {
  listIds(): Promise<string[]>;
  followUpCounts(): Promise<Map<string, number>>;
  append(row: unknown[]): Promise<void>;
}

export class GoogleSheetsWhatsAppLogRepository implements WhatsAppLogRepository {
  constructor(private readonly sheets: GoogleSheetsClient) {}

  private async rows() {
    const rows = await this.sheets.readRows(
      spreadsheetId(),
      env.WHATSAPP_LOG_SHEET_NAME,
    );
    assertExactHeaders(
      rows[0] ?? [],
      WHATSAPP_LOG_HEADERS,
      env.WHATSAPP_LOG_SHEET_NAME,
    );
    return rows;
  }

  async listIds() {
    return (await this.rows())
      .slice(1)
      .flatMap((row) => (row[0] ? [String(row[0]).trim()] : []));
  }

  async followUpCounts() {
    const counts = new Map<string, number>();
    (await this.rows()).slice(1).forEach((row) => {
      const requestId = String(row[1] ?? "").trim();
      if (
        requestId &&
        String(row[6] ?? "").trim() === "FOLLOW-UP" &&
        !String(row[9] ?? "").trim()
      )
        counts.set(requestId, (counts.get(requestId) ?? 0) + 1);
    });
    return counts;
  }

  async append(row: unknown[]) {
    await this.sheets.appendRow(
      spreadsheetId(),
      env.WHATSAPP_LOG_SHEET_NAME,
      row,
    );
  }
}

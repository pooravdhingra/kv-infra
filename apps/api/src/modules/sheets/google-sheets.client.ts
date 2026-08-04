import {
  INVENTORY_HEADERS,
  ORDER_ALLOCATION_HEADERS,
  PACKING_MASTER_HEADERS,
  QA_LOG_HEADERS,
  RECEIVING_LOG_HEADERS,
  SUPPLIER_MASTER_HEADERS,
  SUPPLIER_REQUEST_HEADERS,
  WHATSAPP_LOG_HEADERS,
} from "@kv-infra/shared";

import { env } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";
import type { GoogleOAuthService } from "../google/google-oauth.service.js";

type ValueInputOption = "RAW" | "USER_ENTERED";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

const quoteSheet = (name: string) => `'${name.replaceAll("'", "''")}'`;

export const sheetNameFromA1Range = (range: string) => {
  const separator = range.lastIndexOf("!");
  if (separator < 0) return null;
  const sheet = range.slice(0, separator);
  return sheet.startsWith("'") && sheet.endsWith("'")
    ? sheet.slice(1, -1).replaceAll("''", "'")
    : sheet;
};

type DataFilterValueRange = {
  dataFilters?: Array<{ a1Range?: string }>;
  valueRange?: { range?: string; values?: unknown[][] };
};

export const alignValueRangesToSheets = (
  sheetNames: string[],
  valueRanges: DataFilterValueRange[],
) => {
  const rowsBySheet = new Map<string, unknown[][]>();
  valueRanges.forEach((entry) => {
    const ranges = [
      entry.valueRange?.range,
      ...(entry.dataFilters?.map((filter) => filter.a1Range) ?? []),
    ];
    const sheetName = ranges.flatMap((range) =>
      range ? [sheetNameFromA1Range(range)] : [],
    )[0];
    if (sheetName) rowsBySheet.set(sheetName, entry.valueRange?.values ?? []);
  });
  return sheetNames.map((name) => rowsBySheet.get(name) ?? []);
};

export const assertExactHeaders = (
  actual: unknown[],
  expected: readonly string[],
  sheetName: string,
) => {
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
};

export class GoogleSheetsClient {
  constructor(private readonly oauth: GoogleOAuthService) {}

  async readRows(spreadsheetId: string, sheetName: string) {
    const range = `${quoteSheet(sheetName)}!A:ZZ`;
    const result = await this.request<{ values?: unknown[][] }>(
      `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    );
    return result.values ?? [];
  }

  async readMultipleRows(spreadsheetId: string, sheetNames: string[]) {
    if (sheetNames.length === 0) return [];
    const result = await this.request<{
      valueRanges?: Array<{
        dataFilters?: Array<{ a1Range?: string }>;
        valueRange?: { range?: string; values?: unknown[][] };
      }>;
    }>(`${SHEETS_API}/${spreadsheetId}/values:batchGetByDataFilter`, {
      method: "POST",
      body: JSON.stringify({
        majorDimension: "ROWS",
        dataFilters: sheetNames.map((name) => ({
          a1Range: `${quoteSheet(name)}!A:ZZ`,
        })),
      }),
    });
    return alignValueRangesToSheets(sheetNames, result.valueRanges ?? []);
  }

  async appendRow(
    spreadsheetId: string,
    sheetName: string,
    row: unknown[],
    valueInputOption: ValueInputOption = "USER_ENTERED",
  ) {
    const range = `${quoteSheet(sheetName)}!A:ZZ`;
    await this.request(
      `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=${valueInputOption}&insertDataOption=INSERT_ROWS`,
      { method: "POST", body: JSON.stringify({ values: [row] }) },
    );
  }

  async updateRow(
    spreadsheetId: string,
    sheetName: string,
    rowNumber: number,
    row: unknown[],
    valueInputOption: ValueInputOption = "USER_ENTERED",
  ) {
    const range = `${quoteSheet(sheetName)}!A${rowNumber}`;
    await this.request(
      `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=${valueInputOption}`,
      { method: "PUT", body: JSON.stringify({ values: [row] }) },
    );
  }

  async updateRange(
    spreadsheetId: string,
    range: string,
    values: unknown[][],
    valueInputOption: ValueInputOption = "USER_ENTERED",
  ) {
    await this.request(
      `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=${valueInputOption}`,
      { method: "PUT", body: JSON.stringify({ values }) },
    );
  }

  async batchUpdateRanges(
    spreadsheetId: string,
    updates: Array<{ range: string; values: unknown[][] }>,
    valueInputOption: ValueInputOption = "USER_ENTERED",
  ) {
    await this.request(`${SHEETS_API}/${spreadsheetId}/values:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ valueInputOption, data: updates }),
    });
  }

  async createOrderTab(spreadsheetId: string, title: string) {
    const result = await this.request<{
      replies?: Array<{
        addSheet?: { properties?: { sheetId?: number; title?: string } };
      }>;
    }>(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title } } }],
      }),
    });
    const properties = result.replies?.[0]?.addSheet?.properties;
    if (properties?.sheetId === undefined) {
      throw new AppError(
        502,
        "SHEET_CREATE_FAILED",
        "Google did not return the new sheet ID",
      );
    }
    return { sheetId: properties.sheetId, title: properties.title ?? title };
  }

  async listSheets(spreadsheetId: string) {
    const result = await this.request<{
      sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
    }>(
      `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`,
    );
    return (result.sheets ?? []).flatMap((sheet) =>
      sheet.properties?.sheetId !== undefined && sheet.properties.title
        ? [{ sheetId: sheet.properties.sheetId, title: sheet.properties.title }]
        : [],
    );
  }

  async formatOrderTab(
    spreadsheetId: string,
    sheetId: number,
    hiddenColumnStart: number,
    hiddenColumnEnd: number,
  ) {
    await this.request(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            updateSheetProperties: {
              properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
              fields: "gridProperties.frozenRowCount",
            },
          },
          {
            updateDimensionProperties: {
              range: {
                sheetId,
                dimension: "COLUMNS",
                startIndex: hiddenColumnStart,
                endIndex: hiddenColumnEnd,
              },
              properties: { hiddenByUser: true },
              fields: "hiddenByUser",
            },
          },
        ],
      }),
    });
  }

  async spreadsheetMetadata(spreadsheetId: string) {
    return this.request<{
      spreadsheetId: string;
      properties: { title: string };
    }>(`${SHEETS_API}/${spreadsheetId}?fields=spreadsheetId,properties.title`);
  }

  async verifyContractSheet(
    spreadsheetId: string,
    sheetName: string,
    headers: readonly string[],
  ) {
    const rows = await this.readRows(spreadsheetId, sheetName);
    assertExactHeaders(rows[0] ?? [], headers, sheetName);
  }

  async testConnection() {
    if (!env.MASTER_SPREADSHEET_ID || !env.ORDERS_SPREADSHEET_ID) {
      throw new AppError(
        503,
        "GOOGLE_NOT_CONFIGURED",
        "Spreadsheet IDs are not configured",
      );
    }
    const [master, orders] = await Promise.all([
      this.spreadsheetMetadata(env.MASTER_SPREADSHEET_ID),
      this.spreadsheetMetadata(env.ORDERS_SPREADSHEET_ID),
    ]);
    const requiredSheets = [
      [env.PACKING_MASTER_SHEET_NAME, PACKING_MASTER_HEADERS],
      [env.SUPPLIER_MASTER_SHEET_NAME, SUPPLIER_MASTER_HEADERS],
      [env.INVENTORY_SHEET_NAME, INVENTORY_HEADERS],
      [env.RECEIVING_LOG_SHEET_NAME, RECEIVING_LOG_HEADERS],
      [env.QA_LOG_SHEET_NAME, QA_LOG_HEADERS],
      [env.ORDER_ALLOCATIONS_SHEET_NAME, ORDER_ALLOCATION_HEADERS],
      [env.SUPPLIER_REQUESTS_SHEET_NAME, SUPPLIER_REQUEST_HEADERS],
      [env.WHATSAPP_LOG_SHEET_NAME, WHATSAPP_LOG_HEADERS],
    ] as const;
    for (const [sheetName, headers] of requiredSheets)
      await this.verifyContractSheet(
        env.MASTER_SPREADSHEET_ID,
        sheetName,
        headers,
      );
    return {
      masterSpreadsheet: {
        id: master.spreadsheetId,
        title: master.properties.title,
      },
      ordersSpreadsheet: {
        id: orders.spreadsheetId,
        title: orders.properties.title,
      },
      verifiedSheets: requiredSheets.map(([sheetName]) => sheetName),
    };
  }

  private async request<T = unknown>(
    url: string,
    init: RequestInit = {},
  ): Promise<T> {
    const accessToken = await this.oauth.getAccessToken();
    const response = await fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        ...init.headers,
      },
    });
    const body = (await response.json()) as T & {
      error?: { message?: string; status?: string };
    };
    if (!response.ok) {
      throw new AppError(
        response.status === 401 ? 401 : 502,
        "GOOGLE_SHEETS_FAILED",
        body.error?.message ?? "Google Sheets request failed",
        body.error?.status ? { googleStatus: body.error.status } : undefined,
      );
    }
    return body;
  }
}

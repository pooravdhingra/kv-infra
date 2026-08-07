import {
  CLIENT_ORDER_LINK_HEADERS,
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

const sleep = (delayMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, delayMs));

const errorCode = (value: unknown) =>
  typeof value === "object" && value !== null && "code" in value
    ? String(value.code)
    : "";

export const isGoogleSheetsTimeout = (error: unknown) => {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError")
      return true;
    if (/timed?\s*out|timeout/i.test(error.message)) return true;
  }
  const code = errorCode(error);
  const cause =
    typeof error === "object" && error !== null && "cause" in error
      ? error.cause
      : undefined;
  return [code, errorCode(cause)].some((value) =>
    [
      "ETIMEDOUT",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_HEADERS_TIMEOUT",
    ].includes(value),
  );
};

const isRetryableGoogleFailure = (error: unknown) => {
  if (isGoogleSheetsTimeout(error)) return true;
  if (!(error instanceof AppError) || typeof error.details !== "object")
    return false;
  const details = error.details as { googleHttpStatus?: unknown };
  return [408, 429, 500, 502, 503, 504].includes(
    Number(details.googleHttpStatus),
  );
};

export const googleSheetsRetryDelay = (
  error: unknown,
  attempt: number,
  baseDelayMs: number,
  jitterMs = Math.floor(Math.random() * 1_001),
) => {
  const exponentialDelay = baseDelayMs * 2 ** attempt + jitterMs;
  if (!(error instanceof AppError) || typeof error.details !== "object")
    return exponentialDelay;
  const details = error.details as {
    googleHttpStatus?: unknown;
    retryAfterMs?: unknown;
  };
  if (Number(details.googleHttpStatus) !== 429) return exponentialDelay;
  return (
    Math.max(5_000 * 2 ** attempt, Number(details.retryAfterMs) || 0) + jitterMs
  );
};

export const retryWithExponentialBackoff = async <T>(
  operation: () => Promise<T>,
  options: {
    attempts: number;
    baseDelayMs: number;
    shouldRetry: (error: unknown) => boolean;
    delayFor?: (error: unknown, attempt: number) => number;
    wait?: (delayMs: number) => Promise<void>;
  },
) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt + 1 >= options.attempts || !options.shouldRetry(error))
        throw error;
      await (options.wait ?? sleep)(
        options.delayFor?.(error, attempt) ??
          options.baseDelayMs * 2 ** attempt,
      );
    }
  }
};

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

type CachedRows = { expiresAt: number; rows: unknown[][] };
type QueuedRead = {
  promise: Promise<unknown[][]>;
  resolve: (rows: unknown[][]) => void;
  reject: (error: unknown) => void;
  generation: number;
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
  private readonly rowCache = new Map<string, CachedRows>();
  private readonly inFlightRows = new Map<string, Promise<unknown[][]>>();
  private readonly queuedReads = new Map<string, Map<string, QueuedRead>>();
  private readonly generations = new Map<string, number>();
  private readonly sheetListCache = new Map<
    string,
    {
      expiresAt: number;
      value: Array<{ sheetId: number; title: string }>;
      pending?: Promise<Array<{ sheetId: number; title: string }>>;
    }
  >();

  constructor(private readonly oauth: GoogleOAuthService) {}

  async readRows(spreadsheetId: string, sheetName: string) {
    const cacheKey = `${spreadsheetId}\u0000${sheetName}`;
    const cached = this.rowCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.rows;
    const inFlight = this.inFlightRows.get(cacheKey);
    if (inFlight) return inFlight;

    let batch = this.queuedReads.get(spreadsheetId);
    if (!batch) {
      batch = new Map();
      this.queuedReads.set(spreadsheetId, batch);
      queueMicrotask(() => void this.flushQueuedReads(spreadsheetId));
    }
    const existing = batch.get(sheetName);
    if (existing) return existing.promise;

    let resolve!: QueuedRead["resolve"];
    let reject!: QueuedRead["reject"];
    const promise = new Promise<unknown[][]>((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    batch.set(sheetName, {
      promise,
      resolve,
      reject,
      generation: this.generations.get(spreadsheetId) ?? 0,
    });
    this.inFlightRows.set(cacheKey, promise);
    return promise;
  }

  async readMultipleRows(spreadsheetId: string, sheetNames: string[]) {
    return Promise.all(
      sheetNames.map((sheetName) => this.readRows(spreadsheetId, sheetName)),
    );
  }

  private async fetchMultipleRows(spreadsheetId: string, sheetNames: string[]) {
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

  private async flushQueuedReads(spreadsheetId: string) {
    const batch = this.queuedReads.get(spreadsheetId);
    if (!batch) return;
    this.queuedReads.delete(spreadsheetId);
    const sheetNames = [...batch.keys()];
    try {
      const results = await this.fetchMultipleRows(spreadsheetId, sheetNames);
      const currentGeneration = this.generations.get(spreadsheetId) ?? 0;
      sheetNames.forEach((sheetName, index) => {
        const queued = batch.get(sheetName)!;
        const rows = results[index] ?? [];
        if (queued.generation === currentGeneration) {
          this.rowCache.set(`${spreadsheetId}\u0000${sheetName}`, {
            expiresAt: Date.now() + env.GOOGLE_SHEETS_READ_CACHE_MS,
            rows,
          });
        }
        const cacheKey = `${spreadsheetId}\u0000${sheetName}`;
        if (this.inFlightRows.get(cacheKey) === queued.promise)
          this.inFlightRows.delete(cacheKey);
        queued.resolve(rows);
      });
    } catch (error) {
      batch.forEach((queued, sheetName) => {
        const cacheKey = `${spreadsheetId}\u0000${sheetName}`;
        if (this.inFlightRows.get(cacheKey) === queued.promise)
          this.inFlightRows.delete(cacheKey);
        queued.reject(error);
      });
    }
  }

  private invalidateSpreadsheet(
    spreadsheetId: string,
    sheetListChanged = false,
  ) {
    this.generations.set(
      spreadsheetId,
      (this.generations.get(spreadsheetId) ?? 0) + 1,
    );
    for (const key of this.rowCache.keys()) {
      if (key.startsWith(`${spreadsheetId}\u0000`)) this.rowCache.delete(key);
    }
    for (const key of this.inFlightRows.keys()) {
      if (key.startsWith(`${spreadsheetId}\u0000`))
        this.inFlightRows.delete(key);
    }
    if (sheetListChanged) this.sheetListCache.delete(spreadsheetId);
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
    this.invalidateSpreadsheet(spreadsheetId);
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
    this.invalidateSpreadsheet(spreadsheetId);
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
    this.invalidateSpreadsheet(spreadsheetId);
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
    this.invalidateSpreadsheet(spreadsheetId);
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
    this.invalidateSpreadsheet(spreadsheetId, true);
    return { sheetId: properties.sheetId, title: properties.title ?? title };
  }

  async listSheets(spreadsheetId: string) {
    const cached = this.sheetListCache.get(spreadsheetId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (cached?.pending) return cached.pending;
    const pending = this.request<{
      sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
    }>(`${SHEETS_API}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`)
      .then((result) =>
        (result.sheets ?? []).flatMap((sheet) =>
          sheet.properties?.sheetId !== undefined && sheet.properties.title
            ? [
                {
                  sheetId: sheet.properties.sheetId,
                  title: sheet.properties.title,
                },
              ]
            : [],
        ),
      )
      .then((value) => {
        this.sheetListCache.set(spreadsheetId, {
          expiresAt: Date.now() + env.GOOGLE_SHEETS_READ_CACHE_MS,
          value,
        });
        return value;
      })
      .catch((error) => {
        this.sheetListCache.delete(spreadsheetId);
        throw error;
      });
    this.sheetListCache.set(spreadsheetId, {
      expiresAt: 0,
      value: cached?.value ?? [],
      pending,
    });
    return pending;
  }

  async formatOrderTab(
    spreadsheetId: string,
    sheetId: number,
    hiddenColumnStart: number,
    hiddenColumnEnd: number,
  ) {
    await this.formatOrderTabs(spreadsheetId, [
      { sheetId, hiddenColumnStart, hiddenColumnEnd },
    ]);
  }

  async formatOrderTabs(
    spreadsheetId: string,
    tabs: Array<{
      sheetId: number;
      hiddenColumnStart: number;
      hiddenColumnEnd: number;
    }>,
  ) {
    if (tabs.length === 0) return;
    await this.request(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: tabs.flatMap(
          ({ sheetId, hiddenColumnStart, hiddenColumnEnd }) => [
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
        ),
      }),
    });
    this.invalidateSpreadsheet(spreadsheetId);
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
      [env.CLIENT_ORDER_LINKS_SHEET_NAME, CLIENT_ORDER_LINK_HEADERS],
    ] as const;
    const requiredRows = await this.readMultipleRows(
      env.MASTER_SPREADSHEET_ID,
      requiredSheets.map(([sheetName]) => sheetName),
    );
    requiredSheets.forEach(([sheetName, headers], index) =>
      assertExactHeaders(requiredRows[index]?.[0] ?? [], headers, sheetName),
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
    try {
      return await retryWithExponentialBackoff(
        async () => {
          const accessToken = await this.oauth.getAccessToken();
          const response = await fetch(url, {
            ...init,
            signal: AbortSignal.timeout(env.GOOGLE_SHEETS_TIMEOUT_MS),
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
            const retryAfterSeconds = Number(
              response.headers.get("retry-after"),
            );
            throw new AppError(
              response.status === 401 ? 401 : 502,
              "GOOGLE_SHEETS_FAILED",
              body.error?.message ?? "Google Sheets request failed",
              {
                ...(body.error?.status
                  ? { googleStatus: body.error.status }
                  : {}),
                googleHttpStatus: response.status,
                ...(Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
                  ? { retryAfterMs: retryAfterSeconds * 1_000 }
                  : {}),
              },
            );
          }
          return body;
        },
        {
          attempts: env.GOOGLE_SHEETS_RETRY_ATTEMPTS,
          baseDelayMs: env.GOOGLE_SHEETS_RETRY_BASE_DELAY_MS,
          shouldRetry: isRetryableGoogleFailure,
          delayFor: (error, attempt) =>
            googleSheetsRetryDelay(
              error,
              attempt,
              env.GOOGLE_SHEETS_RETRY_BASE_DELAY_MS,
            ),
        },
      );
    } catch (error) {
      if (isGoogleSheetsTimeout(error)) {
        throw new AppError(
          504,
          "GOOGLE_SHEETS_TIMEOUT",
          `Google Sheets did not respond after ${env.GOOGLE_SHEETS_RETRY_ATTEMPTS} attempts`,
        );
      }
      throw error;
    }
  }
}

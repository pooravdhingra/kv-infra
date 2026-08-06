import { INVENTORY_HEADERS } from "@kv-infra/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../lib/app-error.js";
import {
  alignValueRangesToSheets,
  assertExactHeaders,
  GoogleSheetsClient,
  googleSheetsRetryDelay,
  isGoogleSheetsTimeout,
  retryWithExponentialBackoff,
  sheetNameFromA1Range,
} from "./google-sheets.client.js";
import type { GoogleOAuthService } from "../google/google-oauth.service.js";

afterEach(() => vi.unstubAllGlobals());

describe("Sheets contract validation", () => {
  it("accepts the exact header contract", () => {
    expect(() =>
      assertExactHeaders(
        [...INVENTORY_HEADERS],
        INVENTORY_HEADERS,
        "INVENTORY",
      ),
    ).not.toThrow();
  });

  it("rejects reordered or missing headers", () => {
    expect(() =>
      assertExactHeaders(["SKU", "UNIT"], INVENTORY_HEADERS, "INVENTORY"),
    ).toThrowError(AppError);
  });
});

describe("Google Sheets retries", () => {
  it("retries timeouts with exponential backoff", async () => {
    let calls = 0;
    const delays: number[] = [];
    const result = await retryWithExponentialBackoff(
      async () => {
        calls += 1;
        if (calls < 3) {
          const error = new Error("request timed out");
          error.name = "TimeoutError";
          throw error;
        }
        return "ok";
      },
      {
        attempts: 3,
        baseDelayMs: 250,
        shouldRetry: isGoogleSheetsTimeout,
        wait: async (delay) => {
          delays.push(delay);
        },
      },
    );

    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(delays).toEqual([250, 500]);
  });

  it("does not retry unrelated errors", async () => {
    let calls = 0;
    await expect(
      retryWithExponentialBackoff(
        async () => {
          calls += 1;
          throw new Error("invalid sheet headers");
        },
        {
          attempts: 3,
          baseDelayMs: 250,
          shouldRetry: isGoogleSheetsTimeout,
          wait: async () => undefined,
        },
      ),
    ).rejects.toThrow("invalid sheet headers");
    expect(calls).toBe(1);
  });

  it("backs off quota responses more slowly than ordinary timeouts", () => {
    expect(
      googleSheetsRetryDelay(
        new AppError(502, "GOOGLE_SHEETS_FAILED", "Quota exceeded", {
          googleHttpStatus: 429,
        }),
        1,
        500,
        0,
      ),
    ).toBe(10_000);
  });
});

describe("Google Sheets read batching", () => {
  it("combines concurrent same-workbook reads and reuses the short cache", async () => {
    const responseBody = JSON.stringify({
      valueRanges: [
        {
          dataFilters: [{ a1Range: "'INVENTORY'!A:ZZ" }],
          valueRange: {
            range: "'INVENTORY'!A1:A2",
            values: [["SKU"], ["KV-B0001"]],
          },
        },
        {
          dataFilters: [{ a1Range: "'QA LOG'!A:ZZ" }],
          valueRange: {
            range: "'QA LOG'!A1:A1",
            values: [["PACKING ID"]],
          },
        },
      ],
    });
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(responseBody, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const oauth = {
      getAccessToken: async () => "test-token",
    } as unknown as GoogleOAuthService;
    const client = new GoogleSheetsClient(oauth);

    const [inventory, qa] = await Promise.all([
      client.readRows("master", "INVENTORY"),
      client.readRows("master", "QA LOG"),
    ]);
    expect(inventory).toEqual([["SKU"], ["KV-B0001"]]);
    expect(qa).toEqual([["PACKING ID"]]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)),
    ).toMatchObject({
      dataFilters: [
        { a1Range: "'INVENTORY'!A:ZZ" },
        { a1Range: "'QA LOG'!A:ZZ" },
      ],
    });

    await client.readRows("master", "INVENTORY");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await client.updateRange("master", "'INVENTORY'!A2", [["KV-B0002"]]);
    await client.readRows("master", "INVENTORY");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("sheetNameFromA1Range", () => {
  it("extracts quoted and unquoted sheet names from returned ranges", () => {
    expect(sheetNameFromA1Range("'ATIF - 04 Aug 2026'!A1:ZZ2")).toBe(
      "ATIF - 04 Aug 2026",
    );
    expect(sheetNameFromA1Range("TEST!A1:ZZ2")).toBe("TEST");
    expect(sheetNameFromA1Range("'Supplier''s order'!A:ZZ")).toBe(
      "Supplier's order",
    );
  });

  it("keeps an omitted empty tab from shifting later tab values", () => {
    const atifRows = [
      ["SKU", "ITEM DESCRIPTION"],
      ["KV-000001", "FLANGE"],
    ];
    expect(
      alignValueRangesToSheets(
        ["TEST", "ATIF - 04 Aug 2026"],
        [
          {
            dataFilters: [{ a1Range: "'ATIF - 04 Aug 2026'!A:ZZ" }],
            valueRange: {
              range: "'ATIF - 04 Aug 2026'!A1:B2",
              values: atifRows,
            },
          },
        ],
      ),
    ).toEqual([[], atifRows]);
  });
});

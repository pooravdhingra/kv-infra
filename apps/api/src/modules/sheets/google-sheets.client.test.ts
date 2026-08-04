import { INVENTORY_HEADERS } from "@kv-infra/shared";
import { describe, expect, it } from "vitest";

import { AppError } from "../../lib/app-error.js";
import {
  alignValueRangesToSheets,
  assertExactHeaders,
  sheetNameFromA1Range,
} from "./google-sheets.client.js";

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

import { INVENTORY_HEADERS } from "@kv-infra/shared";
import { describe, expect, it } from "vitest";

import { AppError } from "../../lib/app-error.js";
import { assertExactHeaders } from "./google-sheets.client.js";

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

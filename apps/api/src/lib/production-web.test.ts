import { describe, expect, it } from "vitest";

import { shouldServeSpaDocument } from "./production-web.js";

describe("production web routing", () => {
  it("serves the SPA document for browser routes", () => {
    expect(shouldServeSpaDocument("GET", "/orders/ORDER-2026-0001")).toBe(true);
    expect(
      shouldServeSpaDocument("GET", "/order/COL-2026-0001.5b7a76bdeeb2f57d"),
    ).toBe(true);
    expect(shouldServeSpaDocument("GET", "/add-sku/private.token")).toBe(true);
  });

  it("does not turn missing assets or mutations into the SPA document", () => {
    expect(shouldServeSpaDocument("GET", "/assets/missing.js")).toBe(false);
    expect(shouldServeSpaDocument("POST", "/orders/new")).toBe(false);
  });
});

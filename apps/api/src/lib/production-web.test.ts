import { describe, expect, it } from "vitest";

import { shouldServeSpaDocument } from "./production-web.js";

describe("production web routing", () => {
  it("serves the SPA document for browser routes", () => {
    expect(shouldServeSpaDocument("GET", "/orders/ORDER-2026-0001")).toBe(true);
  });

  it("does not turn missing assets or mutations into the SPA document", () => {
    expect(shouldServeSpaDocument("GET", "/assets/missing.js")).toBe(false);
    expect(shouldServeSpaDocument("POST", "/orders/new")).toBe(false);
  });
});

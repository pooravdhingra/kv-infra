import { describe, expect, it } from "vitest";

import { createSkuRequestSchema } from "./sku.js";

describe("createSkuRequestSchema", () => {
  it.each(["pcs", "set", "kit"] as const)(
    "accepts the %s creation unit",
    (unit) => {
      expect(
        createSkuRequestSchema.parse({
          oem: "Bajaj",
          itemDescription: "Test item",
          unit,
        }).unit,
      ).toBe(unit);
    },
  );

  it("rejects legacy units for new SKUs", () => {
    expect(() =>
      createSkuRequestSchema.parse({
        oem: "Bajaj",
        itemDescription: "Test item",
        unit: "kg",
      }),
    ).toThrow();
  });
});

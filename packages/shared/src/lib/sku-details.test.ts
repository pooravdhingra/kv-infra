import { describe, expect, it } from "vitest";

import {
  hasMissingSkuPackingDetails,
  missingSkuPackingFields,
} from "./sku-details.js";

describe("SKU packing details", () => {
  it("treats every zero-valued packing field as missing", () => {
    const details = {
      quantityPerCarton: 100,
      weightPerCarton: 0,
      length: 20,
      breadth: 0,
      height: 10,
    };

    expect(hasMissingSkuPackingDetails(details)).toBe(true);
    expect(missingSkuPackingFields(details)).toEqual([
      "weightPerCarton",
      "breadth",
    ]);
  });
});

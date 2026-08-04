import { describe, expect, it } from "vitest";

import { formatDecimal } from "./format-number";

describe("formatDecimal", () => {
  it("rounds to at most ten decimal places without trailing zeroes", () => {
    expect(formatDecimal(1.23456789126)).toBe("1.2345678913");
    expect(formatDecimal(0.123456789)).toBe("0.123456789");
    expect(formatDecimal(0.9)).toBe("0.9");
  });
});

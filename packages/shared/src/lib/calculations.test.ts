import { describe, expect, it } from "vitest";

import {
  calculateInventoryTotals,
  calculateOrderLineTotals,
  calculateStockCheck,
  finishPackingTransition,
  getSuggestedAction,
  receiveInventoryTransition,
  startPackingTransition,
} from "./calculations.js";

describe("inventory calculations", () => {
  it("excludes unpacked stock and subtracts assigned stock", () => {
    expect(calculateInventoryTotals(100, 8, 125)).toEqual({
      packedTotalQuantity: 800,
      availableQuantity: 675,
    });
  });

  it("rejects over-assignment", () => {
    expect(() => calculateInventoryTotals(10, 2, 21)).toThrow(RangeError);
  });
});

describe("suggested order actions", () => {
  it("prioritizes packed stock, active requests, unpacked stock, then supplier", () => {
    const base = { requiredQuantity: 100, reservedQuantity: 0 };
    expect(
      getSuggestedAction({
        ...base,
        availableQuantity: 100,
        unpackedQuantity: 0,
        supplierRequestStatus: "SENT",
      }).suggestedAction,
    ).toBe("RESERVE_STOCK");
    expect(
      getSuggestedAction({
        ...base,
        availableQuantity: 0,
        unpackedQuantity: 0,
        supplierRequestStatus: "CONFIRMED",
      }).suggestedAction,
    ).toBe("MARK_RECEIVED");
    expect(
      getSuggestedAction({
        ...base,
        availableQuantity: 0,
        unpackedQuantity: 100,
        supplierRequestStatus: null,
      }).suggestedAction,
    ).toBe("START_PACKING");
    expect(
      getSuggestedAction({
        ...base,
        availableQuantity: 0,
        unpackedQuantity: 20,
        supplierRequestStatus: null,
      }).suggestedAction,
    ).toBe("REQUEST_SUPPLIER");
    expect(
      getSuggestedAction({
        ...base,
        availableQuantity: 0,
        unpackedQuantity: 0,
        supplierRequestStatus: null,
      }).suggestedAction,
    ).toBe("REQUEST_SUPPLIER");
  });
});

describe("inventory movements", () => {
  it("receives and starts packing without creating available stock", () => {
    expect(receiveInventoryTransition(10, 40)).toBe(50);
    expect(
      startPackingTransition({
        unpackedQuantity: 50,
        inPackingQuantity: 5,
        quantityTaken: 30,
      }),
    ).toEqual({ unpackedQuantity: 20, inPackingQuantity: 35 });
  });

  it("finishes only reconciled complete cartons", () => {
    expect(
      finishPackingTransition({
        quantityPerCarton: 10,
        inPackingQuantity: 100,
        packedCartons: 2,
        defectiveShortQuantity: 1,
        quantityTaken: 50,
        goodQuantity: 40,
        finishedCartons: 4,
        defectiveQuantity: 6,
        shortQuantity: 4,
      }),
    ).toEqual({
      inPackingQuantity: 50,
      packedCartons: 6,
      defectiveShortQuantity: 11,
    });
  });

  it("rejects overdraw and unreconciled packing", () => {
    expect(() =>
      startPackingTransition({
        unpackedQuantity: 10,
        inPackingQuantity: 0,
        quantityTaken: 11,
      }),
    ).toThrow(RangeError);
    expect(() =>
      finishPackingTransition({
        quantityPerCarton: 10,
        inPackingQuantity: 50,
        packedCartons: 0,
        defectiveShortQuantity: 0,
        quantityTaken: 50,
        goodQuantity: 40,
        finishedCartons: 4,
        defectiveQuantity: 1,
        shortQuantity: 1,
      }),
    ).toThrow(RangeError);
  });
});

describe("order calculations", () => {
  it("calculates quantity, kilograms, and cubic metres", () => {
    expect(
      calculateOrderLineTotals({
        cartons: 10,
        quantityPerCarton: 100,
        weightPerCarton: 12.5,
        length: 50,
        breadth: 40,
        height: 30,
      }),
    ).toEqual({ totalQuantity: 1000, grossWeight: 125, volume: 0.6 });
  });

  it("classifies packed, unpacked, and supplier outcomes", () => {
    expect(
      calculateStockCheck({
        requiredQuantity: 100,
        availableQuantity: 100,
        unpackedQuantity: 0,
      }).stockStatus,
    ).toBe("READY_TO_RESERVE");
    expect(
      calculateStockCheck({
        requiredQuantity: 100,
        availableQuantity: 60,
        unpackedQuantity: 40,
      }).stockStatus,
    ).toBe("NEEDS_PACKING");
    expect(
      calculateStockCheck({
        requiredQuantity: 100,
        availableQuantity: 60,
        unpackedQuantity: 20,
      }).stockStatus,
    ).toBe("NEEDS_SUPPLIER");
  });
});

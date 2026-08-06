import { describe, expect, it } from "vitest";

import {
  calculateCartonsFromTotalQuantity,
  assignInventoryTransition,
  cancelInventoryAssignmentTransition,
  calculateInventoryTotals,
  calculateOrderLineTotals,
  calculateStockCheck,
  finishPackingTransition,
  getSuggestedAction,
  receiveInventoryTransition,
  shipInventoryTransition,
  startPackingTransition,
} from "./calculations.js";

describe("assignment calculations", () => {
  it("assigns available packed stock and reverses it safely", () => {
    expect(
      assignInventoryTransition({
        quantityPerCarton: 100,
        packedCartons: 6,
        totalAssigned: 100,
        quantityAssigned: 200,
      }),
    ).toBe(300);
    expect(
      cancelInventoryAssignmentTransition({
        totalAssigned: 300,
        quantityCancelled: 200,
      }),
    ).toBe(100);
    expect(() =>
      cancelInventoryAssignmentTransition({
        totalAssigned: 100,
        quantityCancelled: 200,
      }),
    ).toThrow("exceeds total assigned stock");
  });
});

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

describe("shipping calculations", () => {
  it("consumes packed cartons and their assignment without changing availability", () => {
    const shipped = shipInventoryTransition({
      quantityPerCarton: 75,
      packedCartons: 120,
      totalAssigned: 8000,
      shippedQuantity: 7500,
    });
    expect(shipped).toEqual({ packedCartons: 20, totalAssigned: 500 });
    expect(calculateInventoryTotals(75, 20, 500).availableQuantity).toBe(1000);
  });

  it("rejects incomplete cartons or stock not assigned to the order", () => {
    expect(() =>
      shipInventoryTransition({
        quantityPerCarton: 75,
        packedCartons: 100,
        totalAssigned: 7500,
        shippedQuantity: 7400,
      }),
    ).toThrow("complete cartons");
    expect(() =>
      shipInventoryTransition({
        quantityPerCarton: 75,
        packedCartons: 100,
        totalAssigned: 7000,
        shippedQuantity: 7500,
      }),
    ).toThrow("assigned stock");
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
        unpackedQuantity: 20,
        inPackingQuantity: 100,
        packedCartons: 2,
        defectiveShortQuantity: 1,
        quantityTaken: 50,
        goodQuantity: 40,
        finishedCartons: 4,
        defectiveQuantity: 6,
        shortQuantity: 4,
        leftUnpackedQuantity: 0,
      }),
    ).toEqual({
      unpackedQuantity: 20,
      inPackingQuantity: 50,
      packedCartons: 6,
      defectiveShortQuantity: 11,
    });
  });

  it("returns unfinished pieces to unpacked stock", () => {
    expect(
      finishPackingTransition({
        quantityPerCarton: 10,
        unpackedQuantity: 20,
        inPackingQuantity: 50,
        packedCartons: 0,
        defectiveShortQuantity: 0,
        quantityTaken: 50,
        goodQuantity: 30,
        finishedCartons: 3,
        defectiveQuantity: 2,
        shortQuantity: 3,
        leftUnpackedQuantity: 15,
      }),
    ).toEqual({
      unpackedQuantity: 35,
      inPackingQuantity: 0,
      packedCartons: 3,
      defectiveShortQuantity: 5,
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
        unpackedQuantity: 0,
        inPackingQuantity: 50,
        packedCartons: 0,
        defectiveShortQuantity: 0,
        quantityTaken: 50,
        goodQuantity: 40,
        finishedCartons: 4,
        defectiveQuantity: 1,
        shortQuantity: 1,
        leftUnpackedQuantity: 0,
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
        length: 10,
        breadth: 10,
        height: 10,
      }),
    ).toEqual({ totalQuantity: 1000, grossWeight: 125, volume: 0.163871 });
  });

  it("derives cartons from an operator-entered total", () => {
    expect(calculateCartonsFromTotalQuantity(1250, 250)).toBe(5);
    expect(calculateCartonsFromTotalQuantity(1000, 3)).toBe(333.333333333333);
    expect(() => calculateCartonsFromTotalQuantity(1000, 0)).toThrow(
      RangeError,
    );
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

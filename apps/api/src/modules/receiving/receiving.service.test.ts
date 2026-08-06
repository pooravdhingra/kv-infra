import type { InventorySourceRecord } from "../inventory/inventory.repository.js";
import { describe, expect, it } from "vitest";

import type { ReceivingRepository } from "./receiving.repository.js";
import {
  generateNextReceiptId,
  ReceivingService,
} from "./receiving.service.js";

const inventory: InventorySourceRecord = {
  rowNumber: 2,
  sku: "KV-000001",
  itemDescription: "Cork sheet",
  quantityPerCarton: 10,
  unit: "pcs",
  unpackedQuantity: 20,
  inPackingQuantity: 0,
  packedCartons: 0,
  totalAssigned: 0,
  defectiveShortQuantity: 0,
  lastReceivedDate: null,
  lastPackedDate: null,
  warehouseLocation: "",
  notes: "",
  lastUpdated: null,
};

class FakeReceivingRepository implements ReceivingRepository {
  savedInventory: InventorySourceRecord | null = null;
  savedRow: unknown[] = [];
  async snapshot() {
    return {
      ids: ["REC-2026-0004"],
      receipts: [],
      nextRowNumber: 2,
    };
  }
  async commit(
    row: unknown[],
    _rowNumber: number,
    next: InventorySourceRecord,
  ) {
    this.savedRow = row;
    this.savedInventory = next;
  }
}

describe("ReceivingService", () => {
  it("appends an unchecked receipt and increases only unpacked stock", async () => {
    const repository = new FakeReceivingRepository();
    const service = new ReceivingService(
      repository,
      { list: async () => [inventory], update: async () => undefined },
      { list: async () => [], markLineReceived: async () => undefined },
    );
    const result = await service.create({
      date: "2026-08-04",
      sku: "KV-000001",
      quantityReceived: 30,
      supplier: "Supplier A",
      receivedBy: "Operator",
    });

    expect(result.receiptId).toBe("REC-2026-0005");
    expect(result.itemCheckStatus).toBe("UNCHECKED");
    expect(result.receivedBy).toBe("OPERATOR");
    expect(repository.savedRow[8]).toBe("OPERATOR");
    expect(repository.savedInventory).toMatchObject({
      unpackedQuantity: 50,
      inPackingQuantity: 0,
      packedCartons: 0,
      totalAssigned: 0,
    });
  });

  it("increments receipt IDs within a year", () => {
    expect(
      generateNextReceiptId(2026, ["REC-2025-0099", "REC-2026-0010"]),
    ).toBe("REC-2026-0011");
  });
});

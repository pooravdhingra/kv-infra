import type {
  InventorySourceRecord,
  InventoryRepository,
} from "./inventory.repository.js";
import { InventoryService } from "./inventory.service.js";
import { describe, expect, it } from "vitest";

const inventory: InventorySourceRecord = {
  rowNumber: 2,
  sku: "KV-000001",
  itemDescription: "Cork sheet",
  quantityPerCarton: 100,
  unit: "pcs",
  unpackedQuantity: 50,
  inPackingQuantity: 20,
  packedCartons: 8,
  totalAssigned: 125,
  defectiveShortQuantity: 2,
  lastReceivedDate: null,
  lastPackedDate: null,
  warehouseLocation: "A-01",
  notes: "",
  lastUpdated: null,
};

class FakeInventoryRepository implements InventoryRepository {
  records = [{ ...inventory }];
  async list() {
    return this.records;
  }
  async update(record: InventorySourceRecord) {
    this.records = [record];
  }
}

describe("InventoryService", () => {
  it("calculates packed and available quantities from source fields", async () => {
    const result = await new InventoryService(
      new FakeInventoryRepository(),
    ).get("KV-000001");
    expect(result.packedTotalQuantity).toBe(800);
    expect(result.availableQuantity).toBe(675);
    expect(result.unpackedQuantity).toBe(50);
  });

  it("applies audited deltas and recalculates availability", async () => {
    const repository = new FakeInventoryRepository();
    const result = await new InventoryService(repository).adjust({
      sku: "KV-000001",
      unpackedDelta: 25,
      packedCartonsDelta: 2,
      reason: "Physical count correction",
    });
    expect(result.unpackedQuantity).toBe(75);
    expect(result.packedCartons).toBe(10);
    expect(result.availableQuantity).toBe(875);
    expect(repository.records[0]?.notes).toContain("Physical count correction");
  });

  it("rejects adjustments that make a quantity negative", async () => {
    await expect(
      new InventoryService(new FakeInventoryRepository()).adjust({
        sku: "KV-000001",
        unpackedDelta: -51,
        reason: "Invalid correction",
      }),
    ).rejects.toMatchObject({ code: "NEGATIVE_INVENTORY", status: 409 });
  });
});

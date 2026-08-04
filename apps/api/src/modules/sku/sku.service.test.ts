import type { Sku } from "@kv-infra/shared";
import { describe, expect, it } from "vitest";

import type {
  InventoryRecord,
  SkuRecord,
  SkuRepository,
} from "./sku.repository.js";
import { generateNextSkuCode, SkuService } from "./sku.service.js";

const sampleSku: Sku = {
  sku: "KV-000001",
  itemDescription: "Cork Sheet 50mm",
  quantityPerCarton: 100,
  unit: "pcs",
  weightPerCarton: 12.5,
  length: 50,
  breadth: 40,
  height: 30,
};

const { sku: _sampleSkuCode, ...sampleDetails } = sampleSku;

class FakeSkuRepository implements SkuRepository {
  skus: SkuRecord[] = [];
  inventory: InventoryRecord[] = [];

  async listSkus() {
    return this.skus;
  }
  async listInventory() {
    return this.inventory;
  }
  async appendSku(sku: Sku) {
    this.skus.push({ ...sku, rowNumber: this.skus.length + 2 });
  }
  async appendInventory(sku: Sku, rowNumber: number) {
    this.inventory.push({ sku: sku.sku, rowNumber });
  }
  async updateSku(rowNumber: number, sku: Sku) {
    const index = this.skus.findIndex((item) => item.rowNumber === rowNumber);
    this.skus[index] = { ...sku, rowNumber };
  }
  async updateInventoryIdentity() {}
  async archiveSku(
    skuRowNumber: number,
    inventoryRowNumber: number | undefined,
    sku: Sku,
  ) {
    const archivedSku = `DELETED-${sku.sku}`;
    const skuIndex = this.skus.findIndex(
      (item) => item.rowNumber === skuRowNumber,
    );
    this.skus[skuIndex] = {
      ...sku,
      sku: archivedSku,
      itemDescription: `[DELETED] ${sku.itemDescription}`,
      rowNumber: skuRowNumber,
    };
    if (inventoryRowNumber !== undefined) {
      const inventoryIndex = this.inventory.findIndex(
        (item) => item.rowNumber === inventoryRowNumber,
      );
      this.inventory[inventoryIndex] = {
        sku: archivedSku,
        rowNumber: inventoryRowNumber,
      };
    }
  }
}

describe("SkuService", () => {
  it("creates the packing and inventory records", async () => {
    const repository = new FakeSkuRepository();
    const result = await new SkuService(repository).create(sampleDetails);

    expect(result.sku).toBe("KV-000001");
    expect(repository.skus).toHaveLength(1);
    expect(repository.inventory).toEqual([{ sku: "KV-000001", rowNumber: 2 }]);
  });

  it("increments generated IDs while ignoring legacy SKU names", async () => {
    const repository = new FakeSkuRepository();
    repository.skus.push(
      { ...sampleSku, sku: "FLNG001", rowNumber: 2 },
      { ...sampleSku, sku: "KV-009999", rowNumber: 3 },
    );

    const result = await new SkuService(repository).create(sampleDetails);

    expect(result.sku).toBe("KV-010000");
    expect(repository.skus).toHaveLength(3);
    expect(repository.inventory).toHaveLength(1);
  });

  it("continues beyond six digits without wrapping", () => {
    expect(generateNextSkuCode([{ sku: "KV-999999" }])).toBe("KV-1000000");
  });

  it("archives a deleted SKU and excludes it from active results", async () => {
    const repository = new FakeSkuRepository();
    repository.skus.push({ ...sampleSku, rowNumber: 2 });
    repository.inventory.push({ sku: sampleSku.sku, rowNumber: 2 });
    const service = new SkuService(repository);

    await expect(service.delete(sampleSku.sku)).resolves.toEqual({
      sku: sampleSku.sku,
    });
    await expect(service.list()).resolves.toEqual([]);
    expect(repository.skus[0]?.sku).toBe("DELETED-KV-000001");
    expect(generateNextSkuCode(repository.skus)).toBe("KV-000002");
  });
});

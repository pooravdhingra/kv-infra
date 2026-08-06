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
    const result = await new SkuService(repository).create({
      ...sampleDetails,
      oem: "Bajaj",
    });

    expect(result.sku).toBe("KV-B0001");
    expect(result.itemDescription).toBe("CORK SHEET 50MM");
    expect(repository.skus).toHaveLength(1);
    expect(repository.inventory).toEqual([{ sku: "KV-B0001", rowNumber: 2 }]);
  });

  it("creates a provisional SKU with zero packing details", async () => {
    const repository = new FakeSkuRepository();
    const result = await new SkuService(repository).create({
      oem: "TVS",
      itemDescription: "New sample item",
    });

    expect(result).toEqual({
      sku: "KV-T0001",
      itemDescription: "NEW SAMPLE ITEM",
      quantityPerCarton: 0,
      unit: "pcs",
      weightPerCarton: 0,
      length: 0,
      breadth: 0,
      height: 0,
    });
  });

  it("increments within an OEM while ignoring legacy and other OEM IDs", async () => {
    const repository = new FakeSkuRepository();
    repository.skus.push(
      { ...sampleSku, sku: "FLNG001", rowNumber: 2 },
      { ...sampleSku, sku: "KV-009999", rowNumber: 3 },
      { ...sampleSku, sku: "KV-T0020", rowNumber: 4 },
      { ...sampleSku, sku: "KV-B9999", rowNumber: 5 },
    );

    const result = await new SkuService(repository).create({
      ...sampleDetails,
      oem: "Bajaj",
    });

    expect(result.sku).toBe("KV-B10000");
    expect(repository.skus).toHaveLength(5);
    expect(repository.inventory).toHaveLength(1);
  });

  it("continues beyond six digits without wrapping", () => {
    expect(generateNextSkuCode([{ sku: "KV-P999999" }], "Piaggio")).toBe(
      "KV-P1000000",
    );
  });

  it("uses the required prefix for every OEM", () => {
    expect(generateNextSkuCode([], "Bajaj")).toBe("KV-B0001");
    expect(generateNextSkuCode([], "TVS")).toBe("KV-T0001");
    expect(generateNextSkuCode([], "Piaggio")).toBe("KV-P0001");
    expect(generateNextSkuCode([], "Other")).toBe("KV-X0001");
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
    expect(
      generateNextSkuCode(
        [...repository.skus, { ...sampleSku, sku: "DELETED-KV-B0001" }],
        "Bajaj",
      ),
    ).toBe("KV-B0002");
  });
});

import { describe, expect, it } from "vitest";

import { SupplierService } from "./supplier.service.js";

describe("SupplierService", () => {
  it("caches the master read and sorts matching suppliers by priority", async () => {
    let reads = 0;
    const service = new SupplierService({
      list: async () => {
        reads += 1;
        return [
          {
            sku: "KV-000001",
            itemDescription: "Item",
            name: "Backup",
            number: "2",
            priority: 2,
          },
          {
            sku: "KV-000001",
            itemDescription: "Item",
            name: "Primary",
            number: "1",
            priority: 1,
          },
          {
            sku: "KV-000002",
            itemDescription: "Other",
            name: "Other",
            number: "3",
            priority: 1,
          },
        ];
      },
    });

    expect(
      (await service.forSku("KV-000001")).map((item) => item.name),
    ).toEqual(["Primary", "Backup"]);
    await service.forSku("KV-000002");
    expect(reads).toBe(1);
  });
});

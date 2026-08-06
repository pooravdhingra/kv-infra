import {
  ORDER_HEADERS,
  calculateCartonsFromTotalQuantity,
  type InventoryItem,
  type OrderLine,
  type Sku,
} from "@kv-infra/shared";
import { describe, expect, it } from "vitest";

import type { SkuRepository } from "../sku/sku.repository.js";
import type { AllocationRepository } from "../allocations/allocation.repository.js";
import type {
  OrderRepository,
  OrderSheetSnapshot,
  OrderSkuPackingUpdate,
} from "./order.repository.js";
import { generateNextOrderId, OrderService } from "./order.service.js";

const sku: Sku = {
  sku: "KV-000001",
  itemDescription: "Cork sheet",
  quantityPerCarton: 100,
  unit: "pcs",
  weightPerCarton: 12.5,
  length: 50,
  breadth: 40,
  height: 30,
};

const inventory: InventoryItem = {
  sku: sku.sku,
  itemDescription: sku.itemDescription,
  quantityPerCarton: sku.quantityPerCarton,
  unit: sku.unit,
  unpackedQuantity: 400,
  inPackingQuantity: 0,
  packedCartons: 6,
  packedTotalQuantity: 600,
  totalAssigned: 0,
  availableQuantity: 600,
  defectiveShortQuantity: 0,
  lastReceivedDate: null,
  lastPackedDate: null,
  warehouseLocation: "A-01",
  notes: "",
  lastUpdated: null,
};

class FakeOrderRepository implements OrderRepository {
  sheets: OrderSheetSnapshot[] = [];
  written: unknown[][] = [];
  stockCheckWrites: OrderLine[] = [];
  skuPackingUpdates: OrderSkuPackingUpdate[] = [];
  completionWrites: Array<{
    title: string;
    lineCount: number;
    completedAt: string;
  }> = [];
  lineStateWrites: Array<{
    title: string;
    rowNumber: number;
    input: {
      status: string;
      reservedQuantity?: number;
      supplierRequestStatus?: string;
    };
  }> = [];
  async snapshot() {
    return this.sheets;
  }
  async create(title: string, values: unknown[][]) {
    this.written = values;
    return { sheetId: 99, title };
  }
  async updateStockCheck(_title: string, items: OrderLine[]) {
    this.stockCheckWrites = items;
  }
  async updateSkuPackingDetails(updates: OrderSkuPackingUpdate[]) {
    this.skuPackingUpdates = updates;
    updates.forEach((update) => {
      const row = this.sheets
        .find((sheet) => sheet.title === update.title)
        ?.rows.at(update.rowNumber - 1);
      if (!row) return;
      row[2] = update.sku.quantityPerCarton;
      row[4] = calculateCartonsFromTotalQuantity(
        update.totalQuantity,
        update.sku.quantityPerCarton,
      );
      row[6] = update.sku.weightPerCarton;
      row[10] = update.sku.length;
      row[11] = update.sku.breadth;
      row[12] = update.sku.height;
    });
  }
  async completeOrder(title: string, lineCount: number, completedAt: string) {
    this.completionWrites.push({ title, lineCount, completedAt });
    this.sheets.forEach((sheet) => {
      if (sheet.title !== title) return;
      sheet.rows.slice(1, lineCount + 1).forEach((row) => {
        row[9] = "SHIPPED";
        row[20] = completedAt;
      });
    });
  }
  async updateLineState(
    title: string,
    rowNumber: number,
    input: {
      status: string;
      reservedQuantity?: number;
      supplierRequestStatus?: string;
    },
  ) {
    this.lineStateWrites.push({ title, rowNumber, input });
  }
}

const skuRepository: SkuRepository = {
  listSkus: async () => [{ ...sku, rowNumber: 2 }],
  listInventory: async () => [],
  appendSku: async () => undefined,
  appendInventory: async () => undefined,
  updateSku: async () => undefined,
  updateInventoryIdentity: async () => undefined,
  archiveSku: async () => undefined,
};

const inventoryService = { list: async () => [inventory] };

describe("OrderService", () => {
  it("creates calculated rows and runs a stock check", async () => {
    const repository = new FakeOrderRepository();
    const result = await new OrderService(
      repository,
      skuRepository,
      inventoryService,
    ).create({
      customerName: "Abc Traders",
      dateReceived: "2026-08-04",
      orderNotes: "Handle carefully",
      items: [{ sku: "KV-000001", cartons: 10 }],
    });

    expect(result.orderId).toBe("ORD-2026-0001");
    expect(result.customerName).toBe("ABC TRADERS");
    expect(repository.written[1]?.[22]).toBe("ABC TRADERS");
    expect(result.items[0]).toMatchObject({
      totalQuantity: 1000,
      grossWeight: 125,
      volume: 9.832238,
      shortfallQuantity: 400,
      stockStatus: "NEEDS_PACKING",
      suggestedAction: "START_PACKING",
    });
    expect(repository.written[0]).toEqual([...ORDER_HEADERS]);
    expect(repository.written[1]?.[5]).toBe("=E2*C2");
    expect(repository.written[1]?.[8]).toBe("=K2*L2*M2*E2*0.000016387064");
  });

  it("rejects an inactive or unknown SKU", async () => {
    await expect(
      new OrderService(
        new FakeOrderRepository(),
        skuRepository,
        inventoryService,
      ).create({
        customerName: "ABC Traders",
        dateReceived: "2026-08-04",
        items: [{ sku: "KV-999999", cartons: 1 }],
      }),
    ).rejects.toMatchObject({ code: "UNKNOWN_SKU", status: 400 });
  });

  it("creates a direct-quantity order and later backfills carton details", async () => {
    const repository = new FakeOrderRepository();
    let currentSku = {
      ...sku,
      quantityPerCarton: 0,
      weightPerCarton: 0,
      length: 0,
      breadth: 0,
      height: 0,
    };
    const service = new OrderService(
      repository,
      {
        ...skuRepository,
        listSkus: async () => [{ ...currentSku, rowNumber: 2 }],
      },
      { list: async () => [{ ...inventory, quantityPerCarton: 0 }] },
    );
    const created = await service.create({
      customerName: "ABC Traders",
      dateReceived: "2026-08-04",
      items: [{ sku: currentSku.sku, totalQuantity: 7500 }],
    });

    expect(created.items[0]).toMatchObject({
      quantityPerCarton: 0,
      cartons: 0,
      totalQuantity: 7500,
    });
    expect(repository.written[1]?.[4]).toBe("");
    expect(repository.written[1]?.[5]).toBe(7500);

    repository.sheets = [
      { sheetId: 99, title: created.sheetTitle, rows: repository.written },
    ];
    await expect(service.get(created.orderId)).resolves.toMatchObject({
      items: [
        {
          quantityPerCarton: 0,
          cartons: 0,
          totalQuantity: 7500,
        },
      ],
    });
    currentSku = {
      ...currentSku,
      quantityPerCarton: 100,
      weightPerCarton: 12,
      length: 20,
      breadth: 16,
      height: 12,
    };
    await expect(service.syncSkuPackingDetails(currentSku.sku)).resolves.toBe(
      1,
    );
    expect(repository.skuPackingUpdates[0]).toMatchObject({
      title: created.sheetTitle,
      rowNumber: 2,
      totalQuantity: 7500,
      sku: currentSku,
    });
    await expect(service.get(created.orderId)).resolves.toMatchObject({
      items: [
        {
          quantityPerCarton: 100,
          cartons: 75,
          totalQuantity: 7500,
        },
      ],
    });
  });

  it("persists a refreshed stock check to its order tab", async () => {
    const repository = new FakeOrderRepository();
    const service = new OrderService(
      repository,
      skuRepository,
      inventoryService,
    );
    const created = await service.create({
      customerName: "ABC Traders",
      dateReceived: "2026-08-04",
      items: [{ sku: "KV-000001", cartons: 10 }],
    });
    repository.sheets = [
      { sheetId: 99, title: created.sheetTitle, rows: repository.written },
    ];

    await service.stockCheck(created.orderId);

    expect(repository.stockCheckWrites[0]).toMatchObject({
      stockStatus: "NEEDS_PACKING",
      shortfallQuantity: 400,
    });
  });

  it("reports no shortfall or supplier action after the line is fully reserved", async () => {
    const repository = new FakeOrderRepository();
    const service = new OrderService(
      repository,
      skuRepository,
      inventoryService,
    );
    const created = await service.create({
      customerName: "ABC Traders",
      dateReceived: "2026-08-04",
      items: [{ sku: "KV-000001", cartons: 10 }],
    });

    repository.written[1]![16] = 1000;
    repository.sheets = [
      { sheetId: 99, title: created.sheetTitle, rows: repository.written },
    ];

    const fullyAssignedInventory = {
      ...inventory,
      packedCartons: 10,
      packedTotalQuantity: 1000,
      totalAssigned: 1000,
      availableQuantity: 0,
    };
    const allocationRepository: Pick<AllocationRepository, "snapshot"> = {
      snapshot: async () => ({
        events: [
          {
            allocationId: "ALLOC-2026-0001",
            orderId: created.orderId,
            orderLineId: created.items[0]!.orderLineId,
            sku: sku.sku,
            itemDescription: sku.itemDescription,
            quantity: 1000,
            notes: "Packed and assigned",
          },
        ],
        nextRowNumber: 3,
      }),
    };
    const {
      packedTotalQuantity: _packedTotalQuantity,
      availableQuantity: _availableQuantity,
      ...fullyAssignedSource
    } = fullyAssignedInventory;
    let shipmentInventory = [{ ...fullyAssignedSource, rowNumber: 2 }];
    const reconciledService = new OrderService(
      repository,
      skuRepository,
      { list: async () => [fullyAssignedInventory] },
      allocationRepository,
      {
        list: async () => shipmentInventory,
        updateMany: async (records) => {
          shipmentInventory = records;
        },
      },
    );
    const result = await reconciledService.get(created.orderId);

    expect(result.items[0]).toMatchObject({
      reservedQuantity: 1000,
      remainingQuantity: 0,
      shortfallQuantity: 0,
      stockStatus: "FULLY_RESERVED",
      suggestedAction: "NO_ACTION",
    });

    await reconciledService.adjustAllocation(
      created.orderId,
      created.items[0]!.orderLineId,
      -1000,
    );
    expect(repository.lineStateWrites.at(-1)?.input).toMatchObject({
      status: "PARTIALLY RESERVED",
      reservedQuantity: 0,
    });

    const shipped = await reconciledService.ship(created.orderId);
    expect(shipped).toMatchObject({
      status: "COMPLETED",
      completedAt: expect.any(String),
    });
    expect(repository.completionWrites[0]).toMatchObject({
      title: created.sheetTitle,
      lineCount: 1,
    });
    expect(shipmentInventory[0]).toMatchObject({
      packedCartons: 0,
      totalAssigned: 0,
    });
    await expect(
      reconciledService.stockCheck(created.orderId),
    ).rejects.toMatchObject({ code: "ORDER_COMPLETED", status: 409 });
  });

  it("rejects shipping while any order line remains unreserved", async () => {
    const repository = new FakeOrderRepository();
    const service = new OrderService(
      repository,
      skuRepository,
      inventoryService,
    );
    const created = await service.create({
      customerName: "ABC Traders",
      dateReceived: "2026-08-04",
      items: [{ sku: "KV-000001", cartons: 10 }],
    });
    repository.written[1]![16] = 1000;
    repository.sheets = [
      { sheetId: 99, title: created.sheetTitle, rows: repository.written },
    ];

    await expect(service.ship(created.orderId)).rejects.toMatchObject({
      code: "ORDER_NOT_READY_TO_SHIP",
      status: 409,
    });
    expect(repository.completionWrites).toHaveLength(0);
  });

  it("increments yearly order IDs", () => {
    expect(generateNextOrderId(2026, ["ORD-2025-0100", "ORD-2026-0009"])).toBe(
      "ORD-2026-0010",
    );
  });
});

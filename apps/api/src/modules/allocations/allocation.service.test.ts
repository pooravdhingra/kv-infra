import type { InventorySourceRecord } from "../inventory/inventory.repository.js";
import { describe, expect, it } from "vitest";

import type {
  AllocationEvent,
  AllocationRepository,
} from "./allocation.repository.js";
import { AllocationService } from "./allocation.service.js";

const inventory: InventorySourceRecord = {
  rowNumber: 2,
  sku: "KV-000001",
  itemDescription: "Flange big compact",
  quantityPerCarton: 100,
  unit: "pcs",
  unpackedQuantity: 0,
  inPackingQuantity: 0,
  packedCartons: 10,
  totalAssigned: 0,
  defectiveShortQuantity: 0,
  lastReceivedDate: null,
  lastPackedDate: null,
  warehouseLocation: "A1",
  notes: "",
  lastUpdated: null,
};

class FakeAllocationRepository implements AllocationRepository {
  events: AllocationEvent[] = [];
  committedInventory: InventorySourceRecord | null = null;

  async snapshot() {
    return { events: this.events, nextRowNumber: this.events.length + 2 };
  }

  async commit(
    row: unknown[],
    _rowNumber: number,
    next: InventorySourceRecord,
  ) {
    this.events.push({
      allocationId: String(row[0]),
      orderId: String(row[1]),
      orderLineId: String(row[2]),
      sku: String(row[3]),
      itemDescription: String(row[4]),
      quantity: Number(row[5]),
      notes: String(row[6]),
    });
    this.committedInventory = next;
  }
}

const order = {
  orderId: "ORD-2026-0001",
  items: [
    {
      orderLineId: "ORD-2026-0001-L001",
      sku: "KV-000001",
      itemDescription: "Flange big compact",
      remainingQuantity: 600,
      reservedQuantity: 0,
      unit: "pcs" as const,
    },
  ],
};

describe("AllocationService", () => {
  it("assigns available stock and records a compensating cancellation", async () => {
    const repository = new FakeAllocationRepository();
    let currentInventory = { ...inventory };
    const deltas: number[] = [];
    const service = new AllocationService(
      repository,
      {
        list: async () => [repository.committedInventory ?? currentInventory],
        update: async () => undefined,
      },
      {
        get: async () => order as never,
        adjustAllocation: async (_orderId, _lineId, delta) => {
          deltas.push(delta);
          order.items[0]!.reservedQuantity += delta;
          return {
            requiredQuantity: 600,
            reservedQuantity: order.items[0]!.reservedQuantity,
          };
        },
      },
    );

    const created = await service.create(order.orderId, {
      orderLineId: order.items[0]!.orderLineId,
      quantity: 200,
      notes: "Operator reserve",
    });
    expect(repository.committedInventory?.totalAssigned).toBe(200);

    const cancelled = await service.cancel(created.allocationId, {
      notes: "Customer reduced order",
    });
    expect(cancelled.cancelled).toBe(true);
    expect(repository.events[1]?.quantity).toBe(-200);
    expect(repository.events[1]?.notes).toContain(
      `[CANCELS: ${created.allocationId}]`,
    );
    expect(repository.committedInventory?.totalAssigned).toBe(0);
    expect(deltas).toEqual([200, -200]);
  });

  it("cancels a ledger allocation when the order reserved cell is stale", async () => {
    const repository = new FakeAllocationRepository();
    repository.events = [
      {
        allocationId: "ALLOC-2026-0001",
        orderId: "ORD-2026-0003",
        orderLineId: "ORD-2026-0003-L001",
        sku: inventory.sku,
        itemDescription: inventory.itemDescription,
        quantity: 6500,
        notes: "Auto-assigned after QA",
      },
    ];
    const assignedInventory = {
      ...inventory,
      packedCartons: 65,
      totalAssigned: 6500,
    };
    const orderDeltas: number[] = [];
    const service = new AllocationService(
      repository,
      { list: async () => [assignedInventory], update: async () => undefined },
      {
        get: async () =>
          ({
            items: [
              {
                orderLineId: "ORD-2026-0003-L001",
                reservedQuantity: 0,
              },
            ],
          }) as never,
        adjustAllocation: async (_orderId, _lineId, delta) => {
          orderDeltas.push(delta);
          return { requiredQuantity: 6500, reservedQuantity: 0 };
        },
      },
    );

    const cancelled = await service.cancel("ALLOC-2026-0001", {
      notes: "Release stale packing allocation",
    });

    expect(cancelled.cancelled).toBe(true);
    expect(repository.committedInventory?.totalAssigned).toBe(0);
    expect(repository.events[1]?.quantity).toBe(-6500);
    expect(orderDeltas).toEqual([]);
  });
});

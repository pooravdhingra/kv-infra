import type { Order } from "@kv-infra/shared";
import { describe, expect, it } from "vitest";

import type { InventorySourceRecord } from "../inventory/inventory.repository.js";
import type { PackingEvent, PackingRepository } from "./packing.repository.js";
import { PackingService } from "./packing.service.js";

const inventory: InventorySourceRecord = {
  rowNumber: 2,
  sku: "KV-000001",
  itemDescription: "Cork sheet",
  quantityPerCarton: 10,
  unit: "pcs",
  unpackedQuantity: 100,
  inPackingQuantity: 0,
  packedCartons: 1,
  totalAssigned: 0,
  defectiveShortQuantity: 0,
  lastReceivedDate: null,
  lastPackedDate: null,
  warehouseLocation: "",
  notes: "",
  lastUpdated: null,
};

const eventFromRow = (row: unknown[]): PackingEvent => ({
  packingId: String(row[0]),
  date: String(row[1]),
  sku: String(row[2]),
  itemDescription: String(row[3]),
  quantityTaken: Number(row[4]),
  goodQuantity: Number(row[5]),
  packedCartons: Number(row[6]),
  defectiveQuantity: Number(row[7]),
  shortQuantity: Number(row[8]),
  leftUnpackedQuantity: Number(row[14]),
  assignedToOrder: row[9] === "YES",
  orderId: row[10] ? String(row[10]) : null,
  orderLineId: row[11] ? String(row[11]) : null,
  status: String(row[12]) as PackingEvent["status"],
  notes: String(row[13]),
});

class FakePackingRepository implements PackingRepository {
  events: PackingEvent[] = [];
  current = { ...inventory };
  allocationRow: unknown[] | undefined;
  async listEvents() {
    return this.events;
  }
  async listAllocationIds() {
    return [];
  }
  async commitStart(row: unknown[], next: InventorySourceRecord) {
    this.events.push(eventFromRow(row));
    this.current = next;
  }
  async commitFinish(
    row: unknown[],
    next: InventorySourceRecord,
    allocationRow?: unknown[],
  ) {
    this.events.push(eventFromRow(row));
    this.current = next;
    this.allocationRow = allocationRow;
  }
  async appendEvents(rows: unknown[][]) {
    this.events.push(...rows.map(eventFromRow));
  }
}

const linkedOrder: Order = {
  orderId: "ORD-2026-0001",
  status: "PENDING",
  completedAt: null,
  customerName: "ABC Traders",
  dateReceived: "2026-08-04",
  orderNotes: "",
  sheetTitle: "ABC Traders - 04 Aug 2026",
  sheetUrl: "https://docs.google.com/spreadsheets/d/test/edit#gid=1",
  totalCartons: 4,
  totalQuantity: 40,
  grossWeight: 0,
  volume: 0,
  actualGrossWeight: null,
  actualVolume: null,
  items: [
    {
      orderLineId: "ORD-2026-0001-L001",
      sku: "KV-000001",
      itemDescription: "Cork sheet",
      quantityPerCarton: 10,
      unit: "pcs",
      cartons: 4,
      totalQuantity: 40,
      weightPerCarton: 0,
      grossWeight: 0,
      volume: 0,
      length: 0,
      breadth: 0,
      height: 0,
      availableQuantity: 10,
      unpackedQuantity: 100,
      assignedQuantity: 0,
      reservedQuantity: 0,
      remainingQuantity: 40,
      shortfallQuantity: 30,
      stockStatus: "NEEDS_PACKING",
      supplierRequestStatus: null,
      suggestedAction: "START_PACKING",
      alternativeActions: ["RECEIVE_MATERIAL", "RESERVE_STOCK"],
    },
  ],
};

describe("PackingService", () => {
  it("appends an unlinked snapshot without deleting the packing history", async () => {
    const repository = new FakePackingRepository();
    repository.events = [
      {
        packingId: "PACK-2026-0001",
        date: "2026-08-04",
        sku: inventory.sku,
        itemDescription: inventory.itemDescription,
        quantityTaken: 40,
        goodQuantity: 0,
        packedCartons: 0,
        defectiveQuantity: 0,
        shortQuantity: 0,
        leftUnpackedQuantity: 0,
        assignedToOrder: false,
        orderId: linkedOrder.orderId,
        orderLineId: linkedOrder.items[0]!.orderLineId,
        status: "IN PACKING",
        notes: "Linked session",
      },
    ];
    const service = new PackingService(
      repository,
      { list: async () => [repository.current], update: async () => undefined },
      {} as never,
    );

    await expect(
      service.unlinkForLine(
        linkedOrder.orderId,
        linkedOrder.items[0]!.orderLineId,
      ),
    ).resolves.toBe(1);
    expect(repository.events).toHaveLength(2);
    expect(repository.events[1]).toMatchObject({
      packingId: "PACK-2026-0001",
      orderId: null,
      orderLineId: null,
      status: "IN PACKING",
    });
    expect(repository.events[1]?.notes).toContain("[UNLINKED FROM");
  });

  it("moves stock into packing and finishes with reconciled QA quantities", async () => {
    const repository = new FakePackingRepository();
    let syncedSku = "";
    const service = new PackingService(
      repository,
      { list: async () => [repository.current], update: async () => undefined },
      {
        list: async () => [],
        recordAllocation: async () => ({
          requiredQuantity: 0,
          reservedQuantity: 0,
        }),
        adjustAllocation: async () => ({
          requiredQuantity: 0,
          reservedQuantity: 0,
        }),
        syncSkuPackingDetails: async (sku) => {
          syncedSku = sku;
          return 0;
        },
      },
    );
    const started = await service.start({
      date: "2026-08-04",
      sku: "KV-000001",
      quantityTaken: 50,
    });
    expect(started.status).toBe("IN PACKING");
    expect(repository.current).toMatchObject({
      unpackedQuantity: 50,
      inPackingQuantity: 50,
    });

    const finished = await service.finish(started.packingId, {
      date: "2026-08-05",
      goodQuantity: 40,
      packedCartons: 4,
      defectiveQuantity: 6,
      shortQuantity: 4,
      leftUnpackedQuantity: 0,
    });
    expect(finished.status).toBe("FINISHED");
    expect(repository.current).toMatchObject({
      unpackedQuantity: 50,
      inPackingQuantity: 0,
      packedCartons: 5,
      defectiveShortQuantity: 10,
    });
    expect(repository.events.map((event) => event.status)).toEqual([
      "IN PACKING",
      "FINISHED",
    ]);
    expect(syncedSku).toBe("KV-000001");
  });

  it("packs beyond an order need, assigns only the need, and keeps excess available", async () => {
    const repository = new FakePackingRepository();
    let recordedQuantity = 0;
    const service = new PackingService(
      repository,
      {
        list: async () => [repository.current],
        update: async () => undefined,
      },
      {
        list: async () => [linkedOrder],
        recordAllocation: async (_orderId, _lineId, quantity) => {
          recordedQuantity = quantity;
          return { requiredQuantity: 40, reservedQuantity: quantity };
        },
        adjustAllocation: async () => ({
          requiredQuantity: 40,
          reservedQuantity: 0,
        }),
        syncSkuPackingDetails: async () => 0,
      },
    );
    const started = await service.start({
      date: "2026-08-04",
      sku: "KV-000001",
      quantityTaken: 60,
      orderId: linkedOrder.orderId,
      orderLineId: linkedOrder.items[0]!.orderLineId,
    });
    const finished = await service.finish(started.packingId, {
      date: "2026-08-05",
      goodQuantity: 50,
      packedCartons: 5,
      defectiveQuantity: 0,
      shortQuantity: 0,
      leftUnpackedQuantity: 10,
    });

    expect(finished.assignedQuantity).toBe(40);
    expect(repository.current.totalAssigned).toBe(40);
    expect(repository.current).toMatchObject({
      unpackedQuantity: 50,
      inPackingQuantity: 0,
      packedCartons: 6,
    });
    expect(repository.allocationRow?.[1]).toBe(linkedOrder.orderId);
    expect(recordedQuantity).toBe(40);
  });
});

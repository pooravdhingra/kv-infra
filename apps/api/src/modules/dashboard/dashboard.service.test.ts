import { describe, expect, it } from "vitest";

import { DashboardService } from "./dashboard.service.js";

describe("DashboardService", () => {
  it("prioritizes failures, follow-ups, packing, and order actions", async () => {
    const service = new DashboardService(
      {
        list: async () =>
          [
            {
              orderId: "ORD-2026-0002",
              status: "PENDING",
              customerName: "Prince",
              dateReceived: "2026-08-04",
              totalCartons: 20,
              totalQuantity: 2000,
              items: [
                {
                  orderLineId: "ORD-2026-0002-L001",
                  sku: "KV-B000001",
                  itemDescription: "Flange big",
                  unit: "pcs",
                  remainingQuantity: 1000,
                  unpackedQuantity: 0,
                  shortfallQuantity: 1000,
                  stockStatus: "NEEDS_SUPPLIER",
                  supplierRequestStatus: null,
                },
                {
                  orderLineId: "ORD-2026-0002-L002",
                  sku: "KV-T000001",
                  itemDescription: "Flange small",
                  unit: "pcs",
                  remainingQuantity: 1000,
                  unpackedQuantity: 1000,
                  shortfallQuantity: 1000,
                  stockStatus: "NEEDS_PACKING",
                  supplierRequestStatus: null,
                },
              ],
            },
            { orderId: "ORD-2026-0001", status: "COMPLETED", items: [] },
          ] as never,
      },
      {
        list: async () =>
          ({
            sessions: [
              {
                packingId: "PACK-2026-0002",
                date: "2026-08-04",
                sku: "KV-T000001",
                itemDescription: "Flange small",
                quantityTaken: 1000,
                goodQuantity: 0,
                unit: "pcs",
                orderId: "ORD-2026-0002",
                status: "IN PACKING",
              },
            ],
            unpackedInventory: [
              {
                sku: "KV-T000001",
                itemDescription: "Flange small",
                unit: "pcs",
                unpackedQuantity: 1000,
              },
            ],
          }) as never,
      },
      {
        snapshot: async () =>
          ({
            records: [
              {
                requestId: "REQ-2026-0001",
                status: "SEND FAILED",
                autoFollowUpEnabled: true,
                nextFollowUpAt: "2020-01-01T00:00:00.000Z",
              },
            ],
            nextRowNumber: 3,
          }) as never,
      },
      {
        recent: async () =>
          [
            {
              receiptId: "REC-2026-0001",
              date: "2026-08-03",
              itemDescription: "Flange small",
              quantityReceived: 1000,
              unit: "pcs",
              supplier: "ABC Supplier",
            },
          ] as never,
      },
    );

    const dashboard = await service.get();

    expect(dashboard.summary).toMatchObject({
      pendingOrders: 1,
      completedOrders: 1,
      supplierShortfallLines: 1,
      activePackingSessions: 1,
      unpackedSkus: 1,
      dueFollowUps: 1,
      sendFailures: 1,
    });
    expect(dashboard.actions.slice(0, 3).map((action) => action.id)).toEqual([
      "send-failures",
      "due-followups",
      "finish-PACK-2026-0002",
    ]);
    expect(dashboard.actions.map((action) => action.id)).toContain(
      "supplier-ORD-2026-0002",
    );
    expect(dashboard.orders[0]).toMatchObject({
      orderId: "ORD-2026-0002",
      readiness: "NEEDS_SUPPLIER",
    });
    expect(dashboard.activity).toHaveLength(2);
  });
});

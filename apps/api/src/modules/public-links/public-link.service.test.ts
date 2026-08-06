import type { Order, Sku } from "@kv-infra/shared";
import { describe, expect, it } from "vitest";

import type {
  ClientOrderLinkRecord,
  ClientOrderLinkRepository,
} from "./client-order-link.repository.js";
import {
  generateNextClientOrderLinkId,
  PublicLinkService,
} from "./public-link.service.js";

class FakeLinkRepository implements ClientOrderLinkRepository {
  records: ClientOrderLinkRecord[] = [];
  submittedWrites = 0;
  async list() {
    return this.records;
  }
  async append(record: Omit<ClientOrderLinkRecord, "rowNumber">) {
    this.records.push({ ...record, rowNumber: this.records.length + 2 });
  }
  async markSubmitted(rowNumber: number, orderId: string, submittedAt: string) {
    this.submittedWrites += 1;
    const record = this.records.find((item) => item.rowNumber === rowNumber)!;
    record.orderId = orderId;
    record.submittedAt = submittedAt;
  }
  async disable(rowNumber: number, disabledAt: string) {
    this.records.find((item) => item.rowNumber === rowNumber)!.disabledAt =
      disabledAt;
  }
}

const sku: Sku = {
  sku: "KV-B0001",
  itemDescription: "FLANGE BIG COMPACT",
  quantityPerCarton: 100,
  unit: "pcs",
  weightPerCarton: 10,
  length: 12,
  breadth: 10,
  height: 8,
};

const order = (status: Order["status"] = "PENDING"): Order =>
  ({
    orderId: "ORD-2026-0001",
    status,
    completedAt: status === "COMPLETED" ? new Date().toISOString() : null,
    customerName: "ATIF",
    dateReceived: "2026-08-07",
    orderNotes: "",
    sheetTitle: "ATIF - 07 Aug 2026",
    sheetUrl: "https://docs.google.com/spreadsheets/d/test/edit#gid=1",
    totalCartons: 10,
    totalQuantity: 1000,
    grossWeight: 100,
    volume: 0.1573158144,
    items: [
      {
        sku: sku.sku,
        itemDescription: sku.itemDescription,
        unit: sku.unit,
        cartons: 10,
        totalQuantity: 1000,
        grossWeight: 100,
        volume: 0.1573158144,
      },
    ],
  }) as Order;

const config = {
  appBaseUrl: "https://kv.example.com",
  sessionSecret: "a-secure-session-secret-with-more-than-32-characters",
  skuFormToken: "a-static-sku-token-with-more-than-32-characters",
  timeZone: "Asia/Kolkata",
};

describe("PublicLinkService", () => {
  it("generates independent human-readable link IDs", () => {
    expect(
      generateNextClientOrderLinkId(2026, [
        { linkId: "COL-2026-0009" },
        { linkId: "COL-2025-9999" },
      ]),
    ).toBe("COL-2026-0010");
  });

  it("creates a signed customer-specific link without storing its token", async () => {
    const repository = new FakeLinkRepository();
    const service = new PublicLinkService(
      repository,
      {
        create: async () => order(),
        get: async () => order(),
        list: async () => [],
      },
      { create: async () => sku, list: async () => [sku] },
      config,
    );

    const created = await service.createClientOrderLink({
      customerName: "Atif",
    });

    expect(created.customerName).toBe("ATIF");
    expect(created.url).toMatch(
      /^https:\/\/kv\.example\.com\/order\/COL-\d{4}-0001\./,
    );
    expect(repository.records[0]).not.toHaveProperty("token");
  });

  it("accepts one public order and turns the same link into a summary", async () => {
    const repository = new FakeLinkRepository();
    let createCalls = 0;
    const service = new PublicLinkService(
      repository,
      {
        create: async (input) => {
          createCalls += 1;
          expect(input).toMatchObject({ customerName: "ATIF" });
          return order();
        },
        get: async () => order(),
        list: async () => [],
      },
      { create: async () => sku, list: async () => [sku] },
      config,
    );
    const created = await service.createClientOrderLink({
      customerName: "ATIF",
    });
    const token = created.url.split("/order/")[1]!;

    await expect(service.publicOrderState(token)).resolves.toMatchObject({
      status: "OPEN",
      customerName: "ATIF",
    });
    await expect(
      service.submitPublicOrder(token, {
        items: [{ sku: sku.sku, cartons: 10 }],
      }),
    ).resolves.toMatchObject({
      status: "SUBMITTED",
      summary: { orderId: "ORD-2026-0001", totalQuantity: 1000 },
    });
    await expect(service.publicOrderState(token)).resolves.toMatchObject({
      status: "SUBMITTED",
      summary: { orderId: "ORD-2026-0001" },
    });
    expect(createCalls).toBe(1);
    expect(repository.submittedWrites).toBe(1);
  });

  it("takes a submitted link down after shipment", async () => {
    const repository = new FakeLinkRepository();
    repository.records.push({
      linkId: "COL-2026-0001",
      customerName: "ATIF",
      createdAt: new Date().toISOString(),
      orderId: "ORD-2026-0001",
      submittedAt: new Date().toISOString(),
      disabledAt: null,
      rowNumber: 2,
    });
    const service = new PublicLinkService(
      repository,
      {
        create: async () => order(),
        get: async () => order("COMPLETED"),
        list: async () => [order("COMPLETED")],
      },
      { create: async () => sku, list: async () => [sku] },
      config,
    );
    const [record] = await service.listClientOrderLinks();
    expect(record?.status).toBe("SHIPPED");
    const token = record!.url.split("/order/")[1]!;
    await expect(service.publicOrderState(token)).rejects.toMatchObject({
      status: 410,
      code: "CLIENT_ORDER_LINK_SHIPPED",
    });
  });

  it("guards the permanent SKU form with its configured token", async () => {
    let created = false;
    const service = new PublicLinkService(
      new FakeLinkRepository(),
      {
        create: async () => order(),
        get: async () => order(),
        list: async () => [],
      },
      {
        create: async () => {
          created = true;
          return sku;
        },
        list: async () => [sku],
      },
      config,
    );

    await expect(
      service.createPublicSku(config.skuFormToken, {
        oem: "Bajaj",
        itemDescription: "Flange",
      }),
    ).resolves.toEqual(sku);
    expect(created).toBe(true);
    await expect(service.createPublicSku("wrong", {})).rejects.toMatchObject({
      status: 404,
    });
  });
});

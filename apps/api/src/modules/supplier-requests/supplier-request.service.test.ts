import { describe, expect, it } from "vitest";
import {
  combineInitialOrderMessages,
  followUpMessage,
  initialOrderMessage,
} from "@kv-infra/shared";

import {
  bulkMessageDelayMs,
  nextSupplierRequestId,
  SupplierRequestService,
} from "./supplier-request.service.js";
import type { SupplierRequestRecord } from "./supplier-request.repository.js";

describe("supplier request messages", () => {
  it("unlinks supplier requests and disables follow-ups without deleting them", async () => {
    const record: SupplierRequestRecord = {
      rowNumber: 2,
      requestId: "REQ-2026-0001",
      orderId: "ORD-2026-0001",
      orderLineId: "ORD-2026-0001-L001",
      sku: "KV-000001",
      itemDescription: "FLANGE BIG",
      requiredQuantity: 1000,
      availableQuantity: 0,
      shortfallQuantity: 1000,
      selectedSupplier: "ABC",
      supplierNumber: "9810525118",
      supplierPriority: 1,
      lastMessageAt: "2026-08-04T10:00:00.000Z",
      nextFollowUpAt: "2026-08-07T10:00:00.000Z",
      status: "SENT",
      autoFollowUpEnabled: true,
      notes: "",
    };
    let updated: SupplierRequestRecord | null = null;
    const service = new SupplierRequestService(
      {
        snapshot: async () => ({ records: [record], nextRowNumber: 3 }),
        append: async () => undefined,
        appendMany: async () => undefined,
        update: async (next) => {
          updated = next;
        },
      },
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.unlinkForLine(record.orderId, record.orderLineId),
    ).resolves.toBe(1);
    expect(updated).toMatchObject({
      status: "UNLINKED",
      autoFollowUpEnabled: false,
      nextFollowUpAt: null,
    });
  });

  it("uses the approved initial-order wording", () => {
    expect(
      initialOrderMessage([
        {
          itemDescription: "Flange big compact",
          quantity: 1000,
          unit: "pcs",
        },
        {
          itemDescription: "Flange small compact",
          quantity: 2000,
          unit: "pcs",
        },
      ]),
    ).toBe(
      "Hello Bhaiya, how are you? Please note new order:\n\n1. FLANGE BIG COMPACT - 1000 PCS\n2. FLANGE SMALL COMPACT - 2000 PCS\n\nKab tak bhijva sakte ho?",
    );
  });

  it("uses the approved follow-up wording", () => {
    expect(
      followUpMessage([
        {
          itemDescription: "abc",
          quantity: 1000,
          unit: "pcs",
        },
        {
          itemDescription: "xyz",
          quantity: 2000,
          unit: "pcs",
        },
      ]),
    ).toBe(
      "Hello Bhaiya, ye items pending hain:\n\n1. abc - 1000 pcs\n2. xyz - 2000 pcs\n\nkab tak bhijvaoge?",
    );
  });

  it("increments yearly request IDs", () => {
    expect(
      nextSupplierRequestId(2026, ["REQ-2025-0100", "REQ-2026-0009"]),
    ).toBe("REQ-2026-0010");
  });

  it("combines edited item lines for one supplier into one message", () => {
    expect(
      combineInitialOrderMessages([
        {
          messageBody:
            "Hello Bhaiya, how are you? Please note new order:\n\n1. FLANGE BIG COMPACT - 7500 PCS URGENT\n\nKab tak bhijva sakte ho?",
          item: {
            itemDescription: "Flange big compact",
            quantity: 7500,
            unit: "pcs",
          },
        },
        {
          messageBody: initialOrderMessage([
            {
              itemDescription: "Flange small compact",
              quantity: 15000,
              unit: "pcs",
            },
          ]),
          item: {
            itemDescription: "Flange small compact",
            quantity: 15000,
            unit: "pcs",
          },
        },
      ]),
    ).toBe(
      "Hello Bhaiya, how are you? Please note new order:\n\n1. FLANGE BIG COMPACT - 7500 PCS URGENT\n2. FLANGE SMALL COMPACT - 15000 PCS\n\nKab tak bhijva sakte ho?",
    );
  });

  it("uses an inclusive five-to-fifty-five second bulk-message gap", () => {
    expect(bulkMessageDelayMs(0)).toBe(5_000);
    expect(bulkMessageDelayMs(0.5)).toBeGreaterThanOrEqual(30_000);
    expect(bulkMessageDelayMs(1)).toBe(55_000);
  });

  it("sends one combined message and keeps one request row per order line", async () => {
    const records: unknown[] = [];
    const messages: Array<{ supplierNumber: string; messageBody: string }> = [];
    const statuses: string[] = [];
    const line = (orderLineId: string, sku: string, description: string) => ({
      orderLineId,
      sku,
      itemDescription: description,
      shortfallQuantity: 1000,
      totalQuantity: 1000,
      availableQuantity: 0,
      unit: "pcs" as const,
    });
    const service = new SupplierRequestService(
      {
        snapshot: async () => ({ records: [], nextRowNumber: 2 }),
        append: async () => undefined,
        appendMany: async (next) => {
          records.push(...next);
        },
        update: async () => undefined,
      },
      {
        list: async () => [
          {
            orderId: "ORD-2026-0002",
            status: "PENDING",
            items: [
              line("ORD-2026-0002-L001", "KV-000001", "Flange big"),
              line("ORD-2026-0002-L002", "KV-000002", "Flange small"),
            ],
          } as never,
        ],
        setSupplierRequestStatus: async (_orderId, orderLineId) => {
          statuses.push(orderLineId);
        },
      },
      {
        forSku: async (sku) => [
          {
            sku,
            itemDescription: "Flange",
            name: "ABC Supplier",
            number: "9810525118",
            priority: 1,
          },
        ],
      },
      {
        send: async (input: unknown) => {
          messages.push(
            input as { supplierNumber: string; messageBody: string },
          );
          return {
            messageId: "MSG-2026-0001",
            sentAt: "2026-08-04T10:00:00.000Z",
            errorMessage: null,
          };
        },
      } as never,
      {} as never,
      { random: () => 0, sleep: async () => undefined },
    );

    const result = await service.createBulk({
      requests: [
        {
          orderId: "ORD-2026-0002",
          orderLineId: "ORD-2026-0002-L001",
          supplierNumber: "9810525118",
          quantity: 1000,
          messageBody: initialOrderMessage([
            { itemDescription: "Flange big", quantity: 1000, unit: "pcs" },
          ]),
          autoFollowUpEnabled: true,
          notes: "",
        },
        {
          orderId: "ORD-2026-0002",
          orderLineId: "ORD-2026-0002-L002",
          supplierNumber: "9810525118",
          quantity: 1000,
          messageBody: initialOrderMessage([
            { itemDescription: "Flange small", quantity: 1000, unit: "pcs" },
          ]),
          autoFollowUpEnabled: true,
          notes: "",
        },
      ],
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.messageBody).toContain("1. FLANGE BIG - 1000 PCS");
    expect(messages[0]?.messageBody).toContain("2. FLANGE SMALL - 1000 PCS");
    expect(records).toHaveLength(2);
    expect(result.map((item) => item.requestId)).toEqual([
      "REQ-2026-0001",
      "REQ-2026-0002",
    ]);
    expect(statuses).toEqual(["ORD-2026-0002-L001", "ORD-2026-0002-L002"]);
  });
});

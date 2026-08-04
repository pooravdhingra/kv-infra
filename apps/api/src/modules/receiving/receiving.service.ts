import {
  createReceiptRequestSchema,
  receiptSchema,
  receiveInventoryTransition,
  type Receipt,
} from "@kv-infra/shared";

import { AppError } from "../../lib/app-error.js";
import type { InventoryRepository } from "../inventory/inventory.repository.js";
import type { OrderService } from "../orders/order.service.js";
import type { SupplierRequestService } from "../supplier-requests/supplier-request.service.js";
import type { ReceivingRepository } from "./receiving.repository.js";

const RECEIPT_ID = /^REC-(\d{4})-(\d{4,})$/;

export const generateNextReceiptId = (year: number, ids: string[]) => {
  const highest = ids.reduce((max, id) => {
    const match = RECEIPT_ID.exec(id);
    return match && Number(match[1]) === year
      ? Math.max(max, Number(match[2]))
      : max;
  }, 0);
  return `REC-${year}-${String(highest + 1).padStart(4, "0")}`;
};

export class ReceivingService {
  private readonly completed = new Map<string, Receipt>();

  constructor(
    private readonly repository: ReceivingRepository,
    private readonly inventoryRepository: InventoryRepository,
    private readonly orders: Pick<OrderService, "list" | "markLineReceived">,
    private readonly supplierRequests?: Pick<
      SupplierRequestService,
      "markReceivedForLine"
    >,
  ) {}

  async openOrderOptions(rawSku: string) {
    const sku = rawSku.trim().toUpperCase();
    return (await this.orders.list()).flatMap((order) =>
      order.items.flatMap((line) =>
        line.sku === sku && line.remainingQuantity > 0
          ? [
              {
                orderId: order.orderId,
                orderLineId: line.orderLineId,
                customerName: order.customerName,
                requiredQuantity: line.totalQuantity,
                reservedQuantity: line.reservedQuantity,
                remainingQuantity: line.remainingQuantity,
                line,
              },
            ]
          : [],
      ),
    );
  }

  async recent(limit = 20) {
    const snapshot = await this.repository.snapshot();
    return snapshot.receipts
      .slice(-Math.max(1, Math.min(limit, 100)))
      .reverse();
  }

  async create(input: unknown, idempotencyKey?: string) {
    if (idempotencyKey && this.completed.has(idempotencyKey))
      return this.completed.get(idempotencyKey)!;
    const request = createReceiptRequestSchema.parse(input);
    const records = await this.inventoryRepository.list();
    const current = records.find(
      (item) => !item.sku.startsWith("DELETED-") && item.sku === request.sku,
    );
    if (!current)
      throw new AppError(
        404,
        "INVENTORY_NOT_FOUND",
        `Inventory for ${request.sku} was not found`,
      );

    if (request.orderId && request.orderLineId) {
      const option = (await this.openOrderOptions(request.sku)).find(
        (item) =>
          item.orderId === request.orderId &&
          item.orderLineId === request.orderLineId,
      );
      if (!option)
        throw new AppError(
          409,
          "INVALID_ORDER_LINK",
          "The selected order line is not open for this SKU",
        );
    }

    const receiptSnapshot = await this.repository.snapshot();
    const receiptId = generateNextReceiptId(
      Number(request.date.slice(0, 4)),
      receiptSnapshot.ids,
    );
    const receipt = receiptSchema.parse({
      receiptId,
      date: request.date,
      sku: current.sku,
      itemDescription: current.itemDescription,
      quantityReceived: request.quantityReceived,
      unit: current.unit,
      supplier: request.supplier,
      warehouseLocation: request.warehouseLocation,
      receivedBy: request.receivedBy,
      notes: request.notes,
      itemCheckStatus: "UNCHECKED",
      orderId: request.orderId ?? null,
      orderLineId: request.orderLineId ?? null,
    });
    const timestamp = new Date().toISOString();
    await this.repository.commit(
      [
        receipt.receiptId,
        receipt.date,
        receipt.sku,
        receipt.itemDescription,
        receipt.quantityReceived,
        receipt.unit,
        receipt.supplier,
        receipt.warehouseLocation,
        receipt.receivedBy,
        receipt.notes,
        receipt.itemCheckStatus,
        receipt.orderId ?? "",
        receipt.orderLineId ?? "",
      ],
      receiptSnapshot.nextRowNumber,
      {
        ...current,
        unpackedQuantity: receiveInventoryTransition(
          current.unpackedQuantity,
          request.quantityReceived,
        ),
        warehouseLocation:
          request.warehouseLocation || current.warehouseLocation,
        lastReceivedDate: request.date,
        lastUpdated: timestamp,
      },
    );
    if (request.orderId && request.orderLineId) {
      await this.orders.markLineReceived(
        request.orderId,
        request.orderLineId,
        request.markSupplierRequestReceived,
      );
      if (request.markSupplierRequestReceived)
        await this.supplierRequests?.markReceivedForLine(
          request.orderId,
          request.orderLineId,
          request.sendDeliveryConfirmation,
        );
    }
    if (idempotencyKey) this.completed.set(idempotencyKey, receipt);
    return receipt;
  }
}

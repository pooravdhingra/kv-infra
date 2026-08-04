import {
  allocationSchema,
  assignInventoryTransition,
  cancelAllocationRequestSchema,
  cancelInventoryAssignmentTransition,
  createAllocationRequestSchema,
  type Allocation,
} from "@kv-infra/shared";

import { AppError } from "../../lib/app-error.js";
import type { InventoryRepository } from "../inventory/inventory.repository.js";
import type { OrderService } from "../orders/order.service.js";
import type { AllocationRepository } from "./allocation.repository.js";

const idPattern = /^ALLOC-(\d{4})-(\d{4,})$/;
const cancellationTarget = (notes: string) =>
  /^\[CANCELS: ([^\]]+)]/.exec(notes)?.[1] ?? null;

export const nextAllocationId = (year: number, ids: string[]) => {
  const highest = ids.reduce((max, id) => {
    const match = idPattern.exec(id);
    return match && Number(match[1]) === year
      ? Math.max(max, Number(match[2]))
      : max;
  }, 0);
  return `ALLOC-${year}-${String(highest + 1).padStart(4, "0")}`;
};

export class AllocationService {
  private readonly completed = new Map<string, Allocation>();

  constructor(
    private readonly repository: AllocationRepository,
    private readonly inventoryRepository: InventoryRepository,
    private readonly orders: Pick<OrderService, "get" | "adjustAllocation">,
  ) {}

  async list(orderId?: string) {
    const [snapshot, inventory] = await Promise.all([
      this.repository.snapshot(),
      this.inventoryRepository.list(),
    ]);
    const cancelled = new Map(
      snapshot.events.flatMap((event) => {
        const target =
          event.quantity < 0 ? cancellationTarget(event.notes) : null;
        return target ? [[target, event.allocationId] as const] : [];
      }),
    );
    const unitBySku = new Map(
      inventory.flatMap((item) => [
        [item.sku, item.unit] as const,
        ...(item.sku.startsWith("DELETED-")
          ? ([[item.sku.slice("DELETED-".length), item.unit]] as const)
          : []),
      ]),
    );
    return snapshot.events
      .filter(
        (event) =>
          event.quantity > 0 && (!orderId || event.orderId === orderId),
      )
      .map((event) =>
        allocationSchema.parse({
          allocationId: event.allocationId,
          orderId: event.orderId,
          orderLineId: event.orderLineId,
          sku: event.sku,
          itemDescription: event.itemDescription,
          quantityAssigned: event.quantity,
          unit: unitBySku.get(event.sku),
          notes: event.notes,
          cancelled: cancelled.has(event.allocationId),
          cancellationId: cancelled.get(event.allocationId) ?? null,
        }),
      )
      .sort((left, right) =>
        right.allocationId.localeCompare(left.allocationId),
      );
  }

  async create(orderId: string, input: unknown, idempotencyKey?: string) {
    if (idempotencyKey && this.completed.has(idempotencyKey))
      return this.completed.get(idempotencyKey)!;
    const request = createAllocationRequestSchema.parse(input);
    const order = await this.orders.get(orderId);
    if (order.status === "COMPLETED")
      throw new AppError(
        409,
        "ORDER_COMPLETED",
        `${orderId} has already been shipped`,
      );
    const line = order.items.find(
      (item) => item.orderLineId === request.orderLineId,
    );
    if (!line)
      throw new AppError(
        404,
        "ORDER_LINE_NOT_FOUND",
        `Order line ${request.orderLineId} was not found in ${orderId}`,
      );
    if (request.quantity > line.remainingQuantity)
      throw new AppError(
        409,
        "INVALID_ALLOCATION",
        "Allocation exceeds the remaining order-line quantity",
      );
    const inventory = (await this.inventoryRepository.list()).find(
      (item) => item.sku === line.sku && !item.sku.startsWith("DELETED-"),
    );
    if (!inventory)
      throw new AppError(
        404,
        "INVENTORY_NOT_FOUND",
        `Inventory for ${line.sku} was not found`,
      );
    let totalAssigned: number;
    try {
      totalAssigned = assignInventoryTransition({
        quantityPerCarton: inventory.quantityPerCarton,
        packedCartons: inventory.packedCartons,
        totalAssigned: inventory.totalAssigned,
        quantityAssigned: request.quantity,
      });
    } catch (error) {
      throw new AppError(
        409,
        "INVALID_ALLOCATION",
        error instanceof Error ? error.message : "Stock cannot be assigned",
      );
    }
    const snapshot = await this.repository.snapshot();
    const allocationId = nextAllocationId(
      new Date().getFullYear(),
      snapshot.events.map((event) => event.allocationId),
    );
    await this.orders.adjustAllocation(
      orderId,
      line.orderLineId,
      request.quantity,
    );
    try {
      await this.repository.commit(
        [
          allocationId,
          orderId,
          line.orderLineId,
          line.sku,
          line.itemDescription,
          request.quantity,
          request.notes,
        ],
        snapshot.nextRowNumber,
        {
          ...inventory,
          totalAssigned,
          lastUpdated: new Date().toISOString(),
        },
      );
    } catch (error) {
      await this.orders.adjustAllocation(
        orderId,
        line.orderLineId,
        -request.quantity,
      );
      throw error;
    }
    const allocation = allocationSchema.parse({
      allocationId,
      orderId,
      orderLineId: line.orderLineId,
      sku: line.sku,
      itemDescription: line.itemDescription,
      quantityAssigned: request.quantity,
      unit: line.unit,
      notes: request.notes,
      cancelled: false,
      cancellationId: null,
    });
    if (idempotencyKey) this.completed.set(idempotencyKey, allocation);
    return allocation;
  }

  async cancel(allocationId: string, input: unknown, idempotencyKey?: string) {
    if (idempotencyKey && this.completed.has(idempotencyKey))
      return this.completed.get(idempotencyKey)!;
    const request = cancelAllocationRequestSchema.parse(input);
    const snapshot = await this.repository.snapshot();
    const original = snapshot.events.find(
      (event) => event.allocationId === allocationId && event.quantity > 0,
    );
    if (!original)
      throw new AppError(
        404,
        "ALLOCATION_NOT_FOUND",
        `Allocation ${allocationId} was not found`,
      );
    const order = await this.orders.get(original.orderId);
    if (order.status === "COMPLETED")
      throw new AppError(
        409,
        "ORDER_COMPLETED",
        `${original.orderId} has already been shipped`,
      );
    const orderLine = order.items.find(
      (item) => item.orderLineId === original.orderLineId,
    );
    if (!orderLine)
      throw new AppError(
        409,
        "INVALID_ALLOCATION_CANCELLATION",
        "The allocation's order line no longer exists",
      );
    const orderQuantityToRelease = Math.min(
      original.quantity,
      orderLine.reservedQuantity,
    );
    if (
      snapshot.events.some(
        (event) =>
          event.quantity < 0 &&
          cancellationTarget(event.notes) === allocationId,
      )
    )
      throw new AppError(
        409,
        "ALLOCATION_ALREADY_CANCELLED",
        `${allocationId} is already cancelled`,
      );
    const inventory = (await this.inventoryRepository.list()).find(
      (item) =>
        item.sku === original.sku || item.sku === `DELETED-${original.sku}`,
    );
    if (!inventory)
      throw new AppError(
        404,
        "INVENTORY_NOT_FOUND",
        `Inventory for ${original.sku} was not found`,
      );
    let totalAssigned: number;
    try {
      totalAssigned = cancelInventoryAssignmentTransition({
        totalAssigned: inventory.totalAssigned,
        quantityCancelled: original.quantity,
      });
    } catch (error) {
      throw new AppError(
        409,
        "INVALID_ALLOCATION_CANCELLATION",
        error instanceof Error
          ? error.message
          : "Assignment cannot be cancelled",
      );
    }
    const cancellationId = nextAllocationId(
      new Date().getFullYear(),
      snapshot.events.map((event) => event.allocationId),
    );
    if (orderQuantityToRelease > 0)
      await this.orders.adjustAllocation(
        original.orderId,
        original.orderLineId,
        -orderQuantityToRelease,
      );
    try {
      await this.repository.commit(
        [
          cancellationId,
          original.orderId,
          original.orderLineId,
          original.sku,
          original.itemDescription,
          -original.quantity,
          `[CANCELS: ${allocationId}] ${request.notes}`,
        ],
        snapshot.nextRowNumber,
        {
          ...inventory,
          totalAssigned,
          lastUpdated: new Date().toISOString(),
        },
      );
    } catch (error) {
      if (orderQuantityToRelease > 0)
        await this.orders.adjustAllocation(
          original.orderId,
          original.orderLineId,
          orderQuantityToRelease,
        );
      throw error;
    }
    const allocation = allocationSchema.parse({
      allocationId: original.allocationId,
      orderId: original.orderId,
      orderLineId: original.orderLineId,
      sku: original.sku,
      itemDescription: original.itemDescription,
      quantityAssigned: original.quantity,
      unit: inventory.unit,
      notes: original.notes,
      cancelled: true,
      cancellationId,
    });
    if (idempotencyKey) this.completed.set(idempotencyKey, allocation);
    return allocation;
  }
}

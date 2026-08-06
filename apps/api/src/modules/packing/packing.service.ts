import {
  assignInventoryTransition,
  finishPackingRequestSchema,
  finishPackingTransition,
  packingSessionSchema,
  startPackingRequestSchema,
  startPackingTransition,
  type PackingSession,
} from "@kv-infra/shared";

import { AppError } from "../../lib/app-error.js";
import type { InventoryRepository } from "../inventory/inventory.repository.js";
import type { OrderService } from "../orders/order.service.js";
import type { PackingEvent, PackingRepository } from "./packing.repository.js";

const sequenceId = (prefix: string, year: number, ids: string[]) => {
  const pattern = new RegExp(`^${prefix}-${year}-(\\d{4,})$`);
  const highest = ids.reduce((max, id) => {
    const match = pattern.exec(id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${year}-${String(highest + 1).padStart(4, "0")}`;
};

export class PackingService {
  private readonly completed = new Map<string, PackingSession>();

  constructor(
    private readonly repository: PackingRepository,
    private readonly inventoryRepository: InventoryRepository,
    private readonly orders: Pick<
      OrderService,
      "list" | "recordAllocation" | "adjustAllocation" | "syncSkuPackingDetails"
    >,
  ) {}

  private async sessionFromEvent(event: PackingEvent) {
    const inventory = (await this.inventoryRepository.list()).find(
      (item) => item.sku === event.sku && !item.sku.startsWith("DELETED-"),
    );
    if (!inventory)
      throw new AppError(
        404,
        "INVENTORY_NOT_FOUND",
        `Inventory for ${event.sku} was not found`,
      );
    return packingSessionSchema.parse({
      ...event,
      unit: inventory.unit,
      quantityPerCarton: inventory.quantityPerCarton,
      assignedQuantity:
        event.status === "FINISHED" && event.assignedToOrder
          ? event.goodQuantity
          : 0,
    });
  }

  async list() {
    const [events, inventory] = await Promise.all([
      this.repository.listEvents(),
      this.inventoryRepository.list(),
    ]);
    const latest = new Map<string, PackingEvent>();
    events.forEach((event) => latest.set(event.packingId, event));
    const inventoryMap = new Map(inventory.map((item) => [item.sku, item]));
    const sessions = [...latest.values()].map((event) => {
      const item = inventoryMap.get(event.sku);
      if (!item)
        throw new AppError(
          404,
          "INVENTORY_NOT_FOUND",
          `Inventory for ${event.sku} was not found`,
        );
      return packingSessionSchema.parse({
        ...event,
        unit: item.unit,
        quantityPerCarton: item.quantityPerCarton,
        assignedQuantity:
          event.status === "FINISHED" && event.assignedToOrder
            ? event.goodQuantity
            : 0,
      });
    });
    return {
      sessions: sessions.sort((a, b) => b.packingId.localeCompare(a.packingId)),
      unpackedInventory: inventory
        .filter(
          (item) =>
            !item.sku.startsWith("DELETED-") && item.unpackedQuantity > 0,
        )
        .map((item) => ({
          sku: item.sku,
          itemDescription: item.itemDescription,
          unit: item.unit,
          unpackedQuantity: item.unpackedQuantity,
        })),
    };
  }

  async start(input: unknown, idempotencyKey?: string) {
    if (idempotencyKey && this.completed.has(idempotencyKey))
      return this.completed.get(idempotencyKey)!;
    const request = startPackingRequestSchema.parse(input);
    const [events, inventory] = await Promise.all([
      this.repository.listEvents(),
      this.inventoryRepository.list(),
    ]);
    const current = inventory.find(
      (item) => item.sku === request.sku && !item.sku.startsWith("DELETED-"),
    );
    if (!current)
      throw new AppError(
        404,
        "INVENTORY_NOT_FOUND",
        `Inventory for ${request.sku} was not found`,
      );
    if (request.orderId && request.orderLineId) {
      const line = (await this.orders.list())
        .find((order) => order.orderId === request.orderId)
        ?.items.find(
          (item) =>
            item.orderLineId === request.orderLineId &&
            item.sku === request.sku,
        );
      if (!line || line.remainingQuantity <= 0)
        throw new AppError(
          409,
          "INVALID_ORDER_LINK",
          "The linked order line has no remaining requirement",
        );
    }
    let movement;
    try {
      movement = startPackingTransition({
        unpackedQuantity: current.unpackedQuantity,
        inPackingQuantity: current.inPackingQuantity,
        quantityTaken: request.quantityTaken,
      });
    } catch (error) {
      throw new AppError(
        409,
        "INVALID_PACKING_START",
        error instanceof Error ? error.message : "Packing cannot start",
      );
    }
    const packingId = sequenceId(
      "PACK",
      Number(request.date.slice(0, 4)),
      events.map((event) => event.packingId),
    );
    const event: PackingEvent = {
      packingId,
      date: request.date,
      sku: current.sku,
      itemDescription: current.itemDescription,
      quantityTaken: request.quantityTaken,
      goodQuantity: 0,
      packedCartons: 0,
      defectiveQuantity: 0,
      shortQuantity: 0,
      leftUnpackedQuantity: 0,
      assignedToOrder: false,
      orderId: request.orderId ?? null,
      orderLineId: request.orderLineId ?? null,
      status: "IN PACKING",
      notes: request.notes,
    };
    await this.repository.commitStart(this.eventRow(event), {
      ...current,
      ...movement,
      lastUpdated: new Date().toISOString(),
    });
    const session = await this.sessionFromEvent(event);
    if (idempotencyKey) this.completed.set(idempotencyKey, session);
    return session;
  }

  async finish(packingId: string, input: unknown, idempotencyKey?: string) {
    if (idempotencyKey && this.completed.has(idempotencyKey))
      return this.completed.get(idempotencyKey)!;
    const request = finishPackingRequestSchema.parse(input);
    const events = await this.repository.listEvents();
    const related = events.filter((event) => event.packingId === packingId);
    const started = related.find((event) => event.status === "IN PACKING");
    if (!started)
      throw new AppError(
        404,
        "PACKING_NOT_FOUND",
        `Packing session ${packingId} was not found`,
      );
    if (related.some((event) => event.status === "FINISHED"))
      throw new AppError(
        409,
        "PACKING_ALREADY_FINISHED",
        `${packingId} is already finished`,
      );
    const current = (await this.inventoryRepository.list()).find(
      (item) => item.sku === started.sku,
    );
    if (!current)
      throw new AppError(
        404,
        "INVENTORY_NOT_FOUND",
        `Inventory for ${started.sku} was not found`,
      );
    await this.orders.syncSkuPackingDetails(started.sku);
    let movement;
    try {
      movement = finishPackingTransition({
        quantityPerCarton: current.quantityPerCarton,
        unpackedQuantity: current.unpackedQuantity,
        inPackingQuantity: current.inPackingQuantity,
        packedCartons: current.packedCartons,
        defectiveShortQuantity: current.defectiveShortQuantity,
        quantityTaken: started.quantityTaken,
        goodQuantity: request.goodQuantity,
        finishedCartons: request.packedCartons,
        defectiveQuantity: request.defectiveQuantity,
        shortQuantity: request.shortQuantity,
        leftUnpackedQuantity: request.leftUnpackedQuantity,
      });
    } catch (error) {
      throw new AppError(
        409,
        "INVALID_PACKING_FINISH",
        error instanceof Error ? error.message : "Packing cannot finish",
      );
    }
    let assignedQuantity = 0;
    let allocationRow: unknown[] | undefined;
    let nextAssigned = current.totalAssigned;
    if (started.orderId && started.orderLineId && request.goodQuantity > 0) {
      const line = (await this.orders.list())
        .find((order) => order.orderId === started.orderId)
        ?.items.find((item) => item.orderLineId === started.orderLineId);
      if (!line)
        throw new AppError(
          409,
          "INVALID_ALLOCATION",
          "The linked order line was not found",
        );
      assignedQuantity = Math.min(request.goodQuantity, line.remainingQuantity);
      if (assignedQuantity > 0) {
        try {
          nextAssigned = assignInventoryTransition({
            quantityPerCarton: current.quantityPerCarton,
            packedCartons: movement.packedCartons,
            totalAssigned: current.totalAssigned,
            quantityAssigned: assignedQuantity,
          });
        } catch (error) {
          throw new AppError(
            409,
            "INVALID_ALLOCATION",
            error instanceof Error ? error.message : "Stock cannot be assigned",
          );
        }
        const allocationId = sequenceId(
          "ALLOC",
          Number(started.date.slice(0, 4)),
          await this.repository.listAllocationIds(),
        );
        allocationRow = [
          allocationId,
          started.orderId,
          started.orderLineId,
          started.sku,
          started.itemDescription,
          assignedQuantity,
          `[PACKING ID: ${packingId}] Auto-assigned after QA`,
        ];
      }
    }
    const finished: PackingEvent = {
      ...started,
      date: request.date,
      goodQuantity: request.goodQuantity,
      packedCartons: request.packedCartons,
      defectiveQuantity: request.defectiveQuantity,
      shortQuantity: request.shortQuantity,
      leftUnpackedQuantity: request.leftUnpackedQuantity,
      assignedToOrder: assignedQuantity > 0,
      status: "FINISHED",
      notes: request.notes,
    };
    if (started.orderId && started.orderLineId && assignedQuantity > 0)
      await this.orders.recordAllocation(
        started.orderId,
        started.orderLineId,
        assignedQuantity,
      );
    try {
      await this.repository.commitFinish(
        this.eventRow(finished),
        {
          ...current,
          ...movement,
          totalAssigned: nextAssigned,
          lastPackedDate: request.date,
          lastUpdated: new Date().toISOString(),
        },
        allocationRow,
      );
    } catch (error) {
      if (started.orderId && started.orderLineId && assignedQuantity > 0)
        await this.orders.adjustAllocation(
          started.orderId,
          started.orderLineId,
          -assignedQuantity,
        );
      throw error;
    }
    const session = packingSessionSchema.parse({
      ...finished,
      unit: current.unit,
      quantityPerCarton: current.quantityPerCarton,
      assignedQuantity,
    });
    if (idempotencyKey) this.completed.set(idempotencyKey, session);
    return session;
  }

  private eventRow(event: PackingEvent) {
    return [
      event.packingId,
      event.date,
      event.sku,
      event.itemDescription,
      event.quantityTaken,
      event.goodQuantity,
      event.packedCartons,
      event.defectiveQuantity,
      event.shortQuantity,
      event.assignedToOrder ? "YES" : "NO",
      event.orderId ?? "",
      event.orderLineId ?? "",
      event.status,
      event.notes,
      event.leftUnpackedQuantity,
    ];
  }
}

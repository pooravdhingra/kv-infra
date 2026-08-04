import {
  ORDER_HEADERS,
  calculateOrderLineTotals,
  calculateStockCheck,
  createOrderRequestSchema,
  getSuggestedAction,
  orderSchema,
  shipInventoryTransition,
  type InventoryItem,
  type Order,
  type OrderLine,
  type Sku,
} from "@kv-infra/shared";

import { env } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";
import type { AllocationRepository } from "../allocations/allocation.repository.js";
import type { InventoryService } from "../inventory/inventory.service.js";
import type {
  InventoryShipmentRepository,
  InventorySourceRecord,
} from "../inventory/inventory.repository.js";
import type { SkuRepository } from "../sku/sku.repository.js";
import {
  isOrderHeader,
  type OrderRepository,
  type OrderSheetSnapshot,
} from "./order.repository.js";

const ORDER_ID_PATTERN = /^ORD-(\d{4})-(\d{4,})$/;
const displayStatuses = {
  READY_TO_RESERVE: "READY TO RESERVE",
  NEEDS_PACKING: "NEEDS PACKING",
  NEEDS_SUPPLIER: "NEEDS SUPPLIER",
  FULLY_RESERVED: "FULLY RESERVED",
} as const;

const numeric = (value: unknown, label: string) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new AppError(
      409,
      "INVALID_ORDER_SHEET",
      `${label} must be non-negative`,
    );
  }
  return parsed;
};

const text = (value: unknown) => String(value ?? "").trim();

const allocationKey = (orderId: string, orderLineId: string) =>
  `${orderId}\u0000${orderLineId}`;

export const generateNextOrderId = (year: number, orderIds: string[]) => {
  const highest = orderIds.reduce((max, orderId) => {
    const match = ORDER_ID_PATTERN.exec(orderId);
    return match && Number(match[1]) === year
      ? Math.max(max, Number(match[2]))
      : max;
  }, 0);
  return `ORD-${year}-${String(highest + 1).padStart(4, "0")}`;
};

const dateLabel = (isoDate: string) => {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, day)));
};

const safeTabBase = (customerName: string, dateReceived: string) =>
  `${customerName
    .replace(/[\\/?*\[\]:]/g, "-")
    .replace(/\s+/g, " ")
    .trim()} - ${dateLabel(dateReceived)}`;

const uniqueTabTitle = (base: string, existingTitles: Set<string>) => {
  const initial = base.slice(0, 100);
  if (!existingTitles.has(initial)) return initial;
  for (let number = 2; number < 10_000; number += 1) {
    const suffix = ` (${number})`;
    const candidate = `${base.slice(0, 100 - suffix.length)}${suffix}`;
    if (!existingTitles.has(candidate)) return candidate;
  }
  throw new AppError(
    409,
    "ORDER_TAB_LIMIT",
    "Could not create a unique order tab name",
  );
};

const sheetUrl = (sheetId: number) =>
  `https://docs.google.com/spreadsheets/d/${env.ORDERS_SPREADSHEET_ID}/edit#gid=${sheetId}`;

const stockLine = (
  base: Omit<
    OrderLine,
    | "availableQuantity"
    | "unpackedQuantity"
    | "assignedQuantity"
    | "remainingQuantity"
    | "shortfallQuantity"
    | "stockStatus"
    | "suggestedAction"
    | "alternativeActions"
  >,
  inventory: InventoryItem | undefined,
): OrderLine => {
  const availableQuantity = inventory?.availableQuantity ?? 0;
  const unpackedQuantity = inventory?.unpackedQuantity ?? 0;
  const assignedQuantity = inventory?.totalAssigned ?? 0;
  const actions = getSuggestedAction({
    requiredQuantity: base.totalQuantity,
    reservedQuantity: base.reservedQuantity,
    availableQuantity,
    unpackedQuantity,
    supplierRequestStatus: base.supplierRequestStatus,
  });
  const stockPosition =
    actions.remainingQuantity === 0
      ? {
          shortfallQuantity: 0,
          stockStatus: "FULLY_RESERVED" as const,
        }
      : calculateStockCheck({
          requiredQuantity: actions.remainingQuantity,
          availableQuantity,
          unpackedQuantity,
        });
  return {
    ...base,
    availableQuantity,
    unpackedQuantity,
    assignedQuantity,
    ...stockPosition,
    ...actions,
  };
};

export class OrderService {
  private readonly completedRequests = new Map<string, Order>();

  constructor(
    private readonly repository: OrderRepository,
    private readonly skuRepository: SkuRepository,
    private readonly inventoryService: Pick<InventoryService, "list">,
    private readonly allocationRepository?: Pick<
      AllocationRepository,
      "snapshot"
    >,
    private readonly inventoryRepository?: InventoryShipmentRepository,
  ) {}

  async create(input: unknown, idempotencyKey?: string) {
    if (idempotencyKey && this.completedRequests.has(idempotencyKey)) {
      return this.completedRequests.get(idempotencyKey)!;
    }
    const request = createOrderRequestSchema.parse(input);
    const [snapshot, skuRecords, inventory] = await Promise.all([
      this.repository.snapshot(),
      this.skuRepository.listSkus(),
      this.inventoryService.list(),
    ]);
    const activeSkus = skuRecords.filter(
      (sku) => !sku.sku.startsWith("DELETED-"),
    );
    const skuMap = new Map(activeSkus.map((sku) => [sku.sku, sku]));
    const inventoryMap = new Map(inventory.map((item) => [item.sku, item]));
    const orderIds = snapshot.flatMap((sheet) =>
      isOrderHeader(sheet.rows[0] ?? []) && sheet.rows[1]?.[13]
        ? [text(sheet.rows[1][13])]
        : [],
    );
    const year = Number(request.dateReceived.slice(0, 4));
    const orderId = generateNextOrderId(year, orderIds);
    const timestamp = new Date().toISOString();

    const items = request.items.map((requested, index) => {
      const sku = skuMap.get(requested.sku);
      if (!sku) {
        throw new AppError(
          400,
          "UNKNOWN_SKU",
          `SKU ${requested.sku} is not active`,
        );
      }
      const totals = calculateOrderLineTotals({
        ...sku,
        cartons: requested.cartons,
      });
      return stockLine(
        {
          orderLineId: `${orderId}-L${String(index + 1).padStart(3, "0")}`,
          sku: sku.sku,
          itemDescription: sku.itemDescription,
          quantityPerCarton: sku.quantityPerCarton,
          unit: sku.unit,
          cartons: requested.cartons,
          ...totals,
          weightPerCarton: sku.weightPerCarton,
          length: sku.length,
          breadth: sku.breadth,
          height: sku.height,
          reservedQuantity: 0,
          supplierRequestStatus: null,
        },
        inventoryMap.get(sku.sku),
      );
    });

    const tabTitle = uniqueTabTitle(
      safeTabBase(request.customerName, request.dateReceived),
      new Set(snapshot.map((sheet) => sheet.title)),
    );
    const values = [
      [...ORDER_HEADERS],
      ...items.map((item, index) => {
        const row = index + 2;
        return [
          item.sku,
          item.itemDescription,
          item.quantityPerCarton,
          item.unit,
          item.cartons,
          `=E${row}*C${row}`,
          item.weightPerCarton,
          `=E${row}*G${row}`,
          `=K${row}*L${row}*M${row}*E${row}/1000000`,
          displayStatuses[item.stockStatus],
          item.length,
          item.breadth,
          item.height,
          orderId,
          item.orderLineId,
          request.dateReceived,
          `=F${row}`,
          0,
          item.shortfallQuantity,
          "",
          timestamp,
          request.orderNotes,
          request.customerName,
        ];
      }),
    ];
    const created = await this.repository.create(tabTitle, values);
    const order = orderSchema.parse({
      orderId,
      status: "PENDING",
      completedAt: null,
      customerName: request.customerName,
      dateReceived: request.dateReceived,
      orderNotes: request.orderNotes,
      sheetTitle: created.title,
      sheetUrl: sheetUrl(created.sheetId),
      ...this.totals(items),
      items,
    });
    if (idempotencyKey) this.completedRequests.set(idempotencyKey, order);
    return order;
  }

  async list() {
    const [snapshot, inventory, allocationSnapshot] = await Promise.all([
      this.repository.snapshot(),
      this.inventoryService.list(),
      this.allocationRepository?.snapshot(),
    ]);
    const inventoryMap = new Map(inventory.map((item) => [item.sku, item]));
    const reservedByLine = new Map<string, number>();
    allocationSnapshot?.events.forEach((event) => {
      const key = allocationKey(event.orderId, event.orderLineId);
      reservedByLine.set(key, (reservedByLine.get(key) ?? 0) + event.quantity);
    });
    return snapshot
      .filter(
        (sheet) => isOrderHeader(sheet.rows[0] ?? []) && sheet.rows.length > 1,
      )
      .map((sheet) =>
        this.fromSheet(
          sheet,
          inventoryMap,
          allocationSnapshot ? reservedByLine : undefined,
        ),
      )
      .sort((left, right) => right.orderId.localeCompare(left.orderId));
  }

  async get(orderId: string) {
    const order = (await this.list()).find((item) => item.orderId === orderId);
    if (!order)
      throw new AppError(
        404,
        "ORDER_NOT_FOUND",
        `Order ${orderId} was not found`,
      );
    return order;
  }

  async stockCheck(orderId: string) {
    const order = await this.get(orderId);
    if (order.status === "COMPLETED")
      throw new AppError(
        409,
        "ORDER_COMPLETED",
        `${orderId} has already been shipped`,
      );
    await this.repository.updateStockCheck(order.sheetTitle, order.items);
    return order;
  }

  async ship(orderId: string) {
    const order = await this.get(orderId);
    if (order.status === "COMPLETED") return order;
    if (
      order.items.length === 0 ||
      order.items.some(
        (item) =>
          item.stockStatus !== "FULLY_RESERVED" || item.remainingQuantity > 0,
      )
    )
      throw new AppError(
        409,
        "ORDER_NOT_READY_TO_SHIP",
        "Every order line must be fully packed and reserved before shipping",
      );
    if (!this.inventoryRepository)
      throw new AppError(
        503,
        "INVENTORY_NOT_CONFIGURED",
        "Inventory shipment storage is not configured",
      );
    const completedAt = new Date().toISOString();
    const inventory = await this.inventoryRepository.list();
    const shippedBySku = new Map<string, number>();
    order.items.forEach((item) =>
      shippedBySku.set(
        item.sku,
        (shippedBySku.get(item.sku) ?? 0) + item.reservedQuantity,
      ),
    );
    const originals: InventorySourceRecord[] = [];
    const updated = [...shippedBySku].map(([sku, shippedQuantity]) => {
      const current = inventory.find(
        (item) => item.sku === sku && !item.sku.startsWith("DELETED-"),
      );
      if (!current)
        throw new AppError(
          404,
          "INVENTORY_NOT_FOUND",
          `Inventory for ${sku} was not found`,
        );
      originals.push(current);
      let movement;
      try {
        movement = shipInventoryTransition({
          quantityPerCarton: current.quantityPerCarton,
          packedCartons: current.packedCartons,
          totalAssigned: current.totalAssigned,
          shippedQuantity,
        });
      } catch (error) {
        throw new AppError(
          409,
          "INVALID_SHIPMENT",
          error instanceof Error ? error.message : "Order cannot be shipped",
        );
      }
      return {
        ...current,
        ...movement,
        notes: [
          current.notes,
          `[${completedAt}] SHIPPED ${orderId}: ${shippedQuantity} ${current.unit}`,
        ]
          .filter(Boolean)
          .join("\n"),
        lastUpdated: completedAt,
      };
    });
    await this.inventoryRepository.updateMany(updated);
    try {
      await this.repository.completeOrder(
        order.sheetTitle,
        order.items.length,
        completedAt,
      );
    } catch (error) {
      await this.inventoryRepository.updateMany(originals);
      throw error;
    }
    return orderSchema.parse({
      ...order,
      status: "COMPLETED",
      completedAt,
    });
  }

  async markLineReceived(
    orderId: string,
    orderLineId: string,
    markSupplierRequestReceived: boolean,
  ) {
    const located = await this.locateLine(orderId, orderLineId);
    if (text(located.row[9]).toUpperCase() === "SHIPPED")
      throw new AppError(
        409,
        "ORDER_COMPLETED",
        `${orderId} has already been shipped`,
      );
    await this.repository.updateLineState(
      located.sheet.title,
      located.rowNumber,
      {
        status: "RECEIVED",
        ...(markSupplierRequestReceived
          ? { supplierRequestStatus: "RECEIVED" }
          : {}),
      },
    );
  }

  async recordAllocation(
    orderId: string,
    orderLineId: string,
    quantity: number,
  ) {
    return this.adjustAllocation(orderId, orderLineId, quantity);
  }

  async adjustAllocation(
    orderId: string,
    orderLineId: string,
    quantityDelta: number,
  ) {
    const located = await this.locateLine(orderId, orderLineId);
    const required = numeric(located.row[16], "REQUIRED QTY");
    const allocationSnapshot = await this.allocationRepository?.snapshot();
    const reserved = allocationSnapshot
      ? allocationSnapshot.events
          .filter(
            (event) =>
              event.orderId === orderId && event.orderLineId === orderLineId,
          )
          .reduce((total, event) => total + event.quantity, 0)
      : numeric(located.row[17], "RESERVED QTY");
    const nextReserved = reserved + quantityDelta;
    if (quantityDelta === 0 || nextReserved < 0 || nextReserved > required) {
      throw new AppError(
        409,
        "INVALID_ALLOCATION",
        "Allocation change is outside the order-line quantity",
      );
    }
    await this.repository.updateLineState(
      located.sheet.title,
      located.rowNumber,
      {
        status:
          nextReserved === required ? "FULLY RESERVED" : "PARTIALLY RESERVED",
        reservedQuantity: nextReserved,
      },
    );
    return { requiredQuantity: required, reservedQuantity: nextReserved };
  }

  async setSupplierRequestStatus(
    orderId: string,
    orderLineId: string,
    supplierRequestStatus: "SENT" | "CONFIRMED" | "RECEIVED",
  ) {
    const located = await this.locateLine(orderId, orderLineId);
    await this.repository.updateLineState(
      located.sheet.title,
      located.rowNumber,
      {
        status: text(located.row[9]) || "NEEDS SUPPLIER",
        supplierRequestStatus,
      },
    );
  }

  private async locateLine(orderId: string, orderLineId: string) {
    const snapshot = await this.repository.snapshot();
    for (const sheet of snapshot) {
      if (!isOrderHeader(sheet.rows[0] ?? [])) continue;
      const rowIndex = sheet.rows.findIndex(
        (row, index) =>
          index > 0 &&
          text(row[13]) === orderId &&
          text(row[14]) === orderLineId,
      );
      if (rowIndex >= 1) {
        return { sheet, row: sheet.rows[rowIndex]!, rowNumber: rowIndex + 1 };
      }
    }
    throw new AppError(
      404,
      "ORDER_LINE_NOT_FOUND",
      `Order line ${orderLineId} was not found in ${orderId}`,
    );
  }

  private fromSheet(
    sheet: OrderSheetSnapshot,
    inventory: Map<string, InventoryItem>,
    reservedByLine?: Map<string, number>,
  ) {
    const dataRows = sheet.rows.slice(1).filter((row) => row[13]);
    const first = dataRows[0];
    if (!first)
      throw new AppError(
        409,
        "INVALID_ORDER_SHEET",
        `${sheet.title} has no order rows`,
      );
    const completed = dataRows.every(
      (row) => text(row[9]).toUpperCase() === "SHIPPED",
    );
    const completedAt = completed
      ? (dataRows
          .map((row) => text(row[20]))
          .filter(Boolean)
          .sort()
          .at(-1) ?? null)
      : null;
    const items = dataRows.map((row) => {
      const totals = calculateOrderLineTotals({
        cartons: numeric(row[4], "NO OF CTNS"),
        quantityPerCarton: numeric(row[2], "QUANTITY/CTN"),
        weightPerCarton: numeric(row[6], "WEIGHT/CTN"),
        length: numeric(row[10], "LENGTH"),
        breadth: numeric(row[11], "BREADTH"),
        height: numeric(row[12], "HEIGHT"),
      });
      const sku = text(row[0]).toUpperCase();
      const orderId = text(row[13]);
      const orderLineId = text(row[14]);
      return stockLine(
        {
          orderLineId,
          sku,
          itemDescription: text(row[1]),
          quantityPerCarton: numeric(row[2], "QUANTITY/CTN"),
          unit: text(row[3]) as Sku["unit"],
          cartons: numeric(row[4], "NO OF CTNS"),
          ...totals,
          weightPerCarton: numeric(row[6], "WEIGHT/CTN"),
          length: numeric(row[10], "LENGTH"),
          breadth: numeric(row[11], "BREADTH"),
          height: numeric(row[12], "HEIGHT"),
          reservedQuantity:
            reservedByLine?.get(allocationKey(orderId, orderLineId)) ??
            numeric(row[17], "RESERVED QTY"),
          supplierRequestStatus: (
            ["SENT", "CONFIRMED", "RECEIVED"] as const
          ).includes(text(row[19]) as "SENT" | "CONFIRMED" | "RECEIVED")
            ? (text(row[19]) as "SENT" | "CONFIRMED" | "RECEIVED")
            : null,
        },
        inventory.get(sku),
      );
    });
    return orderSchema.parse({
      orderId: text(first[13]),
      status: completed ? "COMPLETED" : "PENDING",
      completedAt,
      customerName: text(first[22]),
      dateReceived: text(first[15]),
      orderNotes: text(first[21]),
      sheetTitle: sheet.title,
      sheetUrl: sheetUrl(sheet.sheetId),
      ...this.totals(items),
      items,
    });
  }

  private totals(items: OrderLine[]) {
    const sum = (pick: (item: OrderLine) => number) =>
      items.reduce((total, item) => total + pick(item), 0);
    return {
      totalCartons: sum((item) => item.cartons),
      totalQuantity: sum((item) => item.totalQuantity),
      grossWeight: sum((item) => item.grossWeight),
      volume: sum((item) => item.volume),
    };
  }
}

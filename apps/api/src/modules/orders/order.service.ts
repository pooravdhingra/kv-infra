import {
  ORDER_HEADERS,
  calculateOrderLineTotals,
  calculateStockCheck,
  createOrderRequestSchema,
  getSuggestedAction,
  orderSchema,
  type InventoryItem,
  type Order,
  type OrderLine,
  type Sku,
} from "@kv-infra/shared";

import { env } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";
import type { InventoryService } from "../inventory/inventory.service.js";
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
  return {
    ...base,
    availableQuantity,
    unpackedQuantity,
    assignedQuantity,
    ...calculateStockCheck({
      requiredQuantity: actions.remainingQuantity,
      availableQuantity,
      unpackedQuantity,
    }),
    ...actions,
  };
};

export class OrderService {
  private readonly completedRequests = new Map<string, Order>();

  constructor(
    private readonly repository: OrderRepository,
    private readonly skuRepository: SkuRepository,
    private readonly inventoryService: Pick<InventoryService, "list">,
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
    const [snapshot, inventory] = await Promise.all([
      this.repository.snapshot(),
      this.inventoryService.list(),
    ]);
    const inventoryMap = new Map(inventory.map((item) => [item.sku, item]));
    return snapshot
      .filter(
        (sheet) => isOrderHeader(sheet.rows[0] ?? []) && sheet.rows.length > 1,
      )
      .map((sheet) => this.fromSheet(sheet, inventoryMap))
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
    await this.repository.updateStockCheck(order.sheetTitle, order.items);
    return order;
  }

  async markLineReceived(
    orderId: string,
    orderLineId: string,
    markSupplierRequestReceived: boolean,
  ) {
    const located = await this.locateLine(orderId, orderLineId);
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
    const located = await this.locateLine(orderId, orderLineId);
    const required = numeric(located.row[16], "REQUIRED QTY");
    const reserved = numeric(located.row[17], "RESERVED QTY");
    const nextReserved = reserved + quantity;
    if (quantity <= 0 || nextReserved > required) {
      throw new AppError(
        409,
        "INVALID_ALLOCATION",
        "Allocation exceeds the remaining order-line quantity",
      );
    }
    await this.repository.updateLineState(
      located.sheet.title,
      located.rowNumber,
      {
        status: nextReserved === required ? "READY" : "PARTIALLY RESERVED",
        reservedQuantity: nextReserved,
      },
    );
    return { requiredQuantity: required, reservedQuantity: nextReserved };
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
  ) {
    const dataRows = sheet.rows.slice(1).filter((row) => row[13]);
    const first = dataRows[0];
    if (!first)
      throw new AppError(
        409,
        "INVALID_ORDER_SHEET",
        `${sheet.title} has no order rows`,
      );
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
      return stockLine(
        {
          orderLineId: text(row[14]),
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
          reservedQuantity: numeric(row[17], "RESERVED QTY"),
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

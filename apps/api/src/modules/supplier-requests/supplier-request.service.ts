import {
  bulkCreateSupplierRequestsSchema,
  combineInitialOrderMessages,
  createSupplierRequestSchema,
  followUpMessage,
  initialOrderMessage,
  supplierRequestSchema,
  updateSupplierRequestNotesSchema,
  type SupplierRequest,
} from "@kv-infra/shared";

import { env } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";
import type { OrderService } from "../orders/order.service.js";
import type { SupplierService } from "../suppliers/supplier.service.js";
import type { WhatsAppLogRepository } from "../whatsapp/whatsapp.repository.js";
import type { WhatsAppService } from "../whatsapp/whatsapp.service.js";
import type {
  SupplierRequestRecord,
  SupplierRequestRepository,
} from "./supplier-request.repository.js";

const requestPattern = /^REQ-(\d{4})-(\d{4,})$/;

export const bulkMessageDelayMs = (randomValue: number) =>
  5_000 + Math.floor(Math.min(Math.max(randomValue, 0), 0.999999) * 50_001);

type BulkSendTiming = {
  random: () => number;
  sleep: (milliseconds: number) => Promise<void>;
};

const defaultBulkSendTiming: BulkSendTiming = {
  random: Math.random,
  sleep: (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

export const nextSupplierRequestId = (year: number, ids: string[]) => {
  const highest = ids.reduce((max, id) => {
    const match = requestPattern.exec(id);
    return match && Number(match[1]) === year
      ? Math.max(max, Number(match[2]))
      : max;
  }, 0);
  return `REQ-${year}-${String(highest + 1).padStart(4, "0")}`;
};

const plusThreeDays = (iso: string) => {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + 3);
  return date.toISOString();
};

const localDay = (iso: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: env.OPERATOR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};

export class SupplierRequestService {
  private readonly completed = new Map<string, SupplierRequest>();
  private readonly completedBulk = new Map<string, SupplierRequest[]>();

  constructor(
    private readonly repository: SupplierRequestRepository,
    private readonly orders: Pick<
      OrderService,
      "list" | "setSupplierRequestStatus"
    >,
    private readonly suppliers: Pick<SupplierService, "forSku">,
    private readonly whatsapp: WhatsAppService,
    private readonly whatsappLog: WhatsAppLogRepository,
    private readonly bulkSendTiming: BulkSendTiming = defaultBulkSendTiming,
  ) {}

  private async hydrate(
    records: SupplierRequestRecord[],
  ): Promise<SupplierRequest[]> {
    const [orders, followUps] = await Promise.all([
      this.orders.list(),
      this.whatsappLog.followUpCounts(),
    ]);
    const orderMap = new Map(orders.map((order) => [order.orderId, order]));
    return records.map((record) => {
      const line = orderMap
        .get(record.orderId)
        ?.items.find((item) => item.orderLineId === record.orderLineId);
      if (!line)
        throw new AppError(
          409,
          "SUPPLIER_REQUEST_ORDER_MISSING",
          `${record.requestId} references a missing order line`,
        );
      return supplierRequestSchema.parse({
        ...record,
        unit: line.unit,
        followUpNumber: followUps.get(record.requestId) ?? 0,
      });
    });
  }

  async list() {
    const snapshot = await this.repository.snapshot();
    return (await this.hydrate(snapshot.records)).sort((left, right) =>
      right.requestId.localeCompare(left.requestId),
    );
  }

  async pending() {
    return (await this.list()).filter(
      (request) => request.status !== "RECEIVED",
    );
  }

  async create(input: unknown, idempotencyKey?: string) {
    if (idempotencyKey && this.completed.has(idempotencyKey))
      return this.completed.get(idempotencyKey)!;
    const request = createSupplierRequestSchema.parse(input);
    const order = (await this.orders.list()).find(
      (item) => item.orderId === request.orderId,
    );
    if (!order)
      throw new AppError(
        404,
        "ORDER_NOT_FOUND",
        `Order ${request.orderId} was not found`,
      );
    const line = order.items.find(
      (item) => item.orderLineId === request.orderLineId,
    );
    if (!line)
      throw new AppError(
        404,
        "ORDER_LINE_NOT_FOUND",
        `Order line ${request.orderLineId} was not found`,
      );
    if (
      line.shortfallQuantity <= 0 ||
      request.quantity > line.shortfallQuantity
    )
      throw new AppError(
        409,
        "INVALID_SUPPLIER_REQUEST",
        "Requested quantity exceeds the current supplier shortfall",
      );
    const supplier = (await this.suppliers.forSku(line.sku)).find(
      (item) => item.number === request.supplierNumber,
    );
    if (!supplier)
      throw new AppError(
        409,
        "INVALID_SUPPLIER",
        "Choose a supplier configured for this SKU",
      );
    const snapshot = await this.repository.snapshot();
    const active = snapshot.records.find(
      (item) =>
        item.orderLineId === line.orderLineId && item.status !== "RECEIVED",
    );
    if (active)
      throw new AppError(
        409,
        "SUPPLIER_REQUEST_EXISTS",
        `${active.requestId} is already active for this order line`,
      );
    const requestId = nextSupplierRequestId(
      new Date().getFullYear(),
      snapshot.records.map((item) => item.requestId),
    );
    const body =
      request.messageBody ??
      initialOrderMessage([
        {
          itemDescription: line.itemDescription,
          quantity: request.quantity,
          unit: line.unit,
        },
      ]);
    const sent = await this.whatsapp.send(
      { supplierNumber: supplier.number, messageBody: body },
      {
        requestId,
        orderId: order.orderId,
        sku: line.sku,
        supplierName: supplier.name,
        messageType: "INITIAL ORDER",
      },
    );
    const record: SupplierRequestRecord = {
      rowNumber: snapshot.nextRowNumber,
      requestId,
      orderId: order.orderId,
      orderLineId: line.orderLineId,
      sku: line.sku,
      itemDescription: line.itemDescription,
      requiredQuantity: line.totalQuantity,
      availableQuantity: line.availableQuantity,
      shortfallQuantity: request.quantity,
      selectedSupplier: supplier.name,
      supplierNumber: supplier.number,
      supplierPriority: supplier.priority,
      lastMessageAt: sent.sentAt,
      nextFollowUpAt: sent.sentAt ? plusThreeDays(sent.sentAt) : null,
      status: sent.errorMessage ? "SEND FAILED" : "SENT",
      autoFollowUpEnabled: request.autoFollowUpEnabled && !sent.errorMessage,
      notes: [request.notes, sent.errorMessage].filter(Boolean).join("\n"),
    };
    await this.repository.append(record);
    if (!sent.errorMessage)
      await this.orders.setSupplierRequestStatus(
        order.orderId,
        line.orderLineId,
        "SENT",
      );
    const result = supplierRequestSchema.parse({
      ...record,
      unit: line.unit,
      followUpNumber: 0,
    });
    if (idempotencyKey) this.completed.set(idempotencyKey, result);
    return result;
  }

  async createBulk(input: unknown, idempotencyKey?: string) {
    if (idempotencyKey && this.completedBulk.has(idempotencyKey))
      return this.completedBulk.get(idempotencyKey)!;
    const batch = bulkCreateSupplierRequestsSchema.parse(input);
    const [orders, snapshot] = await Promise.all([
      this.orders.list(),
      this.repository.snapshot(),
    ]);
    const seenLines = new Set<string>();
    const allocatedIds = snapshot.records.map((item) => item.requestId);
    const prepared = await Promise.all(
      batch.requests.map(async (request, index) => {
        const lineKey = `${request.orderId}\u0000${request.orderLineId}`;
        if (seenLines.has(lineKey))
          throw new AppError(
            409,
            "DUPLICATE_BULK_REQUEST_LINE",
            `Order line ${request.orderLineId} appears more than once`,
          );
        seenLines.add(lineKey);
        const order = orders.find((item) => item.orderId === request.orderId);
        if (!order)
          throw new AppError(
            404,
            "ORDER_NOT_FOUND",
            `Order ${request.orderId} was not found`,
          );
        if (order.status === "COMPLETED")
          throw new AppError(
            409,
            "ORDER_COMPLETED",
            `${order.orderId} has already been shipped`,
          );
        const line = order.items.find(
          (item) => item.orderLineId === request.orderLineId,
        );
        if (!line)
          throw new AppError(
            404,
            "ORDER_LINE_NOT_FOUND",
            `Order line ${request.orderLineId} was not found`,
          );
        if (
          line.shortfallQuantity <= 0 ||
          request.quantity > line.shortfallQuantity
        )
          throw new AppError(
            409,
            "INVALID_SUPPLIER_REQUEST",
            "Requested quantity exceeds the current supplier shortfall",
          );
        const supplier = (await this.suppliers.forSku(line.sku)).find(
          (item) => item.number === request.supplierNumber,
        );
        if (!supplier)
          throw new AppError(
            409,
            "INVALID_SUPPLIER",
            `Choose a supplier configured for ${line.sku}`,
          );
        const active = snapshot.records.find(
          (item) =>
            item.orderLineId === line.orderLineId && item.status !== "RECEIVED",
        );
        if (active)
          throw new AppError(
            409,
            "SUPPLIER_REQUEST_EXISTS",
            `${active.requestId} is already active for this order line`,
          );
        const requestId = nextSupplierRequestId(
          new Date().getFullYear(),
          allocatedIds,
        );
        allocatedIds.push(requestId);
        return { index, requestId, request, order, line, supplier };
      }),
    );

    const groups = new Map<string, typeof prepared>();
    prepared.forEach((item) => {
      const group = groups.get(item.supplier.number) ?? [];
      group.push(item);
      groups.set(item.supplier.number, group);
    });
    const results: SupplierRequest[] = [];
    let groupIndex = 0;
    for (const group of groups.values()) {
      if (groupIndex > 0)
        await this.bulkSendTiming.sleep(
          bulkMessageDelayMs(this.bulkSendTiming.random()),
        );
      groupIndex += 1;
      const messageBody = combineInitialOrderMessages(
        group.map(({ request, line }) => ({
          messageBody:
            request.messageBody ??
            initialOrderMessage([
              {
                itemDescription: line.itemDescription,
                quantity: request.quantity,
                unit: line.unit,
              },
            ]),
          item: {
            itemDescription: line.itemDescription,
            quantity: request.quantity,
            unit: line.unit,
          },
        })),
      );
      const sent = await this.whatsapp.send(
        {
          supplierNumber: group[0]!.supplier.number,
          messageBody,
        },
        {
          requestId: group.map((item) => item.requestId).join(", "),
          orderId: [...new Set(group.map((item) => item.order.orderId))].join(
            ", ",
          ),
          sku: group.map((item) => item.line.sku).join(", "),
          supplierName: group[0]!.supplier.name,
          messageType: "INITIAL ORDER",
          notes: `Grouped request for ${group.length} order line${group.length === 1 ? "" : "s"}`,
        },
      );
      const records = group.map(
        ({ index, requestId, request, order, line, supplier }) => {
          const record: SupplierRequestRecord = {
            rowNumber: snapshot.nextRowNumber + index,
            requestId,
            orderId: order.orderId,
            orderLineId: line.orderLineId,
            sku: line.sku,
            itemDescription: line.itemDescription,
            requiredQuantity: line.totalQuantity,
            availableQuantity: line.availableQuantity,
            shortfallQuantity: request.quantity,
            selectedSupplier: supplier.name,
            supplierNumber: supplier.number,
            supplierPriority: supplier.priority,
            lastMessageAt: sent.sentAt,
            nextFollowUpAt: sent.sentAt ? plusThreeDays(sent.sentAt) : null,
            status: sent.errorMessage ? "SEND FAILED" : "SENT",
            autoFollowUpEnabled:
              request.autoFollowUpEnabled && !sent.errorMessage,
            notes: [request.notes, sent.errorMessage]
              .filter(Boolean)
              .join("\n"),
          };
          return record;
        },
      );
      await this.repository.appendMany(records);
      if (!sent.errorMessage)
        for (const item of group)
          await this.orders.setSupplierRequestStatus(
            item.order.orderId,
            item.line.orderLineId,
            "SENT",
          );
      results.push(
        ...records.map((record, index) =>
          supplierRequestSchema.parse({
            ...record,
            unit: group[index]!.line.unit,
            followUpNumber: 0,
          }),
        ),
      );
    }
    results.sort(
      (left, right) =>
        prepared.find((item) => item.requestId === left.requestId)!.index -
        prepared.find((item) => item.requestId === right.requestId)!.index,
    );
    if (idempotencyKey) this.completedBulk.set(idempotencyKey, results);
    return results;
  }

  private async findRecord(requestId: string) {
    const record = (await this.repository.snapshot()).records.find(
      (item) => item.requestId === requestId,
    );
    if (!record)
      throw new AppError(
        404,
        "SUPPLIER_REQUEST_NOT_FOUND",
        `Supplier request ${requestId} was not found`,
      );
    return record;
  }

  async markConfirmed(requestId: string, input: unknown) {
    const { notes } = updateSupplierRequestNotesSchema.parse(input);
    const record = await this.findRecord(requestId);
    if (record.status === "RECEIVED")
      throw new AppError(409, "REQUEST_RECEIVED", `${requestId} is received`);
    const updated = {
      ...record,
      status: "CONFIRMED" as const,
      notes: [record.notes, notes].filter(Boolean).join("\n"),
    };
    await this.repository.update(updated);
    await this.orders.setSupplierRequestStatus(
      record.orderId,
      record.orderLineId,
      "CONFIRMED",
    );
    return (await this.hydrate([updated]))[0]!;
  }

  async markReceived(requestId: string, input: unknown = {}) {
    const { notes } = updateSupplierRequestNotesSchema.parse(input);
    const record = await this.findRecord(requestId);
    const updated = {
      ...record,
      status: "RECEIVED" as const,
      autoFollowUpEnabled: false,
      nextFollowUpAt: null,
      notes: [record.notes, notes].filter(Boolean).join("\n"),
    };
    await this.repository.update(updated);
    await this.orders.setSupplierRequestStatus(
      record.orderId,
      record.orderLineId,
      "RECEIVED",
    );
    return (await this.hydrate([updated]))[0]!;
  }

  async markReceivedForLine(
    orderId: string,
    orderLineId: string,
    sendDeliveryConfirmation = false,
  ) {
    const active = (await this.repository.snapshot()).records.filter(
      (item) =>
        item.orderId === orderId &&
        item.orderLineId === orderLineId &&
        item.status !== "RECEIVED",
    );
    for (const record of active) {
      let confirmationNote = "";
      if (sendDeliveryConfirmation) {
        const sent = await this.whatsapp.send(
          {
            supplierNumber: record.supplierNumber,
            messageBody: "Hello Bhaiya, material receive ho gaya. Thank you.",
          },
          {
            requestId: record.requestId,
            orderId: record.orderId,
            sku: record.sku,
            supplierName: record.selectedSupplier,
            messageType: "DELIVERY CONFIRMATION",
          },
        );
        confirmationNote = sent.errorMessage
          ? `Delivery confirmation failed: ${sent.errorMessage}`
          : "Delivery confirmation sent";
      }
      await this.markReceived(record.requestId, { notes: confirmationNote });
    }
  }

  async disableFollowUps(requestId: string, input: unknown) {
    const { notes } = updateSupplierRequestNotesSchema.parse(input);
    const record = await this.findRecord(requestId);
    const updated = {
      ...record,
      autoFollowUpEnabled: false,
      nextFollowUpAt: null,
      notes: [record.notes, notes].filter(Boolean).join("\n"),
    };
    await this.repository.update(updated);
    return (await this.hydrate([updated]))[0]!;
  }

  async sendFollowUp(requestId: string, requireDue = false) {
    const record = await this.findRecord(requestId);
    if (record.status === "RECEIVED" || !record.autoFollowUpEnabled)
      throw new AppError(
        409,
        "FOLLOW_UP_DISABLED",
        "Follow-ups are disabled for this request",
      );
    const now = new Date().toISOString();
    if (
      record.lastMessageAt &&
      localDay(record.lastMessageAt) === localDay(now)
    )
      throw new AppError(
        409,
        "FOLLOW_UP_ALREADY_SENT_TODAY",
        "A message was already sent for this request today",
      );
    if (
      requireDue &&
      (!record.nextFollowUpAt ||
        new Date(record.nextFollowUpAt) > new Date(now))
    )
      throw new AppError(409, "FOLLOW_UP_NOT_DUE", "Follow-up is not due yet");
    const hydrated = (await this.hydrate([record]))[0]!;
    const followUpNumber = hydrated.followUpNumber + 1;
    const sent = await this.whatsapp.send(
      {
        supplierNumber: record.supplierNumber,
        messageBody: followUpMessage([
          {
            itemDescription: record.itemDescription,
            quantity: record.shortfallQuantity,
            unit: hydrated.unit,
          },
        ]),
      },
      {
        requestId: record.requestId,
        orderId: record.orderId,
        sku: record.sku,
        supplierName: record.selectedSupplier,
        messageType: "FOLLOW-UP",
        followUpNumber,
      },
    );
    const updated: SupplierRequestRecord = {
      ...record,
      ...(sent.sentAt
        ? {
            lastMessageAt: sent.sentAt,
            nextFollowUpAt: plusThreeDays(sent.sentAt),
            status:
              record.status === "SEND FAILED"
                ? ("SENT" as const)
                : record.status,
          }
        : {}),
      notes: [record.notes, sent.errorMessage].filter(Boolean).join("\n"),
    };
    await this.repository.update(updated);
    return supplierRequestSchema.parse({
      ...updated,
      unit: hydrated.unit,
      followUpNumber: sent.sentAt ? followUpNumber : hydrated.followUpNumber,
    });
  }

  async retryInitial(requestId: string) {
    const record = await this.findRecord(requestId);
    if (record.status !== "SEND FAILED")
      throw new AppError(
        409,
        "REQUEST_NOT_FAILED",
        "Only failed initial requests can be retried",
      );
    const hydrated = (await this.hydrate([record]))[0]!;
    const sent = await this.whatsapp.send(
      {
        supplierNumber: record.supplierNumber,
        messageBody: initialOrderMessage([
          {
            itemDescription: record.itemDescription,
            quantity: record.shortfallQuantity,
            unit: hydrated.unit,
          },
        ]),
      },
      {
        requestId: record.requestId,
        orderId: record.orderId,
        sku: record.sku,
        supplierName: record.selectedSupplier,
        messageType: "INITIAL ORDER",
        notes: "Retry after failed send",
      },
    );
    const updated: SupplierRequestRecord = {
      ...record,
      ...(sent.sentAt
        ? {
            status: "SENT" as const,
            lastMessageAt: sent.sentAt,
            nextFollowUpAt: plusThreeDays(sent.sentAt),
            autoFollowUpEnabled: true,
          }
        : {}),
      notes: [record.notes, sent.errorMessage].filter(Boolean).join("\n"),
    };
    await this.repository.update(updated);
    if (sent.sentAt)
      await this.orders.setSupplierRequestStatus(
        record.orderId,
        record.orderLineId,
        "SENT",
      );
    return supplierRequestSchema.parse({
      ...updated,
      unit: hydrated.unit,
      followUpNumber: hydrated.followUpNumber,
    });
  }

  async sendDueFollowUps() {
    if (!this.whatsapp.status().connected) return [];
    const now = new Date();
    const due = (await this.pending()).filter(
      (request) =>
        request.autoFollowUpEnabled &&
        request.nextFollowUpAt &&
        new Date(request.nextFollowUpAt) <= now &&
        (!request.lastMessageAt ||
          localDay(request.lastMessageAt) !== localDay(now.toISOString())),
    );
    const sent: SupplierRequest[] = [];
    for (const request of due)
      sent.push(await this.sendFollowUp(request.requestId, true));
    return sent;
  }
}

import {
  dashboardSchema,
  hasMissingSkuPackingDetails,
  type Dashboard,
} from "@kv-infra/shared";

import type { OrderService } from "../orders/order.service.js";
import type { PackingService } from "../packing/packing.service.js";
import type { ReceivingService } from "../receiving/receiving.service.js";
import type { SupplierRequestRepository } from "../supplier-requests/supplier-request.repository.js";
import type { SkuService } from "../sku/sku.service.js";

type DashboardAction = Dashboard["actions"][number];

const orderReadiness = (
  order: Awaited<ReturnType<OrderService["list"]>>[number],
): Dashboard["orders"][number]["readiness"] => {
  if (order.items.every((item) => item.remainingQuantity === 0))
    return "READY_TO_SHIP";
  if (order.items.some((item) => item.stockStatus === "NEEDS_SUPPLIER"))
    return "NEEDS_SUPPLIER";
  if (order.items.some((item) => item.stockStatus === "NEEDS_PACKING"))
    return "NEEDS_PACKING";
  if (order.items.some((item) => item.stockStatus === "READY_TO_RESERVE"))
    return "READY_TO_RESERVE";
  return "IN_PROGRESS";
};

export class DashboardService {
  constructor(
    private readonly orders: Pick<OrderService, "list">,
    private readonly packing: Pick<PackingService, "list">,
    private readonly supplierRequests: Pick<
      SupplierRequestRepository,
      "snapshot"
    >,
    private readonly receiving: Pick<ReceivingService, "recent">,
    private readonly skus: Pick<SkuService, "list">,
  ) {}

  async get() {
    const [orders, packing, requests, receipts, skus] = await Promise.all([
      this.orders.list(),
      this.packing.list(),
      this.supplierRequests.snapshot(),
      this.receiving.recent(6),
      this.skus.list(),
    ]);
    const pendingOrders = orders.filter((order) => order.status === "PENDING");
    const completedOrders = orders.filter(
      (order) => order.status === "COMPLETED",
    );
    const activePacking = packing.sessions.filter(
      (session) => session.status === "IN PACKING",
    );
    const activeRequests = requests.records.filter(
      (request) => request.status !== "RECEIVED",
    );
    const dueFollowUps = activeRequests.filter(
      (request) =>
        request.autoFollowUpEnabled &&
        request.nextFollowUpAt &&
        new Date(request.nextFollowUpAt) <= new Date(),
    );
    const sendFailures = activeRequests.filter(
      (request) => request.status === "SEND FAILED",
    );
    const supplierLines = pendingOrders.flatMap((order) =>
      order.items.flatMap((line) =>
        line.stockStatus === "NEEDS_SUPPLIER" ? [{ order, line }] : [],
      ),
    );
    const readyToShip = pendingOrders.filter((order) =>
      order.items.every((line) => line.remainingQuantity === 0),
    );

    const actions: DashboardAction[] = [];
    if (sendFailures.length > 0)
      actions.push({
        id: "send-failures",
        title: `Retry ${sendFailures.length} failed WhatsApp ${sendFailures.length === 1 ? "request" : "requests"}`,
        detail: "Supplier messages are waiting for operator attention.",
        href: "/supplier-requests",
        tone: "URGENT",
      });
    if (dueFollowUps.length > 0)
      actions.push({
        id: "due-followups",
        title: `${dueFollowUps.length} supplier ${dueFollowUps.length === 1 ? "follow-up is" : "follow-ups are"} due`,
        detail: "Review and send the scheduled three-day follow-ups.",
        href: "/supplier-requests",
        tone: "URGENT",
      });
    activePacking.slice(0, 3).forEach((session) =>
      actions.push({
        id: `finish-${session.packingId}`,
        title: `Finish packing ${session.sku}`,
        detail: `${session.quantityTaken} ${session.unit} is currently in QA${session.orderId ? ` for ${session.orderId}` : ""}.`,
        href: `/packing/${encodeURIComponent(session.packingId)}/finish`,
        tone: "ATTENTION",
      }),
    );
    skus
      .filter(hasMissingSkuPackingDetails)
      .slice(0, 3)
      .forEach((sku) =>
        actions.push({
          id: `fill-sku-${sku.sku}`,
          title: `Fill missing values for ${sku.sku} · ${sku.itemDescription}`,
          detail: "Packing quantity, weight, or dimensions are missing.",
          href: `/skus?sku=${encodeURIComponent(sku.sku)}`,
          tone: "ATTENTION",
        }),
      );
    readyToShip.slice(0, 3).forEach((order) =>
      actions.push({
        id: `ship-${order.orderId}`,
        title: `Ship ${order.orderId} for ${order.customerName}`,
        detail: "Every line is packed and fully reserved.",
        href: `/orders/${encodeURIComponent(order.orderId)}`,
        tone: "READY",
      }),
    );
    pendingOrders
      .filter((order) =>
        order.items.some(
          (line) =>
            line.stockStatus === "NEEDS_SUPPLIER" &&
            (!line.supplierRequestStatus ||
              line.supplierRequestStatus === "RECEIVED"),
        ),
      )
      .slice(0, 3)
      .forEach((order) =>
        actions.push({
          id: `supplier-${order.orderId}`,
          title: `Request supplier stock for ${order.customerName}`,
          detail: "One or more order lines have an unrequested shortfall.",
          href: `/supplier-requests/group?orderId=${encodeURIComponent(order.orderId)}`,
          tone: "ATTENTION",
        }),
      );
    pendingOrders
      .flatMap((order) =>
        order.items.flatMap((line) =>
          line.stockStatus === "NEEDS_PACKING" ? [{ order, line }] : [],
        ),
      )
      .slice(0, 3)
      .forEach(({ order, line }) =>
        actions.push({
          id: `pack-${line.orderLineId}`,
          title: `Pack ${line.itemDescription}`,
          detail: `${line.unpackedQuantity} ${line.unit} is unpacked for ${order.orderId}.`,
          href: `/packing/start?sku=${encodeURIComponent(line.sku)}&orderId=${encodeURIComponent(order.orderId)}&orderLineId=${encodeURIComponent(line.orderLineId)}`,
          tone: "ATTENTION",
        }),
      );
    pendingOrders
      .flatMap((order) =>
        order.items.flatMap((line) =>
          line.stockStatus === "READY_TO_RESERVE" && line.remainingQuantity > 0
            ? [{ order, line }]
            : [],
        ),
      )
      .slice(0, 3)
      .forEach(({ order, line }) =>
        actions.push({
          id: `reserve-${line.orderLineId}`,
          title: `Reserve stock for ${order.customerName}`,
          detail: `${line.remainingQuantity} ${line.unit} of ${line.itemDescription} is ready.`,
          href: `/orders/${encodeURIComponent(order.orderId)}`,
          tone: "READY",
        }),
      );
    if (actions.length === 0)
      actions.push({
        id: "review-inventory",
        title: "Review inventory positions",
        detail: "No urgent workflow action is currently waiting.",
        href: "/inventory",
        tone: "ROUTINE",
      });

    const activity: Dashboard["activity"] = [
      ...receipts.map((receipt) => ({
        id: receipt.receiptId,
        kind: "RECEIVING" as const,
        date: receipt.date,
        title: `Received ${receipt.itemDescription}`,
        detail: `${receipt.quantityReceived} ${receipt.unit} from ${receipt.supplier}`,
        href: "/receiving",
      })),
      ...packing.sessions.slice(0, 6).map((session) => ({
        id: session.packingId,
        kind: "PACKING" as const,
        date: session.date,
        title:
          session.status === "FINISHED"
            ? `Packed ${session.itemDescription}`
            : `Started packing ${session.itemDescription}`,
        detail:
          session.status === "FINISHED"
            ? `${session.goodQuantity} ${session.unit} passed QA`
            : `${session.quantityTaken} ${session.unit} in progress`,
        href:
          session.status === "FINISHED"
            ? "/packing"
            : `/packing/${encodeURIComponent(session.packingId)}/finish`,
      })),
    ]
      .sort(
        (left, right) =>
          right.date.localeCompare(left.date) ||
          right.id.localeCompare(left.id),
      )
      .slice(0, 6);

    return dashboardSchema.parse({
      summary: {
        pendingOrders: pendingOrders.length,
        completedOrders: completedOrders.length,
        readyToShipOrders: readyToShip.length,
        supplierShortfallLines: supplierLines.length,
        activePackingSessions: activePacking.length,
        unpackedSkus: packing.unpackedInventory.length,
        dueFollowUps: dueFollowUps.length,
        sendFailures: sendFailures.length,
      },
      actions: actions.slice(0, 10),
      orders: pendingOrders
        .sort((left, right) => right.orderId.localeCompare(left.orderId))
        .slice(0, 6)
        .map((order) => ({
          orderId: order.orderId,
          customerName: order.customerName,
          dateReceived: order.dateReceived,
          lineCount: order.items.length,
          totalCartons: order.totalCartons,
          totalQuantity: order.totalQuantity,
          readiness: orderReadiness(order),
        })),
      activity,
    });
  }
}

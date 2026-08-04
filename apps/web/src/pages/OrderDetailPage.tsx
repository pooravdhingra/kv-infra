import { useEffect, useState } from "react";
import type {
  Allocation,
  Order,
  OrderAction,
  OrderLine,
} from "@kv-infra/shared";

import {
  allocateOrderStock,
  apiErrorMessage,
  cancelAllocation,
  getOrder,
  listAllocations,
  runOrderStockCheck,
  shipOrder,
} from "../api/client";
import { formatDecimal } from "../lib/format-number";

const statusLabel = {
  READY_TO_RESERVE: "Ready to reserve",
  NEEDS_PACKING: "Needs packing",
  NEEDS_SUPPLIER: "Needs supplier",
  FULLY_RESERVED: "Fully reserved",
} as const;

const actionLabel: Record<OrderAction, string> = {
  RESERVE_STOCK: "Reserve stock",
  START_PACKING: "Start packing",
  REQUEST_SUPPLIER: "Request supplier",
  MARK_RECEIVED: "Mark received",
  RECEIVE_MATERIAL: "Receive material",
  NO_ACTION: "Fully reserved",
};

const actionHref = (action: OrderAction, orderId: string, line: OrderLine) => {
  const params = new URLSearchParams({
    sku: line.sku,
    orderId,
    orderLineId: line.orderLineId,
  });
  if (action === "START_PACKING") return `/packing/start?${params}`;
  if (action === "MARK_RECEIVED" || action === "RECEIVE_MATERIAL")
    return `/receiving?${params}`;
  if (action === "REQUEST_SUPPLIER") return `/supplier-requests/new?${params}`;
  return null;
};

export const OrderDetailPage = ({ orderId }: { orderId: string }) => {
  const [order, setOrder] = useState<Order | null>(null);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [allocationDrafts, setAllocationDrafts] = useState<
    Record<string, number>
  >({});
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);
  const [mutating, setMutating] = useState("");

  const refresh = async () => {
    const [nextOrder, nextAllocations] = await Promise.all([
      getOrder(orderId),
      listAllocations(orderId),
    ]);
    setOrder(nextOrder);
    setAllocations(nextAllocations);
  };

  useEffect(() => {
    void refresh().catch((error) => setMessage(apiErrorMessage(error)));
  }, [orderId]);

  const checkStock = async () => {
    setChecking(true);
    setMessage("");
    try {
      setOrder(await runOrderStockCheck(orderId));
      setMessage("Stock position refreshed from Inventory.");
    } catch (error) {
      setMessage(apiErrorMessage(error));
    } finally {
      setChecking(false);
    }
  };

  const reserve = async (line: OrderLine) => {
    const quantity =
      allocationDrafts[line.orderLineId] ??
      Math.min(line.availableQuantity, line.remainingQuantity);
    setMutating(line.orderLineId);
    setMessage("");
    try {
      const allocation = await allocateOrderStock(orderId, {
        orderLineId: line.orderLineId,
        quantity,
        notes: "Reserved from order detail",
      });
      await refresh();
      setMessage(
        `${allocation.allocationId} reserved ${quantity} ${line.unit}.`,
      );
    } catch (error) {
      setMessage(apiErrorMessage(error));
    } finally {
      setMutating("");
    }
  };

  const cancel = async (allocation: Allocation) => {
    const reason = window.prompt(
      `Reason for cancelling ${allocation.allocationId}:`,
    );
    if (!reason || reason.trim().length < 2) return;
    setMutating(allocation.allocationId);
    setMessage("");
    try {
      await cancelAllocation(allocation.allocationId, { notes: reason });
      await refresh();
      setMessage(`${allocation.allocationId} cancelled and stock released.`);
    } catch (error) {
      setMessage(apiErrorMessage(error));
    } finally {
      setMutating("");
    }
  };

  const ship = async () => {
    if (
      !window.confirm(
        "Mark this order as shipped and move it to Completed Orders?",
      )
    )
      return;
    setMutating("ship-order");
    setMessage("");
    try {
      setOrder(await shipOrder(orderId));
      setMessage("Order marked as shipped.");
    } catch (error) {
      setMessage(apiErrorMessage(error));
    } finally {
      setMutating("");
    }
  };

  if (!order)
    return (
      <section className="page-panel">
        <p>{message || "Loading order…"}</p>
      </section>
    );

  const supplierShortfallLines = order.items.filter(
    (item) =>
      item.shortfallQuantity > 0 &&
      (!item.supplierRequestStatus ||
        item.supplierRequestStatus === "RECEIVED"),
  );

  return (
    <section className="page-panel">
      <a className="back-link" href="/orders">
        ← Orders
      </a>
      <div className="page-title-row detail-title">
        <div>
          <h1>{order.customerName}</h1>
        </div>
        <div className="detail-title-actions">
          {order.status === "COMPLETED" ? (
            <span className="stock-badge shipped">Shipped</span>
          ) : (
            <>
              {supplierShortfallLines.length > 0 && (
                <a
                  className="secondary-button"
                  href={`/supplier-requests/group?orderId=${encodeURIComponent(order.orderId)}`}
                >
                  Request all shortfalls
                </a>
              )}
              {order.items.every(
                (item) =>
                  item.stockStatus === "FULLY_RESERVED" &&
                  item.remainingQuantity === 0,
              ) && (
                <button
                  className="primary-button"
                  disabled={Boolean(mutating)}
                  onClick={() => void ship()}
                >
                  {mutating === "ship-order" ? "Shipping…" : "Ship order"}
                </button>
              )}
            </>
          )}
          <a
            className="secondary-button sheet-link"
            href={order.sheetUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open Google Sheet ↗
          </a>
        </div>
      </div>
      <div className="metric-grid">
        <div>
          <span>Order date</span>
          <strong>{order.dateReceived}</strong>
        </div>
        <div>
          <span>Cartons</span>
          <strong>{order.totalCartons}</strong>
        </div>
        <div>
          <span>Total quantity</span>
          <strong>{order.totalQuantity}</strong>
        </div>
        <div>
          <span>Gross weight</span>
          <strong>{order.grossWeight} kg</strong>
        </div>
        <div>
          <span>Volume</span>
          <strong>{formatDecimal(order.volume)} CBM</strong>
        </div>
      </div>
      {order.orderNotes && <div className="notice">{order.orderNotes}</div>}
      <div className="section-heading order-lines-heading">
        <h2>Stock check</h2>
        {order.status === "PENDING" && (
          <button
            className="secondary-button"
            disabled={checking}
            onClick={checkStock}
          >
            {checking ? "Checking…" : "Refresh stock check"}
          </button>
        )}
      </div>
      {message && <div className="notice">{message}</div>}
      <div className="data-table" role="table" aria-label="Order stock check">
        <div className="order-stock-row order-stock-head" role="row">
          <span>SKU / item</span>
          <span>Required</span>
          <span>Available</span>
          <span>Unpacked</span>
          <span>Reserved</span>
          <span>Shortfall</span>
          <span>Status</span>
          <span>Suggested action</span>
        </div>
        {order.items.map((line) => (
          <div className="order-stock-row" role="row" key={line.orderLineId}>
            <span>
              <strong>{line.sku}</strong>
              <small>{line.itemDescription}</small>
            </span>
            <span>
              {line.totalQuantity} {line.unit}
            </span>
            <span>{line.availableQuantity}</span>
            <span>{line.unpackedQuantity}</span>
            <span>{line.reservedQuantity}</span>
            <strong>{line.shortfallQuantity}</strong>
            <span className={`stock-badge ${line.stockStatus.toLowerCase()}`}>
              {statusLabel[line.stockStatus]}
            </span>
            <span className="line-actions">
              {actionHref(line.suggestedAction, order.orderId, line) ? (
                <a
                  className="primary-button compact-action"
                  href={actionHref(line.suggestedAction, order.orderId, line)!}
                >
                  {actionLabel[line.suggestedAction]}
                </a>
              ) : (
                <span className="action-state">
                  {actionLabel[line.suggestedAction]}
                </span>
              )}
              {line.alternativeActions
                .filter((action) => action !== "NO_ACTION")
                .slice(0, 2)
                .map((action) => {
                  const href = actionHref(action, order.orderId, line);
                  return href ? (
                    <a className="alternative-action" href={href} key={action}>
                      {actionLabel[action]}
                    </a>
                  ) : (
                    <span
                      className="alternative-action is-disabled"
                      key={action}
                    >
                      {actionLabel[action]}
                    </span>
                  );
                })}
              {line.availableQuantity > 0 && line.remainingQuantity > 0 && (
                <span className="allocation-controls">
                  <input
                    aria-label={`Reserve quantity for ${line.sku}`}
                    type="number"
                    min="0.000001"
                    max={Math.min(
                      line.availableQuantity,
                      line.remainingQuantity,
                    )}
                    step="any"
                    value={
                      allocationDrafts[line.orderLineId] ??
                      Math.min(line.availableQuantity, line.remainingQuantity)
                    }
                    onChange={(event) =>
                      setAllocationDrafts((current) => ({
                        ...current,
                        [line.orderLineId]: event.target.valueAsNumber || 0,
                      }))
                    }
                  />
                  <button
                    className="primary-button compact-action"
                    disabled={
                      Boolean(mutating) ||
                      (allocationDrafts[line.orderLineId] ?? 1) <= 0
                    }
                    onClick={() => void reserve(line)}
                  >
                    {mutating === line.orderLineId ? "Reserving…" : "Reserve"}
                  </button>
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
      <div className="section-heading order-lines-heading">
        <h2>Allocation history</h2>
      </div>
      <div className="data-table" role="table" aria-label="Order allocations">
        <div className="allocation-row allocation-head" role="row">
          <span>Allocation</span>
          <span>SKU / item</span>
          <span>Quantity</span>
          <span>Status</span>
          <span>Notes</span>
          <span />
        </div>
        {allocations.map((allocation) => (
          <div
            className="allocation-row"
            role="row"
            key={allocation.allocationId}
          >
            <strong>{allocation.allocationId}</strong>
            <span>
              <strong>{allocation.sku}</strong>
              <small>{allocation.itemDescription}</small>
            </span>
            <span>
              {allocation.quantityAssigned} {allocation.unit}
            </span>
            <span>{allocation.cancelled ? "Cancelled" : "Active"}</span>
            <span>{allocation.notes || "—"}</span>
            <span>
              {!allocation.cancelled && order.status === "PENDING" && (
                <button
                  className="text-button danger-text"
                  disabled={Boolean(mutating)}
                  onClick={() => void cancel(allocation)}
                >
                  Cancel
                </button>
              )}
            </span>
          </div>
        ))}
        {allocations.length === 0 && (
          <div className="table-empty">No stock allocations yet.</div>
        )}
      </div>
    </section>
  );
};

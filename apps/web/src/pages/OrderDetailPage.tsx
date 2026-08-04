import { useEffect, useState } from "react";
import type { Order, OrderAction, OrderLine } from "@kv-infra/shared";

import { apiErrorMessage, getOrder, runOrderStockCheck } from "../api/client";

const statusLabel = {
  READY_TO_RESERVE: "Ready to reserve",
  NEEDS_PACKING: "Needs packing",
  NEEDS_SUPPLIER: "Needs supplier",
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
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    void getOrder(orderId)
      .then(setOrder)
      .catch((error) => setMessage(apiErrorMessage(error)));
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

  if (!order)
    return (
      <section className="page-panel">
        <p>{message || "Loading order…"}</p>
      </section>
    );

  return (
    <section className="page-panel">
      <a className="back-link" href="/orders">
        ← Orders
      </a>
      <div className="page-title-row detail-title">
        <div>
          <span className="eyebrow">{order.orderId}</span>
          <h1>{order.customerName}</h1>
        </div>
        <a
          className="secondary-button sheet-link"
          href={order.sheetUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open Google Sheet ↗
        </a>
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
          <strong>{order.volume} CBM</strong>
        </div>
      </div>
      {order.orderNotes && <div className="notice">{order.orderNotes}</div>}
      <div className="section-heading order-lines-heading">
        <h2>Stock check</h2>
        <button
          className="secondary-button"
          disabled={checking}
          onClick={checkStock}
        >
          {checking ? "Checking…" : "Refresh stock check"}
        </button>
      </div>
      {message && <div className="notice">{message}</div>}
      <div className="data-table" role="table" aria-label="Order stock check">
        <div className="order-stock-row order-stock-head" role="row">
          <span>SKU / item</span>
          <span>Required</span>
          <span>Available</span>
          <span>Unpacked</span>
          <span>Assigned</span>
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
            <span>{line.assignedQuantity}</span>
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
            </span>
          </div>
        ))}
      </div>
    </section>
  );
};

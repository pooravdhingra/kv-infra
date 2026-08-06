import { useEffect, useState } from "react";
import type { Order } from "@kv-infra/shared";

import { apiErrorMessage, listOrders } from "../api/client";

const readiness = (order: Order) => {
  if (order.items.every((item) => item.stockStatus === "FULLY_RESERVED")) {
    return { label: "Fully reserved", className: "fully_reserved" };
  }
  if (order.items.some((item) => item.stockStatus === "NEEDS_SUPPLIER")) {
    return { label: "Needs supplier", className: "needs_supplier" };
  }
  if (order.items.some((item) => item.stockStatus === "NEEDS_PACKING")) {
    return { label: "Needs packing", className: "needs_packing" };
  }
  return { label: "Ready to reserve", className: "ready_to_reserve" };
};

export const OrdersPage = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<"pending" | "completed">(
    "pending",
  );
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void listOrders()
      .then(setOrders)
      .catch((error) => setMessage(apiErrorMessage(error)))
      .finally(() => setLoading(false));
  }, []);
  const pendingOrders = orders.filter((order) => order.status === "PENDING");
  const completedOrders = orders.filter(
    (order) => order.status === "COMPLETED",
  );
  const visibleOrders =
    activeTab === "pending" ? pendingOrders : completedOrders;

  return (
    <section className="page-panel">
      <div className="page-title-row orders-title-row">
        <div>
          <h1>Orders</h1>
        </div>
        <a className="primary-button create-order-link" href="/orders/new">
          + Create new order
        </a>
      </div>

      <div className="order-tabs" role="tablist" aria-label="Order status">
        <button
          className={activeTab === "pending" ? "is-active" : ""}
          role="tab"
          aria-selected={activeTab === "pending"}
          onClick={() => setActiveTab("pending")}
        >
          Pending orders <span>{pendingOrders.length}</span>
        </button>
        <button
          className={activeTab === "completed" ? "is-active" : ""}
          role="tab"
          aria-selected={activeTab === "completed"}
          onClick={() => setActiveTab("completed")}
        >
          Completed orders <span>{completedOrders.length}</span>
        </button>
      </div>
      {message && <div className="notice error-notice">{message}</div>}
      {loading ? (
        <p>Loading orders…</p>
      ) : (
        <div className="data-table" role="table" aria-label="Pending orders">
          <div className="orders-row orders-head" role="row">
            <span>Order</span>
            <span>Customer</span>
            <span>Date received</span>
            <span>Lines</span>
            <span>Cartons</span>
            <span>Stock status</span>
            <span />
          </div>
          {visibleOrders.map((order) => {
            const status =
              order.status === "COMPLETED"
                ? { label: "Shipped", className: "shipped" }
                : readiness(order);
            return (
              <div className="orders-row" role="row" key={order.orderId}>
                <strong>{order.orderId}</strong>
                <span>{order.customerName}</span>
                <span>{order.dateReceived}</span>
                <span>{order.items.length}</span>
                <span>
                  {order.items.some((item) => item.quantityPerCarton <= 0)
                    ? "Missing"
                    : order.totalCartons}
                </span>
                <span className={`stock-badge ${status.className}`}>
                  {status.label}
                </span>
                <a
                  className="text-button"
                  href={`/orders/${encodeURIComponent(order.orderId)}`}
                >
                  View
                </a>
              </div>
            );
          })}
          {visibleOrders.length === 0 && (
            <div className="table-empty">No {activeTab} orders found.</div>
          )}
        </div>
      )}
    </section>
  );
};

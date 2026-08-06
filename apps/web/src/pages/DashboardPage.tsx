import { useEffect, useState } from "react";
import type { Dashboard } from "@kv-infra/shared";

import { apiErrorMessage, getDashboard } from "../api/client";

const quickActions = [
  ["New order", "Create and check customer demand", "/orders/new"],
  ["Receive material", "Log incoming supplier stock", "/receiving"],
  ["Start packing", "Move unpacked stock into QA", "/packing/start"],
  ["Create SKU", "Add a new item", "/skus"],
] as const;

const readinessLabel: Record<Dashboard["orders"][number]["readiness"], string> =
  {
    READY_TO_SHIP: "Ready to ship",
    NEEDS_SUPPLIER: "Needs supplier",
    NEEDS_PACKING: "Needs packing",
    READY_TO_RESERVE: "Ready to reserve",
    IN_PROGRESS: "In progress",
  };

const displayDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));

export const DashboardPage = () => {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getDashboard()
      .then(setDashboard)
      .catch((error) => setMessage(apiErrorMessage(error)));
  }, []);

  return (
    <>
      <section className="hero dashboard-hero">
        <span className="eyebrow">
          {new Intl.DateTimeFormat("en-IN", { dateStyle: "full" }).format(
            new Date(),
          )}
        </span>
      </section>

      {message && <div className="notice error-notice">{message}</div>}
      {!dashboard && !message && <p>Loading today’s operations…</p>}

      {dashboard && (
        <>
          <section
            className="dashboard-metrics"
            aria-label="Operations overview"
          >
            <a href="/orders">
              <span>Pending orders</span>
              <strong>{dashboard.summary.pendingOrders}</strong>
              <small>{dashboard.summary.readyToShipOrders} ready to ship</small>
            </a>
            <a href="/supplier-requests">
              <span>Supplier shortfalls</span>
              <strong>{dashboard.summary.supplierShortfallLines}</strong>
              <small>{dashboard.summary.dueFollowUps} follow-ups due</small>
            </a>
            <a href="/packing">
              <span>In packing</span>
              <strong>{dashboard.summary.activePackingSessions}</strong>
              <small>{dashboard.summary.unpackedSkus} SKUs unpacked</small>
            </a>
            <a href="/supplier-requests">
              <span>Send failures</span>
              <strong>{dashboard.summary.sendFailures}</strong>
              <small>WhatsApp requests</small>
            </a>
            <a href="/orders">
              <span>Completed orders</span>
              <strong>{dashboard.summary.completedOrders}</strong>
              <small>Browsable history</small>
            </a>
          </section>

          <section className="section dashboard-action-section">
            <div className="section-heading">
              <h2>Recommended next steps</h2>
              <span>{dashboard.actions.length} actions</span>
            </div>
            <div className="dashboard-action-list">
              {dashboard.actions.map((action, index) => (
                <a
                  className={`dashboard-action-row tone-${action.tone.toLowerCase()}`}
                  href={action.href}
                  key={action.id}
                >
                  <span className="dashboard-action-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <strong>{action.title}</strong>
                    <small>{action.detail}</small>
                  </span>
                  <span className="arrow">→</span>
                </a>
              ))}
            </div>
          </section>

          <section className="section dashboard-columns">
            <div className="dashboard-panel">
              <div className="section-heading">
                <h2>Current orders</h2>
                <a href="/orders">View all →</a>
              </div>
              <div className="dashboard-order-list">
                {dashboard.orders.map((order) => (
                  <a
                    href={`/orders/${encodeURIComponent(order.orderId)}`}
                    className="dashboard-order-row"
                    key={order.orderId}
                  >
                    <span>
                      <strong>{order.customerName}</strong>
                      <small>
                        {order.orderId} · {displayDate(order.dateReceived)}
                      </small>
                    </span>
                    <span>
                      <strong>{order.totalCartons}</strong>
                      <small>cartons</small>
                    </span>
                    <span
                      className={`stock-badge ${order.readiness.toLowerCase()}`}
                    >
                      {readinessLabel[order.readiness]}
                    </span>
                  </a>
                ))}
                {dashboard.orders.length === 0 && (
                  <div className="dashboard-empty">No pending orders.</div>
                )}
              </div>
            </div>

            <div className="dashboard-panel">
              <div className="section-heading">
                <h2>Recent activity</h2>
                <span>Receiving and packing</span>
              </div>
              <div className="dashboard-activity-list">
                {dashboard.activity.map((activity) => (
                  <a
                    href={activity.href}
                    key={`${activity.kind}-${activity.id}`}
                  >
                    <span
                      className={`activity-mark ${activity.kind.toLowerCase()}`}
                    />
                    <span>
                      <strong>{activity.title}</strong>
                      <small>{activity.detail}</small>
                    </span>
                    <time>{displayDate(activity.date)}</time>
                  </a>
                ))}
                {dashboard.activity.length === 0 && (
                  <div className="dashboard-empty">
                    No activity recorded yet.
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      )}

      <section className="section">
        <div className="section-heading">
          <h2>Quick actions</h2>
        </div>
        <div className="dashboard-quick-grid">
          {quickActions.map(([title, description, href]) => (
            <a href={href} key={title}>
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
              <span className="arrow">→</span>
            </a>
          ))}
        </div>
      </section>
    </>
  );
};

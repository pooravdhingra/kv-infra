import { useEffect, useState } from "react";
import type { SupplierRequest } from "@kv-infra/shared";

import {
  apiErrorMessage,
  disableSupplierFollowUps,
  listSupplierRequests,
  markSupplierRequestConfirmed,
  markSupplierRequestReceived,
  sendDueSupplierFollowUps,
  sendSupplierFollowUp,
  retrySupplierRequest,
} from "../api/client";

const displayDate = (value: string | null) =>
  value ? new Date(value).toLocaleString() : "—";

export const SupplierRequestsPage = () => {
  const created = new URLSearchParams(window.location.search).get("created");
  const [requests, setRequests] = useState<SupplierRequest[]>([]);
  const [message, setMessage] = useState(
    created === "group"
      ? "Approved supplier requests processed."
      : created
        ? "Supplier request recorded."
        : "",
  );
  const [busy, setBusy] = useState("");

  const refresh = async () => setRequests(await listSupplierRequests());

  useEffect(() => {
    void refresh().catch((error) => setMessage(apiErrorMessage(error)));
  }, []);

  const run = async (
    key: string,
    action: () => Promise<SupplierRequest | SupplierRequest[]>,
    success: string,
  ) => {
    setBusy(key);
    setMessage("");
    try {
      await action();
      await refresh();
      setMessage(success);
    } catch (error) {
      setMessage(apiErrorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const pending = requests.filter((request) => request.status !== "RECEIVED");

  return (
    <section className="page-panel">
      <div className="page-title-row orders-title-row">
        <div>
          <h1>Supplier requests</h1>
        </div>
        <button
          className="primary-button"
          aria-busy={busy === "due"}
          disabled={Boolean(busy)}
          onClick={() =>
            void run(
              "due",
              sendDueSupplierFollowUps,
              "All currently due follow-ups were processed.",
            )
          }
        >
          Send all due follow-ups
        </button>
      </div>
      {message && <div className="notice">{message}</div>}
      <div className="metric-grid request-metrics">
        <div className="metric-primary">
          <span>Pending</span>
          <strong>{pending.length}</strong>
        </div>
        <div>
          <span>Confirmed</span>
          <strong>
            {
              requests.filter((request) => request.status === "CONFIRMED")
                .length
            }
          </strong>
        </div>
        <div>
          <span>Send failures</span>
          <strong>
            {
              requests.filter((request) => request.status === "SEND FAILED")
                .length
            }
          </strong>
        </div>
      </div>
      <div className="data-table" role="table" aria-label="Supplier requests">
        <div className="supplier-request-row supplier-request-head" role="row">
          <span>Request / order</span>
          <span>SKU / item</span>
          <span>Supplier</span>
          <span>Pending qty</span>
          <span>Status</span>
          <span>Next follow-up</span>
          <span>Actions</span>
        </div>
        {requests.map((request) => (
          <div
            className="supplier-request-row"
            role="row"
            key={request.requestId}
          >
            <span>
              <strong>{request.requestId}</strong>
              <a href={`/orders/${request.orderId}`}>{request.orderId}</a>
            </span>
            <span>
              <strong>{request.sku}</strong>
              <small>{request.itemDescription}</small>
            </span>
            <span>
              <strong>{request.selectedSupplier}</strong>
              <small>Priority {request.supplierPriority}</small>
            </span>
            <span>
              {request.shortfallQuantity} {request.unit}
            </span>
            <span
              className={`request-status ${request.status.toLowerCase().replace(" ", "-")}`}
            >
              {request.status}
            </span>
            <span>
              {displayDate(request.nextFollowUpAt)}
              <small>{request.followUpNumber} follow-ups sent</small>
            </span>
            <span className="request-actions">
              {request.status === "SEND FAILED" && (
                <button
                  className="text-button"
                  aria-busy={busy === `${request.requestId}-retry`}
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void run(
                      `${request.requestId}-retry`,
                      () => retrySupplierRequest(request.requestId),
                      `${request.requestId} sent successfully.`,
                    )
                  }
                >
                  Retry send
                </button>
              )}
              {request.status !== "RECEIVED" && request.autoFollowUpEnabled && (
                <button
                  className="text-button"
                  aria-busy={busy === `${request.requestId}-follow-up`}
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void run(
                      `${request.requestId}-follow-up`,
                      () => sendSupplierFollowUp(request.requestId),
                      `Follow-up sent for ${request.requestId}.`,
                    )
                  }
                >
                  Follow up
                </button>
              )}
              {request.status === "SENT" && (
                <button
                  className="text-button"
                  aria-busy={busy === `${request.requestId}-confirm`}
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void run(
                      `${request.requestId}-confirm`,
                      () => markSupplierRequestConfirmed(request.requestId),
                      `${request.requestId} marked confirmed.`,
                    )
                  }
                >
                  Confirm
                </button>
              )}
              {request.status !== "RECEIVED" && (
                <button
                  className="text-button"
                  aria-busy={busy === `${request.requestId}-received`}
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void run(
                      `${request.requestId}-received`,
                      () => markSupplierRequestReceived(request.requestId),
                      `${request.requestId} marked received.`,
                    )
                  }
                >
                  Received
                </button>
              )}
              {request.autoFollowUpEnabled && request.status !== "RECEIVED" && (
                <button
                  className="text-button danger-text"
                  aria-busy={busy === `${request.requestId}-stop`}
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void run(
                      `${request.requestId}-stop`,
                      () =>
                        disableSupplierFollowUps(
                          request.requestId,
                          "Disabled by operator",
                        ),
                      `Follow-ups disabled for ${request.requestId}.`,
                    )
                  }
                >
                  Stop follow-ups
                </button>
              )}
            </span>
          </div>
        ))}
        {requests.length === 0 && (
          <div className="table-empty">No supplier requests recorded yet.</div>
        )}
      </div>
    </section>
  );
};

import {
  initialOrderMessage,
  type OrderLine,
  type Supplier,
} from "@kv-infra/shared";
import { useEffect, useState } from "react";

import {
  apiErrorMessage,
  createBulkSupplierRequests,
  getOrder,
  listSuppliers,
} from "../api/client";

type RequestDraft = {
  line: OrderLine;
  suppliers: Supplier[];
  supplierNumber: string;
  quantity: number;
  messageBody: string;
  autoFollowUpEnabled: boolean;
  notes: string;
  approved: boolean;
  sent: boolean;
  error: string;
};

const messageFor = (line: OrderLine, quantity: number) =>
  initialOrderMessage([
    {
      itemDescription: line.itemDescription,
      quantity,
      unit: line.unit,
    },
  ]);

export const GroupSupplierRequestsPage = () => {
  const orderId =
    new URLSearchParams(window.location.search).get("orderId") ?? "";
  const [customerName, setCustomerName] = useState("");
  const [drafts, setDrafts] = useState<RequestDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!orderId) {
      setMessage("Open this page from an order with supplier shortfalls.");
      setLoading(false);
      return;
    }
    void getOrder(orderId)
      .then(async (order) => {
        if (order.status === "COMPLETED")
          throw new Error("Completed orders cannot create supplier requests.");
        setCustomerName(order.customerName);
        const lines = order.items.filter(
          (line) =>
            line.shortfallQuantity > 0 &&
            (!line.supplierRequestStatus ||
              line.supplierRequestStatus === "RECEIVED"),
        );
        const suppliers = await Promise.all(
          lines.map((line) => listSuppliers(line.sku)),
        );
        setDrafts(
          lines.map((line, index) => ({
            line,
            suppliers: suppliers[index] ?? [],
            supplierNumber: suppliers[index]?.[0]?.number ?? "",
            quantity: line.shortfallQuantity,
            messageBody: messageFor(line, line.shortfallQuantity),
            autoFollowUpEnabled: true,
            notes: "",
            approved: false,
            sent: false,
            error:
              suppliers[index]?.length === 0
                ? "No supplier is configured for this SKU."
                : "",
          })),
        );
        if (lines.length === 0)
          setMessage(
            "No unrequested supplier shortfalls remain on this order.",
          );
      })
      .catch((error) => setMessage(apiErrorMessage(error)))
      .finally(() => setLoading(false));
  }, [orderId]);

  const updateDraft = (index: number, values: Partial<RequestDraft>) =>
    setDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, ...values } : draft,
      ),
    );

  const sendAll = async () => {
    setSaving(true);
    setMessage("");
    try {
      await createBulkSupplierRequests({
        requests: drafts
          .filter((draft) => !draft.sent)
          .map((draft) => ({
            orderId,
            orderLineId: draft.line.orderLineId,
            supplierNumber: draft.supplierNumber,
            quantity: draft.quantity,
            messageBody: draft.messageBody,
            autoFollowUpEnabled: draft.autoFollowUpEnabled,
            notes: draft.notes,
          })),
      });
      window.location.assign("/supplier-requests?created=group");
    } catch (error) {
      setMessage(apiErrorMessage(error));
      setDrafts((current) =>
        current.map((draft) => ({ ...draft, approved: false })),
      );
      setSaving(false);
    }
  };

  const readyToSend =
    drafts.length > 0 &&
    drafts.every(
      (draft) =>
        draft.sent ||
        (draft.approved &&
          draft.supplierNumber &&
          draft.quantity > 0 &&
          draft.quantity <= draft.line.shortfallQuantity &&
          draft.messageBody.trim()),
    ) &&
    drafts.some((draft) => !draft.sent);

  return (
    <section className="page-panel group-request-page">
      <a
        className="back-link"
        href={orderId ? `/orders/${orderId}` : "/orders"}
      >
        ← Order
      </a>
      <div className="page-title-row orders-title-row">
        <div>
          <h1>Review supplier requests</h1>
          {customerName && (
            <p className="lead compact-lead">
              {orderId} · {customerName}
            </p>
          )}
        </div>
        <button
          className="primary-button"
          disabled={saving || !readyToSend}
          onClick={() => void sendAll()}
        >
          {saving ? "Sending approved requests…" : "Send all approved"}
        </button>
      </div>
      <div className="notice">
        Review every message and tick its approval box. Nothing is sent until
        all displayed requests are approved.
      </div>
      {message && <div className="notice error-notice">{message}</div>}
      {loading ? (
        <p>Preparing supplier requests…</p>
      ) : (
        <div className="group-request-list">
          {drafts.map((draft, index) => (
            <article
              className={`group-request-card ${draft.approved ? "is-approved" : ""} ${draft.sent ? "is-sent" : ""}`}
              key={draft.line.orderLineId}
            >
              <label className="group-approval">
                <input
                  type="checkbox"
                  checked={draft.approved || draft.sent}
                  disabled={
                    saving ||
                    draft.sent ||
                    !draft.supplierNumber ||
                    draft.suppliers.length === 0
                  }
                  onChange={(event) =>
                    updateDraft(index, { approved: event.target.checked })
                  }
                />
                <span>{draft.sent ? "Sent" : "Approve"}</span>
              </label>
              <div className="group-request-fields">
                <div className="request-item-summary">
                  <strong>{draft.line.itemDescription}</strong>
                  <span>{draft.line.sku}</span>
                  <span>
                    Shortfall: {draft.line.shortfallQuantity} {draft.line.unit}
                  </span>
                </div>
                <div className="group-request-grid">
                  <label>
                    Supplier
                    <select
                      value={draft.supplierNumber}
                      disabled={saving || draft.sent}
                      onChange={(event) =>
                        updateDraft(index, {
                          supplierNumber: event.target.value,
                          approved: false,
                        })
                      }
                    >
                      {draft.suppliers.length === 0 && (
                        <option value="">No supplier configured</option>
                      )}
                      {draft.suppliers.map((supplier) => (
                        <option value={supplier.number} key={supplier.number}>
                          {supplier.name} — Priority {supplier.priority}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Quantity requested
                    <input
                      type="number"
                      min="0.000001"
                      max={draft.line.shortfallQuantity}
                      step="any"
                      value={draft.quantity || ""}
                      disabled={saving || draft.sent}
                      onChange={(event) => {
                        const quantity = event.target.valueAsNumber || 0;
                        updateDraft(index, {
                          quantity,
                          messageBody: messageFor(draft.line, quantity),
                          approved: false,
                        });
                      }}
                    />
                  </label>
                </div>
                <label>
                  WhatsApp message
                  <textarea
                    className="message-preview"
                    required
                    maxLength={4000}
                    value={draft.messageBody}
                    disabled={saving || draft.sent}
                    onChange={(event) =>
                      updateDraft(index, {
                        messageBody: event.target.value,
                        approved: false,
                      })
                    }
                  />
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={draft.autoFollowUpEnabled}
                    disabled={saving || draft.sent}
                    onChange={(event) =>
                      updateDraft(index, {
                        autoFollowUpEnabled: event.target.checked,
                        approved: false,
                      })
                    }
                  />
                  Send follow-ups every three days until received
                </label>
                <label>
                  Internal notes
                  <textarea
                    value={draft.notes}
                    disabled={saving || draft.sent}
                    onChange={(event) =>
                      updateDraft(index, {
                        notes: event.target.value,
                        approved: false,
                      })
                    }
                  />
                </label>
                {draft.error && (
                  <div className="notice error-notice">{draft.error}</div>
                )}
              </div>
            </article>
          ))}
          {drafts.length === 0 && (
            <div className="table-empty">No supplier requests to prepare.</div>
          )}
        </div>
      )}
    </section>
  );
};

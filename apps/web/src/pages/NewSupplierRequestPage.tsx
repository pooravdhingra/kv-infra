import {
  initialOrderMessage,
  type Order,
  type Supplier,
} from "@kv-infra/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  apiErrorMessage,
  createSupplierRequest,
  getOrder,
  listSuppliers,
} from "../api/client";

export const NewSupplierRequestPage = () => {
  const query = new URLSearchParams(window.location.search);
  const orderId = query.get("orderId") ?? "";
  const orderLineId = query.get("orderLineId") ?? "";
  const [order, setOrder] = useState<Order | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierNumber, setSupplierNumber] = useState("");
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [quantity, setQuantity] = useState(0);
  const [messageBody, setMessageBody] = useState("");
  const [autoFollowUpEnabled, setAutoFollowUpEnabled] = useState(true);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const line = useMemo(
    () => order?.items.find((item) => item.orderLineId === orderLineId),
    [order, orderLineId],
  );

  useEffect(() => {
    if (!orderId || !orderLineId) {
      setMessage("Open this page from an order line that needs a supplier.");
      return;
    }
    void getOrder(orderId)
      .then(setOrder)
      .catch((error) => setMessage(apiErrorMessage(error)));
  }, [orderId, orderLineId]);

  useEffect(() => {
    if (!line) return;
    setQuantity(line.shortfallQuantity);
    setMessageBody(
      initialOrderMessage([
        {
          itemDescription: line.itemDescription,
          quantity: line.shortfallQuantity,
          unit: line.unit,
        },
      ]),
    );
    setSuppliersLoading(true);
    void listSuppliers(line.sku)
      .then((items) => {
        setSuppliers(items);
        setSupplierNumber(items[0]?.number ?? "");
      })
      .catch((error) => setMessage(apiErrorMessage(error)))
      .finally(() => setSuppliersLoading(false));
  }, [line?.orderLineId]);

  const changeQuantity = (next: number) => {
    setQuantity(next);
    if (line)
      setMessageBody(
        initialOrderMessage([
          {
            itemDescription: line.itemDescription,
            quantity: next,
            unit: line.unit,
          },
        ]),
      );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!line || !supplierNumber) return;
    setSaving(true);
    setMessage("");
    try {
      const created = await createSupplierRequest({
        orderId,
        orderLineId,
        supplierNumber,
        quantity,
        messageBody,
        autoFollowUpEnabled,
        notes,
      });
      window.location.assign(
        `/supplier-requests?created=${encodeURIComponent(created.requestId)}`,
      );
    } catch (error) {
      setMessage(apiErrorMessage(error));
      setSaving(false);
    }
  };

  return (
    <section className="page-panel narrow-panel">
      <div className="workflow-nav">
        <a
          className="back-link"
          href={orderId ? `/orders/${orderId}` : "/orders"}
        >
          ← Order
        </a>
      </div>
      <h1>New supplier request</h1>
      {line && (
        <div className="request-item-summary">
          <strong>{line.itemDescription}</strong>
          <span>{line.sku}</span>
          <span>
            Current shortfall: {line.shortfallQuantity} {line.unit}
          </span>
        </div>
      )}
      <form className="sku-form workflow-form" onSubmit={submit}>
        <label>
          Supplier
          <select
            required
            value={supplierNumber}
            disabled={!line || suppliers.length === 0}
            onChange={(event) => setSupplierNumber(event.target.value)}
          >
            {suppliers.length === 0 && (
              <option value="">
                {suppliersLoading
                  ? "Loading suppliers…"
                  : "No supplier configured"}
              </option>
            )}
            {suppliers.map((supplier) => (
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
            max={line?.shortfallQuantity}
            step="any"
            required
            value={quantity || ""}
            onChange={(event) =>
              changeQuantity(event.target.valueAsNumber || 0)
            }
          />
        </label>
        <label>
          WhatsApp message
          <textarea
            className="message-preview"
            required
            maxLength={4000}
            value={messageBody}
            onChange={(event) => setMessageBody(event.target.value)}
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={autoFollowUpEnabled}
            onChange={(event) => setAutoFollowUpEnabled(event.target.checked)}
          />
          Send follow-ups every three days until received
        </label>
        <label>
          Internal notes
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        {message && <div className="notice error-notice">{message}</div>}
        <button
          className="primary-button"
          disabled={
            saving || !line || !supplierNumber || quantity <= 0 || !messageBody
          }
        >
          {saving ? "Sending…" : "Send WhatsApp request"}
        </button>
      </form>
    </section>
  );
};

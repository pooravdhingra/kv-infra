import { useEffect, useState, type FormEvent } from "react";
import type { OpenOrderOption } from "@kv-infra/shared";

import {
  apiErrorMessage,
  listOpenOrderOptions,
  listPacking,
  startPacking,
} from "../api/client";

const today = () => new Date().toLocaleDateString("en-CA");
type InventoryChoice = Awaited<
  ReturnType<typeof listPacking>
>["unpackedInventory"][number];

export const StartPackingPage = () => {
  const query = new URLSearchParams(window.location.search);
  const [inventory, setInventory] = useState<InventoryChoice[]>([]);
  const [sku, setSku] = useState(query.get("sku") ?? "");
  const [date, setDate] = useState(today);
  const [quantity, setQuantity] = useState(0);
  const [options, setOptions] = useState<OpenOrderOption[]>([]);
  const [orderLineId, setOrderLineId] = useState(
    query.get("orderLineId") ?? "",
  );
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void listPacking()
      .then((data) => setInventory(data.unpackedInventory))
      .catch((error) => setMessage(apiErrorMessage(error)));
  }, []);
  useEffect(() => {
    if (!sku) {
      setOptions([]);
      setOrderLineId("");
      return;
    }
    void listOpenOrderOptions(sku)
      .then((items) => {
        setOptions(items);
        setOrderLineId((current) =>
          items.some((item) => item.orderLineId === current) ? current : "",
        );
      })
      .catch((error) => setMessage(apiErrorMessage(error)));
  }, [sku]);

  const selected = inventory.find((item) => item.sku === sku);
  const selectedOrder = options.find(
    (item) => item.orderLineId === orderLineId,
  );
  const maxQuantity = Math.min(
    selected?.unpackedQuantity ?? 0,
    selectedOrder?.remainingQuantity ?? Number.POSITIVE_INFINITY,
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) {
      setMessage("Select an SKU with unpacked stock.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const session = await startPacking({
        date,
        sku,
        quantityTaken: quantity,
        notes,
        ...(selectedOrder
          ? {
              orderId: selectedOrder.orderId,
              orderLineId: selectedOrder.orderLineId,
            }
          : {}),
      });
      window.location.assign(
        `/packing/${encodeURIComponent(session.packingId)}/finish`,
      );
    } catch (error) {
      setMessage(apiErrorMessage(error));
      setSaving(false);
    }
  };

  return (
    <section className="page-panel narrow-panel">
      <div className="workflow-nav">
        <a className="back-link" href="/packing">
          ← Packing
        </a>
      </div>
      <h1>Start packing</h1>
      <form className="sku-form workflow-form" onSubmit={submit}>
        <label>
          SKU
          <input
            list="packing-sku-options"
            placeholder="Type or select an SKU"
            value={sku}
            onChange={(event) => {
              setSku(event.target.value.toUpperCase());
              setQuantity(0);
            }}
            required
          />
          <datalist id="packing-sku-options">
            {inventory.map((item) => (
              <option key={item.sku} value={item.sku}>
                {item.itemDescription}
              </option>
            ))}
          </datalist>
        </label>
        <div className="selected-item-line">
          {selected ? (
            <>
              <strong>{selected.itemDescription}</strong>
              <span>
                {selected.unpackedQuantity} {selected.unit} unpacked
              </span>
            </>
          ) : (
            <span>Select an SKU with unpacked stock</span>
          )}
        </div>
        <div className="form-grid">
          <label>
            Date
            <input
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label>
            Quantity taken
            <input
              type="number"
              required
              min="0.000001"
              max={Number.isFinite(maxQuantity) ? maxQuantity : undefined}
              step="any"
              value={quantity || ""}
              onChange={(event) => setQuantity(event.target.valueAsNumber || 0)}
            />
          </label>
        </div>
        <label>
          Assign to order after packing
          <select
            value={orderLineId}
            disabled={!selected}
            onChange={(event) => {
              setOrderLineId(event.target.value);
              setQuantity(0);
            }}
          >
            <option value="">General stock — do not assign</option>
            {options.map((option) => (
              <option key={option.orderLineId} value={option.orderLineId}>
                {option.orderId} — {option.customerName} —{" "}
                {option.remainingQuantity} remaining
              </option>
            ))}
          </select>
        </label>
        <label>
          Notes
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        {message && <div className="notice error-notice">{message}</div>}
        <button
          className="primary-button"
          disabled={
            saving || !selected || quantity <= 0 || quantity > maxQuantity
          }
        >
          {saving ? "Starting…" : "Start packing"}
        </button>
      </form>
    </section>
  );
};

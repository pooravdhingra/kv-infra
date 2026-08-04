import { useEffect, useState, type FormEvent } from "react";
import type {
  InventoryItem,
  ManualInventoryAdjustment,
} from "@kv-infra/shared";

import {
  adjustInventory,
  apiErrorMessage,
  getInventoryItem,
} from "../api/client";

const emptyAdjustment = {
  unpackedDelta: 0,
  inPackingDelta: 0,
  packedCartonsDelta: 0,
  totalAssignedDelta: 0,
  defectiveShortDelta: 0,
  warehouseLocation: "",
  reason: "",
};

type AdjustmentForm = typeof emptyAdjustment;

export const InventoryDetailPage = ({ sku }: { sku: string }) => {
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<AdjustmentForm>(emptyAdjustment);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getInventoryItem(sku)
      .then(setItem)
      .catch((error) => setMessage(apiErrorMessage(error)));
  }, [sku]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const input: ManualInventoryAdjustment = {
        sku,
        ...form,
        warehouseLocation: form.warehouseLocation.trim() || undefined,
      };
      const updated = await adjustInventory(input);
      setItem(updated);
      setForm(emptyAdjustment);
      setMessage("Inventory adjustment saved with an audit note.");
    } catch (error) {
      setMessage(apiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (!item) {
    return (
      <section className="page-panel">
        <p>{message || "Loading inventory item…"}</p>
      </section>
    );
  }

  const fields = [
    ["Unpacked", item.unpackedQuantity],
    ["In packing", item.inPackingQuantity],
    ["Packed cartons", item.packedCartons],
    ["Packed total", item.packedTotalQuantity],
    ["Assigned", item.totalAssigned],
    ["Available", item.availableQuantity],
    ["Defective / short", item.defectiveShortQuantity],
  ] as const;
  const deltaFields = [
    ["unpackedDelta", "Unpacked change"],
    ["inPackingDelta", "In-packing change"],
    ["packedCartonsDelta", "Packed cartons change"],
    ["totalAssignedDelta", "Assigned change"],
    ["defectiveShortDelta", "Defective / short change"],
  ] as const;

  return (
    <section className="page-panel">
      <a className="back-link" href="/inventory">
        ← Inventory
      </a>
      <div className="page-title-row detail-title">
        <div>
          <h1>{item.itemDescription}</h1>
        </div>
        <span>
          {item.quantityPerCarton} {item.unit} / CTN
        </span>
      </div>
      <div className="metric-grid inventory-metrics">
        {fields.map(([label, value]) => (
          <div
            className={label === "Available" ? "metric-primary" : ""}
            key={label}
          >
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="detail-columns">
        <dl className="result-list detail-list">
          <div>
            <dt>Location</dt>
            <dd>{item.warehouseLocation || "—"}</dd>
          </div>
          <div>
            <dt>Last received</dt>
            <dd>{item.lastReceivedDate || "—"}</dd>
          </div>
          <div>
            <dt>Last packed</dt>
            <dd>{item.lastPackedDate || "—"}</dd>
          </div>
          <div>
            <dt>Last updated</dt>
            <dd>{item.lastUpdated || "—"}</dd>
          </div>
          <div>
            <dt>Notes</dt>
            <dd>{item.notes || "—"}</dd>
          </div>
        </dl>
        <form className="sku-form adjustment-form" onSubmit={submit}>
          <div className="section-heading">
            <h2>Manual adjustment</h2>
            <span>Use + or − values</span>
          </div>
          <div className="form-grid">
            {deltaFields.map(([name, label]) => (
              <label key={name}>
                {label}
                <input
                  type="number"
                  step="any"
                  value={form[name]}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      [name]: event.target.valueAsNumber || 0,
                    })
                  }
                />
              </label>
            ))}
          </div>
          <label>
            Warehouse location
            <input
              value={form.warehouseLocation}
              onChange={(event) =>
                setForm({ ...form, warehouseLocation: event.target.value })
              }
            />
          </label>
          <label>
            Reason{" "}
            <input
              required
              minLength={3}
              value={form.reason}
              placeholder="Required for the audit trail"
              onChange={(event) =>
                setForm({ ...form, reason: event.target.value })
              }
            />
          </label>
          {message && <div className="notice">{message}</div>}
          <button className="primary-button" disabled={saving}>
            {saving ? "Saving…" : "Save adjustment"}
          </button>
        </form>
      </div>
    </section>
  );
};

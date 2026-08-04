import { useEffect, useState, type FormEvent } from "react";
import { skuOems, skuUnits, type Sku, type SkuOem } from "@kv-infra/shared";

import {
  apiErrorMessage,
  createSku,
  deleteSku,
  listSkus,
  updateSku,
} from "../api/client";

const emptySku: Sku = {
  sku: "",
  itemDescription: "",
  quantityPerCarton: 1,
  unit: "pcs",
  weightPerCarton: 0,
  length: 0,
  breadth: 0,
  height: 0,
};

const numberFields = [
  ["quantityPerCarton", "Quantity / CTN"],
  ["weightPerCarton", "Weight / CTN (kg)"],
  ["length", "Length (cm)"],
  ["breadth", "Breadth (cm)"],
  ["height", "Height (cm)"],
] as const;

export const SkuMasterPage = () => {
  const [skus, setSkus] = useState<Sku[]>([]);
  const [form, setForm] = useState<Sku>(emptySku);
  const [oem, setOem] = useState<SkuOem>("Bajaj");
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formCollapsed, setFormCollapsed] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setSkus(await listSkus());
    } catch (error) {
      setMessage(apiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => void load(), []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      if (editing) {
        const { sku, ...updates } = form;
        await updateSku(sku, updates);
        setMessage(`${sku} updated.`);
      } else {
        const { sku: _sku, ...details } = form;
        const created = await createSku({ ...details, oem });
        setMessage(`${created.sku} created with its inventory row.`);
      }
      setForm(emptySku);
      setOem("Bajaj");
      setEditing(false);
      await load();
    } catch (error) {
      setMessage(apiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const filtered = skus.filter((sku) =>
    `${sku.sku} ${sku.itemDescription}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  const remove = async () => {
    if (!editing) return;
    const sku = form.sku;
    const confirmed = window.confirm(
      `Delete ${sku}? It will be removed from active SKU and Inventory views.`,
    );
    if (!confirmed) return;

    setSaving(true);
    setMessage("");
    try {
      await deleteSku(sku);
      setForm(emptySku);
      setEditing(false);
      setMessage(`${sku} deleted.`);
      await load();
    } catch (error) {
      setMessage(apiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page-panel">
      <div className="page-title-row">
        <div>
          <h1>SKU master</h1>
        </div>
        <span>{skus.length} SKUs</span>
      </div>

      <div className={`master-layout ${formCollapsed ? "form-collapsed" : ""}`}>
        <div className="sku-list-panel">
          <input
            className="search-input"
            aria-label="Search SKU or item description"
            placeholder="Search SKU / item description"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {loading ? (
            <p>Loading…</p>
          ) : (
            <div className="data-table" role="table" aria-label="SKU list">
              <div className="table-row table-head" role="row">
                <span>SKU</span>
                <span>Item description</span>
                <span>Qty / CTN</span>
                <span>Unit</span>
                <span>Weight / CTN (kg)</span>
                <span>Length</span>
                <span>Breadth</span>
                <span>Height</span>
                <span />
              </div>
              {filtered.map((sku) => (
                <div className="table-row" role="row" key={sku.sku}>
                  <strong>{sku.sku}</strong>
                  <span>{sku.itemDescription}</span>
                  <span>{sku.quantityPerCarton}</span>
                  <span>{sku.unit}</span>
                  <span>{sku.weightPerCarton} kg</span>
                  <span>{sku.length} cm</span>
                  <span>{sku.breadth} cm</span>
                  <span>{sku.height} cm</span>
                  <button
                    className="text-button"
                    onClick={() => {
                      setForm(sku);
                      setEditing(true);
                      setFormCollapsed(false);
                      setMessage("");
                    }}
                  >
                    Edit
                  </button>
                </div>
              ))}
              {!loading && filtered.length === 0 && (
                <div className="table-empty">No SKUs found.</div>
              )}
            </div>
          )}
        </div>

        <aside
          className={`sku-form-panel ${formCollapsed ? "is-collapsed" : ""}`}
        >
          <button
            type="button"
            className="form-collapse-button"
            aria-expanded={!formCollapsed}
            aria-controls="sku-editor"
            onClick={() => setFormCollapsed((collapsed) => !collapsed)}
          >
            {formCollapsed ? "← Add SKU" : "Hide form →"}
          </button>
          <form id="sku-editor" className="sku-form" onSubmit={submit}>
            <div className="section-heading">
              <h2>{editing ? `Edit ${form.sku}` : "Create new SKU"}</h2>
              {editing && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setEditing(false);
                    setForm(emptySku);
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
            {editing && (
              <label>
                SKU
                <input value={form.sku} disabled />
              </label>
            )}
            {!editing && (
              <label>
                OEM
                <select
                  value={oem}
                  onChange={(event) => setOem(event.target.value as SkuOem)}
                >
                  {skuOems.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Item description
              <input
                value={form.itemDescription}
                required
                onChange={(event) =>
                  setForm({ ...form, itemDescription: event.target.value })
                }
              />
            </label>
            <label>
              Unit
              <select
                value={form.unit}
                onChange={(event) =>
                  setForm({ ...form, unit: event.target.value as Sku["unit"] })
                }
              >
                {skuUnits.map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              {numberFields.map(([name, label]) => (
                <label key={name}>
                  {label}
                  <input
                    type="number"
                    min={name === "quantityPerCarton" ? "0.000001" : "0"}
                    step="any"
                    required
                    value={form[name]}
                    onChange={(event) =>
                      setForm({ ...form, [name]: event.target.valueAsNumber })
                    }
                  />
                </label>
              ))}
            </div>
            {message && <div className="notice">{message}</div>}
            <div className="sku-form-actions">
              <button className="primary-button" disabled={saving}>
                {saving ? "Saving…" : editing ? "Save changes" : "Save SKU"}
              </button>
              {editing && (
                <button
                  type="button"
                  className="danger-button"
                  disabled={saving}
                  onClick={remove}
                >
                  Delete SKU
                </button>
              )}
            </div>
          </form>
        </aside>
      </div>
    </section>
  );
};

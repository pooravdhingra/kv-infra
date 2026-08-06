import { useEffect, useRef, useState, type FormEvent } from "react";
import { skuOems, skuUnits, type Sku, type SkuOem } from "@kv-infra/shared";

import {
  apiErrorMessage,
  createSku,
  deleteSku,
  listSkus,
  updateSku,
} from "../api/client";

type NumericSkuField =
  "quantityPerCarton" | "weightPerCarton" | "length" | "breadth" | "height";

type SkuForm = Omit<Sku, NumericSkuField> &
  Record<NumericSkuField, number | "">;

const emptySku: SkuForm = {
  sku: "",
  itemDescription: "",
  quantityPerCarton: "",
  unit: "pcs",
  weightPerCarton: "",
  length: "",
  breadth: "",
  height: "",
};

const numberFields = [
  ["quantityPerCarton", "Quantity / CTN"],
  ["weightPerCarton", "Weight / CTN (kg)"],
  ["length", "Length (cm)"],
  ["breadth", "Breadth (cm)"],
  ["height", "Height (cm)"],
] as const;

const skuToForm = (sku: Sku): SkuForm => ({
  ...sku,
  quantityPerCarton: sku.quantityPerCarton || "",
  weightPerCarton: sku.weightPerCarton || "",
  length: sku.length || "",
  breadth: sku.breadth || "",
  height: sku.height || "",
});

const displayPackingValue = (value: number, suffix = "") =>
  value > 0 ? `${value}${suffix}` : "Missing";

export const SkuMasterPage = () => {
  const [skus, setSkus] = useState<Sku[]>([]);
  const [form, setForm] = useState<SkuForm>(emptySku);
  const [oem, setOem] = useState<SkuOem>("Bajaj");
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formCollapsed, setFormCollapsed] = useState(false);
  const requestedSku = useRef(
    new URLSearchParams(window.location.search).get("sku")?.toUpperCase() ?? "",
  );
  const handledRequestedSku = useRef(false);

  const load = async () => {
    setLoading(true);
    try {
      const items = await listSkus();
      setSkus(items);
      if (!handledRequestedSku.current) {
        handledRequestedSku.current = true;
        const requested = items.find(
          (item) => item.sku === requestedSku.current,
        );
        if (requested) {
          setForm(skuToForm(requested));
          setEditing(true);
          setFormCollapsed(false);
        }
      }
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
      const details = {
        itemDescription: form.itemDescription,
        unit: form.unit,
        quantityPerCarton:
          form.quantityPerCarton === "" ? 0 : form.quantityPerCarton,
        weightPerCarton: form.weightPerCarton === "" ? 0 : form.weightPerCarton,
        length: form.length === "" ? 0 : form.length,
        breadth: form.breadth === "" ? 0 : form.breadth,
        height: form.height === "" ? 0 : form.height,
      };
      if (editing) {
        await updateSku(form.sku, details);
        setMessage(`${form.sku} updated.`);
      } else {
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
          <h1>SKU</h1>
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
                  <span>{displayPackingValue(sku.quantityPerCarton)}</span>
                  <span>{sku.unit}</span>
                  <span>{displayPackingValue(sku.weightPerCarton, " kg")}</span>
                  <span>{displayPackingValue(sku.length, " cm")}</span>
                  <span>{displayPackingValue(sku.breadth, " cm")}</span>
                  <span>{displayPackingValue(sku.height, " cm")}</span>
                  <button
                    className="text-button"
                    onClick={() => {
                      setForm(skuToForm(sku));
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
                    min="0"
                    step="any"
                    required={editing}
                    placeholder="Missing"
                    value={form[name]}
                    onChange={(event) => {
                      const value = event.target.value;
                      setForm({
                        ...form,
                        [name]: value === "" ? "" : event.target.valueAsNumber,
                      });
                    }}
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

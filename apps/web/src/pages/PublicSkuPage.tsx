import { useEffect, useState, type FormEvent } from "react";
import {
  skuCreationUnits,
  skuOems,
  type CreateSkuRequest,
  type SkuOem,
} from "@kv-infra/shared";

import {
  apiErrorMessage,
  createPublicSku,
  getPublicSkuFormStatus,
} from "../api/client";
import { PublicPageShell } from "../components/PublicPageShell";

type NumericField =
  "quantityPerCarton" | "weightPerCarton" | "length" | "breadth" | "height";

const numericFields = [
  ["quantityPerCarton", "Quantity / CTN"],
  ["weightPerCarton", "Weight / CTN (kg)"],
  ["length", "Length (in)"],
  ["breadth", "Breadth (in)"],
  ["height", "Height (in)"],
] as const;

export const PublicSkuPage = ({ token }: { token: string }) => {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [oem, setOem] = useState<SkuOem>("Bajaj");
  const [itemDescription, setItemDescription] = useState("");
  const [unit, setUnit] = useState<(typeof skuCreationUnits)[number]>("pcs");
  const [numbers, setNumbers] = useState<Record<NumericField, number | "">>({
    quantityPerCarton: "",
    weightPerCarton: "",
    length: "",
    breadth: "",
    height: "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getPublicSkuFormStatus(token)
      .then(() => setEnabled(true))
      .catch((error) => {
        setEnabled(false);
        setMessage(apiErrorMessage(error));
      });
  }, [token]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const input: CreateSkuRequest = {
        oem,
        itemDescription,
        unit,
        quantityPerCarton: numbers.quantityPerCarton || 0,
        weightPerCarton: numbers.weightPerCarton || 0,
        length: numbers.length || 0,
        breadth: numbers.breadth || 0,
        height: numbers.height || 0,
      };
      const created = await createPublicSku(token, input);
      setMessage(`${created.sku} — ${created.itemDescription} created.`);
      setItemDescription("");
      setNumbers({
        quantityPerCarton: "",
        weightPerCarton: "",
        length: "",
        breadth: "",
        height: "",
      });
    } catch (error) {
      setMessage(apiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (enabled === null)
    return (
      <PublicPageShell label="SKU form">
        <div className="public-card">
          <p>Loading SKU form…</p>
        </div>
      </PublicPageShell>
    );
  if (!enabled)
    return (
      <PublicPageShell label="SKU form">
        <div className="public-card public-unavailable">
          <h1>SKU form unavailable</h1>
          <p>{message}</p>
        </div>
      </PublicPageShell>
    );

  return (
    <PublicPageShell label="SKU form">
      <div className="public-card public-sku-card">
        <p className="public-kicker">Packing master</p>
        <h1>Add a new SKU</h1>
        <p className="lead">
          OEM and item description are required. Packing values can be added
          later.
        </p>
        <form className="sku-form public-sku-form" onSubmit={submit}>
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
          <label>
            Item description
            <input
              required
              maxLength={200}
              value={itemDescription}
              onChange={(event) => setItemDescription(event.target.value)}
            />
          </label>
          <label>
            Unit
            <select
              value={unit}
              onChange={(event) =>
                setUnit(event.target.value as (typeof skuCreationUnits)[number])
              }
            >
              {skuCreationUnits.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <div className="form-grid">
            {numericFields.map(([name, label]) => (
              <label key={name}>
                {label}
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Optional"
                  value={numbers[name]}
                  onChange={(event) =>
                    setNumbers((current) => ({
                      ...current,
                      [name]: event.target.value
                        ? event.target.valueAsNumber
                        : "",
                    }))
                  }
                />
              </label>
            ))}
          </div>
          {message && <div className="notice">{message}</div>}
          <button
            className="primary-button public-submit"
            aria-busy={saving}
            disabled={saving || !itemDescription.trim()}
          >
            {saving ? "Creating SKU…" : "Create SKU"}
          </button>
        </form>
      </div>
    </PublicPageShell>
  );
};

import { useEffect, useState, type FormEvent } from "react";
import {
  hasMissingSkuPackingDetails,
  missingSkuPackingFields,
  type PackingSession,
  type Sku,
  type SkuPackingNumericField,
} from "@kv-infra/shared";

import {
  apiErrorMessage,
  finishPacking,
  getSku,
  listPacking,
  updateSku,
} from "../api/client";

type DimensionForm = Record<SkuPackingNumericField, string>;

const dimensionFields: Array<[SkuPackingNumericField, string, string]> = [
  ["quantityPerCarton", "Quantity / CTN", ""],
  ["weightPerCarton", "Weight / CTN", "kg"],
  ["length", "Length", "in"],
  ["breadth", "Breadth", "in"],
  ["height", "Height", "in"],
];

const toDimensionForm = (sku: Sku): DimensionForm => ({
  quantityPerCarton:
    sku.quantityPerCarton > 0 ? String(sku.quantityPerCarton) : "",
  weightPerCarton: sku.weightPerCarton > 0 ? String(sku.weightPerCarton) : "",
  length: sku.length > 0 ? String(sku.length) : "",
  breadth: sku.breadth > 0 ? String(sku.breadth) : "",
  height: sku.height > 0 ? String(sku.height) : "",
});

const dimensionValue = (value: string) => Number(value || 0);

export const FinishPackingPage = ({ packingId }: { packingId: string }) => {
  const [date, setDate] = useState(() =>
    new Date().toLocaleDateString("en-CA"),
  );
  const [session, setSession] = useState<PackingSession | null>(null);
  const [skuDetails, setSkuDetails] = useState<Sku | null>(null);
  const [dimensionForm, setDimensionForm] = useState<DimensionForm | null>(
    null,
  );
  const [dimensionsOpen, setDimensionsOpen] = useState(false);
  const [dimensionsDirty, setDimensionsDirty] = useState(false);
  const [packedCartons, setPackedCartons] = useState("");
  const [defective, setDefective] = useState("");
  const [short, setShort] = useState("");
  const [leftUnpacked, setLeftUnpacked] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void listPacking()
      .then(async (data) => {
        const found = data.sessions.find(
          (item) => item.packingId === packingId,
        );
        if (!found) throw new Error(`${packingId} was not found`);
        const sku = await getSku(found.sku);
        setSkuDetails(sku);
        setDimensionForm(toDimensionForm(sku));
        setDimensionsOpen(hasMissingSkuPackingDetails(sku));
        setSession({ ...found, quantityPerCarton: sku.quantityPerCarton });
      })
      .catch((error) => setMessage(apiErrorMessage(error)));
  }, [packingId]);

  if (!session || !skuDetails || !dimensionForm)
    return (
      <section className="page-panel">
        <p>{message || "Loading packing session…"}</p>
      </section>
    );
  const packedCartonCount = Number(packedCartons || 0);
  const defectiveQuantity = Number(defective || 0);
  const shortQuantity = Number(short || 0);
  const leftUnpackedQuantity = Number(leftUnpacked || 0);
  const quantityPerCarton = dimensionValue(dimensionForm.quantityPerCarton);
  const good = packedCartonCount * quantityPerCarton;
  const accounted =
    good + defectiveQuantity + shortQuantity + leftUnpackedQuantity;
  const unaccounted =
    Math.round((session.quantityTaken - accounted) * 1_000_000) / 1_000_000;
  const valid = unaccounted === 0 && Number.isInteger(packedCartonCount);
  const missingFields = missingSkuPackingFields(skuDetails);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) {
      setMessage(
        "Good, defective, short, and left unpacked quantities must exactly equal quantity taken.",
      );
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      if (dimensionsDirty) {
        const updated = await updateSku(session.sku, {
          itemDescription: skuDetails.itemDescription,
          unit: skuDetails.unit,
          quantityPerCarton,
          weightPerCarton: dimensionValue(dimensionForm.weightPerCarton),
          length: dimensionValue(dimensionForm.length),
          breadth: dimensionValue(dimensionForm.breadth),
          height: dimensionValue(dimensionForm.height),
        });
        setSkuDetails(updated);
        setSession((current) =>
          current
            ? { ...current, quantityPerCarton: updated.quantityPerCarton }
            : current,
        );
        setDimensionsDirty(false);
      }
      await finishPacking(packingId, {
        date,
        goodQuantity: good,
        packedCartons: packedCartonCount,
        defectiveQuantity,
        shortQuantity,
        leftUnpackedQuantity,
        notes,
      });
      window.location.assign("/packing");
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
      <h1>Finish packing</h1>
      <div className="metric-grid">
        <div>
          <span>SKU</span>
          <strong>{session.sku}</strong>
        </div>
        <div>
          <span>Quantity taken</span>
          <strong>
            {session.quantityTaken} {session.unit}
          </strong>
        </div>
        <div>
          <span>Qty / carton</span>
          <strong>
            {quantityPerCarton > 0 ? quantityPerCarton : "Missing"}
          </strong>
        </div>
        <div>
          <span>Linked order</span>
          <strong>{session.orderId ?? "None"}</strong>
        </div>
      </div>
      <form className="sku-form workflow-form" onSubmit={submit}>
        {missingFields.length > 0 && (
          <div className="notice packing-details-notice">
            This SKU has missing packing values. Add measurements recorded
            during packing now, or leave them for later.
          </div>
        )}
        <button
          type="button"
          className="form-collapse-button packing-details-toggle"
          aria-expanded={dimensionsOpen}
          aria-controls="packing-dimensional-info"
          onClick={() => setDimensionsOpen((open) => !open)}
        >
          {dimensionsOpen ? "Hide dimensional info" : "Edit dimensional info"}
        </button>
        {dimensionsOpen && (
          <div
            id="packing-dimensional-info"
            className="packing-dimensions-panel"
          >
            <div className="section-heading">
              <h2>SKU packing information</h2>
              <span>Optional</span>
            </div>
            <div className="form-grid">
              {dimensionFields.map(([field, label, unit]) => (
                <label key={field}>
                  {label}
                  {unit ? ` (${unit})` : ""}
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Missing"
                    value={dimensionForm[field]}
                    onChange={(event) => {
                      setDimensionForm({
                        ...dimensionForm,
                        [field]: event.target.value,
                      });
                      setDimensionsDirty(true);
                    }}
                  />
                </label>
              ))}
            </div>
            <small>
              Entered values will be saved to the SKU when packing is finished.
              Empty values remain marked Missing.
            </small>
          </div>
        )}
        <label>
          Date finished
          <input
            type="date"
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Packed cartons
            <input
              type="number"
              min="0"
              step="1"
              required
              value={packedCartons}
              placeholder="0"
              onChange={(event) => setPackedCartons(event.target.value)}
            />
          </label>
          <label>
            Good quantity
            <input value={good} disabled />
          </label>
          <label>
            Defective quantity
            <input
              type="number"
              min="0"
              step="any"
              required
              value={defective}
              placeholder="0"
              onChange={(event) => setDefective(event.target.value)}
            />
          </label>
          <label>
            Short quantity
            <input
              type="number"
              min="0"
              step="any"
              required
              value={short}
              placeholder="0"
              onChange={(event) => setShort(event.target.value)}
            />
          </label>
          <label>
            Left unpacked
            <input
              type="number"
              min="0"
              step="any"
              required
              value={leftUnpacked}
              placeholder="0"
              onChange={(event) => setLeftUnpacked(event.target.value)}
            />
          </label>
        </div>
        <div className={`packing-reconciliation ${valid ? "is-valid" : ""}`}>
          <span>Quantity remaining to account for</span>
          <strong>{unaccounted}</strong>
        </div>
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
          aria-busy={saving}
          disabled={saving || !valid}
        >
          {saving
            ? "Finishing…"
            : session.orderId
              ? "Finish & assign to order"
              : "Finish packing"}
        </button>
      </form>
    </section>
  );
};

import { useEffect, useState, type FormEvent } from "react";
import type { PackingSession } from "@kv-infra/shared";

import { apiErrorMessage, finishPacking, listPacking } from "../api/client";

export const FinishPackingPage = ({ packingId }: { packingId: string }) => {
  const [date, setDate] = useState(() =>
    new Date().toLocaleDateString("en-CA"),
  );
  const [session, setSession] = useState<PackingSession | null>(null);
  const [packedCartons, setPackedCartons] = useState("");
  const [defective, setDefective] = useState("");
  const [short, setShort] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void listPacking()
      .then((data) => {
        const found = data.sessions.find(
          (item) => item.packingId === packingId,
        );
        if (!found) throw new Error(`${packingId} was not found`);
        setSession(found);
      })
      .catch((error) => setMessage(apiErrorMessage(error)));
  }, [packingId]);

  if (!session)
    return (
      <section className="page-panel">
        <p>{message || "Loading packing session…"}</p>
      </section>
    );
  const packedCartonCount = Number(packedCartons || 0);
  const defectiveQuantity = Number(defective || 0);
  const shortQuantity = Number(short || 0);
  const good = packedCartonCount * session.quantityPerCarton;
  const accounted = good + defectiveQuantity + shortQuantity;
  const unaccounted =
    Math.round((session.quantityTaken - accounted) * 1_000_000) / 1_000_000;
  const valid = unaccounted === 0 && Number.isInteger(packedCartonCount);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) {
      setMessage(
        "Good, defective, and short quantities must exactly equal quantity taken.",
      );
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await finishPacking(packingId, {
        date,
        goodQuantity: good,
        packedCartons: packedCartonCount,
        defectiveQuantity,
        shortQuantity,
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
          <strong>{session.quantityPerCarton}</strong>
        </div>
        <div>
          <span>Linked order</span>
          <strong>{session.orderId ?? "None"}</strong>
        </div>
      </div>
      <form className="sku-form workflow-form" onSubmit={submit}>
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
        <button className="primary-button" disabled={saving || !valid}>
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

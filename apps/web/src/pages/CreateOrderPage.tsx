import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  calculateOrderLineTotals,
  type CreateOrderRequest,
  type Sku,
} from "@kv-infra/shared";

import { apiErrorMessage, createOrder, listSkus } from "../api/client";
import { formatDecimal } from "../lib/format-number";

type DraftLine = { sku: string; skuQuery: string; cartons: number };

const skuLabel = (sku: Sku) => `${sku.sku} — ${sku.itemDescription}`;

const matchingSkus = (skus: Sku[], query: string) => {
  const search = query.trim().toLowerCase();
  if (!search) return skus.slice(0, 8);

  return skus
    .flatMap((sku) => {
      const code = sku.sku.toLowerCase();
      const description = sku.itemDescription.toLowerCase();
      const label = `${code} ${description}`;
      const displayedLabel = skuLabel(sku).toLowerCase();
      let rank = Number.POSITIVE_INFINITY;
      if (code === search || displayedLabel === search) rank = 0;
      else if (code.startsWith(search)) rank = 1;
      else if (description.startsWith(search)) rank = 2;
      else if (code.includes(search)) rank = 3;
      else if (description.includes(search)) rank = 4;
      else if (search.split(/\s+/).every((word) => label.includes(word)))
        rank = 5;
      return Number.isFinite(rank) ? [{ sku, rank }] : [];
    })
    .sort(
      (left, right) =>
        left.rank - right.rank || left.sku.sku.localeCompare(right.sku.sku),
    )
    .slice(0, 8)
    .map(({ sku }) => sku);
};

const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export const CreateOrderPage = () => {
  const [skus, setSkus] = useState<Sku[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [dateReceived, setDateReceived] = useState(localDate);
  const [orderNotes, setOrderNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { sku: "", skuQuery: "", cartons: 1 },
  ]);
  const [activeSkuLine, setActiveSkuLine] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void listSkus()
      .then(setSkus)
      .catch((error) => setMessage(apiErrorMessage(error)));
  }, []);

  const preview = useMemo(
    () =>
      lines.map((line) => {
        const sku = skus.find((candidate) => candidate.sku === line.sku);
        return sku
          ? {
              ...line,
              skuDetails: sku,
              ...calculateOrderLineTotals({ ...sku, cartons: line.cartons }),
            }
          : null;
      }),
    [lines, skus],
  );

  const totals = preview.reduce(
    (sum, line) => ({
      cartons: sum.cartons + (line?.cartons ?? 0),
      quantity: sum.quantity + (line?.totalQuantity ?? 0),
      weight: sum.weight + (line?.grossWeight ?? 0),
      volume: sum.volume + (line?.volume ?? 0),
    }),
    { cartons: 0, quantity: 0, weight: 0, volume: 0 },
  );

  const updateLine = (index: number, updates: Partial<DraftLine>) =>
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...updates } : line,
      ),
    );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (lines.some((line) => !line.sku)) {
      setMessage(
        "Select a valid SKU from the matching results for every item.",
      );
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const input: CreateOrderRequest = {
        customerName,
        dateReceived,
        orderNotes,
        items: lines.map(({ sku, cartons }) => ({ sku, cartons })),
      };
      const order = await createOrder(input);
      window.location.assign(`/orders/${encodeURIComponent(order.orderId)}`);
    } catch (error) {
      setMessage(apiErrorMessage(error));
      setSaving(false);
    }
  };

  return (
    <section className="page-panel">
      <a className="back-link" href="/orders">
        ← Orders
      </a>
      <div className="page-title-row">
        <div>
          <h1>New order</h1>
        </div>
      </div>
      <form className="order-form" onSubmit={submit}>
        <div className="order-meta form-grid">
          <label>
            Customer name
            <input
              required
              minLength={2}
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
            />
          </label>
          <label>
            Date received
            <input
              required
              type="date"
              value={dateReceived}
              onChange={(event) => setDateReceived(event.target.value)}
            />
          </label>
        </div>
        <label className="order-notes-label">
          Order notes
          <textarea
            maxLength={1000}
            value={orderNotes}
            onChange={(event) => setOrderNotes(event.target.value)}
          />
        </label>

        <div className="section-heading order-lines-heading">
          <h2>Order items</h2>
          <button
            type="button"
            className="secondary-button"
            disabled={skus.length === 0}
            onClick={() =>
              setLines([...lines, { sku: "", skuQuery: "", cartons: 1 }])
            }
          >
            + Add item
          </button>
        </div>
        <div
          className="data-table order-editor"
          role="table"
          aria-label="Order items"
        >
          <div className="order-edit-row order-edit-head" role="row">
            <span>SKU / item</span>
            <span>Cartons</span>
            <span>Qty / CTN</span>
            <span>T-QTY</span>
            <span>Gross kg</span>
            <span>Volume CBM</span>
            <span />
          </div>
          {lines.map((line, index) => {
            const calculated = preview[index];
            const matches = matchingSkus(skus, line.skuQuery);
            return (
              <div className="order-edit-row" role="row" key={index}>
                <div className="sku-combobox">
                  <input
                    role="combobox"
                    aria-label={`Search SKU for item ${index + 1}`}
                    aria-expanded={activeSkuLine === index}
                    aria-controls={`sku-results-${index}`}
                    aria-autocomplete="list"
                    aria-invalid={!line.sku}
                    autoComplete="off"
                    placeholder="Type SKU or item description"
                    value={line.skuQuery}
                    onFocus={() => setActiveSkuLine(index)}
                    onBlur={() => setActiveSkuLine(null)}
                    onChange={(event) => {
                      updateLine(index, {
                        sku: "",
                        skuQuery: event.target.value,
                      });
                      setActiveSkuLine(index);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setActiveSkuLine(null);
                      if (event.key === "Enter" && activeSkuLine === index) {
                        event.preventDefault();
                        const firstMatch = matches[0];
                        if (firstMatch) {
                          updateLine(index, {
                            sku: firstMatch.sku,
                            skuQuery: skuLabel(firstMatch),
                          });
                          setActiveSkuLine(null);
                        }
                      }
                    }}
                  />
                  {activeSkuLine === index && (
                    <div
                      className="sku-matches"
                      id={`sku-results-${index}`}
                      role="listbox"
                      aria-label={`Matching SKUs for item ${index + 1}`}
                    >
                      {matches.map((sku) => (
                        <button
                          type="button"
                          role="option"
                          aria-selected={line.sku === sku.sku}
                          key={sku.sku}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            updateLine(index, {
                              sku: sku.sku,
                              skuQuery: skuLabel(sku),
                            });
                            setActiveSkuLine(null);
                          }}
                        >
                          <strong>{sku.sku}</strong>
                          <span>{sku.itemDescription}</span>
                        </button>
                      ))}
                      {matches.length === 0 && (
                        <span className="sku-no-match">No matching SKU</span>
                      )}
                    </div>
                  )}
                  {!line.sku && line.skuQuery && activeSkuLine !== index && (
                    <small className="sku-selection-error">
                      Select a match from the list
                    </small>
                  )}
                </div>
                <input
                  aria-label={`Cartons for item ${index + 1}`}
                  type="number"
                  min="1"
                  max="1000000"
                  step="1"
                  value={line.cartons}
                  onChange={(event) =>
                    updateLine(index, {
                      cartons: event.target.valueAsNumber || 1,
                    })
                  }
                />
                <span>{calculated?.skuDetails.quantityPerCarton ?? "—"}</span>
                <strong>{calculated?.totalQuantity ?? "—"}</strong>
                <span>{calculated?.grossWeight ?? "—"}</span>
                <span>
                  {calculated ? formatDecimal(calculated.volume) : "—"}
                </span>
                <button
                  type="button"
                  className="text-button danger-text"
                  disabled={lines.length === 1}
                  onClick={() =>
                    setLines(
                      lines.filter((_, lineIndex) => lineIndex !== index),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>

        <div className="order-summary">
          <div>
            <span>Cartons</span>
            <strong>{totals.cartons}</strong>
          </div>
          <div>
            <span>Total quantity</span>
            <strong>{totals.quantity}</strong>
          </div>
          <div>
            <span>Gross weight</span>
            <strong>{totals.weight} kg</strong>
          </div>
          <div>
            <span>Volume</span>
            <strong>{formatDecimal(totals.volume)} CBM</strong>
          </div>
        </div>
        {message && <div className="notice error-notice">{message}</div>}
        <div className="order-submit-row order-submit-only">
          <button
            className="primary-button"
            disabled={
              saving || skus.length === 0 || lines.some((line) => !line.sku)
            }
          >
            {saving ? "Creating order…" : "Create order & check stock"}
          </button>
        </div>
      </form>
    </section>
  );
};

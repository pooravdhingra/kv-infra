import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  calculateCartonsFromTotalQuantity,
  calculateOrderLineTotals,
  type PublicOrderState,
  type Sku,
} from "@kv-infra/shared";

import { PublicPageShell } from "../components/PublicPageShell";
import {
  apiErrorMessage,
  getPublicOrderState,
  submitPublicOrder,
} from "../api/client";
import { formatDecimal } from "../lib/format-number";
import {
  calculateDraftTotal,
  emptyLine,
  matchingSkus,
  positiveNumber,
  skuLabel,
  type DraftLine,
} from "./CreateOrderPage";

const OrderSummary = ({ state }: { state: PublicOrderState }) => {
  if (state.status !== "SUBMITTED") return null;
  const { summary } = state;
  return (
    <div className="public-card public-summary-card">
      <div className="public-success-mark">✓</div>
      <p className="public-kicker">Order received</p>
      <h1>{summary.customerName}</h1>
      <p className="lead">
        Thank you. This summary will remain available from the same link while
        your order is being prepared.
      </p>
      <div className="public-order-meta">
        <span>Order</span>
        <strong>{summary.orderId}</strong>
        <span>Date</span>
        <strong>{summary.dateReceived}</strong>
      </div>
      <div className="data-table public-order-table" role="table">
        <div className="public-order-row public-order-head" role="row">
          <span>SKU</span>
          <span>Item</span>
          <span>Cartons</span>
          <span>Quantity</span>
        </div>
        {summary.items.map((item, index) => (
          <div
            className="public-order-row"
            role="row"
            key={`${item.sku}-${index}`}
          >
            <strong>{item.sku}</strong>
            <span>{item.itemDescription}</span>
            <span>{item.cartons || "—"}</span>
            <span>
              {item.totalQuantity} {item.unit}
            </span>
          </div>
        ))}
      </div>
      <div className="order-summary public-totals">
        <div>
          <span>Cartons</span>
          <strong>{summary.totalCartons || "—"}</strong>
        </div>
        <div>
          <span>Total quantity</span>
          <strong>{summary.totalQuantity}</strong>
        </div>
        <div>
          <span>Estimated gross weight</span>
          <strong>{summary.grossWeight} kg</strong>
        </div>
        <div>
          <span>Estimated volume</span>
          <strong>{formatDecimal(summary.volume)} CBM</strong>
        </div>
        <div>
          <span>Actual gross weight</span>
          <strong>
            {summary.actualGrossWeight === null
              ? ""
              : `${summary.actualGrossWeight} kg`}
          </strong>
        </div>
        <div>
          <span>Actual volume</span>
          <strong>
            {summary.actualVolume === null
              ? ""
              : `${formatDecimal(summary.actualVolume)} CBM`}
          </strong>
        </div>
      </div>
    </div>
  );
};

export const PublicOrderPage = ({ token }: { token: string }) => {
  const [state, setState] = useState<PublicOrderState | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [orderNotes, setOrderNotes] = useState("");
  const [activeSkuLine, setActiveSkuLine] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getPublicOrderState(token)
      .then(setState)
      .catch((error) => setMessage(apiErrorMessage(error)))
      .finally(() => setLoading(false));
  }, [token]);

  const skus = state?.status === "OPEN" ? state.skus : [];
  const preview = useMemo(
    () =>
      lines.map((line) => {
        const sku = skus.find((candidate) => candidate.sku === line.sku);
        if (!sku) return null;
        const cartons = positiveNumber(line.cartons) ? line.cartons : 0;
        const calculated = calculateOrderLineTotals({ ...sku, cartons });
        return {
          ...line,
          skuDetails: sku,
          ...calculated,
          totalQuantity:
            sku.quantityPerCarton > 0
              ? calculated.totalQuantity
              : positiveNumber(line.totalQuantity)
                ? line.totalQuantity
                : 0,
        };
      }),
    [lines, skus],
  );
  const totals = preview.reduce(
    (sum, line) => ({
      cartons:
        sum.cartons + (line && positiveNumber(line.cartons) ? line.cartons : 0),
      quantity: sum.quantity + (line?.totalQuantity ?? 0),
      weight: sum.weight + (line?.grossWeight ?? 0),
      volume: sum.volume + (line?.volume ?? 0),
    }),
    { cartons: 0, quantity: 0, weight: 0, volume: 0 },
  );
  const updateLine = (index: number, updates: Partial<DraftLine>) =>
    setLines((current) =>
      current.map((line, lineIndex) =>
        index === lineIndex ? { ...line, ...updates } : line,
      ),
    );

  const selectSku = (index: number, sku: Sku) => {
    const cartons = sku.quantityPerCarton > 0 ? 1 : "";
    updateLine(index, {
      sku: sku.sku,
      skuQuery: skuLabel(sku),
      cartons,
      totalQuantity:
        cartons === ""
          ? ""
          : calculateDraftTotal(cartons, sku.quantityPerCarton),
    });
    setActiveSkuLine(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (lines.some((line) => !line.sku)) {
      setMessage(
        "Select a valid SKU from the matching results for every item.",
      );
      return;
    }
    const incomplete = lines.some((line) => {
      const sku = skus.find((item) => item.sku === line.sku);
      return sku?.quantityPerCarton
        ? !positiveNumber(line.cartons)
        : !positiveNumber(line.totalQuantity);
    });
    if (incomplete) {
      setMessage("Enter cartons or total quantity for every item.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      setState(
        await submitPublicOrder(token, {
          orderNotes,
          items: lines.map((line) => {
            const sku = skus.find((item) => item.sku === line.sku)!;
            return sku.quantityPerCarton > 0
              ? { sku: line.sku, cartons: Number(line.cartons) }
              : { sku: line.sku, totalQuantity: Number(line.totalQuantity) };
          }),
        }),
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setMessage(apiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <PublicPageShell>
        <div className="public-card">
          <p>Loading order form…</p>
        </div>
      </PublicPageShell>
    );
  if (!state)
    return (
      <PublicPageShell>
        <div className="public-card public-unavailable">
          <h1>Order link unavailable</h1>
          <p>{message || "Please contact KV Infra for a new order link."}</p>
        </div>
      </PublicPageShell>
    );
  if (state.status === "SUBMITTED")
    return (
      <PublicPageShell>
        <OrderSummary state={state} />
      </PublicPageShell>
    );

  return (
    <PublicPageShell>
      <div className="public-card public-order-form-card">
        <p className="public-kicker">New order</p>
        <h1>{state.customerName}</h1>
        <p className="lead">
          Select each item and enter either cartons or total quantity.
        </p>
        <form className="order-form" onSubmit={submit}>
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
              onClick={() => setLines((current) => [...current, emptyLine()])}
            >
              + Add item
            </button>
          </div>
          <div className="public-order-editor">
            {lines.map((line, index) => {
              const calculated = preview[index];
              const matches = matchingSkus(skus, line.skuQuery);
              return (
                <div className="public-order-edit-row" key={index}>
                  <label className="public-sku-field">
                    SKU / item
                    <div className="sku-combobox">
                      <input
                        role="combobox"
                        aria-expanded={activeSkuLine === index}
                        autoComplete="off"
                        placeholder="Type SKU or item description"
                        value={line.skuQuery}
                        onFocus={() => setActiveSkuLine(index)}
                        onBlur={() => setActiveSkuLine(null)}
                        onChange={(event) => {
                          updateLine(index, {
                            sku: "",
                            skuQuery: event.target.value,
                            cartons: 1,
                            totalQuantity: "",
                          });
                          setActiveSkuLine(index);
                        }}
                      />
                      {activeSkuLine === index && (
                        <div className="sku-matches" role="listbox">
                          {matches.map((sku) => (
                            <button
                              type="button"
                              role="option"
                              aria-selected={line.sku === sku.sku}
                              key={sku.sku}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => selectSku(index, sku)}
                            >
                              <strong>{sku.sku}</strong>
                              <span>{sku.itemDescription}</span>
                            </button>
                          ))}
                          {matches.length === 0 && (
                            <span className="sku-no-match">
                              No matching SKU
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </label>
                  <label>
                    Cartons
                    <input
                      type="number"
                      min="1"
                      max="1000000"
                      step="any"
                      placeholder={
                        calculated?.skuDetails.quantityPerCarton === 0
                          ? "Unavailable"
                          : "Cartons"
                      }
                      disabled={
                        !calculated ||
                        calculated.skuDetails.quantityPerCarton <= 0
                      }
                      value={line.cartons}
                      onChange={(event) => {
                        const cartons = event.target.value
                          ? event.target.valueAsNumber
                          : "";
                        updateLine(index, {
                          cartons,
                          totalQuantity:
                            positiveNumber(cartons) && calculated
                              ? calculateDraftTotal(
                                  cartons,
                                  calculated.skuDetails.quantityPerCarton,
                                )
                              : "",
                        });
                      }}
                    />
                  </label>
                  <label>
                    Total quantity
                    <input
                      type="number"
                      min="0.000001"
                      step="any"
                      disabled={!calculated}
                      value={line.totalQuantity}
                      onChange={(event) => {
                        const totalQuantity = event.target.value
                          ? event.target.valueAsNumber
                          : "";
                        updateLine(index, {
                          totalQuantity,
                          cartons:
                            positiveNumber(totalQuantity) &&
                            calculated &&
                            calculated.skuDetails.quantityPerCarton > 0
                              ? calculateCartonsFromTotalQuantity(
                                  totalQuantity,
                                  calculated.skuDetails.quantityPerCarton,
                                )
                              : "",
                        });
                      }}
                    />
                  </label>
                  <div className="public-line-total">
                    <span>Qty / CTN</span>
                    <strong>
                      {calculated
                        ? calculated.skuDetails.quantityPerCarton || "Missing"
                        : "—"}
                    </strong>
                  </div>
                  <button
                    type="button"
                    className="text-button danger-text"
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((_, lineIndex) => lineIndex !== index),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
          <div className="order-summary public-entry-totals">
            <div>
              <span>Cartons</span>
              <strong>{totals.cartons}</strong>
            </div>
            <div>
              <span>Total quantity</span>
              <strong>{totals.quantity}</strong>
            </div>
            <div>
              <span>Estimated gross weight</span>
              <strong>{totals.weight} kg</strong>
            </div>
            <div>
              <span>Estimated volume</span>
              <strong>{formatDecimal(totals.volume)} CBM</strong>
            </div>
          </div>
          {message && <div className="notice error-notice">{message}</div>}
          <button
            className="primary-button public-submit"
            aria-busy={saving}
            disabled={saving || lines.some((line) => !line.sku)}
          >
            {saving ? "Sending order…" : "Send order"}
          </button>
        </form>
      </div>
    </PublicPageShell>
  );
};

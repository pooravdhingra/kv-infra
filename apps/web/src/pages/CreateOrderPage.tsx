import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  calculateCartonsFromTotalQuantity,
  calculateOrderLineTotals,
  skuOems,
  type CreateOrderRequest,
  type Sku,
  type SkuOem,
} from "@kv-infra/shared";

import {
  apiErrorMessage,
  createOrder,
  createSku,
  listSkus,
} from "../api/client";
import { formatDecimal } from "../lib/format-number";

type DraftQuantity = number | "";
type DraftLine = {
  sku: string;
  skuQuery: string;
  cartons: DraftQuantity;
  totalQuantity: DraftQuantity;
};

const emptyLine = (): DraftLine => ({
  sku: "",
  skuQuery: "",
  cartons: 1,
  totalQuantity: "",
});

const positiveNumber = (value: DraftQuantity): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const calculateDraftTotal = (cartons: number, quantityPerCarton: number) =>
  calculateOrderLineTotals({
    cartons,
    quantityPerCarton,
    weightPerCarton: 0,
    length: 0,
    breadth: 0,
    height: 0,
  }).totalQuantity;

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
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [activeSkuLine, setActiveSkuLine] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [showNewSku, setShowNewSku] = useState(false);
  const [newSkuTargetLine, setNewSkuTargetLine] = useState(0);
  const [newSkuOem, setNewSkuOem] = useState<SkuOem>("Bajaj");
  const [newSkuDescription, setNewSkuDescription] = useState("");
  const [newSkuQuantityPerCarton, setNewSkuQuantityPerCarton] = useState<
    number | ""
  >("");
  const [creatingSku, setCreatingSku] = useState(false);
  const [newSkuMessage, setNewSkuMessage] = useState("");
  useEffect(() => {
    void listSkus()
      .then(setSkus)
      .catch((error) => setMessage(apiErrorMessage(error)));
  }, []);

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
  const hasMissingWeight = preview.some(
    (line) =>
      line &&
      (line.skuDetails.quantityPerCarton <= 0 ||
        line.skuDetails.weightPerCarton <= 0),
  );
  const hasMissingVolume = preview.some(
    (line) =>
      line &&
      (line.skuDetails.length <= 0 ||
        line.skuDetails.quantityPerCarton <= 0 ||
        line.skuDetails.breadth <= 0 ||
        line.skuDetails.height <= 0),
  );

  const updateLine = (index: number, updates: Partial<DraftLine>) =>
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...updates } : line,
      ),
    );

  const selectSku = (index: number, sku: Sku) => {
    setLines((current) =>
      current.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        const cartons = sku.quantityPerCarton > 0 ? 1 : "";
        return {
          ...line,
          sku: sku.sku,
          skuQuery: skuLabel(sku),
          cartons,
          totalQuantity:
            cartons === ""
              ? ""
              : calculateDraftTotal(cartons, sku.quantityPerCarton),
        };
      }),
    );
    setActiveSkuLine(null);
  };

  const openNewSku = () => {
    let target =
      activeSkuLine ?? lines.findIndex((line) => line.sku.length === 0);
    if (target < 0) {
      target = lines.length;
      setLines((current) => [...current, emptyLine()]);
    }
    setNewSkuTargetLine(target);
    setNewSkuDescription(lines[target]?.skuQuery.trim() ?? "");
    setNewSkuMessage("");
    setShowNewSku(true);
    setActiveSkuLine(null);
  };

  const addNewSku = async () => {
    const description = newSkuDescription.trim();
    if (!description) {
      setNewSkuMessage("Enter an item description.");
      return;
    }
    setCreatingSku(true);
    setNewSkuMessage("");
    try {
      const created = await createSku({
        oem: newSkuOem,
        itemDescription: description,
        ...(positiveNumber(newSkuQuantityPerCarton)
          ? { quantityPerCarton: newSkuQuantityPerCarton }
          : {}),
      });
      setSkus((items) => [...items, created]);
      setLines((current) =>
        current.map((line, index) => {
          if (index !== newSkuTargetLine) return line;
          const cartons = created.quantityPerCarton > 0 ? 1 : "";
          return {
            ...line,
            sku: created.sku,
            skuQuery: skuLabel(created),
            cartons,
            totalQuantity:
              cartons === ""
                ? ""
                : calculateDraftTotal(cartons, created.quantityPerCarton),
          };
        }),
      );
      setShowNewSku(false);
      setNewSkuOem("Bajaj");
      setNewSkuDescription("");
      setNewSkuQuantityPerCarton("");
    } catch (error) {
      setNewSkuMessage(apiErrorMessage(error));
    } finally {
      setCreatingSku(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (lines.some((line) => !line.sku)) {
      setMessage(
        "Select a valid SKU from the matching results for every item.",
      );
      return;
    }
    const incompleteLine = lines.find((line) => {
      const sku = skus.find((item) => item.sku === line.sku);
      return sku?.quantityPerCarton
        ? !positiveNumber(line.cartons)
        : !positiveNumber(line.totalQuantity);
    });
    if (incompleteLine) {
      setMessage(
        "Enter cartons or T-QTY for every item before creating the order.",
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
        items: lines.map((line) => {
          const sku = skus.find((item) => item.sku === line.sku)!;
          return sku.quantityPerCarton > 0
            ? { sku: line.sku, cartons: Number(line.cartons) }
            : { sku: line.sku, totalQuantity: Number(line.totalQuantity) };
        }),
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
          <div className="order-item-actions">
            <button
              type="button"
              className="text-button"
              onClick={showNewSku ? () => setShowNewSku(false) : openNewSku}
            >
              {showNewSku ? "Cancel new SKU" : "+ Add a new SKU"}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={skus.length === 0}
              onClick={() => setLines([...lines, emptyLine()])}
            >
              + Add item
            </button>
          </div>
        </div>
        {showNewSku && (
          <div className="receiving-new-sku order-new-sku">
            <div className="section-heading">
              <h3>Create new SKU</h3>
            </div>
            <div className="form-grid">
              <label>
                OEM
                <select
                  value={newSkuOem}
                  onChange={(event) =>
                    setNewSkuOem(event.target.value as SkuOem)
                  }
                >
                  {skuOems.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label>
                Item description
                <input
                  value={newSkuDescription}
                  maxLength={200}
                  placeholder="Item description"
                  onChange={(event) => setNewSkuDescription(event.target.value)}
                />
              </label>
              <label>
                Quantity / CTN (optional)
                <input
                  type="number"
                  min="0.000001"
                  step="any"
                  placeholder="Can be entered in the order row"
                  value={newSkuQuantityPerCarton}
                  onChange={(event) =>
                    setNewSkuQuantityPerCarton(
                      event.target.value === ""
                        ? ""
                        : event.target.valueAsNumber,
                    )
                  }
                />
              </label>
            </div>
            {newSkuMessage && (
              <div className="notice error-notice">{newSkuMessage}</div>
            )}
            <button
              type="button"
              className="secondary-button"
              aria-busy={creatingSku}
              disabled={creatingSku || !newSkuDescription.trim()}
              onClick={() => void addNewSku()}
            >
              {creatingSku ? "Creating…" : "Create and select SKU"}
            </button>
            <small>
              Quantity / CTN can be entered in the order row. Weight and
              dimensions can be added later from the SKU page.
            </small>
          </div>
        )}
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
                        cartons: 1,
                        totalQuantity: "",
                      });
                      setActiveSkuLine(index);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setActiveSkuLine(null);
                      if (event.key === "Enter" && activeSkuLine === index) {
                        event.preventDefault();
                        const firstMatch = matches[0];
                        if (firstMatch) selectSku(index, firstMatch);
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
                          onClick={() => selectSku(index, sku)}
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
                  step="any"
                  placeholder={
                    calculated?.skuDetails.quantityPerCarton === 0
                      ? "Unavailable"
                      : "Cartons"
                  }
                  disabled={
                    !line.sku ||
                    !calculated ||
                    calculated.skuDetails.quantityPerCarton <= 0
                  }
                  value={line.cartons}
                  onChange={(event) => {
                    const cartons =
                      event.target.value === ""
                        ? ""
                        : event.target.valueAsNumber;
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
                <span>
                  {calculated
                    ? calculated.skuDetails.quantityPerCarton > 0
                      ? calculated.skuDetails.quantityPerCarton
                      : "Missing"
                    : "—"}
                </span>
                <input
                  aria-label={`Total quantity for item ${index + 1}`}
                  type="number"
                  min="0.000001"
                  step="any"
                  placeholder="Enter T-QTY"
                  disabled={!line.sku}
                  value={line.totalQuantity}
                  onChange={(event) => {
                    const totalQuantity =
                      event.target.value === ""
                        ? ""
                        : event.target.valueAsNumber;
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
                <span>
                  {calculated
                    ? calculated.skuDetails.quantityPerCarton > 0 &&
                      calculated.skuDetails.weightPerCarton > 0
                      ? calculated.grossWeight
                      : "Missing"
                    : "—"}
                </span>
                <span>
                  {calculated
                    ? calculated.skuDetails.quantityPerCarton > 0 &&
                      calculated.skuDetails.length > 0 &&
                      calculated.skuDetails.breadth > 0 &&
                      calculated.skuDetails.height > 0
                      ? formatDecimal(calculated.volume)
                      : "Missing"
                    : "—"}
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
            <strong>
              {hasMissingWeight ? "Missing" : `${totals.weight} kg`}
            </strong>
          </div>
          <div>
            <span>Volume</span>
            <strong>
              {hasMissingVolume
                ? "Missing"
                : `${formatDecimal(totals.volume)} CBM`}
            </strong>
          </div>
        </div>
        {message && <div className="notice error-notice">{message}</div>}
        <div className="order-submit-row order-submit-only">
          <button
            className="primary-button"
            aria-busy={saving}
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

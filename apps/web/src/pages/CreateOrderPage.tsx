import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  calculateCartonsFromTotalQuantity,
  calculateOrderLineTotals,
  skuOems,
  type CreateOrderRequest,
  type Sku,
  type SkuOem,
  type UpdateOrderRequest,
} from "@kv-infra/shared";

import {
  apiErrorMessage,
  createOrder,
  createSku,
  getOrder,
  listSkus,
  removeOrderLine,
  updateOrder,
} from "../api/client";
import { formatDecimal } from "../lib/format-number";

export type DraftQuantity = number | "";
export type DraftLine = {
  orderLineId?: string;
  sku: string;
  skuQuery: string;
  cartons: DraftQuantity;
  totalQuantity: DraftQuantity;
};

export const emptyLine = (): DraftLine => ({
  sku: "",
  skuQuery: "",
  cartons: 1,
  totalQuantity: "",
});

export const positiveNumber = (value: DraftQuantity): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export const calculateDraftTotal = (
  cartons: number,
  quantityPerCarton: number,
) =>
  calculateOrderLineTotals({
    cartons,
    quantityPerCarton,
    weightPerCarton: 0,
    length: 0,
    breadth: 0,
    height: 0,
  }).totalQuantity;

export const skuLabel = (sku: Sku) => `${sku.sku} — ${sku.itemDescription}`;

export const matchingSkus = (skus: Sku[], query: string) => {
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

export const CreateOrderPage = ({ orderId }: { orderId?: string }) => {
  const [skus, setSkus] = useState<Sku[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [dateReceived, setDateReceived] = useState(localDate);
  const [orderNotes, setOrderNotes] = useState("");
  const [actualGrossWeight, setActualGrossWeight] = useState<DraftQuantity>("");
  const [actualVolume, setActualVolume] = useState<DraftQuantity>("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [removedLines, setRemovedLines] = useState<DraftLine[]>([]);
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
  const [loadingOrder, setLoadingOrder] = useState(Boolean(orderId));
  const [editBlocked, setEditBlocked] = useState(false);
  useEffect(() => {
    void Promise.all([listSkus(), orderId ? getOrder(orderId) : null])
      .then(([nextSkus, existingOrder]) => {
        setSkus(nextSkus);
        if (!existingOrder) return;
        setCustomerName(existingOrder.customerName);
        setDateReceived(existingOrder.dateReceived);
        setOrderNotes(existingOrder.orderNotes);
        setActualGrossWeight(existingOrder.actualGrossWeight ?? "");
        setActualVolume(existingOrder.actualVolume ?? "");
        setLines(
          existingOrder.items.map((item) => ({
            orderLineId: item.orderLineId,
            sku: item.sku,
            skuQuery: skuLabel(item),
            cartons: item.quantityPerCarton > 0 ? item.cartons : "",
            totalQuantity: item.totalQuantity,
          })),
        );
        if (existingOrder.status === "COMPLETED") {
          setEditBlocked(true);
          setMessage("Shipped orders cannot be edited.");
        }
      })
      .catch((error) => setMessage(apiErrorMessage(error)))
      .finally(() => setLoadingOrder(false));
  }, [orderId]);

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
      const submittedLines = orderId ? [...lines, ...removedLines] : lines;
      const orderItems = submittedLines.map((line) => {
        const sku = skus.find((item) => item.sku === line.sku)!;
        const quantity =
          sku.quantityPerCarton > 0
            ? { cartons: Number(line.cartons) }
            : { totalQuantity: Number(line.totalQuantity) };
        return {
          ...(line.orderLineId ? { orderLineId: line.orderLineId } : {}),
          sku: line.sku,
          ...quantity,
        };
      });
      const input: CreateOrderRequest | UpdateOrderRequest = {
        customerName,
        dateReceived,
        orderNotes,
        items: orderItems,
        ...(orderId
          ? {
              actualGrossWeight:
                typeof actualGrossWeight === "number" &&
                Number.isFinite(actualGrossWeight)
                  ? actualGrossWeight
                  : null,
              actualVolume:
                typeof actualVolume === "number" &&
                Number.isFinite(actualVolume)
                  ? actualVolume
                  : null,
            }
          : {}),
      };
      const order = orderId
        ? await updateOrder(orderId, input as UpdateOrderRequest)
        : await createOrder(input as CreateOrderRequest);
      if (orderId)
        for (const line of removedLines)
          if (line.orderLineId)
            await removeOrderLine(orderId, line.orderLineId);
      window.location.assign(`/orders/${encodeURIComponent(order.orderId)}`);
    } catch (error) {
      setMessage(apiErrorMessage(error));
      setSaving(false);
    }
  };

  if (orderId && !loadingOrder && editBlocked)
    return (
      <section className="page-panel">
        <a
          className="back-link"
          href={`/orders/${encodeURIComponent(orderId)}`}
        >
          ← Order details
        </a>
        <div className="page-title-row">
          <div>
            <h1>Edit order</h1>
          </div>
        </div>
        <div className="notice error-notice">{message}</div>
      </section>
    );

  return (
    <section className="page-panel">
      <a className="back-link" href="/orders">
        ← Orders
      </a>
      <div className="page-title-row">
        <div>
          <h1>{orderId ? "Edit order" : "New order"}</h1>
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
        {orderId && (
          <div className="order-meta form-grid actual-totals-fields">
            <label>
              Actual gross weight (kg)
              <input
                type="number"
                min="0"
                step="any"
                placeholder="Enter after weighing"
                value={actualGrossWeight}
                onChange={(event) =>
                  setActualGrossWeight(
                    event.target.value === "" ? "" : event.target.valueAsNumber,
                  )
                }
              />
            </label>
            <label>
              Actual volume (CBM)
              <input
                type="number"
                min="0"
                step="any"
                placeholder="Enter after packing"
                value={actualVolume}
                onChange={(event) =>
                  setActualVolume(
                    event.target.value === "" ? "" : event.target.valueAsNumber,
                  )
                }
              />
            </label>
          </div>
        )}

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
            <span>Est. gross kg</span>
            <span>Est. volume CBM</span>
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
                    disabled={Boolean(line.orderLineId)}
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
                      : 0
                    : "—"}
                </span>
                <span>
                  {calculated
                    ? calculated.skuDetails.quantityPerCarton > 0 &&
                      calculated.skuDetails.length > 0 &&
                      calculated.skuDetails.breadth > 0 &&
                      calculated.skuDetails.height > 0
                      ? formatDecimal(calculated.volume)
                      : 0
                    : "—"}
                </span>
                <button
                  type="button"
                  className="text-button danger-text"
                  disabled={lines.length === 1}
                  onClick={() => {
                    if (line.orderLineId)
                      setRemovedLines((current) => [...current, line]);
                    setLines(
                      lines.filter((_, lineIndex) => lineIndex !== index),
                    );
                  }}
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
            <span>Estimated gross weight</span>
            <strong>{totals.weight} kg</strong>
          </div>
          <div>
            <span>Estimated volume</span>
            <strong>{formatDecimal(totals.volume)} CBM</strong>
          </div>
        </div>
        {message && <div className="notice error-notice">{message}</div>}
        <div className="order-submit-row order-submit-only">
          <button
            className="primary-button"
            aria-busy={saving}
            disabled={
              saving ||
              loadingOrder ||
              skus.length === 0 ||
              lines.some((line) => !line.sku)
            }
          >
            {saving
              ? orderId
                ? "Saving changes…"
                : "Creating order…"
              : orderId
                ? "Save order changes"
                : "Create order & check stock"}
          </button>
        </div>
      </form>
    </section>
  );
};

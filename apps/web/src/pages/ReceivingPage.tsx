import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  skuOems,
  type OpenOrderOption,
  type Receipt,
  type Sku,
  type SkuOem,
  type Supplier,
} from "@kv-infra/shared";

import {
  apiErrorMessage,
  createSku,
  listAllSuppliers,
  listOpenOrderOptions,
  listRecentReceipts,
  listSkus,
  listSuppliers,
  receiveMaterial,
} from "../api/client";

const today = () => new Date().toLocaleDateString("en-CA");

const skuLabel = (sku: Sku) => `${sku.sku} — ${sku.itemDescription}`;

const matchingSkus = (skus: Sku[], query: string) => {
  const search = query.trim().toLowerCase();
  if (!search) return skus.slice(0, 10);

  return skus
    .flatMap((sku) => {
      const code = sku.sku.toLowerCase();
      const description = sku.itemDescription.toLowerCase();
      const searchable = `${code} ${description}`;
      let rank = Number.POSITIVE_INFINITY;
      if (code === search || skuLabel(sku).toLowerCase() === search) rank = 0;
      else if (code.startsWith(search)) rank = 1;
      else if (description.startsWith(search)) rank = 2;
      else if (code.includes(search)) rank = 3;
      else if (description.includes(search)) rank = 4;
      else if (search.split(/\s+/).every((word) => searchable.includes(word)))
        rank = 5;
      return Number.isFinite(rank) ? [{ sku, rank }] : [];
    })
    .sort(
      (left, right) =>
        left.rank - right.rank || left.sku.sku.localeCompare(right.sku.sku),
    )
    .slice(0, 10)
    .map(({ sku }) => sku);
};

export const ReceivingPage = () => {
  const query = new URLSearchParams(window.location.search);
  const requestedOrderLine = query.get("orderLineId") ?? "";
  const requestedSku = query.get("sku") ?? "";
  const [skus, setSkus] = useState<Sku[]>([]);
  const [sku, setSku] = useState(requestedSku);
  const [skuQuery, setSkuQuery] = useState(requestedSku);
  const [skuSearchOpen, setSkuSearchOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [usingSupplierMaster, setUsingSupplierMaster] = useState(false);
  const [supplierNumber, setSupplierNumber] = useState("");
  const [options, setOptions] = useState<OpenOrderOption[]>([]);
  const [orderLineId, setOrderLineId] = useState(requestedOrderLine);
  const [recent, setRecent] = useState<Receipt[]>([]);
  const [date, setDate] = useState(today);
  const [quantity, setQuantity] = useState(0);
  const [location, setLocation] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [markRequestReceived, setMarkRequestReceived] = useState(false);
  const [sendDeliveryConfirmation, setSendDeliveryConfirmation] =
    useState(false);
  const [formCollapsed, setFormCollapsed] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [showNewSku, setShowNewSku] = useState(false);
  const [newSkuOem, setNewSkuOem] = useState<SkuOem>("Bajaj");
  const [newSkuDescription, setNewSkuDescription] = useState("");
  const [creatingSku, setCreatingSku] = useState(false);

  useEffect(() => {
    void listSkus()
      .then(setSkus)
      .catch((error) => setMessage(apiErrorMessage(error)));
    void listRecentReceipts()
      .then(setRecent)
      .catch((error) => setMessage(apiErrorMessage(error)));
  }, []);

  const selectedSku = skus.find((item) => item.sku === sku);
  const deferredSkuQuery = useDeferredValue(skuQuery);
  const skuMatches = useMemo(
    () => matchingSkus(skus, deferredSkuQuery),
    [skus, deferredSkuQuery],
  );

  useEffect(() => {
    if (selectedSku && skuQuery === requestedSku) {
      setSkuQuery(skuLabel(selectedSku));
    }
  }, [requestedSku, selectedSku, skuQuery]);

  useEffect(() => {
    if (!selectedSku) {
      if (skus.length > 0) {
        setOptions([]);
        setSuppliers([]);
        setUsingSupplierMaster(false);
        setSupplierNumber("");
        setOrderLineId("");
      }
      return;
    }
    let cancelled = false;
    void Promise.all([
      listOpenOrderOptions(selectedSku.sku),
      listSuppliers(selectedSku.sku).then(async (configured) => ({
        suppliers:
          configured.length > 0 ? configured : await listAllSuppliers(),
        usingMaster: configured.length === 0,
      })),
    ])
      .then(([orderOptions, supplierResult]) => {
        if (cancelled) return;
        const supplierOptions = supplierResult.suppliers;
        setOptions(orderOptions);
        setSuppliers(supplierOptions);
        setUsingSupplierMaster(supplierResult.usingMaster);
        setOrderLineId((current) =>
          orderOptions.some((item) => item.orderLineId === current)
            ? current
            : orderOptions.some(
                  (item) => item.orderLineId === requestedOrderLine,
                )
              ? requestedOrderLine
              : "",
        );
        setSupplierNumber((current) =>
          supplierOptions.some((item) => item.number === current)
            ? current
            : (supplierOptions[0]?.number ?? ""),
        );
      })
      .catch((error) => {
        if (!cancelled) setMessage(apiErrorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSku?.sku, skus.length]);

  const chooseSku = (item: Sku) => {
    setSku(item.sku);
    setSkuQuery(skuLabel(item));
    setSkuSearchOpen(false);
    setMessage("");
  };

  const addNewSku = async () => {
    const description = newSkuDescription.trim();
    if (!description) {
      setMessage("Enter the new item description.");
      return;
    }
    setCreatingSku(true);
    setMessage("");
    try {
      const created = await createSku({
        oem: newSkuOem,
        itemDescription: description,
      });
      setSkus((items) => [...items, created]);
      chooseSku(created);
      setShowNewSku(false);
      setNewSkuOem("Bajaj");
      setNewSkuDescription("");
      setMessage(
        `${created.sku} created with packing details set to zero. Complete the receipt below.`,
      );
    } catch (error) {
      setMessage(apiErrorMessage(error));
    } finally {
      setCreatingSku(false);
    }
  };

  const selectedOrder = options.find(
    (item) => item.orderLineId === orderLineId,
  );
  const selectedSupplier = suppliers.find(
    (item) => item.number === supplierNumber,
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedSku || !selectedSupplier) {
      setMessage("Select a valid SKU and one of its configured suppliers.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const receipt = await receiveMaterial({
        date,
        sku: selectedSku.sku,
        quantityReceived: quantity,
        supplier: selectedSupplier.name,
        warehouseLocation: location,
        receivedBy,
        notes,
        ...(selectedOrder
          ? {
              orderId: selectedOrder.orderId,
              orderLineId: selectedOrder.orderLineId,
            }
          : {}),
        markSupplierRequestReceived:
          Boolean(selectedOrder) && markRequestReceived,
        sendDeliveryConfirmation:
          Boolean(selectedOrder) &&
          markRequestReceived &&
          sendDeliveryConfirmation,
      });
      setRecent((items) => [receipt, ...items].slice(0, 20));
      setQuantity(0);
      setNotes("");
      setMessage(`${receipt.receiptId} received into unpacked inventory.`);
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
          <h1>Receiving</h1>
        </div>
      </div>
      <div
        className={`receiving-layout ${formCollapsed ? "form-collapsed" : ""}`}
      >
        <aside
          className={`receiving-form-panel ${formCollapsed ? "is-collapsed" : ""}`}
        >
          <button
            type="button"
            className="form-collapse-button"
            aria-expanded={!formCollapsed}
            aria-controls="receiving-form"
            onClick={() => setFormCollapsed((collapsed) => !collapsed)}
          >
            {formCollapsed ? "Receive →" : "← Hide form"}
          </button>
          <form
            id="receiving-form"
            className="sku-form workflow-form"
            onSubmit={submit}
          >
            <div className="section-heading">
              <h2>Receive material</h2>
            </div>
            <label>
              SKU
              <div className="sku-combobox receiving-sku-combobox">
                <input
                  role="combobox"
                  aria-label="Search SKU"
                  aria-expanded={skuSearchOpen}
                  aria-controls="receiving-sku-results"
                  aria-autocomplete="list"
                  aria-invalid={!selectedSku}
                  autoComplete="off"
                  required
                  placeholder="Type SKU or item description"
                  value={skuQuery}
                  onFocus={() => setSkuSearchOpen(true)}
                  onBlur={() => setSkuSearchOpen(false)}
                  onChange={(event) => {
                    setSku("");
                    setSkuQuery(event.target.value);
                    setSkuSearchOpen(true);
                    setMessage("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setSkuSearchOpen(false);
                    if (event.key === "Enter" && skuSearchOpen) {
                      event.preventDefault();
                      const firstMatch = skuMatches[0];
                      if (firstMatch) chooseSku(firstMatch);
                    }
                  }}
                />
                {skuSearchOpen && (
                  <div
                    className="sku-matches"
                    id="receiving-sku-results"
                    role="listbox"
                    aria-label="Matching SKUs"
                  >
                    {skuMatches.map((item) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={item.sku === sku}
                        key={item.sku}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => chooseSku(item)}
                      >
                        <strong>{item.sku}</strong>
                        <span>{item.itemDescription}</span>
                      </button>
                    ))}
                    {skuMatches.length === 0 && (
                      <span className="sku-no-match">No matching SKU</span>
                    )}
                  </div>
                )}
                {!selectedSku && skuQuery && !skuSearchOpen && (
                  <small className="sku-selection-error">
                    Select a match from the list
                  </small>
                )}
              </div>
            </label>
            <button
              type="button"
              className="text-button receiving-add-sku-button"
              onClick={() => {
                setShowNewSku((visible) => !visible);
                if (!showNewSku && skuQuery.trim())
                  setNewSkuDescription(skuQuery.trim());
              }}
            >
              {showNewSku ? "Cancel new SKU" : "+ Add a new SKU"}
            </button>
            {showNewSku && (
              <div className="receiving-new-sku">
                <div className="section-heading">
                  <h3>Create new SKU</h3>
                </div>
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
                    onChange={(event) =>
                      setNewSkuDescription(event.target.value)
                    }
                  />
                </label>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={creatingSku || !newSkuDescription.trim()}
                  onClick={() => void addNewSku()}
                >
                  {creatingSku ? "Creating…" : "Create and select SKU"}
                </button>
                <small>
                  Packing quantity, weight, and dimensions will start at zero
                  and can be added later in SKU master.
                </small>
              </div>
            )}
            <div className="selected-item-line">
              {selectedSku ? (
                <>
                  <strong>{selectedSku.itemDescription}</strong>
                  <span>{selectedSku.unit}</span>
                </>
              ) : (
                <span>Choose an SKU to continue</span>
              )}
            </div>
            <div className="form-grid">
              <label>
                Date received
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <label>
                Quantity received
                <input
                  type="number"
                  min="0.000001"
                  step="any"
                  required
                  value={quantity || ""}
                  onChange={(event) =>
                    setQuantity(event.target.valueAsNumber || 0)
                  }
                />
              </label>
              <label>
                Supplier
                <select
                  value={supplierNumber}
                  required
                  disabled={!selectedSku || suppliers.length === 0}
                  onChange={(event) => setSupplierNumber(event.target.value)}
                >
                  {suppliers.length === 0 && (
                    <option value="">No supplier configured</option>
                  )}
                  {suppliers.map((supplier) => (
                    <option
                      value={supplier.number}
                      key={`${supplier.name}-${supplier.number}`}
                    >
                      {supplier.name} — Priority {supplier.priority}
                    </option>
                  ))}
                </select>
                {usingSupplierMaster && suppliers.length > 0 && (
                  <small>
                    No suppliers are configured for this SKU yet. Showing the
                    supplier master list.
                  </small>
                )}
              </label>
              <label>
                Warehouse location
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                />
              </label>
              <label>
                Received by
                <input
                  required
                  minLength={2}
                  value={receivedBy}
                  onChange={(event) => setReceivedBy(event.target.value)}
                />
              </label>
            </div>
            <label>
              Optional linked order
              <select
                value={orderLineId}
                onChange={(event) => {
                  setOrderLineId(event.target.value);
                  setMarkRequestReceived(false);
                  setSendDeliveryConfirmation(false);
                }}
                disabled={!selectedSku}
              >
                <option value="">General stock — no order link</option>
                {options.map((option) => (
                  <option value={option.orderLineId} key={option.orderLineId}>
                    {option.orderId} — {option.customerName} —{" "}
                    {option.remainingQuantity} remaining
                  </option>
                ))}
              </select>
            </label>
            {selectedOrder && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={markRequestReceived}
                  onChange={(event) => {
                    setMarkRequestReceived(event.target.checked);
                    if (!event.target.checked)
                      setSendDeliveryConfirmation(false);
                  }}
                />{" "}
                Mark linked supplier request received
              </label>
            )}
            {selectedOrder && markRequestReceived && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={sendDeliveryConfirmation}
                  onChange={(event) =>
                    setSendDeliveryConfirmation(event.target.checked)
                  }
                />{" "}
                Send delivery confirmation on WhatsApp
              </label>
            )}
            <label>
              Notes
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
            {message && <div className="notice">{message}</div>}
            <button
              className="primary-button"
              disabled={
                saving ||
                creatingSku ||
                !selectedSku ||
                !selectedSupplier ||
                quantity <= 0
              }
            >
              {saving ? "Receiving…" : "Mark as received"}
            </button>
          </form>
        </aside>

        <section className="recent-receipts-panel">
          <div className="section-heading">
            <h2>Recently received</h2>
            <span>Latest {recent.length}</span>
          </div>
          <div
            className="data-table"
            role="table"
            aria-label="Recently received materials"
          >
            <div className="receipt-row receipt-head" role="row">
              <span>Receipt</span>
              <span>Date</span>
              <span>SKU / item</span>
              <span>Quantity</span>
              <span>Supplier</span>
              <span>Location</span>
              <span>Order</span>
            </div>
            {recent.map((receipt) => (
              <div className="receipt-row" role="row" key={receipt.receiptId}>
                <strong>{receipt.receiptId}</strong>
                <span>{receipt.date}</span>
                <span>
                  <strong>{receipt.sku}</strong>
                  <small>{receipt.itemDescription}</small>
                </span>
                <span>
                  {receipt.quantityReceived} {receipt.unit}
                </span>
                <span>{receipt.supplier}</span>
                <span>{receipt.warehouseLocation || "—"}</span>
                <span>{receipt.orderId ?? "General"}</span>
              </div>
            ))}
            {recent.length === 0 && (
              <div className="table-empty">
                No receipts have been recorded yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
};

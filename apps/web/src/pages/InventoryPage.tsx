import { useEffect, useState } from "react";
import type { InventoryItem } from "@kv-infra/shared";

import { apiErrorMessage, listInventory } from "../api/client";

export const InventoryPage = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void listInventory()
      .then(setItems)
      .catch((error) => setMessage(apiErrorMessage(error)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = items.filter((item) =>
    `${item.sku} ${item.itemDescription} ${item.warehouseLocation}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  const summary = {
    unpacked: items.filter((item) => item.unpackedQuantity > 0).length,
    inPacking: items.filter((item) => item.inPackingQuantity > 0).length,
    available: items.filter((item) => item.availableQuantity > 0).length,
    unavailable: items.filter((item) => item.availableQuantity === 0).length,
  };

  return (
    <section className="page-panel">
      <div className="page-title-row">
        <div>
          <span className="eyebrow">Warehouse position</span>
          <h1>Inventory</h1>
        </div>
        <span>{items.length} active SKUs</span>
      </div>

      <div className="metric-grid" aria-label="Inventory SKU summary">
        <div>
          <span>SKUs with unpacked stock</span>
          <strong>{summary.unpacked}</strong>
        </div>
        <div>
          <span>SKUs in packing</span>
          <strong>{summary.inPacking}</strong>
        </div>
        <div>
          <span>SKUs available</span>
          <strong>{summary.available}</strong>
        </div>
        <div className="metric-primary">
          <span>SKUs with no availability</span>
          <strong>{summary.unavailable}</strong>
        </div>
      </div>

      <input
        className="search-input"
        aria-label="Search inventory"
        placeholder="Search SKU, description, or warehouse location"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {message && <div className="notice error-notice">{message}</div>}
      {loading ? (
        <p>Loading inventory…</p>
      ) : (
        <div className="data-table" role="table" aria-label="Inventory list">
          <div className="inventory-row inventory-head" role="row">
            <span>SKU</span>
            <span>Item description</span>
            <span>Unpacked</span>
            <span>In packing</span>
            <span>Packed CTNs</span>
            <span>Packed total</span>
            <span>Assigned</span>
            <span>Available</span>
            <span>Unit</span>
            <span />
          </div>
          {filtered.map((item) => (
            <div className="inventory-row" role="row" key={item.sku}>
              <strong>{item.sku}</strong>
              <span>{item.itemDescription}</span>
              <span>{item.unpackedQuantity}</span>
              <span>{item.inPackingQuantity}</span>
              <span>{item.packedCartons}</span>
              <span>{item.packedTotalQuantity}</span>
              <span>{item.totalAssigned}</span>
              <strong>{item.availableQuantity}</strong>
              <span>{item.unit}</span>
              <a
                className="text-button"
                href={`/inventory/${encodeURIComponent(item.sku)}`}
              >
                View
              </a>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="table-empty">No inventory rows found.</div>
          )}
        </div>
      )}
    </section>
  );
};

import { useEffect, useState } from "react";
import type { PackingSession } from "@kv-infra/shared";

import { apiErrorMessage, listPacking } from "../api/client";

type PackingData = Awaited<ReturnType<typeof listPacking>>;

export const PackingPage = () => {
  const [data, setData] = useState<PackingData | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void listPacking()
      .then(setData)
      .catch((error) => setMessage(apiErrorMessage(error)));
  }, []);

  const active = (data?.sessions ?? []).filter(
    (session: PackingSession) => session.status === "IN PACKING",
  );

  return (
    <section className="page-panel">
      <div className="page-title-row orders-title-row">
        <div>
          <span className="eyebrow">Warehouse workflow</span>
          <h1>Packing / QA</h1>
        </div>
        <a className="primary-button create-order-link" href="/packing/start">
          + Start new packing
        </a>
      </div>
      {message && <div className="notice error-notice">{message}</div>}
      {!data && !message && <p>Loading packing activity…</p>}
      {data && (
        <>
          <div className="section-heading orders-heading">
            <h2>Currently in packing</h2>
            <span>{active.length} sessions</span>
          </div>
          <div
            className="data-table"
            role="table"
            aria-label="Currently in packing"
          >
            <div className="packing-row packing-head" role="row">
              <span>Packing ID</span>
              <span>SKU / item</span>
              <span>Qty taken</span>
              <span>Linked order</span>
              <span />
            </div>
            {active.map((session) => (
              <div className="packing-row" role="row" key={session.packingId}>
                <strong>{session.packingId}</strong>
                <span>
                  <strong>{session.sku}</strong>
                  <small>{session.itemDescription}</small>
                </span>
                <span>
                  {session.quantityTaken} {session.unit}
                </span>
                <span>{session.orderId ?? "General stock"}</span>
                <a
                  className="text-button"
                  href={`/packing/${encodeURIComponent(session.packingId)}/finish`}
                >
                  Finish
                </a>
              </div>
            ))}
            {active.length === 0 && (
              <div className="table-empty">
                Nothing is currently in packing.
              </div>
            )}
          </div>
          <div className="section-heading orders-heading">
            <h2>Unpacked stock available</h2>
            <span>{data.unpackedInventory.length} SKUs</span>
          </div>
          <div
            className="data-table"
            role="table"
            aria-label="Unpacked stock available"
          >
            <div className="unpacked-row packing-head" role="row">
              <span>SKU</span>
              <span>Item</span>
              <span>Unpacked</span>
              <span />
            </div>
            {data.unpackedInventory.map((item) => (
              <div className="unpacked-row" role="row" key={item.sku}>
                <strong>{item.sku}</strong>
                <span>{item.itemDescription}</span>
                <span>
                  {item.unpackedQuantity} {item.unit}
                </span>
                <a
                  className="text-button"
                  href={`/packing/start?sku=${encodeURIComponent(item.sku)}`}
                >
                  Start
                </a>
              </div>
            ))}
            {data.unpackedInventory.length === 0 && (
              <div className="table-empty">No unpacked stock is available.</div>
            )}
          </div>
        </>
      )}
    </section>
  );
};

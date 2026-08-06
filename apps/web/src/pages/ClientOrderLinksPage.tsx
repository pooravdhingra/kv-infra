import { useEffect, useState, type FormEvent } from "react";
import type { ClientOrderLink } from "@kv-infra/shared";

import {
  apiErrorMessage,
  createClientOrderLink,
  disableClientOrderLink,
  listClientOrderLinks,
} from "../api/client";

const copyLink = async (url: string) => {
  await navigator.clipboard.writeText(url);
};

export const ClientOrderLinksPage = () => {
  const [links, setLinks] = useState<ClientOrderLink[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = async () => setLinks(await listClientOrderLinks());

  useEffect(() => {
    void load()
      .catch((error) => setMessage(apiErrorMessage(error)))
      .finally(() => setLoading(false));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("create");
    setMessage("");
    try {
      const created = await createClientOrderLink(customerName);
      setLinks((current) => [created, ...current]);
      setCustomerName("");
      try {
        await copyLink(created.url);
        setMessage(`${created.customerName} link created and copied.`);
      } catch {
        setMessage(
          `${created.customerName} link created. Use Copy in the table to copy it.`,
        );
      }
    } catch (error) {
      setMessage(apiErrorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const disable = async (link: ClientOrderLink) => {
    if (
      !window.confirm(
        `Take down the public order link for ${link.customerName}?`,
      )
    )
      return;
    setBusy(link.linkId);
    setMessage("");
    try {
      const updated = await disableClientOrderLink(link.linkId);
      setLinks((current) =>
        current.map((item) =>
          item.linkId === updated.linkId ? updated : item,
        ),
      );
      setMessage(`${link.customerName} link disabled.`);
    } catch (error) {
      setMessage(apiErrorMessage(error));
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="page-panel">
      <a className="back-link" href="/orders">
        ← Orders
      </a>
      <div className="page-title-row">
        <div>
          <h1>Client order links</h1>
        </div>
        <span>
          {links.filter((link) => link.status === "OPEN").length} open
        </span>
      </div>
      <form className="client-link-form" onSubmit={submit}>
        <label>
          Customer name
          <input
            required
            minLength={2}
            maxLength={120}
            placeholder="Customer name"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
          />
        </label>
        <button
          className="primary-button"
          aria-busy={busy === "create"}
          disabled={Boolean(busy) || customerName.trim().length < 2}
        >
          Create and copy link
        </button>
      </form>
      {message && <div className="notice">{message}</div>}
      {loading ? (
        <p>Loading client links…</p>
      ) : (
        <div
          className="data-table"
          role="table"
          aria-label="Client order links"
        >
          <div className="client-link-row client-link-head" role="row">
            <span>Link</span>
            <span>Customer</span>
            <span>Status</span>
            <span>Order</span>
            <span>Created</span>
            <span />
          </div>
          {links.map((link) => (
            <div className="client-link-row" role="row" key={link.linkId}>
              <strong>{link.linkId}</strong>
              <span>{link.customerName}</span>
              <span
                className={`stock-badge client-link-${link.status.toLowerCase()}`}
              >
                {link.status}
              </span>
              <span>{link.orderId ?? "—"}</span>
              <span>{new Date(link.createdAt).toLocaleDateString()}</span>
              <div className="client-link-actions">
                {(link.status === "OPEN" || link.status === "SUBMITTED") && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      void copyLink(link.url).then(() =>
                        setMessage("Link copied."),
                      )
                    }
                  >
                    Copy
                  </button>
                )}
                {link.orderId && link.status !== "DISABLED" && (
                  <a
                    className="text-button"
                    href={`/orders/${encodeURIComponent(link.orderId)}`}
                  >
                    Order
                  </a>
                )}
                {link.status !== "DISABLED" && link.status !== "SHIPPED" && (
                  <button
                    type="button"
                    className="text-button danger-text"
                    aria-busy={busy === link.linkId}
                    disabled={Boolean(busy)}
                    onClick={() => void disable(link)}
                  >
                    Disable
                  </button>
                )}
              </div>
            </div>
          ))}
          {links.length === 0 && (
            <div className="table-empty">
              No client order links created yet.
            </div>
          )}
        </div>
      )}
    </section>
  );
};

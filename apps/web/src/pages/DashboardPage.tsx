const actions = [
  ["SKU master", "Create and maintain packing master items", "/skus"],
  ["Orders", "View pending orders or create a new one", "/orders"],
  ["Receive material", "Log incoming supplier stock", "/receiving"],
  ["Start packing", "Move unpacked stock into QA", "/packing"],
  ["View inventory", "See packed and unpacked totals", "/inventory"],
] as const;

export const DashboardPage = () => (
  <>
    <section className="hero">
      <span className="eyebrow">
        {new Intl.DateTimeFormat("en-IN", { dateStyle: "full" }).format(
          new Date(),
        )}
      </span>
      <h1>What needs attention?</h1>
      <p>Review pending orders, inventory positions, and daily operations.</p>
    </section>

    <section className="section">
      <div className="section-heading">
        <h2>Primary actions</h2>
        <span>Phases 2–5</span>
      </div>
      <div className="action-grid">
        {actions.map(([title, description, href], index) => (
          <a className="action-card" href={href} key={title}>
            <span className="action-number">0{index + 1}</span>
            <h3>{title}</h3>
            <p>{description}</p>
            <span className="arrow">→</span>
          </a>
        ))}
      </div>
    </section>

    <section className="section two-column">
      <div className="queue-card">
        <div className="section-heading">
          <h2>Today’s work</h2>
          <span>Preview</span>
        </div>
        <div className="empty-state">
          <strong>Connect and verify Google Sheets</strong>
          <p>
            Open Settings to authorize Google, validate both spreadsheet IDs,
            and confirm the required master tabs.
          </p>
        </div>
      </div>
      <aside className="principle-card">
        <span className="eyebrow">Operating principle</span>
        <blockquote>
          “A safer and faster way to operate the existing Sheets + WhatsApp
          workflow.”
        </blockquote>
      </aside>
    </section>
  </>
);

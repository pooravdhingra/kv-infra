const actions = [
  ["New order", "Create a customer order and check stock", "/orders/new"],
  ["Receive material", "Log incoming supplier stock", "/receiving"],
  ["Start packing", "Move unpacked stock into QA", "/packing"],
  ["View inventory", "See packed and unpacked totals", "/inventory"],
] as const;

export const DashboardPage = () => (
  <>
    <section className="hero">
      <span className="eyebrow">Friday, 31 July</span>
      <h1>What needs attention?</h1>
      <p>
        The application shell is ready. Live work queues arrive with Sheets
        integration.
      </p>
    </section>

    <section className="section">
      <div className="section-heading">
        <h2>Primary actions</h2>
        <span>Phase 1 skeleton</span>
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
          <strong>No Sheets connection yet</strong>
          <p>
            Phase 2 will populate follow-ups, stock alerts, and ready-to-reserve
            items.
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

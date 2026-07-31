const pageCopy: Record<string, [string, string]> = {
  "/orders/new": [
    "Create new order",
    "Order creation begins after the Google Sheets adapter is connected.",
  ],
  "/receiving": [
    "Receive material",
    "Receiving and inventory mutations are scheduled after the Sheets foundation.",
  ],
  "/packing": [
    "Packing & QA",
    "Packing transitions will be built and tested as explicit inventory movements.",
  ],
  "/inventory": [
    "Inventory",
    "Packed, unpacked, assigned, and available quantities will appear here.",
  ],
};

export const PlaceholderPage = () => {
  const { pathname } = window.location;
  const [title, copy] = pageCopy[pathname] ?? [
    "Coming soon",
    "This module is not part of the current phase.",
  ];

  return (
    <section className="placeholder">
      <span className="eyebrow">Module placeholder</span>
      <h1>{title}</h1>
      <p>{copy}</p>
      <a href="/">← Back to dashboard</a>
    </section>
  );
};

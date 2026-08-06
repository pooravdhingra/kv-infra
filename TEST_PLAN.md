# Test plan

## Automated checks

- Shared environment schema accepts the example local configuration.
- API health route returns status and version.
- Web and API TypeScript compile independently.
- Production builds complete from the repository root.
- Dashboard recommendations prioritize failed sends, due follow-ups, active packing, and actionable order states from live workflow data.
- Dashboard recommendations include incomplete SKUs whose carton quantity, weight, or dimensions contain zero values.
- Exact Sheets headers pass and mismatched headers fail before writes.
- SKU creation requires an OEM, assigns the next independent `KV-BNNNNNN`, `KV-TNNNNNN`, `KV-PNNNNNN`, or `KV-XNNNNNN` identifier, and adds both master and inventory records.
- SKU creation accepts OEM and item description alone, defaulting packing quantity, weight, and dimensions to zero and unit to `pcs`.
- Legacy and other-OEM SKU names do not affect the selected OEM sequence.
- Generated identifiers continue safely beyond six digits.
- SKU deletion archives matching master/inventory identities, hides the SKU from active results, and does not allow its generated identifier to be reused.
- Inventory totals are derived from carton size, packed cartons, and assigned quantity; unpacked stock is excluded from available.
- Manual adjustments reject negative buckets and assignments above packed total, then append an audit note.
- Order creation calculates total quantity, gross kilograms, and CBM; generates the next yearly order ID; and writes formulas to the order tab.
- Stock checks distinguish ready-to-reserve, needs-packing, and needs-supplier states.
- Suggested actions prioritize sufficient packed stock, active supplier requests, sufficient unpacked stock, and supplier shortfalls in that order.
- Receiving increases only unpacked stock and general receipts never alter order/request state.
- Packing start conserves quantity across unpacked and in-packing buckets and rejects overdraw.
- Packing finish requires exact QA reconciliation and complete cartons, then appends a separate finished event.
- Zero-valued SKU packing fields are treated as Missing, and the shared completeness check identifies every missing field.
- Linked packing assigns only good stock to the exact order line and appends an allocation.
- Receiving order lookup batch-reads order tabs and fires only after a complete SKU selection.
- Multi-tab reads associate returned values by sheet name, including when an earlier tab is empty and omitted from Google's response.
- Supplier Master is read through a one-minute cache and suppliers are priority sorted.
- The all-suppliers fallback deduplicates supplier identities for receiving a newly created SKU without a configured supplier row.
- A receipt write reuses one Receiving Log snapshot and commits Inventory plus log row in one values batch update.
- Direct allocations enforce available packed stock and exact remaining demand.
- Fully reserved order lines derive reserved quantity from the allocation ledger, show zero shortfall, and do not request supplier action even if the order tab cell is stale.
- Shipping rejects partially reserved orders, consumes the exact packed cartons and assigned quantity, completes fully reserved orders idempotently, and prevents later stock/allocation mutations.
- Completed orders leave Pending Orders and remain browsable in the Completed Orders tab.
- Allocation cancellation restores assigned stock through a compensating append-only event.
- Supplier request and follow-up message builders preserve the approved wording and case.
- Group supplier review requires every draft to be approved, keeps every message editable, combines same-number items into one send, preserves one request row per line, and spaces distinct messages by 5–55 seconds.
- Displayed CBM values round to no more than ten decimal places.
- Failed WhatsApp attempts remain audit-logged and retryable.
- Ten-digit supplier numbers receive the configured default country code, and nonexistent WhatsApp recipients fail before the attempt is recorded as sent.
- Optional delivery confirmation is allowed only for an explicitly received linked request and cannot block the receipt.
- Follow-up scheduling uses three-day timestamps and prevents a second send on the same operator-local day.

## Business-rule tests required before integration

- Quantity, weight, and cubic-metre calculations, including decimals and zero.
- Available quantity excludes unpacked quantity and subtracts assigned quantity.
- Receiving only increases unpacked quantity.
- Start/finish packing movements conserve quantity and reject overdraw.
- Allocation cannot exceed available quantity; cancellation restores it.
- Duplicate SKU and repeated idempotency keys do not duplicate writes.
- Same SKU can appear on two separate order lines without ambiguity.
- Explicitly linked receipt stops the correct request; general receipt does not.
- Follow-up becomes due after three days, skips received/disabled requests, and cannot auto-send twice in one day.

## Manual smoke test

1. Copy `.env.example` to `.env` and run `npm install`.
2. Run `npm run dev`.
3. Confirm the web shell renders at `http://localhost:5173`.
4. Confirm `http://localhost:4000/api/health` returns JSON.
5. Stop dev mode and run `npm run typecheck`, `npm test`, and `npm run build`.
6. Follow `ENVIRONMENT_SETUP.md` to authorize Google and verify the live Sheets contract.
7. Open Inventory and confirm the row totals match the visible Inventory formulas.
8. Preview a new order and verify quantity, gross weight, and CBM update as carton count changes.
9. In a non-production orders workbook, create an order and confirm the tab name, frozen header, hidden system columns, formulas, and initial stock status.
10. In a non-production master workbook, receive stock, start packing, finish QA, and verify Inventory plus all append-only log rows after each step.
11. Reserve and cancel fake stock from an order, verifying positive and compensating negative allocation rows.
12. Link a non-production WhatsApp account, send only to a controlled test number, and verify initial/follow-up log rows and three-day scheduling.

## Integration test fixtures

Use only fake customers, suppliers, phone numbers, and SKUs. Never copy production Sheets or WhatsApp sessions into the repository.

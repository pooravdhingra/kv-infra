# Test plan

## Phase 1 automated checks

- Shared environment schema accepts the example local configuration.
- API health route returns status and version.
- Web and API TypeScript compile independently.
- Production builds complete from the repository root.

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

## Manual Phase 1 smoke test

1. Copy `.env.example` to `.env` and run `npm install`.
2. Run `npm run dev`.
3. Confirm the web shell renders at `http://localhost:5173`.
4. Confirm `http://localhost:4000/api/health` returns JSON.
5. Stop dev mode and run `npm run typecheck`, `npm test`, and `npm run build`.

## Integration test fixtures

Use only fake customers, suppliers, phone numbers, and SKUs. Never copy production Sheets or WhatsApp sessions into the repository.

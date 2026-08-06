# Data model

## Identifiers

- SKU: `KV-BNNNN`, `KV-TNNNN`, `KV-PNNNN`, or `KV-XNNNN`, allocated independently by OEM. Four digits are the minimum and each sequence expands without wrapping. Existing legacy identifiers remain valid and unchanged.
- Order: `ORD-YYYY-NNNN`
- Order line: `ORD-YYYY-NNNN-LNNN`
- Receipt, packing, allocation, supplier request, and message records each receive immutable unique IDs.

IDs, not sheet row numbers, are cross-sheet references. A repeated SKU in one order is valid because each line has its own ID.

## Entities

- **SKU**: static packing metadata and carton dimensions.
- **Supplier**: a supplier option for a SKU, ordered by priority.
- **Order / order line**: requested cartons and calculated quantities.
- **Inventory**: one aggregate row per SKU.
- **Receipt**: append-only material receipt event.
- **Packing record**: append-only QA/packing event.
- **Allocation**: append-only assignment preventing double allocation.
- **Supplier request**: shortfall request and follow-up state.
- **WhatsApp message**: append-only delivery/audit record.

## Stored statuses

Supplier request status is one of `SENT`, `CONFIRMED`, or `RECEIVED`. `FOLLOW_UP_DUE` is calculated, never stored.

QA event status is `IN PACKING` or `FINISHED`. Both states are append events under one packing ID; business log rows are never rewritten.

## Derived values

- `PACKED TOTAL QTY = PACKED CTNS × QTY / CARTON`
- `AVAILABLE QTY = PACKED TOTAL QTY - TOTAL ASSIGNED`
- `T-QTY = NO OF CTNS × QUANTITY/CTN`
- `GROSS WT = NO OF CTNS × WEIGHT/CTN`
- `VOLUME (CBM) = LENGTH (in) × BREADTH (in) × HEIGHT (in) × NO OF CTNS × 0.000016387064`

Derived values must be recalculated from source fields and must never drift below zero.

Exception: while an SKU's `QUANTITY/CTN` is missing, an order line stores direct `T-QTY` and leaves carton count unavailable. Finishing packing after carton quantity is recorded backfills the pending order and restores the standard formulas.

# Data model

## Identifiers

- SKU: `KV-NNNNNN`, allocated sequentially by the API. Six digits are the minimum; the sequence expands beyond six digits without wrapping.
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
- `VOLUME = LENGTH × BREADTH × HEIGHT × NO OF CTNS / 1,000,000`

Derived values must be recalculated from source fields and must never drift below zero.

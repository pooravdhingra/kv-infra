# Google Sheets contract

Column names and order below are exact. Integration code must fail visibly when headers do not match; it must not silently write into a guessed column.

## PACKING MASTER LIST

`SKU`, `ITEM DESCRIPTION`, `QUANTITY/CTN`, `UNIT`, `WEIGHT/CTN`, `LENGTH`, `BREADTH`, `HEIGHT`

One row per SKU. Creating a SKU also creates its zero-valued inventory row if absent.

New SKU identifiers encode the OEM and maintain independent sequences: `KV-B0001` for Bajaj, `KV-T0001` for TVS, `KV-P0001` for Piaggio, and `KV-X0001` for Other. Four digits are the minimum; sequences expand naturally to five or more digits. Existing `KV-000001`-style and other legacy identifiers remain valid and unchanged. OEM is encoded in the immutable SKU rather than adding a sheet column. New SKU units are `pcs`, `set`, or `kit`, and item descriptions are stored in uppercase. `WEIGHT/CTN` is stored in kilograms; `LENGTH`, `BREADTH`, and `HEIGHT` are stored in inches. A provisional SKU may be created with only OEM and item description; `QUANTITY/CTN`, `WEIGHT/CTN`, `LENGTH`, `BREADTH`, and `HEIGHT` are stored as `0` until measured and edited, and `UNIT` defaults to `pcs`.

## SUPPLIER MASTER LIST

`SKU`, `ITEM DESCRIPTION`, `NAME`, `NUMBER`, `PRIORITY SCALE`

Multiple rows per SKU are allowed. Lower priority-scale value is offered first.

## Order tabs

Tab name: `Customer Name - DD Mon YYYY`. Resolve collisions safely without changing the order ID.

Visible columns: `SKU`, `ITEM DESCRIPTION`, `QUANTITY/CTN`, `UNIT`, `NO OF CTNS`, `T-QTY`, `WEIGHT/CTN`, `GROSS WT`, `VOLUME`, `STATUS`, `LENGTH`, `BREADTH`, `HEIGHT`.

Hidden columns: `ORDER ID`, `ORDER LINE ID`, `ORDER DATE`, `REQUIRED QTY`, `RESERVED QTY`, `SHORTFALL QTY`, `SUPPLIER REQUEST STATUS`, `LAST UPDATED`, `ORDER NOTES`, `CUSTOMER NAME`.

Customer names are stored in uppercase.

The first row is frozen and all system columns are hidden. Normally, `T-QTY`, `GROSS WT`, `VOLUME`, and `REQUIRED QTY` are formulas. A provisional line whose SKU has `QUANTITY/CTN = 0` stores operator-entered `T-QTY` directly, leaves `NO OF CTNS`, `GROSS WT`, and `VOLUME` blank, and keeps `REQUIRED QTY = T-QTY`. When packing later records a positive carton quantity, every matching pending line receives the latest SKU packing values, derives `NO OF CTNS = T-QTY / QUANTITY/CTN`, and returns to normal formulas; completed orders are never rewritten. Volume converts inch dimensions to CBM using `LENGTH × BREADTH × HEIGHT × NO OF CTNS × 0.000016387064`. A stock-check refresh also rewrites this formula for complete pending order rows. While pending, `STATUS` is one of `READY TO RESERVE`, `NEEDS PACKING`, `NEEDS SUPPLIER`, or `FULLY RESERVED`. A fully reserved row has zero `SHORTFALL QTY`. The append-only allocation ledger is authoritative for `RESERVED QTY`; a stock-check refresh reconciles that value and updates `STATUS`, `SHORTFALL QTY`, and `LAST UPDATED` without assigning additional stock. Shipping writes `SHIPPED` to `STATUS` and the same completion timestamp to `LAST UPDATED` on every order line, while Inventory reduces `PACKED CTNS` and `TOTAL ASSIGNED` by the shipped quantities. No business rows are deleted or moved between spreadsheets.

## INVENTORY

`SKU`, `ITEM DESCRIPTION`, `QTY / CARTON`, `UNIT`, `UNPACKED QTY`, `IN PACKING QTY`, `PACKED CTNS`, `PACKED TOTAL QTY`, `TOTAL ASSIGNED`, `AVAILABLE QTY`, `DEFECTIVE / SHORT QTY`, `LAST RECEIVED DATE`, `LAST PACKED DATE`, `WAREHOUSE LOCATION`, `NOTES`, `LAST UPDATED`

Exactly one row per SKU. Unpacked stock never contributes to available quantity.

`PACKED TOTAL QTY = PACKED CTNS × QTY / CARTON`. `AVAILABLE QTY = PACKED TOTAL QTY − TOTAL ASSIGNED`. Both are written as visible formulas, while the API independently recalculates and validates them before returning data. A provisional SKU may have `QTY / CARTON = 0` until its first packing measurements are entered; it cannot be added to an order until carton quantity is positive. Manual corrections use deltas, cannot make any stock bucket negative, and append the operator-entered reason to `NOTES` rather than deleting history.

## RECEIVING LOG

`RECEIPT ID`, `DATE`, `SKU`, `ITEM DESCRIPTION`, `QTY RECEIVED`, `UNIT`, `SUPPLIER`, `WAREHOUSE LOCATION`, `RECEIVED BY`, `NOTES`, `ITEM CHECK STATUS`, `ORDER ID`, `ORDER LINE ID`

Append-only. `ITEM CHECK STATUS` starts as `UNCHECKED`. Order identifiers are blank for general stock. Only an explicit exact order-line link changes its order/request state.

`RECEIVED BY` is stored in uppercase.

## QA LOG

`PACKING ID`, `DATE`, `SKU`, `ITEM DESCRIPTION`, `QTY TAKEN FOR PACKING`, `GOOD QTY`, `PACKED CTNS`, `DEFECTIVE QTY`, `SHORT QTY`, `ASSIGNED TO ORDER?`, `ORDER ID`, `ORDER LINE ID`, `STATUS`, `NOTES`, `LEFT UNPACKED`

Append-only. Starting packing appends an `IN PACKING` event. Finishing appends a second `FINISHED` event with the same packing ID; the initial row is never edited. `GOOD QTY + DEFECTIVE QTY + SHORT QTY + LEFT UNPACKED` must equal quantity taken, and good quantity must equal complete packed cartons multiplied by the SKU carton quantity. Left-unpacked quantity returns to Inventory's unpacked bucket.

## ORDER ALLOCATIONS

`ALLOCATION ID`, `ORDER ID`, `ORDER LINE ID`, `SKU`, `ITEM DESCRIPTION`, `QTY ASSIGNED`, `NOTES`

Append-only. This is the source for preventing double assignment.

Phase 8 creates an allocation automatically only when the operator explicitly links packing to an exact order line. Its notes include the source packing ID.

Direct reservations append a positive `QTY ASSIGNED`. Cancellation never removes that row: it appends a new allocation event with the negative quantity and a notes prefix of `[CANCELS: original-allocation-id]`.

## SUPPLIER REQUESTS

`REQUEST ID`, `ORDER ID`, `ORDER LINE ID`, `SKU`, `ITEM DESCRIPTION`, `REQUIRED QTY`, `AVAILABLE QTY`, `SHORTFALL QTY`, `SELECTED SUPPLIER`, `SUPPLIER NUMBER`, `SUPPLIER PRIORITY`, `LAST MESSAGE AT`, `NEXT FOLLOW-UP AT`, `STATUS`, `AUTO FOLLOW-UP ENABLED`, `NOTES`

Status is `SENT`, `SEND FAILED`, `CONFIRMED`, or `RECEIVED`. A failed WhatsApp attempt remains visible and retryable. Successful initial and follow-up sends set the next follow-up to three days after the send timestamp. `RECEIVED` always disables follow-ups.

## WHATSAPP LOG

`MESSAGE ID`, `REQUEST ID`, `ORDER ID`, `SKU`, `SUPPLIER NAME`, `SUPPLIER NUMBER`, `MESSAGE TYPE`, `MESSAGE BODY`, `SENT AT`, `ERROR MESSAGE`, `FOLLOW-UP NUMBER`, `NOTES`

Append-only. Message type is `INITIAL ORDER`, `FOLLOW-UP`, or `DELIVERY CONFIRMATION`.

Every attempted send is logged. A successful row has `SENT AT`; a failed row has `ERROR MESSAGE`. Session credentials and WhatsApp encryption material are never written to Sheets.

## Write safety

- Validate headers before every mutation.
- Read by immutable ID; do not persist row numbers as identity.
- Record timestamps in ISO 8601 and display them in the operator's local timezone.
- A retry with the same idempotency key must not duplicate an append.
- Google Sheets timeouts and transient throttling responses use bounded exponential-backoff retries before an operator-facing error is returned.
- Concurrent reads for tabs in the same workbook are batched, duplicate in-flight reads are shared, and a short read-through cache is invalidated immediately after application writes.
- Never physically delete a business row from the application.
- SKU deletion archives the matching Packing Master and Inventory identities with a `DELETED-` prefix in one batch update. Active views hide archived SKUs, while generated sequence numbers continue to account for them.

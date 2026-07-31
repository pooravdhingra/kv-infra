# Google Sheets contract

Column names and order below are exact. Integration code must fail visibly when headers do not match; it must not silently write into a guessed column.

## PACKING MASTER LIST

`SKU`, `ITEM DESCRIPTION`, `QUANTITY/CTN`, `UNIT`, `WEIGHT/CTN`, `LENGTH`, `BREADTH`, `HEIGHT`

One row per SKU. Creating a SKU also creates its zero-valued inventory row if absent.

## SUPPLIER MASTER LIST

`SKU`, `ITEM DESCRIPTION`, `NAME`, `NUMBER`, `PRIORITY SCALE`

Multiple rows per SKU are allowed. Lower priority-scale value is offered first.

## Order tabs

Tab name: `Customer Name - DD Mon YYYY`. Resolve collisions safely without changing the order ID.

Visible columns: `SKU`, `ITEM DESCRIPTION`, `QUANTITY/CTN`, `UNIT`, `NO OF CTNS`, `T-QTY`, `WEIGHT/CTN`, `GROSS WT`, `VOLUME`, `STATUS`, `LENGTH`, `BREADTH`, `HEIGHT`.

Hidden columns: `ORDER ID`, `ORDER LINE ID`, `ORDER DATE`, `REQUIRED QTY`, `RESERVED QTY`, `SHORTFALL QTY`, `SUPPLIER REQUEST STATUS`, `LAST UPDATED`.

## INVENTORY

`SKU`, `ITEM DESCRIPTION`, `QTY / CARTON`, `UNIT`, `UNPACKED QTY`, `IN PACKING QTY`, `PACKED CTNS`, `PACKED TOTAL QTY`, `TOTAL ASSIGNED`, `AVAILABLE QTY`, `DEFECTIVE / SHORT QTY`, `LAST RECEIVED DATE`, `LAST PACKED DATE`, `WAREHOUSE LOCATION`, `NOTES`, `LAST UPDATED`

Exactly one row per SKU. Unpacked stock never contributes to available quantity.

## RECEIVING LOG

`RECEIPT ID`, `DATE`, `SKU`, `ITEM DESCRIPTION`, `QTY RECEIVED`, `UNIT`, `SUPPLIER`, `WAREHOUSE LOCATION`, `RECEIVED BY`, `NOTES`, `ITEM CHECK STATUS`

Append-only. A receipt may optionally link to an order/request in application metadata; only an explicit link changes supplier-request state.

## QA LOG

`PACKING ID`, `DATE`, `SKU`, `ITEM DESCRIPTION`, `QTY TAKEN FOR PACKING`, `GOOD QTY`, `PACKED CTNS`, `DEFECTIVE QTY`, `SHORT QTY`, `ASSIGNED TO ORDER?`, `ORDER ID`, `NOTES`

Append-only.

## ORDER ALLOCATIONS

`ALLOCATION ID`, `ORDER ID`, `ORDER LINE ID`, `SKU`, `ITEM DESCRIPTION`, `QTY ASSIGNED`, `NOTES`

Append-only. This is the source for preventing double assignment.

## SUPPLIER REQUESTS

`REQUEST ID`, `ORDER ID`, `ORDER LINE ID`, `SKU`, `ITEM DESCRIPTION`, `REQUIRED QTY`, `AVAILABLE QTY`, `SHORTFALL QTY`, `SELECTED SUPPLIER`, `SUPPLIER NUMBER`, `SUPPLIER PRIORITY`, `LAST MESSAGE AT`, `NEXT FOLLOW-UP AT`, `STATUS`, `AUTO FOLLOW-UP ENABLED`, `NOTES`

## WHATSAPP LOG

`MESSAGE ID`, `REQUEST ID`, `ORDER ID`, `SKU`, `SUPPLIER NAME`, `SUPPLIER NUMBER`, `MESSAGE TYPE`, `MESSAGE BODY`, `SENT AT`, `ERROR MESSAGE`, `FOLLOW-UP NUMBER`, `NOTES`

Append-only. Message type is `INITIAL ORDER`, `FOLLOW-UP`, or `DELIVERY CONFIRMATION`.

## Write safety

- Validate headers before every mutation.
- Read by immutable ID; do not persist row numbers as identity.
- Record timestamps in ISO 8601 and display them in the operator's local timezone.
- A retry with the same idempotency key must not duplicate an append.
- Never delete a business row from the application.

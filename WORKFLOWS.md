# Workflows

## Create SKU

Generate the next sequential `KV-NNNNNN` identifier, append to `PACKING MASTER LIST`, then create a zero-valued `INVENTORY` row with the same identifier. Legacy SKU formats remain readable but do not affect the generated sequence.

## Delete SKU

After explicit operator confirmation, archive the matching Packing Master and Inventory identities with a `DELETED-` prefix in one Sheets values batch update. Hide archived SKUs from active application lists, preserve their rows for audit, and include archived generated IDs when calculating the next sequence number so IDs are never reused.

## Create order and stock check

Generate `ORD-YYYY-NNNN` and stable line IDs, create a collision-safe `Customer - DD Mon YYYY` order tab, copy SKU master fields, and write visible formulas for quantity, gross weight, and CBM. Compare each line's required quantity with packed available and unpacked quantities. A refresh rewrites stock status, shortfall, and last-updated cells but never assigns stock.

## View and correct inventory

Read one active Inventory row per SKU and calculate packed total and available quantity independently of its visible sheet formulas. Show unpacked and in-packing stock, but never include them in available. Manual corrections use signed deltas, require an operator reason, reject impossible states, and retain the reason in the row notes.

## Receive material

Validate an active SKU, append `RECEIVING LOG`, and increase only `UNPACKED QTY`. General stock remains unrelated to an order. When the operator explicitly selects an exact open order line, update that order row to received; mark supplier state received only when separately selected.

## Start packing

Atomically subtract the selected quantity from `UNPACKED QTY`, add it to `IN PACKING QTY`, and append an `IN PACKING` QA event. Reject insufficient or non-positive quantities and linked quantities above the exact line's remaining demand.

## Finish packing / QA

Subtract the amount taken from `IN PACKING QTY`, add good complete cartons to `PACKED CTNS`, add defect and shortage quantities, and append a `FINISHED` QA event without editing the start event. Reject totals that do not reconcile or good quantities that are not complete cartons. Explicitly linked good stock is auto-assigned to that line, with an allocation row and order reserved-quantity update.

## Assign and cancel assignment

Assignment requires packed available stock. Append an allocation and increase `TOTAL ASSIGNED`. Cancellation records a compensating event/note and decreases the assigned total; it does not delete history.

## Supplier request and follow-up

Create a request for the current shortfall, select a supplier by priority, send the initial message, and append `WHATSAPP LOG`. A request is due when auto-follow-up is enabled, its status is not received, and current time reaches `NEXT FOLLOW-UP AT`. Each successful message schedules the next for three days later. Automated retries must not send twice on the same calendar day.

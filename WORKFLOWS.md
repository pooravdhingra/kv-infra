# Workflows

## Create SKU

Validate uniqueness, append to `PACKING MASTER LIST`, then ensure a zero-valued `INVENTORY` row exists. Retrying the same request must not create a second row.

## Create order and stock check

Generate order and line IDs, create a named order tab, copy SKU master fields, calculate totals, and compare each line's required quantity with packed available and unpacked quantities. Open order detail with a suggested action.

## Receive material

Append `RECEIVING LOG` and increase `UNPACKED QTY`. General stock remains unrelated to an order. When the operator explicitly selects a supplier request, mark that request received and stop its follow-ups.

## Start packing

Atomically subtract the selected quantity from `UNPACKED QTY` and add it to `IN PACKING QTY`. Reject insufficient or non-positive quantities.

## Finish packing / QA

Subtract the amount taken from `IN PACKING QTY`, add good complete cartons to `PACKED CTNS`, add defect and shortage quantities, and append `QA LOG`. Reject totals that do not reconcile.

## Assign and cancel assignment

Assignment requires packed available stock. Append an allocation and increase `TOTAL ASSIGNED`. Cancellation records a compensating event/note and decreases the assigned total; it does not delete history.

## Supplier request and follow-up

Create a request for the current shortfall, select a supplier by priority, send the initial message, and append `WHATSAPP LOG`. A request is due when auto-follow-up is enabled, its status is not received, and current time reaches `NEXT FOLLOW-UP AT`. Each successful message schedules the next for three days later. Automated retries must not send twice on the same calendar day.

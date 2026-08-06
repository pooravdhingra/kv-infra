# Workflows

## Operator dashboard

Load one prioritized queue from current orders, supplier requests, packing sessions, SKU metadata, and recent receipts. Show failed WhatsApp sends and due follow-ups first, followed by in-packing work, incomplete SKU packing values, ready-to-ship orders, unrequested supplier shortfalls, packing needs, and stock ready to reserve. Each incomplete-SKU action links directly to that SKU's editor. Keep current pending orders and recent operational activity directly browsable. This is an action summary, not an analytics or forecasting layer.

## Create SKU

Require the operator to choose Bajaj, TVS, Piaggio, or Other and enter an item description when creating a SKU. Packing quantity, weight, and dimensions are optional at creation and default to zero, while unit defaults to `pcs`; the operator can complete those details in SKU Master after measurement. Generate the next identifier in that OEM's independent `KV-BNNNNNN`, `KV-TNNNNNN`, `KV-PNNNNNN`, or `KV-XNNNNNN` sequence, append to `PACKING MASTER LIST`, then create a zero-valued `INVENTORY` row with the same identifier. Legacy SKU formats remain readable and unchanged but do not affect OEM sequences.

## Delete SKU

After explicit operator confirmation, archive the matching Packing Master and Inventory identities with a `DELETED-` prefix in one Sheets values batch update. Hide archived SKUs from active application lists, preserve their rows for audit, and include archived generated IDs when calculating the next sequence number so IDs are never reused.

## Create order and stock check

Allow an operator to create a missing SKU without leaving the order form. This quick path requires OEM, item description, and quantity per carton so demand can be calculated; weight and dimensions default to zero for later editing on the SKU page.

Generate `ORD-YYYY-NNNN` and stable line IDs, create a collision-safe `Customer - DD Mon YYYY` order tab, copy SKU fields, and write visible formulas for quantity, gross weight, and CBM. Compare each line's required quantity with packed available and unpacked quantities. A refresh rewrites stock status, shortfall, and last-updated cells but never assigns stock.

List every created order as pending until an operator ships it. Show **Ship order** only when every line is fully packed and reserved. On confirmation, consume the exact packed cartons and matching assignments from Inventory, write `SHIPPED` and one completion timestamp to every line, remove the order from Pending Orders, and retain it in the browsable Completed Orders tab. Compensate Inventory if the order-tab completion write fails. Do not allow stock refreshes or allocation changes after completion.

## View and correct inventory

Read one active Inventory row per SKU and calculate packed total and available quantity independently of its visible sheet formulas. Show unpacked and in-packing stock, but never include them in available. Manual corrections use signed deltas, require an operator reason, reject impossible states, and retain the reason in the row notes.

## Receive material

Validate an active SKU, append `RECEIVING LOG`, and increase only `UNPACKED QTY`. If the item is new, allow the operator to create and immediately select a provisional SKU using only OEM and item description. Existing SKU-specific suppliers remain preferred; when a provisional SKU has no supplier mapping yet, offer the deduplicated Supplier Master list so the receipt still uses a known supplier. General stock remains unrelated to an order. When the operator explicitly selects an exact open order line, update that order row to received; mark supplier state received only when separately selected.

## Start packing

Atomically subtract the selected quantity from `UNPACKED QTY`, add it to `IN PACKING QTY`, and append an `IN PACKING` QA event. Reject insufficient or non-positive quantities and linked quantities above the exact line's remaining demand.

## Finish packing / QA

Offer a collapsible dimensional-information editor on every finish screen. Open it automatically when quantity per carton, weight, length, breadth, or height is zero, display those values as Missing, and let the operator save measurements to the SKU as part of finishing. Metadata completion is optional, although quantity per carton is inherently needed to record good complete cartons.

Subtract the amount taken from `IN PACKING QTY`, add good complete cartons to `PACKED CTNS`, add defect and shortage quantities, and append a `FINISHED` QA event without editing the start event. Reject totals that do not reconcile or good quantities that are not complete cartons. Explicitly linked good stock is auto-assigned to that line, with an allocation row and order reserved-quantity update.

## Assign and cancel assignment

Assignment requires packed available stock. Append an allocation and increase `TOTAL ASSIGNED`. When a line's remaining quantity reaches zero, mark it `FULLY RESERVED`, clear its shortfall, and suppress supplier action. Cancellation records a compensating event/note and decreases the assigned total; it does not delete history.

Direct reservation is available on order detail and cannot exceed either packed available stock or the exact line's remaining quantity. Cancellation requires an operator reason and appends a negative allocation event whose notes identify the original allocation.

For orders with multiple supplier shortfalls, offer a grouped review page. Preselect each SKU's highest-priority configured supplier and generate one editable message per eligible line. Require an explicit approval checkbox on every message before enabling **Send all approved**. After submission, group items by the operator-approved supplier number, combine same-supplier items into one numbered WhatsApp message, keep one request row per line, and wait a random 5–55 seconds between distinct supplier messages.

The allocation ledger is authoritative for active reserved quantity. Order reads calculate `RESERVED QTY` from its positive and compensating negative events, and a stock-check repairs stale order cells. If a historical cross-spreadsheet write left `RESERVED QTY` stale, cancellation releases the active ledger quantity from Inventory. New allocation flows update the order first and compensate it if the master-sheet batch fails.

## Supplier request and follow-up

Create a request for the current shortfall, select a supplier by priority, send the initial message, and append `WHATSAPP LOG`. A request is due when auto-follow-up is enabled, its status is not received, and current time reaches `NEXT FOLLOW-UP AT`. Each successful message schedules the next for three days later. Automated retries must not send twice on the same calendar day.

Initial message template:

```text
Hello Bhaiya, how are you? Please note new order:

1. FLANGE BIG COMPACT - 1000 PCS

Kab tak bhijva sakte ho?
```

Follow-up template:

```text
Hello Bhaiya, ye items pending hain:

1. abc - 1000 pcs

kab tak bhijvaoge?
```

The initial message is editable before send. Follow-ups use the fixed approved wording. Failed attempts are append-logged and remain available for retry. An explicitly linked receipt may optionally send a delivery confirmation; its send result never controls whether physically received stock is recorded.

# API contract

All endpoints use JSON under `/api`. Successful responses use `{ "data": ... }`; failures use `{ "error": { "code": "...", "message": "...", "details"?: ... } }`. Mutating requests will accept an `Idempotency-Key` header.

## Implemented endpoints

| Method | Path                                           | Purpose                                              |
| ------ | ---------------------------------------------- | ---------------------------------------------------- |
| GET    | `/api/health`                                  | Process health and version                           |
| GET    | `/api/auth/session`                            | Read the current Operator or Owner session           |
| POST   | `/api/auth/login`                              | Create a signed role session                         |
| POST   | `/api/auth/logout`                             | Clear the current role session                       |
| GET    | `/api/dashboard`                               | Prioritized operator queue and overview              |
| GET    | `/api/google/status`                           | Configuration and local token status                 |
| GET    | `/api/google/auth-url`                         | Signed Google OAuth authorization URL                |
| GET    | `/api/google/callback`                         | OAuth callback; encrypts token and redirects         |
| POST   | `/api/google/disconnect`                       | Removes the locally stored authorization             |
| POST   | `/api/google/test`                             | Tests files and exact master/inventory headers       |
| GET    | `/api/skus`                                    | List SKUs from Packing Master                        |
| GET    | `/api/skus/:sku`                               | Read one SKU                                         |
| POST   | `/api/skus`                                    | Create SKU and ensure its Inventory row              |
| PUT    | `/api/skus/:sku`                               | Update master data and Inventory identity fields     |
| DELETE | `/api/skus/:sku`                               | Archive SKU and remove it from active views          |
| GET    | `/api/inventory`                               | List calculated inventory for all active SKUs        |
| GET    | `/api/inventory/:sku`                          | Read one calculated inventory position               |
| POST   | `/api/inventory/manual-adjustment`             | Apply an audited inventory correction                |
| GET    | `/api/orders`                                  | List orders represented by valid order tabs          |
| POST   | `/api/orders`                                  | Create an order tab and run its first stock check    |
| GET    | `/api/orders/:orderId`                         | Read an order and its current stock position         |
| PUT    | `/api/orders/:orderId`                         | Edit a pending order and append new order lines      |
| DELETE | `/api/orders/:orderId/lines/:orderLineId`      | Audit-remove a line and detach its workflow links    |
| POST   | `/api/orders/:orderId/stock-check`             | Refresh stock state in the response and order tab    |
| POST   | `/api/orders/:orderId/ship`                    | Complete a fully reserved order                      |
| POST   | `/api/receiving`                               | Log a receipt and increase unpacked inventory        |
| GET    | `/api/receiving/open-order-options/:sku`       | List open exact order lines for an SKU               |
| GET    | `/api/packing`                                 | List packing sessions and unpacked stock             |
| POST   | `/api/packing/start`                           | Move unpacked stock into an append-logged session    |
| POST   | `/api/packing/:packingId/finish`               | Reconcile QA and move complete cartons to packed     |
| GET    | `/api/receiving?limit=20`                      | List recent receipt events                           |
| GET    | `/api/suppliers`                               | List unique known suppliers from Supplier Master     |
| GET    | `/api/suppliers/:sku`                          | List prioritized suppliers configured for an SKU     |
| POST   | `/api/orders/:orderId/allocate`                | Reserve packed stock for an exact order line         |
| GET    | `/api/allocations?orderId=...`                 | List allocation history                              |
| POST   | `/api/allocations/:id/cancel`                  | Append a compensating cancellation and release stock |
| GET    | `/api/supplier-requests`                       | List supplier requests                               |
| GET    | `/api/supplier-requests/pending`               | List requests not marked received                    |
| POST   | `/api/supplier-requests`                       | Validate shortfall, send, and record a request       |
| POST   | `/api/supplier-requests/bulk`                  | Group approved requests by supplier and send         |
| POST   | `/api/supplier-requests/:id/send-followup`     | Send one guarded follow-up                           |
| POST   | `/api/supplier-requests/send-due-followups`    | Send all currently due follow-ups                    |
| POST   | `/api/supplier-requests/:id/mark-confirmed`    | Mark supplier confirmation                           |
| POST   | `/api/supplier-requests/:id/mark-received`     | Stop follow-ups and mark received                    |
| POST   | `/api/supplier-requests/:id/disable-followups` | Disable automatic follow-ups                         |
| POST   | `/api/supplier-requests/:id/retry`             | Retry a failed initial send                          |
| GET    | `/api/whatsapp/status`                         | Read Baileys connection state                        |
| POST   | `/api/whatsapp/connect`                        | Start or restore the WhatsApp connection             |
| POST   | `/api/whatsapp/disconnect`                     | Log out and remove the saved linked-device session   |
| GET    | `/api/whatsapp/qr`                             | Return the current pairing QR payload                |
| POST   | `/api/whatsapp/send`                           | Send and append-log a direct text message            |
| GET    | `/api/client-order-links`                      | List customer-specific public order links            |
| POST   | `/api/client-order-links`                      | Create a signed single-submit order link             |
| POST   | `/api/client-order-links/:id/disable`          | Take down a public order link                        |
| GET    | `/api/client-order-links/public-tools`         | Read the configured permanent SKU form URL           |
| GET    | `/api/public/orders/:token`                    | Open a client form or submitted order summary        |
| POST   | `/api/public/orders/:token`                    | Submit the customer order once                       |
| GET    | `/api/public/sku-form/:token`                  | Validate access to the permanent SKU form            |
| POST   | `/api/public/sku-form/:token`                  | Create an SKU through the permanent private link     |

Except for health, the three auth endpoints, and the four `/api/public/*` capability endpoints, every API route requires a valid signed session cookie. Public order URLs contain an HMAC signature derived from `SESSION_SECRET`; the signature is never stored in Sheets, a link submits at most one order, and completed or explicitly disabled links return HTTP 410. The permanent SKU endpoint requires the exact `PUBLIC_SKU_FORM_TOKEN`. Login accepts `{ "role": "OPERATOR" | "OWNER", "password": "..." }`. Passwords remain server-side environment secrets. Sessions last 12 hours by default and use a signed, HttpOnly, SameSite cookie; the cookie is marked Secure when `APP_BASE_URL` uses HTTPS. Only the `AUTH_REQUIRED` error code indicates that this application session has expired; a 401 from Google or another integration must be shown as an integration error without signing the operator out. Five consecutive failures from one client temporarily lock further attempts for five minutes. Operator and Owner currently have the same application access, but the role is retained in the session for later authorization rules.

### Public order links

Authenticated operators create links with `{ "customerName": "ABC Traders" }`. The link fixes and uppercases that customer identity. While open, its public endpoint returns the active SKU catalogue needed by the order editor. Submission accepts only `orderNotes` and the normal order `items`; the server supplies customer and operator-local date. After the first successful submission, GET and repeat POST requests return a restricted packing-list-style summary rather than creating another order. Internal stock, supplier, allocation, and Google Sheet fields are never exposed. Shipment or explicit disablement makes the public URL unavailable.

Google OAuth callback persistence failures return `GOOGLE_TOKEN_STORAGE_FAILED` with a safe filesystem code and configuration guidance. Local development uses `.secrets/google-oauth.json`; Railway uses `/data/google-oauth.json` on the attached persistent volume.

WhatsApp connection setup failures caused by an invalid credential path return `WHATSAPP_AUTH_STORAGE_FAILED` with safe configuration guidance. Disconnecting logs out the linked device and deletes only a validated, dedicated Baileys credential directory; reset failures return `WHATSAPP_AUTH_RESET_FAILED`. Local development uses `.secrets/baileys-auth`; Railway uses `/data/baileys-auth` on the attached persistent volume.

### SKU request

```json
{
  "oem": "Bajaj",
  "itemDescription": "Cork Sheet 50mm",
  "quantityPerCarton": 100,
  "unit": "pcs",
  "weightPerCarton": 12.5,
  "length": 20,
  "breadth": 16,
  "height": 12
}
```

`POST /api/skus` requires only `oem` (`Bajaj`, `TVS`, `Piaggio`, or `Other`) and `itemDescription`. It generates an independent OEM sequence using `KV-B0001`, `KV-T0001`, `KV-P0001`, or `KV-X0001` respectively and returns the identifier in the response; numbering expands naturally beyond four digits. Existing identifiers remain unchanged and do not affect OEM sequences. `itemDescription` is stored in uppercase. `quantityPerCarton`, `weightPerCarton`, `length`, `breadth`, and `height` are optional and default to `0`; `unit` defaults to `pcs`. New-SKU units are `pcs`, `set`, and `kit`; legacy stored units remain readable. `weightPerCarton` is measured in kilograms, while `length`, `breadth`, and `height` are measured in inches. Update requests use the SKU path parameter; SKU identity and OEM prefix are immutable.

Delete is an audit-preserving archive operation. It prefixes the Packing Master and Inventory identities with `DELETED-` in one Sheets values batch update; logs are never deleted and archived identifiers are never reused.

### Inventory adjustment request

```json
{
  "sku": "KV-000001",
  "unpackedDelta": 50,
  "inPackingDelta": 0,
  "packedCartonsDelta": 0,
  "totalAssignedDelta": 0,
  "defectiveShortDelta": 0,
  "warehouseLocation": "A-01",
  "reason": "Opening balance verified by warehouse"
}
```

All quantities are deltas. At least one quantity or the location must change, quantities may never become negative, and assigned quantity may not exceed packed total quantity. The reason is appended to `INVENTORY.NOTES` with an ISO timestamp.

### Create order request

```json
{
  "customerName": "ABC Traders",
  "dateReceived": "2026-08-04",
  "orderNotes": "Handle carefully",
  "items": [{ "sku": "KV-000001", "cartons": 10 }]
}
```

Each item requires an active SKU. When its SKU has a positive Quantity/CTN, send `cartons`; the operator may edit Cartons or T-QTY in the UI and the other value is derived. When Quantity/CTN is missing, send a direct quantity instead: `{ "sku": "KV-X000001", "totalQuantity": 7500 }`. That provisional order line has no carton count until packing records a positive Quantity/CTN and synchronizes the latest SKU measurements into matching pending orders. `POST /api/orders` accepts `Idempotency-Key`, generates `ORD-YYYY-NNNN`, creates a readable order tab, fills calculated fields, and reports `READY_TO_RESERVE`, `NEEDS_PACKING`, `NEEDS_SUPPLIER`, or `FULLY_RESERVED` for each line. A fully reserved line always has zero remaining quantity, zero shortfall, and no supplier action. Order reads derive reserved quantity from the append-only allocation ledger. The stock-check endpoint recalculates against current Inventory and repairs the order tab's reserved quantity, status, shortfall, and timestamp cells without assigning additional stock.

Authenticated operators may edit pending orders with `PUT /api/orders/:orderId`. Existing lines retain their order-line IDs and SKU identities; new lines receive the next order-line ID. Customer name, date, notes, cartons, total quantity, nullable `actualGrossWeight`, and nullable `actualVolume` may be corrected. Estimated `grossWeight` and `volume` always remain numeric and sum only measurable lines, treating missing SKU measurements as zero contributions. `DELETE /api/orders/:orderId/lines/:orderLineId` marks the row cancelled, appends compensating allocation events to release reserved Inventory, marks linked supplier requests unlinked with follow-ups disabled, and appends unlinked packing snapshots. None of those business records are deleted. An order must retain at least one active line. Shipped orders reject edits. A client capability link never exposes these mutations: after client submission it remains a read-only summary, including later operator corrections and actual totals.

Order-line responses also expose `reservedQuantity`, `remainingQuantity`, supplier-request state, one pure-function-derived suggested action, and valid alternatives. Suggested actions are `RESERVE_STOCK`, `START_PACKING`, `REQUEST_SUPPLIER`, `MARK_RECEIVED`, or `NO_ACTION`; receiving is available as an alternative while demand remains.

Orders expose `status` as `PENDING` or `COMPLETED` and a nullable `completedAt`. Shipping is accepted only when every line is fully reserved, is idempotent once completed, consumes the shipped packed cartons and matching assigned quantity from Inventory, and changes every visible line status to `SHIPPED`. Reducing packed and assigned stock together leaves unrelated available stock unchanged. Completed orders reject stock refreshes and allocation changes.

### Receive material request

```json
{
  "date": "2026-08-05",
  "sku": "KV-000001",
  "quantityReceived": 500,
  "supplier": "ABC Supplier",
  "warehouseLocation": "Rack A2",
  "receivedBy": "Operator",
  "notes": "General replenishment",
  "orderId": "ORD-2026-0001",
  "orderLineId": "ORD-2026-0001-L001",
  "markSupplierRequestReceived": true,
  "sendDeliveryConfirmation": false
}
```

Order fields are optional but must be supplied together and match an open line for the same SKU. General receipts never change order/request state. A linked receipt updates the exact order row; supplier state changes only when the boolean is explicitly selected.

Delivery confirmation is opt-in and is valid only when the linked request is explicitly marked received. Receiving and follow-up cancellation still complete if the WhatsApp confirmation fails; the failed attempt remains visible in `WHATSAPP LOG`.

The receiving UI accepts suppliers only from `SUPPLIER MASTER LIST`. Supplier rows are cached for 60 seconds. Open-order lookup runs only after a complete SKU selection; all order tabs are fetched through one Sheets batch-read request rather than one request per tab.

### Start and finish packing

```json
{
  "date": "2026-08-05",
  "sku": "KV-000001",
  "quantityTaken": 100,
  "orderId": "ORD-2026-0001",
  "orderLineId": "ORD-2026-0001-L001",
  "notes": "Priority packing"
}
```

```json
{
  "date": "2026-08-05",
  "goodQuantity": 90,
  "packedCartons": 9,
  "defectiveQuantity": 6,
  "shortQuantity": 4,
  "leftUnpackedQuantity": 0,
  "notes": "QA complete"
}
```

Start rejects quantities above unpacked stock, but a linked session may take more than that line's remaining demand. Finish requires exact reconciliation and complete cartons; `leftUnpackedQuantity` returns unfinished pieces to unpacked stock. If linked, good quantity is assigned only up to the exact line's remaining requirement, with any excess kept as available general packed stock.

### Allocation request

`POST /api/orders/:orderId/allocate` accepts `orderLineId`, positive `quantity`, and optional `notes`. Cancellation accepts a required notes reason. Both endpoints accept an `Idempotency-Key` header.

Cancellation uses the append-only allocation ledger as its active-state source. A stale lower `RESERVED QTY` value does not block cancellation; the order row is reduced only to zero while Inventory releases the ledger allocation. New cross-spreadsheet allocation writes include compensating order updates when the master-sheet commit fails.

### Supplier request

Creation accepts `orderId`, `orderLineId`, a Supplier Master `supplierNumber`, a quantity no greater than current shortfall, editable `messageBody`, `autoFollowUpEnabled`, and notes. Every WhatsApp attempt is append-logged, including failures. Local ten-digit supplier numbers are normalized with `WHATSAPP_DEFAULT_COUNTRY_CODE`, and recipient existence is checked with WhatsApp before a send is logged as successful. Successful messages schedule the next follow-up exactly three days later; a request cannot send twice on the same operator-local calendar day.

The grouped review UI submits approved drafts to `/api/supplier-requests/bulk`. Each draft retains independent supplier, quantity, editable message, follow-up, and notes fields; no request is submitted until the operator explicitly approves every displayed draft. The API validates the whole batch before sending, groups drafts by the selected supplier number, combines each supplier's items into one numbered message, and retains one Supplier Requests row per order line. Distinct supplier messages are sent sequentially with a randomized 5–55 second gap.

## Google Sheets retry behavior

Google Sheets calls use a per-attempt timeout and bounded exponential backoff for timeouts and transient Google responses. The default policy is four attempts. Ordinary transient failures start at 500 ms; quota responses use longer waits starting at 5 seconds, and both add randomized jitter. Validation and sheet-contract errors are never retried. Concurrent same-workbook reads are combined into one batch request, identical in-flight reads are shared, and successful reads use a 15-second cache. Every application write invalidates row data immediately; the order-tab list is invalidated only when a tab is created. The web client allows enough time for the API retry window and keeps the initiating button visibly busy during the operation.

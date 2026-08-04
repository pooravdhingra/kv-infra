# API contract

All endpoints use JSON under `/api`. Successful responses use `{ "data": ... }`; failures use `{ "error": { "code": "...", "message": "...", "details"?: ... } }`. Mutating requests will accept an `Idempotency-Key` header.

## Implemented endpoints

| Method | Path                                     | Purpose                                           |
| ------ | ---------------------------------------- | ------------------------------------------------- |
| GET    | `/api/health`                            | Process health and version                        |
| GET    | `/api/google/status`                     | Configuration and local token status              |
| GET    | `/api/google/auth-url`                   | Signed Google OAuth authorization URL             |
| GET    | `/api/google/callback`                   | OAuth callback; encrypts token and redirects      |
| POST   | `/api/google/disconnect`                 | Removes the locally stored authorization          |
| POST   | `/api/google/test`                       | Tests files and exact master/inventory headers    |
| GET    | `/api/skus`                              | List SKUs from Packing Master                     |
| GET    | `/api/skus/:sku`                         | Read one SKU                                      |
| POST   | `/api/skus`                              | Create SKU and ensure its Inventory row           |
| PUT    | `/api/skus/:sku`                         | Update master data and Inventory identity fields  |
| DELETE | `/api/skus/:sku`                         | Archive SKU and remove it from active views       |
| GET    | `/api/inventory`                         | List calculated inventory for all active SKUs     |
| GET    | `/api/inventory/:sku`                    | Read one calculated inventory position            |
| POST   | `/api/inventory/manual-adjustment`       | Apply an audited inventory correction             |
| GET    | `/api/orders`                            | List orders represented by valid order tabs       |
| POST   | `/api/orders`                            | Create an order tab and run its first stock check |
| GET    | `/api/orders/:orderId`                   | Read an order and its current stock position      |
| POST   | `/api/orders/:orderId/stock-check`       | Refresh stock state in the response and order tab |
| POST   | `/api/receiving`                         | Log a receipt and increase unpacked inventory     |
| GET    | `/api/receiving/open-order-options/:sku` | List open exact order lines for an SKU            |
| GET    | `/api/packing`                           | List packing sessions and unpacked stock          |
| POST   | `/api/packing/start`                     | Move unpacked stock into an append-logged session |
| POST   | `/api/packing/:packingId/finish`         | Reconcile QA and move complete cartons to packed  |
| GET    | `/api/receiving?limit=20`                | List recent receipt events                        |
| GET    | `/api/suppliers/:sku`                    | List prioritized suppliers configured for an SKU  |

### SKU request

```json
{
  "itemDescription": "Cork Sheet 50mm",
  "quantityPerCarton": 100,
  "unit": "pcs",
  "weightPerCarton": 12.5,
  "length": 50,
  "breadth": 40,
  "height": 30
}
```

`POST /api/skus` generates the next sequential identifier in the `KV-000001` convention and returns it in the response. Valid units are `pcs`, `kg`, `roll`, `meter`, and `set`. `weightPerCarton` is measured in kilograms. Update requests use the SKU path parameter; SKU identity is immutable.

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

The request requires an active SKU and a positive whole-carton quantity. `POST /api/orders` accepts `Idempotency-Key`, generates `ORD-YYYY-NNNN`, creates a readable order tab, fills calculated fields, and reports `READY_TO_RESERVE`, `NEEDS_PACKING`, or `NEEDS_SUPPLIER` for each line. The stock-check endpoint recalculates against current Inventory and updates status, shortfall, and timestamp cells without assigning stock.

Order-line responses also expose `reservedQuantity`, `remainingQuantity`, supplier-request state, one pure-function-derived suggested action, and valid alternatives. Suggested actions are `RESERVE_STOCK`, `START_PACKING`, `REQUEST_SUPPLIER`, `MARK_RECEIVED`, or `NO_ACTION`; receiving is available as an alternative while demand remains.

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
  "markSupplierRequestReceived": true
}
```

Order fields are optional but must be supplied together and match an open line for the same SKU. General receipts never change order/request state. A linked receipt updates the exact order row; supplier state changes only when the boolean is explicitly selected.

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
  "notes": "QA complete"
}
```

Start rejects quantities above unpacked stock or an explicitly linked line's remaining demand. Finish requires exact reconciliation and complete cartons. If linked, all good quantity is assigned to that exact line, an allocation is appended, Inventory assigned quantity increases, and the order row reserved quantity updates.

## Planned endpoints

- Auth: `POST /auth/login`, `POST /auth/logout`, `GET /auth/session`
- Allocations: `POST /allocations`, `POST /allocations/:allocationId/cancel`
- Supplier requests: `GET /supplier-requests`, `POST /supplier-requests`, `POST /supplier-requests/:requestId/follow-up`, `POST /supplier-requests/:requestId/received`

Exact request/response schemas will be added alongside each phase before implementation.

# API contract

All endpoints use JSON under `/api`. Successful responses use `{ "data": ... }`; failures use `{ "error": { "code": "...", "message": "...", "details"?: ... } }`. Mutating requests will accept an `Idempotency-Key` header.

## Phase 1

| Method | Path          | Purpose                    |
| ------ | ------------- | -------------------------- |
| GET    | `/api/health` | Process health and version |

## Planned endpoints

- Auth: `POST /auth/login`, `POST /auth/logout`, `GET /auth/session`
- Google: `GET /google/status`, `GET /google/auth-url`, `GET /google/callback`, `POST /google/disconnect`, `POST /google/test`
- SKUs: `GET /skus`, `GET /skus/:sku`, `POST /skus`, `PUT /skus/:sku`
- Orders: `GET /orders`, `POST /orders`, `GET /orders/:orderId`, `POST /orders/:orderId/stock-check`
- Inventory: `GET /inventory`, `GET /inventory/:sku`
- Receiving: `POST /receipts`
- Packing: `POST /packing/start`, `POST /packing/:packingId/finish`
- Allocations: `POST /allocations`, `POST /allocations/:allocationId/cancel`
- Supplier requests: `GET /supplier-requests`, `POST /supplier-requests`, `POST /supplier-requests/:requestId/follow-up`, `POST /supplier-requests/:requestId/received`

Exact request/response schemas will be added alongside each phase before implementation.

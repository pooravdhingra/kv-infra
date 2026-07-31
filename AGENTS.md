# AGENTS.md

## Project

This is a custom, bloat-free CRM for an import/trading business. It sits on top of Google Sheets and WhatsApp.

## Core constraint

Google Sheets must remain human-readable and manually browsable. The app protects the workflow but does not obscure or replace it.

## MVP scope

Build SKU and order creation, order sheet auto-fill, inventory totals, receiving, packing/QA, order allocation, supplier WhatsApp requests, and three-day follow-ups.

Do not build a client portal, analytics, shipping documents, sticker printing, predictive ordering, packing hierarchy, or container optimization yet.

## Product laws

- `INVENTORY` has exactly one row per SKU.
- Unpacked stock is visible but never available.
- Available quantity equals packed total quantity minus total assigned.
- Receiving increases unpacked quantity.
- Starting packing moves quantity from unpacked to in-packing.
- Finishing packing moves quantity from in-packing to packed and records defects/shortages.
- Assigning stock increases total assigned; cancellation reverses it.
- Logs are append-only. Never delete business rows; use statuses or notes.
- Receiving stops a supplier follow-up only when explicitly linked to its request/order.
- Do not send a duplicate automated follow-up on the same day.

## Sheets

Read `SHEETS_CONTRACT.md` before changing sheet integration. Column order, IDs, and write rules are contracts.

## Development rules

- Use strict TypeScript.
- Keep business logic in API services or shared pure functions, not React components or route handlers.
- Validate environment variables and external input with Zod.
- Add unit tests for calculations and inventory transitions before integration code.
- Make mutations idempotent where practical.
- Do not hardcode spreadsheet IDs; read them from environment variables.
- Never log or commit passwords, OAuth tokens, encryption keys, or WhatsApp session files.
- Keep Google Sheets and WhatsApp behind adapter modules so either integration can be replaced.
- Update the relevant contract document in the same change when behavior or schema changes.

## Verification

Before handing off code, run `npm run typecheck`, `npm test`, and `npm run build`.

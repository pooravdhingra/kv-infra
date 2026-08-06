# KV Infra CRM MVP

A lightweight operator dashboard over the company's existing Google Sheets and WhatsApp workflow. Google Sheets remain the human-readable verification layer; the dashboard is the safe action layer.

## Current status

Phases 0–12 are implemented: product contracts, Google OAuth/Sheets connection, SKU master, inventory, orders, receiving, packing/QA, direct allocation and cancellation, supplier requests, persisted Baileys WhatsApp connection, guarded three-day follow-ups, and the prioritized operator dashboard.

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Local setup

```bash
cp .env.example .env
npm install
npm run dev
```

Set the Operator and Owner credentials in the ignored `.env`, then open `http://localhost:5173` and sign in. The API runs at `http://localhost:4000`; its health check is `GET /api/health`. Both roles currently open the same workspace.

## Commands

```bash
npm run dev          # web and API in watch mode
npm run build        # production builds for all workspaces
npm run typecheck    # TypeScript checks
npm test             # workspace tests
npm run format:check # formatting check
```

## Repository layout

```text
apps/web             React + Vite operator UI
apps/api             Express API
packages/shared      Shared schemas, constants, and types
docs/sample-data     Non-sensitive development fixtures
docs/wireframes      UI reference material
```

Read `AGENTS.md` before changing code and the relevant root contract before implementing a business flow. Never commit `.env`, Google tokens, or Baileys session data.

For Google Cloud, secrets, spreadsheet preparation, and end-to-end testing, follow [`ENVIRONMENT_SETUP.md`](./ENVIRONMENT_SETUP.md).

For the single-service production container, Railway volume, GitHub deployment workflow, hosted Google callback, and WhatsApp pairing, follow [`RAILWAY_DEPLOYMENT.md`](./RAILWAY_DEPLOYMENT.md).

WhatsApp credentials are stored only in the ignored local directory or mounted production volume configured by `BAILEYS_AUTH_DIR`. Connect the operator account from Settings before sending supplier requests.

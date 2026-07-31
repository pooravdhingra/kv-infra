# KV Infra CRM MVP

A lightweight operator dashboard over the company's existing Google Sheets and WhatsApp workflow. Google Sheets remain the human-readable verification layer; the dashboard is the safe action layer.

## Current status

Phase 0 (product contracts) and Phase 1 (working application skeleton) are set up. Business integrations and mutations begin in Phase 2.

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Local setup

```bash
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`. The API runs at `http://localhost:4000`; its health check is `GET /api/health`.

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

## Next milestone

Phase 2 connects Google OAuth and Sheets. The first product milestone is: create SKU, create order, auto-fill the order tab, and run a stock check. WhatsApp comes only after inventory movements are proven correct.

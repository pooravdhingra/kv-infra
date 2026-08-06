# Environment, secrets, and Google Sheets setup

This guide configures Phases 2–11 locally without committing credentials or business data.

## 1. Create the local environment file

From the repository root:

```bash
cp .env.example .env
chmod 600 .env
```

Generate two different random secrets:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Put the first value in `SESSION_SECRET` and the second in `TOKEN_ENCRYPTION_KEY`. Do not reuse them and do not commit `.env`.

`TOKEN_ENCRYPTION_KEY` encrypts the Google refresh token at rest with AES-256-GCM. The encrypted token is written to `.secrets/google-oauth.json`, which is ignored by Git. Back up neither file to a shared drive. Changing the encryption key invalidates the saved token; delete the token file and reconnect if this happens.

## 2. Prepare Google Sheets

Create a master spreadsheet and an orders spreadsheet. They may be two separate files or the same file during development.

In the master spreadsheet, create these exact tabs and paste each header row into row 1.

### `PACKING MASTER LIST`

```text
SKU	ITEM DESCRIPTION	QUANTITY/CTN	UNIT	WEIGHT/CTN	LENGTH	BREADTH	HEIGHT
```

### `INVENTORY`

```text
SKU	ITEM DESCRIPTION	QTY / CARTON	UNIT	UNPACKED QTY	IN PACKING QTY	PACKED CTNS	PACKED TOTAL QTY	TOTAL ASSIGNED	AVAILABLE QTY	DEFECTIVE / SHORT QTY	LAST RECEIVED DATE	LAST PACKED DATE	WAREHOUSE LOCATION	NOTES	LAST UPDATED
```

Do not add, remove, rename, or reorder these columns. The API deliberately rejects mismatched headers before writing.

### `SUPPLIER MASTER LIST`

```text
SKU	ITEM DESCRIPTION	NAME	NUMBER	PRIORITY SCALE
```

Every receivable SKU must have at least one supplier row. Lower `PRIORITY SCALE` values appear first in the receiving supplier selector.

### `RECEIVING LOG`

```text
RECEIPT ID	DATE	SKU	ITEM DESCRIPTION	QTY RECEIVED	UNIT	SUPPLIER	WAREHOUSE LOCATION	RECEIVED BY	NOTES	ITEM CHECK STATUS	ORDER ID	ORDER LINE ID
```

### `QA LOG`

```text
PACKING ID	DATE	SKU	ITEM DESCRIPTION	QTY TAKEN FOR PACKING	GOOD QTY	PACKED CTNS	DEFECTIVE QTY	SHORT QTY	ASSIGNED TO ORDER?	ORDER ID	ORDER LINE ID	STATUS	NOTES	LEFT UNPACKED
```

If upgrading the earlier 12-column QA tab, insert two columns immediately before `NOTES`, name them `ORDER LINE ID` and `STATUS`, and leave `NOTES` as the final column. Set `STATUS` to `FINISHED` for any historical completed QA rows. Do not overwrite or delete existing QA rows.

### `ORDER ALLOCATIONS`

```text
ALLOCATION ID	ORDER ID	ORDER LINE ID	SKU	ITEM DESCRIPTION	QTY ASSIGNED	NOTES
```

### `SUPPLIER REQUESTS`

```text
REQUEST ID	ORDER ID	ORDER LINE ID	SKU	ITEM DESCRIPTION	REQUIRED QTY	AVAILABLE QTY	SHORTFALL QTY	SELECTED SUPPLIER	SUPPLIER NUMBER	SUPPLIER PRIORITY	LAST MESSAGE AT	NEXT FOLLOW-UP AT	STATUS	AUTO FOLLOW-UP ENABLED	NOTES
```

### `WHATSAPP LOG`

```text
MESSAGE ID	REQUEST ID	ORDER ID	SKU	SUPPLIER NAME	SUPPLIER NUMBER	MESSAGE TYPE	MESSAGE BODY	SENT AT	ERROR MESSAGE	FOLLOW-UP NUMBER	NOTES
```

Find each spreadsheet ID in its URL:

```text
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
```

Set `MASTER_SPREADSHEET_ID` and `ORDERS_SPREADSHEET_ID` in `.env`. The Google account connected later must have edit access to both files.

## 3. Configure Google Cloud

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and select or create a project.
2. Open **APIs & Services → Library**, search for **Google Sheets API**, and enable it.
3. Open **Google Auth Platform** and configure **Branding**, **Audience**, and **Data Access**. For local testing, choose an external audience if necessary and add the operator Google account as a test user.
4. Add the Sheets scope: `https://www.googleapis.com/auth/spreadsheets`.
5. Under **Clients**, create an OAuth client with application type **Web application**.
6. Add this exact authorized redirect URI: `http://localhost:4000/api/google/callback`.
7. Copy the client ID and client secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.

The redirect URI in Google Cloud and `GOOGLE_REDIRECT_URI` must match character-for-character. Google’s current official references are [Configure OAuth consent](https://developers.google.com/workspace/guides/configure-oauth-consent) and [Create access credentials](https://developers.google.com/workspace/guides/create-credentials).

## 4. Complete `.env`

For local development, the relevant section should resemble:

```env
PORT=4000
NODE_ENV=development
APP_BASE_URL=http://localhost:4000
FRONTEND_URL=http://localhost:5173
VITE_API_BASE_URL=/api

GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:4000/api/google/callback
GOOGLE_TOKEN_FILE=.secrets/google-oauth.json

MASTER_SPREADSHEET_ID=your-master-spreadsheet-id
ORDERS_SPREADSHEET_ID=your-orders-spreadsheet-id
PACKING_MASTER_SHEET_NAME=PACKING MASTER LIST
SUPPLIER_MASTER_SHEET_NAME=SUPPLIER MASTER LIST
INVENTORY_SHEET_NAME=INVENTORY
RECEIVING_LOG_SHEET_NAME=RECEIVING LOG
QA_LOG_SHEET_NAME=QA LOG
ORDER_ALLOCATIONS_SHEET_NAME=ORDER ALLOCATIONS
SUPPLIER_REQUESTS_SHEET_NAME=SUPPLIER REQUESTS
WHATSAPP_LOG_SHEET_NAME=WHATSAPP LOG
GOOGLE_SHEETS_TIMEOUT_MS=10000
GOOGLE_SHEETS_RETRY_ATTEMPTS=4
GOOGLE_SHEETS_RETRY_BASE_DELAY_MS=500
GOOGLE_SHEETS_READ_CACHE_MS=15000

BAILEYS_AUTH_DIR=.secrets/baileys-auth
WHATSAPP_DEFAULT_COUNTRY_CODE=91
OPERATOR_TIME_ZONE=Asia/Kolkata
AUTO_FOLLOWUPS_ENABLED=true
FOLLOW_UP_POLL_MINUTES=60

SESSION_SECRET=first-generated-random-value
TOKEN_ENCRYPTION_KEY=second-generated-random-value
```

Keep the default sheet names unless the actual tabs intentionally use different names. Header names remain fixed regardless of tab-name configuration.

The Sheets defaults coalesce and cache reads for 15 seconds, invalidate data after every application write, and retry transient failures up to four times. Keep these defaults for normal operation. Increase `GOOGLE_SHEETS_READ_CACHE_MS` to `30000` if the operator can tolerate up to 30 seconds before manual spreadsheet edits appear in the app and quota pressure remains high.

`BAILEYS_AUTH_DIR` contains WhatsApp linked-device credentials. Keep it inside `.secrets`, never commit or share it, and restrict access to the operator machine. `WHATSAPP_DEFAULT_COUNTRY_CODE` supplies the country code for local ten-digit Supplier Master numbers (`91` for India); numbers already containing a country code are left intact. `OPERATOR_TIME_ZONE` controls the same-calendar-day duplicate follow-up guard. The scheduler checks hourly by default and sends only while WhatsApp is connected.

## 5. Connect and test in the UI

```bash
npm install
npm run dev
```

1. Open `http://localhost:5173/settings`.
2. Confirm the page says **Environment configured**.
3. Select **Connect Google** and authorize the operator account.
4. After returning to Settings, select **Test Sheets connection**.
5. Confirm the master and orders spreadsheet titles appear and both required tabs are verified.
6. In Settings, select **Connect WhatsApp** and scan the QR from WhatsApp under **Linked devices → Link a device**.
7. Open `http://localhost:5173/skus`, create a fake SKU, and confirm one row appears in both `PACKING MASTER LIST` and `INVENTORY`.
8. Edit the fake SKU and confirm the master row and the inventory description/carton/unit fields update without changing inventory quantities.

For WhatsApp testing, use a controlled non-production supplier number and create only fake orders. A local ten-digit number uses `WHATSAPP_DEFAULT_COUNTRY_CODE`; international numbers should include their country code. Confirm one `SUPPLIER REQUESTS` row and one `WHATSAPP LOG` row appear. Do not copy or commit the files created beneath `BAILEYS_AUTH_DIR`.

Use only fictional data for testing.

## 6. API smoke tests

With the app running:

```bash
curl --fail --silent http://localhost:4000/api/health
curl --fail --silent http://localhost:4000/api/google/status
curl --fail --silent -X POST http://localhost:4000/api/google/test
curl --fail --silent http://localhost:4000/api/skus
```

Create a fake SKU:

```bash
curl --fail --silent \
  -H 'Content-Type: application/json' \
  -d '{"oem":"Bajaj","itemDescription":"Test carton","quantityPerCarton":100,"unit":"pcs","weightPerCarton":10,"length":20,"breadth":16,"height":12}' \
  http://localhost:4000/api/skus
```

The API assigns the next available identifier in the selected OEM sequence: `B` for Bajaj, `T` for TVS, `P` for Piaggio, and `X` for Other. Existing legacy SKU formats remain untouched and are ignored when calculating each OEM's next sequence number.

## 7. Automated verification

```bash
npm run typecheck
npm test
npm run build
npm run format:check
npm audit
```

Automated tests use fakes and do not contact Google or read your `.env` secrets.

## Troubleshooting

- **`redirect_uri_mismatch`**: make the Google Cloud redirect URI and `GOOGLE_REDIRECT_URI` exactly identical.
- **App access blocked / user not allowed**: add the operator account as a test user under Google Auth Platform → Audience.
- **Missing refresh token**: remove the app from the Google account’s connected apps, delete `.secrets/google-oauth.json`, and connect again.
- **`SHEET_HEADERS_MISMATCH`**: compare row 1 against `SHEETS_CONTRACT.md`, including spacing and column order.
- **`GOOGLE_NOT_CONNECTED`**: reconnect from Settings; the saved token may have been revoked or deleted.
- **Token cannot be decrypted**: restore the original `TOKEN_ENCRYPTION_KEY`, or delete the encrypted token file and reconnect.

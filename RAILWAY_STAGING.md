# Railway staging environment

This setup keeps one persistent `staging` environment beside `production` in the existing Railway project. Both environments use the same single-service Docker deployment, but they use different Git branches, domains, variables, Google Sheets files, OAuth token storage, Baileys credentials, login secrets, and public-link signing secrets.

Railway scopes service configuration to an environment. A persistent staging environment can therefore deploy the `staging` branch without changing production. See Railway's current [environment documentation](https://docs.railway.com/environments) and [GitHub autodeploy documentation](https://docs.railway.com/deployments/github-autodeploys).

## Required isolation

| Resource                               | Production                | Staging                             |
| -------------------------------------- | ------------------------- | ----------------------------------- |
| Git branch                             | `master`                  | `staging`                           |
| Railway environment                    | `production`              | `staging`                           |
| Public domain                          | Production domain         | Separate Railway staging domain     |
| Master spreadsheet                     | Live business workbook    | Test-only master workbook           |
| Orders spreadsheet                     | Live orders workbook      | Test-only orders workbook           |
| Railway volume                         | Production `/data` volume | Different staging `/data` volume    |
| Google token                           | Production volume token   | Fresh staging authorization         |
| Baileys session                        | Business sender account   | Test sender account or disconnected |
| Session/encryption/public-link secrets | Production values         | Newly generated staging values      |
| Supplier phone numbers                 | Live suppliers            | Controlled test numbers only        |
| Automated follow-ups                   | Enabled as required       | Disabled initially                  |

Never point staging at either production spreadsheet, restore a production volume backup into staging, or copy the production Baileys directory into the staging volume.

## 1. Create the test spreadsheets

Create two new Google Sheets files in a clearly labelled test folder:

- `KV INFRA - STAGING MASTER`
- `KV INFRA - STAGING ORDERS`

Build the staging master workbook using the exact tab names and headers in [`SHEETS_CONTRACT.md`](./SHEETS_CONTRACT.md). The required tabs are:

- `PACKING MASTER LIST`
- `SUPPLIER MASTER LIST`
- `INVENTORY`
- `RECEIVING LOG`
- `QA LOG`
- `ORDER ALLOCATIONS`
- `SUPPLIER REQUESTS`
- `WHATSAPP LOG`
- `CLIENT ORDER LINKS`

Keep row 1 as the exact header row. Logs may start with only the header. If test SKUs are seeded, keep Packing Master and Inventory consistent: Inventory must contain exactly one row for every active test SKU.

The staging orders workbook may start with one blank tab such as `README`. The application ignores tabs that do not contain the order-sheet header. New test orders will receive their own human-readable tabs.

Recommended data policy:

1. Prefer new blank workbooks rather than copying live business data.
2. If a production workbook is copied only to preserve formatting, immediately clear all rows below the headers and remove every copied order tab before connecting staging.
3. Use fake customers, SKUs, quantities, and suppliers.
4. Put only phone numbers controlled by you in the staging Supplier Master.
5. Give the Google account used for staging edit access to both staging workbooks.
6. Copy the two spreadsheet IDs from their URLs; do not paste the full URLs into Railway variables.

## 2. Create the `staging` Git branch

First make sure the current production branch contains the last known-good release and all GitHub checks pass. Then create `staging` from `master`:

```bash
git switch master
git pull --ff-only
git switch -c staging
git push -u origin staging
```

Do not commit `.env`, OAuth tokens, Baileys files, or Railway secrets to either branch.

The repository CI runs for pushes and pull requests targeting both `staging` and `master`. This allows Railway's **Wait for CI** setting to gate both environments.

## 3. Duplicate the Railway environment

In the existing Railway project:

1. Select the `production` environment from the environment menu.
2. Choose **+ New Environment**.
3. Choose **Duplicate Environment** and name it exactly `staging`.
4. Do not approve or deploy the staged changes yet. Duplication copies the service configuration and variables, so the initial staging draft still contains production values.
5. Switch the Railway canvas to `staging` and verify there is still exactly one application service.

Railway documents that duplicating an environment stages copied services and configuration for review before deployment. Use that review window to replace every production-bound value.

## 4. Give staging its own domain and source branch

While the selected Railway environment is `staging`:

1. Open the application service.
2. Under **Settings → Source**, keep the same GitHub repository but change the deployment branch to `staging`.
3. Leave the Root Directory blank and keep `/railway.toml` as the config path.
4. Under **Settings → Networking**, generate a new Railway domain.
5. Record the complete staging URL without a trailing slash, for example `https://kv-operations-os-staging.up.railway.app`.
6. Enable **Auto Deploy**.
7. Enable **Wait for CI** after GitHub has completed at least one `staging` workflow run.

Reopen the production environment afterward and confirm its source branch is still `master`.

## 5. Create a separate staging volume

Staging must have its own persistent auth storage:

1. On the staging canvas, inspect the volume attached to the application service.
2. Confirm it is a staging-environment resource and not the production volume. Railway resources are environment-scoped, but verify the environment and resource identity before continuing.
3. If no staging volume exists, create one and attach it to the service.
4. Set the mount path to exactly `/data`.
5. Keep one service replica.
6. Do not restore a production volume backup into this volume.

Both environments intentionally use `GOOGLE_TOKEN_FILE=/data/google-oauth.json` and `BAILEYS_AUTH_DIR=/data/baileys-auth`. The paths are the same inside each container; the attached volumes must be different.

## 6. Replace staging variables before the first deploy

Open the staging service's **Variables → RAW Editor**. Retain ordinary sheet-name and retry settings, but replace every environment-specific or secret value. Use this staging template:

```env
NODE_ENV=production
APP_BASE_URL=https://YOUR-STAGING-RAILWAY-DOMAIN
FRONTEND_URL=https://YOUR-STAGING-RAILWAY-DOMAIN

OPERATOR_USERNAME=operator
OPERATOR_PASSWORD=REPLACE_WITH_STAGING_OPERATOR_PASSWORD
OWNER_USERNAME=owner
OWNER_PASSWORD=REPLACE_WITH_DISTINCT_STAGING_OWNER_PASSWORD
AUTH_SESSION_HOURS=12

GOOGLE_CLIENT_ID=REPLACE_WITH_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=REPLACE_WITH_GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI=https://YOUR-STAGING-RAILWAY-DOMAIN/api/google/callback
GOOGLE_TOKEN_FILE=/data/google-oauth.json

MASTER_SPREADSHEET_ID=REPLACE_WITH_STAGING_MASTER_SPREADSHEET_ID
ORDERS_SPREADSHEET_ID=REPLACE_WITH_STAGING_ORDERS_SPREADSHEET_ID
PACKING_MASTER_SHEET_NAME=PACKING MASTER LIST
SUPPLIER_MASTER_SHEET_NAME=SUPPLIER MASTER LIST
INVENTORY_SHEET_NAME=INVENTORY
RECEIVING_LOG_SHEET_NAME=RECEIVING LOG
QA_LOG_SHEET_NAME=QA LOG
ORDER_ALLOCATIONS_SHEET_NAME=ORDER ALLOCATIONS
SUPPLIER_REQUESTS_SHEET_NAME=SUPPLIER REQUESTS
WHATSAPP_LOG_SHEET_NAME=WHATSAPP LOG
CLIENT_ORDER_LINKS_SHEET_NAME=CLIENT ORDER LINKS
GOOGLE_SHEETS_TIMEOUT_MS=10000
GOOGLE_SHEETS_RETRY_ATTEMPTS=4
GOOGLE_SHEETS_RETRY_BASE_DELAY_MS=500
GOOGLE_SHEETS_READ_CACHE_MS=15000

BAILEYS_AUTH_DIR=/data/baileys-auth
WHATSAPP_DEFAULT_COUNTRY_CODE=91
OPERATOR_TIME_ZONE=Asia/Kolkata
AUTO_FOLLOWUPS_ENABLED=false
FOLLOW_UP_POLL_MINUTES=60

SESSION_SECRET=REPLACE_WITH_STAGING_SESSION_SECRET
TOKEN_ENCRYPTION_KEY=REPLACE_WITH_STAGING_TOKEN_ENCRYPTION_KEY
PUBLIC_SKU_FORM_TOKEN=REPLACE_WITH_STAGING_PUBLIC_SKU_TOKEN
```

Generate three staging-only values locally:

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

Use them for `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, and `PUBLIC_SKU_FORM_TOKEN`. Do not reuse production values. The Google OAuth client ID and secret may be shared if both hosted callback URLs are registered in the same Google Cloud web client, but the saved OAuth token and encryption key must remain environment-specific.

Do not define `PORT` or `VITE_API_BASE_URL`. Railway supplies the port, and the production web build uses same-origin `/api` requests.

Before deploying, compare `MASTER_SPREADSHEET_ID`, `ORDERS_SPREADSHEET_ID`, `APP_BASE_URL`, `FRONTEND_URL`, and `GOOGLE_REDIRECT_URI` against production one final time. All five must differ where expected.

## 7. Add the staging Google callback

In Google Cloud Console:

1. Open **Google Auth Platform → Clients**.
2. Select the web client used by this application.
3. Add the exact staging redirect URI:

   ```text
   https://YOUR-STAGING-RAILWAY-DOMAIN/api/google/callback
   ```

4. Keep the production and localhost redirect URIs in the same client.
5. If the OAuth consent screen is in testing mode, add the staging Google account as a test user.

The callback must match `GOOGLE_REDIRECT_URI` character-for-character.

## 8. Deploy and connect staging

After every staging variable, source, domain, and volume change has been reviewed:

1. Approve the staged Railway changes and deploy.
2. Open `https://YOUR-STAGING-DOMAIN/api/health`.
3. Confirm `status` is `ok` and `environment` is `staging`.
4. Open the staging app and confirm the amber `STAGING ENVIRONMENT · TEST DATA ONLY` banner appears on the login, operator, and public pages.
5. Sign in with the staging Owner password.
6. Open Settings, connect Google, and authorize the account that can edit only the staging workbooks.
7. Run **Test Sheets connection** and confirm the returned workbook titles are the staging titles.
8. Create one fake SKU and one fake order, then verify writes appeared only in the staging workbooks.

### WhatsApp staging policy

Leave WhatsApp disconnected until the Sheets checks above pass. Then choose one option:

- Recommended: link a separate WhatsApp test account and use only controlled test recipient numbers.
- Safer for most feature tests: leave WhatsApp disconnected and test message generation/editing without sending.

Do not pair the production sender account to staging while production is using it. Keep `AUTO_FOLLOWUPS_ENABLED=false` in staging unless a controlled follow-up test is actively being run. If it is temporarily enabled, disable it again immediately after the test.

## 9. Day-to-day release workflow

Use this branch flow:

```text
feature branch
  → pull request into staging
  → GitHub Verify passes
  → merge into staging
  → Railway staging deploys after CI
  → operator/owner performs staging smoke test
  → pull request from staging into master
  → GitHub Verify passes
  → merge into master
  → Railway production deploys after CI
```

For every staging release, test at least:

1. `/api/health` reports `environment: staging`.
2. The staging banner is visible.
3. Google connection names the two staging workbooks.
4. A fake write lands only in staging Sheets.
5. The changed workflow works end-to-end.
6. Public order/SKU links use the staging domain.
7. If WhatsApp changed, send only to a controlled number and inspect staging `WHATSAPP LOG`.
8. Restart the staging service once when Google/Baileys persistence code changes.

After an emergency production hotfix, merge `master` back into `staging` so the branches do not drift.

## 10. Promotion and rollback rules

- Promote code through Git; do not copy staging variables or volume data into production.
- Railway environment **Sync** is useful for reviewing service configuration changes, but never accept a sync that replaces production spreadsheet IDs, domains, secrets, or volume identity.
- Roll back a failed staging deployment from staging's deployment history. This does not affect production.
- A code rollback does not roll back Sheets writes or volume contents.
- Disable or delete unused staging deployments if cost becomes material; a continuously running staging service consumes resources even when idle.

## Final isolation checklist

Before declaring staging ready, all answers must be yes:

- [ ] Staging source branch is `staging`; production source branch is `master`.
- [ ] Staging has its own domain.
- [ ] Staging points to two test spreadsheet IDs.
- [ ] Staging Google account can edit the test workbooks.
- [ ] Staging has its own `/data` volume.
- [ ] Staging has newly generated session, token-encryption, and public-SKU secrets.
- [ ] Staging OAuth redirect URI is registered in Google Cloud.
- [ ] Staging Supplier Master contains no uncontrolled live supplier numbers.
- [ ] `AUTO_FOLLOWUPS_ENABLED=false` in staging.
- [ ] Staging WhatsApp is disconnected or uses a separate controlled account.
- [ ] `/api/health` reports `environment: staging`.
- [ ] The amber staging banner is visible.
- [ ] One fake SKU/order write was confirmed only in staging Sheets.

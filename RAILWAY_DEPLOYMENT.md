# Railway deployment

This deployment runs the React application, Express API, WhatsApp connection, and follow-up scheduler in one Railway service. Google Sheets remain the business datastore. A single Railway volume preserves only the encrypted Google OAuth token and Baileys linked-device credentials.

## 1. Before opening Railway

1. Run the verification commands locally:

   ```bash
   npm run format:check
   npm run typecheck
   npm test
   npm run build
   ```

2. Commit the deployment files and push the `master` branch to GitHub.
3. Keep the GitHub repository private. Never commit `.env`, `.secrets`, `.baileys-auth`, Google tokens, WhatsApp credentials, passwords, or encryption keys.
4. Generate fresh production secrets locally. Do not reuse the development values:

   ```bash
   openssl rand -hex 32
   openssl rand -hex 32
   ```

   Use one value for `SESSION_SECRET` and the other for `TOKEN_ENCRYPTION_KEY`.

## 2. Create one Railway service

1. Sign in to Railway and connect the GitHub account that owns the repository.
2. Create an **Empty Project**.
3. Inside that project, create one **Empty Service** and name it `kv-operations-os`.
4. Open the service's **Settings → Source**, select **Connect Repo**, choose `pooravdhingra/kv-infra`, and select the `master` branch.
5. Leave **Root Directory** blank so Railway builds from the repository root.
6. Confirm the service uses `/railway.toml` as its config file if Railway asks for a config path.
7. Do not create separate frontend, API, worker, database, or cron services. The root Dockerfile builds the complete application.

The first deployment may start before credentials are added. Its health check can pass, but login and external integrations will remain unavailable until the variables below are configured.

## 3. Generate the public HTTPS domain

1. Open the service's **Settings → Networking** section.
2. Select **Generate Domain**.
3. Copy the complete HTTPS URL, for example:

   ```text
   https://kv-operations-os-production.up.railway.app
   ```

4. Do not add a trailing slash when using this URL in environment variables.

Railway terminates HTTPS automatically. A business-owned custom domain can replace the generated domain later, but every URL variable and the Google redirect URI must then be updated together.

## 4. Add the persistent volume

1. From the Railway project canvas, create a new **Volume**.
2. Attach it to the `kv-operations-os` service.
3. Set its mount path to exactly:

   ```text
   /data
   ```

4. Keep one service replica. Never connect this volume or the same Baileys authentication state to a second running service.
5. After the first successful WhatsApp and Google connections, enable a daily or weekly volume backup from the volume's **Backups** tab.

Only files under `/data` survive redeployments. The container and application source are rebuilt from GitHub on every deployment.

## 5. Add Railway variables

Open the service's **Variables** tab, select **RAW Editor**, and use the template below. Replace every placeholder. Do not copy the local `.env` wholesale, and do not paste real values into Git, documentation, chat, or deployment logs.

```env
NODE_ENV=production
APP_BASE_URL=https://YOUR-RAILWAY-DOMAIN
FRONTEND_URL=https://YOUR-RAILWAY-DOMAIN

OPERATOR_USERNAME=operator
OPERATOR_PASSWORD=REPLACE_WITH_OPERATOR_PASSWORD
OWNER_USERNAME=owner
OWNER_PASSWORD=REPLACE_WITH_DISTINCT_OWNER_PASSWORD
AUTH_SESSION_HOURS=12

GOOGLE_CLIENT_ID=REPLACE_WITH_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=REPLACE_WITH_GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI=https://YOUR-RAILWAY-DOMAIN/api/google/callback
GOOGLE_TOKEN_FILE=/data/google-oauth.json

MASTER_SPREADSHEET_ID=REPLACE_WITH_MASTER_SPREADSHEET_ID
ORDERS_SPREADSHEET_ID=REPLACE_WITH_ORDERS_SPREADSHEET_ID
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

BAILEYS_AUTH_DIR=/data/baileys-auth
WHATSAPP_DEFAULT_COUNTRY_CODE=91
OPERATOR_TIME_ZONE=Asia/Kolkata
AUTO_FOLLOWUPS_ENABLED=true
FOLLOW_UP_POLL_MINUTES=60

SESSION_SECRET=REPLACE_WITH_FIRST_64_CHARACTER_HEX_VALUE
TOKEN_ENCRYPTION_KEY=REPLACE_WITH_SECOND_64_CHARACTER_HEX_VALUE
```

Do not define `PORT`; Railway supplies it and the API reads it automatically. `VITE_API_BASE_URL` is also unnecessary in production because the compiled frontend uses the same-origin `/api` default.

Review and deploy the staged variable and volume changes.

## 6. Configure Google OAuth for the hosted URL

1. Open Google Cloud Console and select the existing application project.
2. Open **Google Auth Platform → Clients** and select the web application client.
3. Add the exact production redirect URI:

   ```text
   https://YOUR-RAILWAY-DOMAIN/api/google/callback
   ```

4. Keep the localhost callback as a second authorized URI if local development will continue.
5. Confirm the Google account that will connect the application can edit both spreadsheets.
6. If the OAuth app is **External → Testing**, add that Google account as a test user. Testing-mode refresh tokens for Sheets expire after seven days, so move to an appropriate production or Internal configuration before relying on unattended operation.

The scheme, hostname, path, capitalization, and trailing slash must match `GOOGLE_REDIRECT_URI` exactly. When changing to a custom domain, add the new callback in Google Cloud before changing the Railway variables.

## 7. Connect the integrations on Railway

1. Open the Railway HTTPS domain and sign in as Owner.
2. Open **Connections**.
3. Select **Connect Google**, authorize the business Google account, and return to the hosted application.
4. Select **Test Sheets connection** and confirm both spreadsheet names and required tabs.
5. Stop the local development app before linking the production WhatsApp device.
6. Select **Connect WhatsApp** and scan the QR under **WhatsApp → Linked devices → Link a device**.
7. Confirm the top bar shows both Sheets and WhatsApp as connected.

Do not upload the local `.baileys-auth` directory to Railway. A fresh hosted pairing avoids sharing one Signal session between two machines. The production QR creates its credentials under `/data/baileys-auth`.

## 8. Enable safe Git deployments

The repository's `.github/workflows/ci.yml` verifies every pull request and every push to `master`.

In Railway:

1. Open the service's **Settings → Source**.
2. Confirm the deployment branch is `master`.
3. Enable **Auto Deploy**.
4. Enable **Wait for CI** after the first GitHub workflow run is visible.

The normal release flow is:

```text
feature branch → pull request → GitHub checks pass → merge to master → Railway deploys
```

The attached volume means a deployment may have a short interruption while Railway moves the volume from the old container to the new one. This also prevents two deployments from using the same Baileys session concurrently.

## 9. Production smoke test

After the deployment reports healthy:

1. Open `https://YOUR-RAILWAY-DOMAIN/api/health` and confirm the JSON status is `ok`.
2. Open a nested browser URL such as `/orders` directly and confirm the application loads rather than returning a 404.
3. Sign out and confirm business pages are inaccessible.
4. Sign back in and confirm the dashboard, SKU, inventory, orders, receiving, and packing pages load.
5. Test Sheets from Connections.
6. Send one WhatsApp message to a controlled test number and verify its `WHATSAPP LOG` row.
7. Restart the Railway service once, then confirm Google remains connected and WhatsApp reconnects from the saved volume.

## 10. Operations and recovery

- Use Railway deployment logs for crashes and startup errors, but never print environment variables or session files.
- Set a usage alert near `$8` and a practical monthly limit near `$12` while measuring the first month.
- Keep the service in the Singapore region and at one replica.
- A code rollback restores the previous image but does not roll back the volume.
- If the Google token cannot be decrypted, restore the original `TOKEN_ENCRYPTION_KEY` or disconnect and authorize Google again.
- If the Baileys session is logged out, reconnect from Connections and scan a new QR. Do not delete or replace the volume for an ordinary WhatsApp re-pair.
- If the domain changes, update `APP_BASE_URL`, `FRONTEND_URL`, `GOOGLE_REDIRECT_URI`, and Google Cloud's authorized redirect URI as one change.

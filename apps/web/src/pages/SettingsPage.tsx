import { useEffect, useState } from "react";
import type {
  GoogleConnectionTestResponse,
  GoogleStatusResponse,
} from "@kv-infra/shared";

import {
  apiErrorMessage,
  disconnectGoogle,
  getGoogleAuthUrl,
  getGoogleStatus,
  testGoogleConnection,
} from "../api/client";

type Status = GoogleStatusResponse["data"];
type TestResult = GoogleConnectionTestResponse["data"];

export const SettingsPage = () => {
  const [status, setStatus] = useState<Status | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => setStatus(await getGoogleStatus());

  useEffect(() => {
    void refresh().catch((error) => setMessage(apiErrorMessage(error)));
    if (
      new URLSearchParams(window.location.search).get("google") === "connected"
    ) {
      setMessage("Google authorization saved. Test the connection next.");
    }
  }, []);

  const connect = async () => {
    setBusy(true);
    setMessage("");
    try {
      window.location.assign(await getGoogleAuthUrl());
    } catch (error) {
      setMessage(apiErrorMessage(error));
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setMessage("");
    try {
      setTestResult(await testGoogleConnection());
      setMessage("Connection and required sheet headers verified.");
    } catch (error) {
      setMessage(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setMessage("");
    try {
      await disconnectGoogle();
      setTestResult(null);
      await refresh();
      setMessage("Local Google authorization removed.");
    } catch (error) {
      setMessage(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-panel narrow-panel">
      <span className="eyebrow">Settings / connections</span>
      <h1>Google Sheets</h1>
      <p className="lead">
        Authorize the operator account, then verify the configured spreadsheets
        and exact header contracts.
      </p>

      <div className="status-card">
        <div>
          <span className={`status-dot ${status?.connected ? "ok" : ""}`} />
          <strong>{status?.connected ? "Connected" : "Not connected"}</strong>
        </div>
        <span>
          {status?.configured
            ? "Environment configured"
            : "Environment incomplete"}
        </span>
      </div>

      {status && status.missingConfiguration.length > 0 && (
        <div className="notice error-notice">
          Missing: <code>{status.missingConfiguration.join(", ")}</code>
        </div>
      )}
      {message && <div className="notice">{message}</div>}

      <div className="button-row">
        {!status?.connected && (
          <button
            className="primary-button"
            onClick={connect}
            disabled={busy || !status?.configured}
          >
            Connect Google
          </button>
        )}
        {status?.connected && (
          <>
            <button className="primary-button" onClick={test} disabled={busy}>
              Test Sheets connection
            </button>
            <button
              className="secondary-button"
              onClick={connect}
              disabled={busy}
            >
              Reconnect Google
            </button>
            <button
              className="secondary-button"
              onClick={disconnect}
              disabled={busy}
            >
              Disconnect
            </button>
          </>
        )}
      </div>

      {testResult && (
        <dl className="result-list">
          <div>
            <dt>Master</dt>
            <dd>{testResult.masterSpreadsheet.title}</dd>
          </div>
          <div>
            <dt>Orders</dt>
            <dd>{testResult.ordersSpreadsheet.title}</dd>
          </div>
          <div>
            <dt>Verified tabs</dt>
            <dd>{testResult.verifiedSheets.join(", ")}</dd>
          </div>
        </dl>
      )}
    </section>
  );
};

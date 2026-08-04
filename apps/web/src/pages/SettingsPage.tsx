import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type {
  GoogleConnectionTestResponse,
  GoogleStatusResponse,
  WhatsAppStatus,
} from "@kv-infra/shared";

import {
  apiErrorMessage,
  disconnectGoogle,
  getGoogleAuthUrl,
  getGoogleStatus,
  testGoogleConnection,
  connectWhatsApp,
  getWhatsAppQr,
  getWhatsAppStatus,
} from "../api/client";

type Status = GoogleStatusResponse["data"];
type TestResult = GoogleConnectionTestResponse["data"];

export const SettingsPage = () => {
  const [status, setStatus] = useState<Status | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [whatsappStatus, setWhatsAppStatus] = useState<WhatsAppStatus | null>(
    null,
  );
  const [whatsappConnecting, setWhatsAppConnecting] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState("");
  const [whatsappMessage, setWhatsAppMessage] = useState("");

  const refresh = async () => setStatus(await getGoogleStatus());

  useEffect(() => {
    void refresh().catch((error) => setMessage(apiErrorMessage(error)));
    void getWhatsAppStatus()
      .then(setWhatsAppStatus)
      .catch((error) => setWhatsAppMessage(apiErrorMessage(error)));
    if (
      new URLSearchParams(window.location.search).get("google") === "connected"
    ) {
      setMessage("Google authorization saved. Test the connection next.");
    }
  }, []);

  useEffect(() => {
    if (!whatsappConnecting) return;
    const poll = async () => {
      try {
        const nextStatus = await getWhatsAppStatus();
        setWhatsAppStatus(nextStatus);
        if (nextStatus.connected) {
          setQr(null);
          setWhatsAppConnecting(false);
          setWhatsAppMessage("WhatsApp connected.");
          return;
        }
        setQr(await getWhatsAppQr());
      } catch (error) {
        setWhatsAppMessage(apiErrorMessage(error));
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2_000);
    return () => window.clearInterval(timer);
  }, [whatsappConnecting]);

  useEffect(() => {
    if (!qr) {
      setQrImage("");
      return;
    }
    void QRCode.toDataURL(qr, { width: 280, margin: 2 }).then(setQrImage);
  }, [qr]);

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

  const connectWa = async () => {
    setWhatsAppMessage("");
    setWhatsAppConnecting(true);
    try {
      setWhatsAppStatus(await connectWhatsApp());
    } catch (error) {
      setWhatsAppConnecting(false);
      setWhatsAppMessage(apiErrorMessage(error));
    }
  };

  return (
    <section className="page-panel narrow-panel">
      <h1>Connections</h1>
      <div className="settings-section">
        <div className="section-heading">
          <h2>Google Sheets</h2>
        </div>
        <p className="lead">
          Authorize the operator account, then verify the configured
          spreadsheets and exact header contracts.
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
      </div>

      <div className="settings-section">
        <div className="section-heading">
          <h2>WhatsApp</h2>
        </div>
        <p className="lead">
          Link the operator WhatsApp account. Session credentials stay in the
          configured local secret directory and are never written to Sheets.
        </p>
        <div className="status-card">
          <div>
            <span
              className={`status-dot ${whatsappStatus?.connected ? "ok" : ""}`}
            />
            <strong>{whatsappStatus?.status ?? "Checking…"}</strong>
          </div>
          <span>{whatsappStatus?.accountId ?? "No linked account"}</span>
        </div>
        {whatsappStatus?.lastError && (
          <div className="notice error-notice">{whatsappStatus.lastError}</div>
        )}
        {whatsappMessage && <div className="notice">{whatsappMessage}</div>}
        {!whatsappStatus?.connected && (
          <button
            className="primary-button"
            disabled={whatsappConnecting}
            onClick={() => void connectWa()}
          >
            {whatsappConnecting ? "Waiting for scan…" : "Connect WhatsApp"}
          </button>
        )}
        {qrImage && (
          <div className="whatsapp-qr">
            <img src={qrImage} alt="WhatsApp connection QR code" />
            <p>Scan with WhatsApp → Linked devices → Link a device.</p>
          </div>
        )}
      </div>
    </section>
  );
};

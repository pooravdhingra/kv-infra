import makeWASocket, {
  Browsers,
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import path from "node:path";
import { existsSync } from "node:fs";
import pino from "pino";

import { env, projectRoot } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";

export type WhatsAppConnectionStatus =
  "DISCONNECTED" | "CONNECTING" | "QR READY" | "CONNECTED";

export interface WhatsAppAdapter {
  connect(): Promise<void>;
  status(): {
    status: WhatsAppConnectionStatus;
    connected: boolean;
    qrAvailable: boolean;
    accountId: string | null;
    lastError: string | null;
  };
  qr(): string | null;
  sendText(number: string, body: string): Promise<void>;
}

export const normalizeWhatsAppJid = (
  number: string,
  defaultCountryCode: string,
) => {
  let digits = number.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `${defaultCountryCode}${digits}`;
  if (digits.length < 10 || digits.length > 15)
    throw new AppError(
      400,
      "INVALID_WHATSAPP_NUMBER",
      "Supplier number must include a valid country code",
    );
  return `${digits}@s.whatsapp.net`;
};

// This integration sends supplier messages but does not read operator chats.
// Ignoring inbound JIDs makes Baileys acknowledge them without attempting
// Signal decryption, avoiding stale-session Bad MAC loops.
export const ignoreIncomingWhatsAppJid = (_jid: string) => true;

export class BaileysWhatsAppAdapter implements WhatsAppAdapter {
  private socket: WASocket | null = null;
  private connectionStatus: WhatsAppConnectionStatus = "DISCONNECTED";
  private currentQr: string | null = null;
  private accountId: string | null = null;
  private lastError: string | null = null;
  private connecting: Promise<void> | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;

  status() {
    return {
      status: this.connectionStatus,
      connected: this.connectionStatus === "CONNECTED",
      qrAvailable: Boolean(this.currentQr),
      accountId: this.accountId,
      lastError: this.lastError,
    };
  }

  qr() {
    return this.currentQr;
  }

  hasSavedSession() {
    return existsSync(path.join(this.authDirectory(), "creds.json"));
  }

  private authDirectory() {
    return path.resolve(projectRoot, env.BAILEYS_AUTH_DIR);
  }

  async connect() {
    if (
      this.connectionStatus === "CONNECTED" ||
      (this.socket &&
        (this.connectionStatus === "CONNECTING" ||
          this.connectionStatus === "QR READY")) ||
      this.connecting
    ) {
      await this.connecting;
      return;
    }
    this.connecting = this.createSocket().finally(() => {
      this.connecting = null;
    });
    await this.connecting;
  }

  private async createSocket() {
    this.connectionStatus = "CONNECTING";
    this.lastError = null;
    const { state, saveCreds } = await useMultiFileAuthState(
      this.authDirectory(),
    );
    const socket = makeWASocket({
      auth: state,
      browser: Browsers.macOS("KV Operations OS"),
      logger: pino({ level: "silent" }),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      shouldIgnoreJid: ignoreIncomingWhatsAppJid,
    });
    this.socket = socket;
    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("connection.update", (update) => {
      if (update.qr) {
        this.currentQr = update.qr;
        this.connectionStatus = "QR READY";
      }
      if (update.connection === "open") {
        this.currentQr = null;
        this.connectionStatus = "CONNECTED";
        this.accountId = socket.user?.id ?? null;
        this.lastError = null;
      }
      if (update.connection === "close") {
        this.socket = null;
        this.currentQr = null;
        this.accountId = null;
        this.connectionStatus = "DISCONNECTED";
        const error = update.lastDisconnect?.error as
          { message?: string; output?: { statusCode?: number } } | undefined;
        this.lastError = error?.message ?? "WhatsApp connection closed";
        const loggedOut =
          error?.output?.statusCode === DisconnectReason.loggedOut;
        const connectionReplaced =
          error?.output?.statusCode === DisconnectReason.connectionReplaced;
        if (!loggedOut && !connectionReplaced && !this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            void this.connect().catch((reason: unknown) => {
              this.lastError =
                reason instanceof Error ? reason.message : "Reconnect failed";
            });
          }, 5_000);
        }
      }
    });
  }

  async sendText(number: string, body: string) {
    if (this.connectionStatus !== "CONNECTED" || !this.socket)
      throw new AppError(
        503,
        "WHATSAPP_DISCONNECTED",
        "Connect WhatsApp from Settings before sending messages",
      );
    const jid = normalizeWhatsAppJid(number, env.WHATSAPP_DEFAULT_COUNTRY_CODE);
    const matches = await this.socket.onWhatsApp(jid);
    const recipient = matches?.find((match) => Boolean(match.exists));
    if (!recipient)
      throw new AppError(
        400,
        "WHATSAPP_NUMBER_NOT_FOUND",
        "The selected supplier number is not registered on WhatsApp",
      );
    await this.socket.sendMessage(recipient.jid || jid, { text: body });
  }
}

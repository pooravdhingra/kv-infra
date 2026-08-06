import { describe, expect, it } from "vitest";

import type { WhatsAppAdapter } from "./whatsapp.adapter.js";
import type { WhatsAppLogRepository } from "./whatsapp.repository.js";
import { WhatsAppService } from "./whatsapp.service.js";

class FakeLogRepository implements WhatsAppLogRepository {
  rows: unknown[][] = [];
  async listIds() {
    return this.rows.map((row) => String(row[0]));
  }
  async followUpCounts() {
    return new Map<string, number>();
  }
  async append(row: unknown[]) {
    this.rows.push(row);
  }
}

const adapter = (
  failure?: string,
  onDisconnect?: () => void,
): WhatsAppAdapter => {
  let connected = true;
  return {
    connect: async () => undefined,
    disconnect: async () => {
      connected = false;
      onDisconnect?.();
    },
    status: () => ({
      status: connected ? "CONNECTED" : "DISCONNECTED",
      connected,
      qrAvailable: false,
      accountId: connected ? "test" : null,
      lastError: null,
    }),
    qr: () => null,
    sendText: async () => {
      if (failure) throw new Error(failure);
    },
  };
};

describe("WhatsAppService", () => {
  it("disconnects the adapter and returns its latest status", async () => {
    let disconnected = false;
    const service = new WhatsAppService(
      adapter(undefined, () => {
        disconnected = true;
      }),
      new FakeLogRepository(),
    );

    await expect(service.disconnect()).resolves.toMatchObject({
      status: "DISCONNECTED",
      connected: false,
    });
    expect(disconnected).toBe(true);
  });

  it("append-logs successful and failed message attempts", async () => {
    const successfulLog = new FakeLogRepository();
    const successful = await new WhatsAppService(adapter(), successfulLog).send(
      { supplierNumber: "+919999999999", messageBody: "Test message" },
      { requestId: "REQ-2026-0001", messageType: "INITIAL ORDER" },
    );
    expect(successful.errorMessage).toBeNull();
    expect(successfulLog.rows[0]?.[8]).toBeTruthy();
    expect(successfulLog.rows[0]?.[9]).toBe("");

    const failedLog = new FakeLogRepository();
    const failed = await new WhatsAppService(
      adapter("Disconnected"),
      failedLog,
    ).send({
      supplierNumber: "+919999999999",
      messageBody: "Test message",
    });
    expect(failed.errorMessage).toBe("Disconnected");
    expect(failedLog.rows[0]?.[8]).toBe("");
    expect(failedLog.rows[0]?.[9]).toBe("Disconnected");
  });
});

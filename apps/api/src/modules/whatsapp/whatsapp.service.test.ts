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

const adapter = (failure?: string): WhatsAppAdapter => ({
  connect: async () => undefined,
  status: () => ({
    status: "CONNECTED",
    connected: true,
    qrAvailable: false,
    accountId: "test",
    lastError: null,
  }),
  qr: () => null,
  sendText: async () => {
    if (failure) throw new Error(failure);
  },
});

describe("WhatsAppService", () => {
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

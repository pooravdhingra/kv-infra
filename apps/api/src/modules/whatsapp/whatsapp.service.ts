import { sendWhatsAppMessageSchema } from "@kv-infra/shared";

import type { WhatsAppAdapter } from "./whatsapp.adapter.js";
import type { WhatsAppLogRepository } from "./whatsapp.repository.js";

export type MessageContext = {
  requestId?: string;
  orderId?: string;
  sku?: string;
  supplierName?: string;
  messageType?: "INITIAL ORDER" | "FOLLOW-UP" | "DELIVERY CONFIRMATION";
  followUpNumber?: number;
  notes?: string;
};

const nextMessageId = (ids: string[]) => {
  const year = new Date().getFullYear();
  const pattern = new RegExp(`^MSG-${year}-(\\d{4,})$`);
  const highest = ids.reduce((max, id) => {
    const match = pattern.exec(id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `MSG-${year}-${String(highest + 1).padStart(4, "0")}`;
};

export class WhatsAppService {
  constructor(
    private readonly adapter: WhatsAppAdapter,
    private readonly repository: WhatsAppLogRepository,
  ) {}

  status() {
    return this.adapter.status();
  }

  async qr() {
    await this.adapter.connect();
    return this.adapter.qr();
  }

  async connect() {
    await this.adapter.connect();
    return this.status();
  }

  async send(input: unknown, context: MessageContext = {}) {
    const request = sendWhatsAppMessageSchema.parse(input);
    const messageId = nextMessageId(await this.repository.listIds());
    const sentAt = new Date().toISOString();
    let errorMessage = "";
    try {
      await this.adapter.sendText(request.supplierNumber, request.messageBody);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Send failed";
    }
    await this.repository.append([
      messageId,
      context.requestId ?? "",
      context.orderId ?? "",
      context.sku ?? "",
      context.supplierName ?? "",
      request.supplierNumber,
      context.messageType ?? "INITIAL ORDER",
      request.messageBody,
      errorMessage ? "" : sentAt,
      errorMessage,
      context.followUpNumber ?? 0,
      context.notes ?? "",
    ]);
    return {
      messageId,
      sentAt: errorMessage ? null : sentAt,
      errorMessage: errorMessage || null,
    };
  }
}

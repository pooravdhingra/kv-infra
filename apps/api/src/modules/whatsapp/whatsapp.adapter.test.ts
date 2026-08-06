import { describe, expect, it } from "vitest";

import {
  ignoreIncomingWhatsAppJid,
  normalizeWhatsAppJid,
} from "./whatsapp.adapter.js";

describe("normalizeWhatsAppJid", () => {
  it("adds the configured country code to a local ten-digit number", () => {
    expect(normalizeWhatsAppJid("9810525118", "91")).toBe(
      "919810525118@s.whatsapp.net",
    );
  });

  it("preserves explicit country codes and removes international prefixes", () => {
    expect(normalizeWhatsAppJid("+91 98105 25118", "91")).toBe(
      "919810525118@s.whatsapp.net",
    );
    expect(normalizeWhatsAppJid("0091-9810525118", "91")).toBe(
      "919810525118@s.whatsapp.net",
    );
  });

  it("ignores inbound chats because the integration is outbound-only", () => {
    expect(ignoreIncomingWhatsAppJid("919810525118@s.whatsapp.net")).toBe(true);
    expect(ignoreIncomingWhatsAppJid("120363000000000000@g.us")).toBe(true);
  });
});

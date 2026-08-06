import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  BaileysWhatsAppAdapter,
  ignoreIncomingWhatsAppJid,
  isSafeWhatsAppAuthDirectory,
  normalizeWhatsAppJid,
} from "./whatsapp.adapter.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

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

  it("only permits dedicated WhatsApp credential directories to be reset", () => {
    expect(isSafeWhatsAppAuthDirectory("/data/baileys-auth")).toBe(true);
    expect(isSafeWhatsAppAuthDirectory("/tmp/kv-whatsapp-auth-test")).toBe(
      true,
    );
    expect(isSafeWhatsAppAuthDirectory("/")).toBe(false);
    expect(isSafeWhatsAppAuthDirectory("/data")).toBe(false);
  });

  it("removes saved credentials when disconnected", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kv-whatsapp-auth-"));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, "creds.json"), "{}");
    await writeFile(join(directory, "session-test.json"), "{}");
    const adapter = new BaileysWhatsAppAdapter(directory);

    expect(adapter.hasSavedSession()).toBe(true);
    await adapter.disconnect();

    expect(adapter.hasSavedSession()).toBe(false);
    expect(adapter.status()).toMatchObject({
      status: "DISCONNECTED",
      connected: false,
      accountId: null,
      lastError: null,
    });
  });

  it("returns an actionable error for an invalid credential directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kv-whatsapp-auth-"));
    temporaryDirectories.push(directory);
    const blockingFile = join(directory, "not-a-directory");
    await writeFile(blockingFile, "blocked");
    const adapter = new BaileysWhatsAppAdapter(
      join(blockingFile, "baileys-auth"),
    );

    await expect(adapter.connect()).rejects.toMatchObject({
      status: 503,
      code: "WHATSAPP_AUTH_STORAGE_FAILED",
    });
    expect(adapter.status()).toMatchObject({
      status: "DISCONNECTED",
      connected: false,
      qrAvailable: false,
      lastError:
        "Could not initialize the WhatsApp linked-device credential directory",
    });
  });
});

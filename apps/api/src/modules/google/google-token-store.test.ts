import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { EncryptedFileTokenStore } from "./google-token-store.js";

const temporaryDirectories: string[] = [];
const testEncryptionKey = "test-only-token-encryption-key-32-characters";

const temporaryDirectory = async () => {
  const directory = await mkdtemp(join(tmpdir(), "kv-google-token-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("EncryptedFileTokenStore", () => {
  it("writes and reads an encrypted token from a writable local path", async () => {
    const directory = await temporaryDirectory();
    const store = new EncryptedFileTokenStore(
      join(directory, ".secrets", "google-oauth.json"),
      testEncryptionKey,
    );
    const tokens = {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 60_000,
    };

    await store.write(tokens);

    await expect(store.read()).resolves.toEqual(tokens);
  });

  it("returns an actionable error when the token path is not writable", async () => {
    const directory = await temporaryDirectory();
    const blockingFile = join(directory, "not-a-directory");
    await writeFile(blockingFile, "blocked");
    const store = new EncryptedFileTokenStore(
      join(blockingFile, "google-oauth.json"),
      testEncryptionKey,
    );

    await expect(
      store.write({ refreshToken: "refresh-token" }),
    ).rejects.toMatchObject({
      status: 503,
      code: "GOOGLE_TOKEN_STORAGE_FAILED",
    });
  });
});

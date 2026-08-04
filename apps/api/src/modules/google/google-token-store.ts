import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import { z } from "zod";

import { env, projectRoot } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";

const tokenSetSchema = z.object({
  accessToken: z.string().optional(),
  refreshToken: z.string(),
  expiresAt: z.number().optional(),
  scope: z.string().optional(),
  tokenType: z.string().optional(),
});

const encryptedFileSchema = z.object({
  version: z.literal(1),
  iv: z.string(),
  authTag: z.string(),
  ciphertext: z.string(),
});

export type GoogleTokenSet = z.infer<typeof tokenSetSchema>;

export interface TokenStore {
  exists(): Promise<boolean>;
  read(): Promise<GoogleTokenSet | null>;
  write(tokens: GoogleTokenSet): Promise<void>;
  delete(): Promise<void>;
}

const encryptionKey = () => {
  if (env.TOKEN_ENCRYPTION_KEY.length < 32) {
    throw new AppError(
      503,
      "GOOGLE_NOT_CONFIGURED",
      "TOKEN_ENCRYPTION_KEY must contain at least 32 characters",
    );
  }

  return createHash("sha256").update(env.TOKEN_ENCRYPTION_KEY).digest();
};

export class EncryptedFileTokenStore implements TokenStore {
  private readonly filePath = isAbsolute(env.GOOGLE_TOKEN_FILE)
    ? env.GOOGLE_TOKEN_FILE
    : resolve(projectRoot, env.GOOGLE_TOKEN_FILE);

  async exists() {
    return (await this.read()) !== null;
  }

  async read(): Promise<GoogleTokenSet | null> {
    let contents: string;
    try {
      contents = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }

    const encrypted = encryptedFileSchema.parse(JSON.parse(contents));
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(encrypted.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");

    return tokenSetSchema.parse(JSON.parse(plaintext));
  }

  async write(tokens: GoogleTokenSet) {
    const validated = tokenSetSchema.parse(tokens);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(validated), "utf8"),
      cipher.final(),
    ]);
    const payload = {
      version: 1 as const,
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };

    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    await writeFile(this.filePath, JSON.stringify(payload), {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  async delete() {
    try {
      await unlink(this.filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const projectRoot = fileURLToPath(
  new URL("../../../../", import.meta.url),
);
dotenv.config({
  path: fileURLToPath(new URL("../../../../.env", import.meta.url)),
});

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_BASE_URL: z.string().url().default("http://localhost:4000"),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  OPERATOR_USERNAME: z.string().trim().min(1).default("operator"),
  OPERATOR_PASSWORD: z.string().default(""),
  OWNER_USERNAME: z.string().trim().min(1).default("owner"),
  OWNER_PASSWORD: z.string().default(""),
  AUTH_SESSION_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_REDIRECT_URI: z
    .string()
    .url()
    .default("http://localhost:4000/api/google/callback"),
  GOOGLE_TOKEN_FILE: z.string().default(".secrets/google-oauth.json"),
  MASTER_SPREADSHEET_ID: z.string().default(""),
  ORDERS_SPREADSHEET_ID: z.string().default(""),
  PACKING_MASTER_SHEET_NAME: z.string().default("PACKING MASTER LIST"),
  SUPPLIER_MASTER_SHEET_NAME: z.string().default("SUPPLIER MASTER LIST"),
  INVENTORY_SHEET_NAME: z.string().default("INVENTORY"),
  RECEIVING_LOG_SHEET_NAME: z.string().default("RECEIVING LOG"),
  QA_LOG_SHEET_NAME: z.string().default("QA LOG"),
  ORDER_ALLOCATIONS_SHEET_NAME: z.string().default("ORDER ALLOCATIONS"),
  SUPPLIER_REQUESTS_SHEET_NAME: z.string().default("SUPPLIER REQUESTS"),
  WHATSAPP_LOG_SHEET_NAME: z.string().default("WHATSAPP LOG"),
  CLIENT_ORDER_LINKS_SHEET_NAME: z.string().default("CLIENT ORDER LINKS"),
  GOOGLE_SHEETS_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(10_000),
  GOOGLE_SHEETS_RETRY_ATTEMPTS: z.coerce
    .number()
    .int()
    .min(1)
    .max(6)
    .default(4),
  GOOGLE_SHEETS_RETRY_BASE_DELAY_MS: z.coerce
    .number()
    .int()
    .min(100)
    .default(500),
  GOOGLE_SHEETS_READ_CACHE_MS: z.coerce.number().int().min(0).default(15_000),
  BAILEYS_AUTH_DIR: z.string().default(".secrets/baileys-auth"),
  OPERATOR_TIME_ZONE: z.string().default("Asia/Kolkata"),
  AUTO_FOLLOWUPS_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  FOLLOW_UP_POLL_MINUTES: z.coerce.number().int().min(5).default(60),
  WHATSAPP_DEFAULT_COUNTRY_CODE: z
    .string()
    .regex(/^\d{1,3}$/)
    .default("91"),
  SESSION_SECRET: z.string().default(""),
  TOKEN_ENCRYPTION_KEY: z.string().default(""),
  PUBLIC_SKU_FORM_TOKEN: z.string().default(""),
});

export const env = envSchema.parse(process.env);

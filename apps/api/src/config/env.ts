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
  SESSION_SECRET: z.string().default(""),
  TOKEN_ENCRYPTION_KEY: z.string().default(""),
});

export const env = envSchema.parse(process.env);

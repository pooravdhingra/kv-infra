import { z } from "zod";

export const googleStatusSchema = z.object({
  data: z.object({
    configured: z.boolean(),
    connected: z.boolean(),
    missingConfiguration: z.array(z.string()),
  }),
});

export const googleAuthUrlSchema = z.object({
  data: z.object({ authUrl: z.string().url() }),
});

export const googleConnectionTestSchema = z.object({
  data: z.object({
    masterSpreadsheet: z.object({ id: z.string(), title: z.string() }),
    ordersSpreadsheet: z.object({ id: z.string(), title: z.string() }),
    verifiedSheets: z.array(z.string()),
  }),
});

export type GoogleStatusResponse = z.infer<typeof googleStatusSchema>;
export type GoogleConnectionTestResponse = z.infer<
  typeof googleConnectionTestSchema
>;

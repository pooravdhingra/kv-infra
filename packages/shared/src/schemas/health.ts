import { z } from "zod";

export const healthResponseSchema = z.object({
  data: z.object({
    status: z.literal("ok"),
    service: z.literal("api"),
    version: z.string(),
    environment: z.string().min(1),
    timestamp: z.string().datetime(),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

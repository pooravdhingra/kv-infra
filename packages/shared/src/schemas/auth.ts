import { z } from "zod";

export const authRoles = ["OPERATOR", "OWNER"] as const;
export const authRoleSchema = z.enum(authRoles);

export const loginRequestSchema = z.object({
  role: authRoleSchema,
  password: z.string().min(1).max(256),
});

export const authSessionSchema = z.object({
  authenticated: z.boolean(),
  role: authRoleSchema.nullable(),
});

export const authSessionResponseSchema = z.object({ data: authSessionSchema });

export type AuthRole = z.infer<typeof authRoleSchema>;
export type LoginRequest = z.input<typeof loginRequestSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;

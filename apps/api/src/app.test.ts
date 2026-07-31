import { healthResponseSchema } from "@kv-infra/shared";
import { describe, expect, it } from "vitest";

import { createHealthResponse } from "./app.js";

describe("API shell", () => {
  it("returns a contract-valid health payload", () => {
    const response = healthResponseSchema.parse(createHealthResponse());

    expect(response.data.status).toBe("ok");
  });
});

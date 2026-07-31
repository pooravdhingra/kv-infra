import { API_PREFIX, type ApiError } from "@kv-infra/shared";
import cors from "cors";
import express from "express";

import { env } from "./config/env.js";

export const createHealthResponse = () => ({
  data: {
    status: "ok" as const,
    service: "api" as const,
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  },
});

export const createApp = () => {
  const app = express();

  app.disable("x-powered-by");
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.get(`${API_PREFIX}/health`, (_request, response) => {
    response.json(createHealthResponse());
  });

  app.use((_request, response) => {
    const body: ApiError = {
      error: { code: "NOT_FOUND", message: "Route not found" },
    };
    response.status(404).json(body);
  });

  return app;
};

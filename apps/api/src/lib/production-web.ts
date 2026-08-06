import express, { type Express } from "express";
import { extname, resolve } from "node:path";

import { env, projectRoot } from "../config/env.js";

export const shouldServeSpaDocument = (method: string, requestPath: string) =>
  method === "GET" && extname(requestPath) === "";

export const mountProductionWeb = (app: Express) => {
  if (env.NODE_ENV !== "production") return;

  const webDist = resolve(projectRoot, "apps/web/dist");
  app.use(
    express.static(webDist, {
      index: false,
      maxAge: "1h",
    }),
  );
  app.use((request, response, next) => {
    if (!shouldServeSpaDocument(request.method, request.path)) {
      next();
      return;
    }
    response.sendFile(
      resolve(webDist, "index.html"),
      { headers: { "Cache-Control": "no-store" } },
      (error) => {
        if (error) next(error);
      },
    );
  });
};

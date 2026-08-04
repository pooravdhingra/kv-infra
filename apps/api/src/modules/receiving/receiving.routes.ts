import { Router } from "express";

import type { ReceivingService } from "./receiving.service.js";

export const createReceivingRouter = (service: ReceivingService) => {
  const router = Router();
  router.get("/", async (request, response) => {
    response.json({
      data: await service.recent(Number(request.query.limit ?? 20)),
    });
  });
  router.get("/open-order-options/:sku", async (request, response) => {
    response.json({
      data: await service.openOrderOptions(String(request.params.sku)),
    });
  });
  router.post("/", async (request, response) => {
    response.status(201).json({
      data: await service.create(
        request.body,
        request.header("Idempotency-Key") || undefined,
      ),
    });
  });
  return router;
};

import { Router } from "express";

import type { OrderService } from "./order.service.js";

export const createOrderRouter = (service: OrderService) => {
  const router = Router();

  router.get("/", async (_request, response) => {
    response.json({ data: await service.list() });
  });

  router.post("/", async (request, response) => {
    const idempotencyKey = request.header("Idempotency-Key") || undefined;
    response
      .status(201)
      .json({ data: await service.create(request.body, idempotencyKey) });
  });

  router.get("/:orderId", async (request, response) => {
    response.json({ data: await service.get(String(request.params.orderId)) });
  });

  router.post("/:orderId/stock-check", async (request, response) => {
    response.json({
      data: await service.stockCheck(String(request.params.orderId)),
    });
  });

  return router;
};

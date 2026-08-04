import { Router } from "express";

import type { OrderService } from "./order.service.js";
import type { AllocationService } from "../allocations/allocation.service.js";

export const createOrderRouter = (
  service: OrderService,
  allocations?: AllocationService,
) => {
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

  router.post("/:orderId/ship", async (request, response) => {
    response.json({
      data: await service.ship(String(request.params.orderId)),
    });
  });

  router.post("/:orderId/allocate", async (request, response) => {
    if (!allocations) throw new Error("Allocation service is not configured");
    response.status(201).json({
      data: await allocations.create(
        String(request.params.orderId),
        request.body,
        request.header("Idempotency-Key") || undefined,
      ),
    });
  });

  return router;
};

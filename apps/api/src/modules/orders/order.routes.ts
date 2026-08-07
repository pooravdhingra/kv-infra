import { Router } from "express";

import type { OrderService } from "./order.service.js";
import type { AllocationService } from "../allocations/allocation.service.js";
import type { PackingService } from "../packing/packing.service.js";
import type { SupplierRequestService } from "../supplier-requests/supplier-request.service.js";
import { AppError } from "../../lib/app-error.js";

export const createOrderRouter = (
  service: OrderService,
  allocations?: AllocationService,
  supplierRequests?: SupplierRequestService,
  packing?: PackingService,
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

  router.put("/:orderId", async (request, response) => {
    response.json({
      data: await service.update(String(request.params.orderId), request.body),
    });
  });

  router.delete("/:orderId/lines/:orderLineId", async (request, response) => {
    if (!allocations || !supplierRequests || !packing)
      throw new Error("Order-line removal services are not configured");
    const orderId = String(request.params.orderId);
    const orderLineId = String(request.params.orderLineId);
    const order = await service.get(orderId);
    if (order.status === "COMPLETED")
      throw new AppError(
        409,
        "ORDER_COMPLETED",
        `${orderId} has already been shipped`,
      );
    if (!order.items.some((line) => line.orderLineId === orderLineId))
      throw new AppError(
        404,
        "ORDER_LINE_NOT_FOUND",
        `Order line ${orderLineId} was not found in ${orderId}`,
      );
    if (order.items.length <= 1)
      throw new AppError(
        409,
        "ORDER_REQUIRES_ITEM",
        "An order must retain at least one item",
      );
    await allocations.cancelForLine(orderId, orderLineId);
    await supplierRequests.unlinkForLine(orderId, orderLineId);
    await packing.unlinkForLine(orderId, orderLineId);
    response.json({ data: await service.cancelLine(orderId, orderLineId) });
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

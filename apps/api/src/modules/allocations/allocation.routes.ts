import { Router } from "express";

import type { AllocationService } from "./allocation.service.js";

export const createAllocationRouter = (service: AllocationService) => {
  const router = Router();
  router.get("/", async (request, response) => {
    const orderId = String(request.query.orderId ?? "") || undefined;
    response.json({ data: await service.list(orderId) });
  });
  router.post("/:allocationId/cancel", async (request, response) => {
    response.json({
      data: await service.cancel(
        String(request.params.allocationId),
        request.body,
        request.header("Idempotency-Key") || undefined,
      ),
    });
  });
  return router;
};

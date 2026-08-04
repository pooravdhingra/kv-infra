import { Router } from "express";

import type { PackingService } from "./packing.service.js";

export const createPackingRouter = (service: PackingService) => {
  const router = Router();
  router.get("/", async (_request, response) => {
    response.json({ data: await service.list() });
  });
  router.post("/start", async (request, response) => {
    response.status(201).json({
      data: await service.start(
        request.body,
        request.header("Idempotency-Key") || undefined,
      ),
    });
  });
  router.post("/:packingId/finish", async (request, response) => {
    response.json({
      data: await service.finish(
        String(request.params.packingId),
        request.body,
        request.header("Idempotency-Key") || undefined,
      ),
    });
  });
  return router;
};

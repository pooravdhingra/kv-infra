import { Router } from "express";

import type { SupplierRequestService } from "./supplier-request.service.js";

export const createSupplierRequestRouter = (
  service: SupplierRequestService,
) => {
  const router = Router();
  router.get("/", async (_request, response) => {
    response.json({ data: await service.list() });
  });
  router.get("/pending", async (_request, response) => {
    response.json({ data: await service.pending() });
  });
  router.post("/", async (request, response) => {
    response.status(201).json({
      data: await service.create(
        request.body,
        request.header("Idempotency-Key") || undefined,
      ),
    });
  });
  router.post("/bulk", async (request, response) => {
    response.status(201).json({
      data: await service.createBulk(
        request.body,
        request.header("Idempotency-Key") || undefined,
      ),
    });
  });
  router.post("/send-due-followups", async (_request, response) => {
    response.json({ data: await service.sendDueFollowUps() });
  });
  router.post("/:requestId/mark-confirmed", async (request, response) => {
    response.json({
      data: await service.markConfirmed(
        String(request.params.requestId),
        request.body,
      ),
    });
  });
  router.post("/:requestId/mark-received", async (request, response) => {
    response.json({
      data: await service.markReceived(
        String(request.params.requestId),
        request.body,
      ),
    });
  });
  router.post("/:requestId/disable-followups", async (request, response) => {
    response.json({
      data: await service.disableFollowUps(
        String(request.params.requestId),
        request.body,
      ),
    });
  });
  router.post("/:requestId/send-followup", async (request, response) => {
    response.json({
      data: await service.sendFollowUp(String(request.params.requestId)),
    });
  });
  router.post("/:requestId/retry", async (request, response) => {
    response.json({
      data: await service.retryInitial(String(request.params.requestId)),
    });
  });
  return router;
};

import { Router } from "express";

import type { PublicLinkService } from "./public-link.service.js";

export const createPublicLinkRouter = (service: PublicLinkService) => {
  const router = Router();

  router.get("/orders/:token", async (request, response) => {
    response.json({
      data: await service.publicOrderState(String(request.params.token)),
    });
  });
  router.post("/orders/:token", async (request, response) => {
    response.status(201).json({
      data: await service.submitPublicOrder(
        String(request.params.token),
        request.body,
      ),
    });
  });
  router.get("/sku-form/:token", (request, response) => {
    response.json({
      data: service.publicSkuFormStatus(String(request.params.token)),
    });
  });
  router.post("/sku-form/:token", async (request, response) => {
    response.status(201).json({
      data: await service.createPublicSku(
        String(request.params.token),
        request.body,
      ),
    });
  });

  return router;
};

export const createClientOrderLinkRouter = (service: PublicLinkService) => {
  const router = Router();

  router.get("/", async (_request, response) => {
    response.json({ data: await service.listClientOrderLinks() });
  });
  router.post("/", async (request, response) => {
    response
      .status(201)
      .json({ data: await service.createClientOrderLink(request.body) });
  });
  router.post("/:linkId/disable", async (request, response) => {
    response.json({
      data: await service.disableClientOrderLink(String(request.params.linkId)),
    });
  });
  router.get("/public-tools", (_request, response) => {
    response.json({ data: service.publicTools() });
  });

  return router;
};

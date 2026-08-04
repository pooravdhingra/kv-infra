import { Router } from "express";

import type { SkuService } from "./sku.service.js";

export const createSkuRouter = (service: SkuService) => {
  const router = Router();

  router.get("/", async (_request, response) => {
    response.json({ data: await service.list() });
  });

  router.get("/:sku", async (request, response) => {
    response.json({ data: await service.get(String(request.params.sku)) });
  });

  router.post("/", async (request, response) => {
    response.status(201).json({ data: await service.create(request.body) });
  });

  router.put("/:sku", async (request, response) => {
    response.json({
      data: await service.update(String(request.params.sku), request.body),
    });
  });

  router.delete("/:sku", async (request, response) => {
    response.json({
      data: await service.delete(String(request.params.sku)),
    });
  });

  return router;
};

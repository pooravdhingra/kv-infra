import { Router } from "express";

import type { InventoryService } from "./inventory.service.js";

export const createInventoryRouter = (service: InventoryService) => {
  const router = Router();

  router.get("/", async (_request, response) => {
    response.json({ data: await service.list() });
  });

  router.get("/:sku", async (request, response) => {
    response.json({ data: await service.get(String(request.params.sku)) });
  });

  router.post("/manual-adjustment", async (request, response) => {
    response.json({ data: await service.adjust(request.body) });
  });

  return router;
};

import { Router } from "express";

import type { SupplierService } from "./supplier.service.js";

export const createSupplierRouter = (service: SupplierService) => {
  const router = Router();
  router.get("/", async (_request, response) => {
    response.json({ data: await service.all() });
  });
  router.get("/:sku", async (request, response) => {
    response.json({ data: await service.forSku(String(request.params.sku)) });
  });
  return router;
};

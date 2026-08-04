import { Router } from "express";

import type { DashboardService } from "./dashboard.service.js";

export const createDashboardRouter = (service: DashboardService) => {
  const router = Router();
  router.get("/", async (_request, response) => {
    response.json({ data: await service.get() });
  });
  return router;
};

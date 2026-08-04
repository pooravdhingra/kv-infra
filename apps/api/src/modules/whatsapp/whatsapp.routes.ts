import { Router } from "express";

import type { WhatsAppService } from "./whatsapp.service.js";

export const createWhatsAppRouter = (service: WhatsAppService) => {
  const router = Router();
  router.get("/status", (_request, response) => {
    response.json({ data: service.status() });
  });
  router.post("/connect", async (_request, response) => {
    response.json({ data: await service.connect() });
  });
  router.get("/qr", async (_request, response) => {
    response.json({ data: { qr: await service.qr() } });
  });
  router.post("/send", async (request, response) => {
    response.json({ data: await service.send(request.body) });
  });
  return router;
};

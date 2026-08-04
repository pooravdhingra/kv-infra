import { API_PREFIX, type ApiError } from "@kv-infra/shared";
import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { ZodError } from "zod";

import { env } from "./config/env.js";
import { AppError } from "./lib/app-error.js";
import { createGoogleRouter } from "./modules/google/google.routes.js";
import { GoogleOAuthService } from "./modules/google/google-oauth.service.js";
import { EncryptedFileTokenStore } from "./modules/google/google-token-store.js";
import { GoogleSheetsClient } from "./modules/sheets/google-sheets.client.js";
import { createInventoryRouter } from "./modules/inventory/inventory.routes.js";
import { GoogleSheetsInventoryRepository } from "./modules/inventory/inventory.repository.js";
import { InventoryService } from "./modules/inventory/inventory.service.js";
import { createPackingRouter } from "./modules/packing/packing.routes.js";
import { GoogleSheetsPackingRepository } from "./modules/packing/packing.repository.js";
import { PackingService } from "./modules/packing/packing.service.js";
import { createReceivingRouter } from "./modules/receiving/receiving.routes.js";
import { GoogleSheetsReceivingRepository } from "./modules/receiving/receiving.repository.js";
import { ReceivingService } from "./modules/receiving/receiving.service.js";
import { createOrderRouter } from "./modules/orders/order.routes.js";
import { GoogleSheetsOrderRepository } from "./modules/orders/order.repository.js";
import { OrderService } from "./modules/orders/order.service.js";
import { createSkuRouter } from "./modules/sku/sku.routes.js";
import { GoogleSheetsSkuRepository } from "./modules/sku/sku.repository.js";
import { SkuService } from "./modules/sku/sku.service.js";
import { createSupplierRouter } from "./modules/suppliers/supplier.routes.js";
import { GoogleSheetsSupplierRepository } from "./modules/suppliers/supplier.repository.js";
import { SupplierService } from "./modules/suppliers/supplier.service.js";
import { createAllocationRouter } from "./modules/allocations/allocation.routes.js";
import { GoogleSheetsAllocationRepository } from "./modules/allocations/allocation.repository.js";
import { AllocationService } from "./modules/allocations/allocation.service.js";
import { createSupplierRequestRouter } from "./modules/supplier-requests/supplier-request.routes.js";
import { GoogleSheetsSupplierRequestRepository } from "./modules/supplier-requests/supplier-request.repository.js";
import { SupplierRequestService } from "./modules/supplier-requests/supplier-request.service.js";
import { BaileysWhatsAppAdapter } from "./modules/whatsapp/whatsapp.adapter.js";
import { createWhatsAppRouter } from "./modules/whatsapp/whatsapp.routes.js";
import { GoogleSheetsWhatsAppLogRepository } from "./modules/whatsapp/whatsapp.repository.js";
import { WhatsAppService } from "./modules/whatsapp/whatsapp.service.js";
import { createDashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { DashboardService } from "./modules/dashboard/dashboard.service.js";

export const createHealthResponse = () => ({
  data: {
    status: "ok" as const,
    service: "api" as const,
    version: "0.11.0",
    timestamp: new Date().toISOString(),
  },
});

export const createApp = () => {
  const app = express();

  app.disable("x-powered-by");
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.get(`${API_PREFIX}/health`, (_request, response) => {
    response.json(createHealthResponse());
  });

  const tokenStore = new EncryptedFileTokenStore();
  const oauth = new GoogleOAuthService(tokenStore);
  const sheets = new GoogleSheetsClient(oauth);
  const skuRepository = new GoogleSheetsSkuRepository(sheets);
  const skuService = new SkuService(skuRepository);
  const inventoryRepository = new GoogleSheetsInventoryRepository(sheets);
  const inventoryService = new InventoryService(inventoryRepository);
  const allocationRepository = new GoogleSheetsAllocationRepository(sheets);
  const orderService = new OrderService(
    new GoogleSheetsOrderRepository(sheets),
    skuRepository,
    inventoryService,
    allocationRepository,
    inventoryRepository,
  );
  const packingService = new PackingService(
    new GoogleSheetsPackingRepository(sheets),
    inventoryRepository,
    orderService,
  );
  const supplierService = new SupplierService(
    new GoogleSheetsSupplierRepository(sheets),
  );
  const whatsappLogRepository = new GoogleSheetsWhatsAppLogRepository(sheets);
  const whatsappAdapter = new BaileysWhatsAppAdapter();
  const whatsappService = new WhatsAppService(
    whatsappAdapter,
    whatsappLogRepository,
  );
  const supplierRequestRepository = new GoogleSheetsSupplierRequestRepository(
    sheets,
  );
  const supplierRequestService = new SupplierRequestService(
    supplierRequestRepository,
    orderService,
    supplierService,
    whatsappService,
    whatsappLogRepository,
  );
  const receivingService = new ReceivingService(
    new GoogleSheetsReceivingRepository(sheets),
    inventoryRepository,
    orderService,
    supplierRequestService,
  );
  const allocationService = new AllocationService(
    allocationRepository,
    inventoryRepository,
    orderService,
  );
  const dashboardService = new DashboardService(
    orderService,
    packingService,
    supplierRequestRepository,
    receivingService,
  );

  app.use(`${API_PREFIX}/dashboard`, createDashboardRouter(dashboardService));
  app.use(`${API_PREFIX}/google`, createGoogleRouter(oauth, sheets));
  app.use(`${API_PREFIX}/skus`, createSkuRouter(skuService));
  app.use(`${API_PREFIX}/inventory`, createInventoryRouter(inventoryService));
  app.use(
    `${API_PREFIX}/orders`,
    createOrderRouter(orderService, allocationService),
  );
  app.use(
    `${API_PREFIX}/allocations`,
    createAllocationRouter(allocationService),
  );
  app.use(`${API_PREFIX}/receiving`, createReceivingRouter(receivingService));
  app.use(`${API_PREFIX}/packing`, createPackingRouter(packingService));
  app.use(`${API_PREFIX}/suppliers`, createSupplierRouter(supplierService));
  app.use(
    `${API_PREFIX}/supplier-requests`,
    createSupplierRequestRouter(supplierRequestService),
  );
  app.use(`${API_PREFIX}/whatsapp`, createWhatsAppRouter(whatsappService));

  if (env.NODE_ENV !== "test" && env.AUTO_FOLLOWUPS_ENABLED) {
    if (whatsappAdapter.hasSavedSession())
      void whatsappService.connect().catch(() => {});
    const initialCheck = setTimeout(
      () => void supplierRequestService.sendDueFollowUps().catch(() => {}),
      30_000,
    );
    initialCheck.unref();
    const timer = setInterval(
      () => void supplierRequestService.sendDueFollowUps().catch(() => {}),
      env.FOLLOW_UP_POLL_MINUTES * 60_000,
    );
    timer.unref();
  }

  app.use((_request, response) => {
    const body: ApiError = {
      error: { code: "NOT_FOUND", message: "Route not found" },
    };
    response.status(404).json(body);
  });

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      if (error instanceof ZodError) {
        const body: ApiError = {
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            details: error.flatten(),
          },
        };
        response.status(400).json(body);
        return;
      }
      if (error instanceof AppError) {
        const body: ApiError = {
          error: {
            code: error.code,
            message: error.message,
            ...(error.details === undefined ? {} : { details: error.details }),
          },
        };
        response.status(error.status).json(body);
        return;
      }

      const body: ApiError = {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred",
        },
      };
      response.status(500).json(body);
    },
  );

  return app;
};

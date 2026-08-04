import {
  googleAuthUrlSchema,
  googleConnectionTestSchema,
  googleStatusSchema,
  dashboardResponseSchema,
  healthResponseSchema,
  inventoryItemResponseSchema,
  inventoryListResponseSchema,
  orderListResponseSchema,
  orderResponseSchema,
  openOrderOptionsResponseSchema,
  packingListResponseSchema,
  packingSessionResponseSchema,
  receiptListResponseSchema,
  receiptResponseSchema,
  skuListResponseSchema,
  skuResponseSchema,
  supplierListResponseSchema,
  allocationListResponseSchema,
  allocationResponseSchema,
  supplierRequestListResponseSchema,
  supplierRequestResponseSchema,
  whatsappQrSchema,
  whatsappStatusSchema,
  type CancelAllocationRequest,
  type BulkCreateSupplierRequests,
  type CreateAllocationRequest,
  type CreateSupplierRequest,
  type CreateSkuRequest,
  type CreateOrderRequest,
  type CreateReceiptRequest,
  type FinishPackingRequest,
  type ManualInventoryAdjustment,
  type StartPackingRequest,
  type UpdateSkuRequest,
} from "@kv-infra/shared";
import axios, { AxiosError } from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api",
  timeout: 10_000,
});

export const apiErrorMessage = (error: unknown) => {
  if (error instanceof AxiosError) {
    const message = (
      error.response?.data as { error?: { message?: string } } | undefined
    )?.error?.message;
    return message ?? error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong";
};

export const getHealth = async () => {
  const response = await api.get("/health");
  return healthResponseSchema.parse(response.data);
};

export const getDashboard = async () =>
  dashboardResponseSchema.parse((await api.get("/dashboard")).data).data;

export const getGoogleStatus = async () =>
  googleStatusSchema.parse((await api.get("/google/status")).data).data;

export const getGoogleAuthUrl = async () =>
  googleAuthUrlSchema.parse((await api.get("/google/auth-url")).data).data
    .authUrl;

export const testGoogleConnection = async () =>
  googleConnectionTestSchema.parse((await api.post("/google/test")).data).data;

export const disconnectGoogle = async () => {
  await api.post("/google/disconnect");
};

let skuListRequest: Promise<
  ReturnType<typeof skuListResponseSchema.parse>["data"]
> | null = null;

export const listSkus = () => {
  if (skuListRequest) return skuListRequest;
  skuListRequest = api
    .get("/skus")
    .then((response) => skuListResponseSchema.parse(response.data).data)
    .finally(() => {
      skuListRequest = null;
    });
  return skuListRequest;
};

export const createSku = async (input: CreateSkuRequest) =>
  skuResponseSchema.parse((await api.post("/skus", input)).data).data;

export const updateSku = async (sku: string, input: UpdateSkuRequest) =>
  skuResponseSchema.parse(
    (await api.put(`/skus/${encodeURIComponent(sku)}`, input)).data,
  ).data;

export const deleteSku = async (sku: string) => {
  await api.delete(`/skus/${encodeURIComponent(sku)}`);
};

export const listInventory = async () =>
  inventoryListResponseSchema.parse((await api.get("/inventory")).data).data;

export const getInventoryItem = async (sku: string) =>
  inventoryItemResponseSchema.parse(
    (await api.get(`/inventory/${encodeURIComponent(sku)}`)).data,
  ).data;

export const adjustInventory = async (input: ManualInventoryAdjustment) =>
  inventoryItemResponseSchema.parse(
    (await api.post("/inventory/manual-adjustment", input)).data,
  ).data;

export const listOrders = async () =>
  orderListResponseSchema.parse((await api.get("/orders")).data).data;

export const getOrder = async (orderId: string) =>
  orderResponseSchema.parse(
    (await api.get(`/orders/${encodeURIComponent(orderId)}`)).data,
  ).data;

export const createOrder = async (input: CreateOrderRequest) =>
  orderResponseSchema.parse(
    (
      await api.post("/orders", input, {
        headers: { "Idempotency-Key": crypto.randomUUID() },
      })
    ).data,
  ).data;

export const runOrderStockCheck = async (orderId: string) =>
  orderResponseSchema.parse(
    (await api.post(`/orders/${encodeURIComponent(orderId)}/stock-check`)).data,
  ).data;

export const shipOrder = async (orderId: string) =>
  orderResponseSchema.parse(
    (await api.post(`/orders/${encodeURIComponent(orderId)}/ship`)).data,
  ).data;

export const listAllocations = async (orderId?: string) =>
  allocationListResponseSchema.parse(
    (await api.get("/allocations", { params: orderId ? { orderId } : {} }))
      .data,
  ).data;

export const allocateOrderStock = async (
  orderId: string,
  input: CreateAllocationRequest,
) =>
  allocationResponseSchema.parse(
    (
      await api.post(`/orders/${encodeURIComponent(orderId)}/allocate`, input, {
        headers: { "Idempotency-Key": crypto.randomUUID() },
      })
    ).data,
  ).data;

export const cancelAllocation = async (
  allocationId: string,
  input: CancelAllocationRequest,
) =>
  allocationResponseSchema.parse(
    (
      await api.post(
        `/allocations/${encodeURIComponent(allocationId)}/cancel`,
        input,
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      )
    ).data,
  ).data;

async function fetchOpenOrderOptions(sku: string) {
  return openOrderOptionsResponseSchema.parse(
    (await api.get(`/receiving/open-order-options/${encodeURIComponent(sku)}`))
      .data,
  ).data;
}

async function fetchSuppliers(sku: string) {
  return supplierListResponseSchema.parse(
    (await api.get(`/suppliers/${encodeURIComponent(sku)}`)).data,
  ).data;
}

const openOrderRequests = new Map<
  string,
  ReturnType<typeof fetchOpenOrderOptions>
>();
const supplierRequests = new Map<string, ReturnType<typeof fetchSuppliers>>();

export const listOpenOrderOptions = (sku: string) => {
  const key = sku.toUpperCase();
  const existing = openOrderRequests.get(key);
  if (existing) return existing;
  const request = fetchOpenOrderOptions(key).finally(() =>
    openOrderRequests.delete(key),
  );
  openOrderRequests.set(key, request);
  return request;
};

export const listSuppliers = (sku: string) => {
  const key = sku.toUpperCase();
  const existing = supplierRequests.get(key);
  if (existing) return existing;
  const request = fetchSuppliers(key).finally(() =>
    supplierRequests.delete(key),
  );
  supplierRequests.set(key, request);
  return request;
};

export const listAllSuppliers = async () =>
  supplierListResponseSchema.parse((await api.get("/suppliers")).data).data;

export const listSupplierRequests = async (pending = false) =>
  supplierRequestListResponseSchema.parse(
    (await api.get(`/supplier-requests${pending ? "/pending" : ""}`)).data,
  ).data;

export const createSupplierRequest = async (input: CreateSupplierRequest) =>
  supplierRequestResponseSchema.parse(
    (
      await api.post("/supplier-requests", input, {
        headers: { "Idempotency-Key": crypto.randomUUID() },
      })
    ).data,
  ).data;

export const createBulkSupplierRequests = async (
  input: BulkCreateSupplierRequests,
) =>
  supplierRequestListResponseSchema.parse(
    (
      await api.post("/supplier-requests/bulk", input, {
        headers: { "Idempotency-Key": crypto.randomUUID() },
        timeout: 0,
      })
    ).data,
  ).data;

const updateSupplierRequest = async (
  requestId: string,
  action: string,
  notes = "",
) =>
  supplierRequestResponseSchema.parse(
    (
      await api.post(
        `/supplier-requests/${encodeURIComponent(requestId)}/${action}`,
        { notes },
      )
    ).data,
  ).data;

export const markSupplierRequestConfirmed = (requestId: string, notes = "") =>
  updateSupplierRequest(requestId, "mark-confirmed", notes);

export const markSupplierRequestReceived = (requestId: string, notes = "") =>
  updateSupplierRequest(requestId, "mark-received", notes);

export const disableSupplierFollowUps = (requestId: string, notes = "") =>
  updateSupplierRequest(requestId, "disable-followups", notes);

export const sendSupplierFollowUp = (requestId: string) =>
  updateSupplierRequest(requestId, "send-followup");

export const retrySupplierRequest = (requestId: string) =>
  updateSupplierRequest(requestId, "retry");

export const sendDueSupplierFollowUps = async () =>
  supplierRequestListResponseSchema.parse(
    (await api.post("/supplier-requests/send-due-followups")).data,
  ).data;

export const getWhatsAppStatus = async () =>
  whatsappStatusSchema.parse((await api.get("/whatsapp/status")).data).data;

export const connectWhatsApp = async () =>
  whatsappStatusSchema.parse((await api.post("/whatsapp/connect")).data).data;

export const getWhatsAppQr = async () =>
  whatsappQrSchema.parse((await api.get("/whatsapp/qr")).data).data.qr;

const recentReceiptRequests = new Map<
  number,
  Promise<ReturnType<typeof receiptListResponseSchema.parse>["data"]>
>();

export const listRecentReceipts = (limit = 20) => {
  const existing = recentReceiptRequests.get(limit);
  if (existing) return existing;
  const request = api
    .get("/receiving", { params: { limit } })
    .then((response) => receiptListResponseSchema.parse(response.data).data)
    .finally(() => recentReceiptRequests.delete(limit));
  recentReceiptRequests.set(limit, request);
  return request;
};

export const receiveMaterial = async (input: CreateReceiptRequest) =>
  receiptResponseSchema.parse(
    (
      await api.post("/receiving", input, {
        headers: { "Idempotency-Key": crypto.randomUUID() },
      })
    ).data,
  ).data;

export const listPacking = async () =>
  packingListResponseSchema.parse((await api.get("/packing")).data).data;

export const startPacking = async (input: StartPackingRequest) =>
  packingSessionResponseSchema.parse(
    (
      await api.post("/packing/start", input, {
        headers: { "Idempotency-Key": crypto.randomUUID() },
      })
    ).data,
  ).data;

export const finishPacking = async (
  packingId: string,
  input: FinishPackingRequest,
) =>
  packingSessionResponseSchema.parse(
    (
      await api.post(
        `/packing/${encodeURIComponent(packingId)}/finish`,
        input,
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      )
    ).data,
  ).data;

import type { SUPPLIER_REQUEST_STATUSES } from "../constants/index.js";

export type SupplierRequestStatus = (typeof SUPPLIER_REQUEST_STATUSES)[number];

export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

import { skuCodeSchema } from "@kv-infra/shared";

import type { SupplierRepository } from "./supplier.repository.js";

const CACHE_MS = 60_000;

export class SupplierService {
  private cached: Awaited<ReturnType<SupplierRepository["list"]>> | null = null;
  private pending: ReturnType<SupplierRepository["list"]> | null = null;
  private expiresAt = 0;

  constructor(private readonly repository: SupplierRepository) {}

  async forSku(rawSku: string) {
    const sku = skuCodeSchema.parse(rawSku);
    if (!this.cached || Date.now() >= this.expiresAt) {
      this.pending ??= this.repository
        .list()
        .then((items) => {
          this.cached = items;
          this.expiresAt = Date.now() + CACHE_MS;
          return items;
        })
        .finally(() => {
          this.pending = null;
        });
      await this.pending;
    }
    return this.cached!.filter((supplier) => supplier.sku === sku).sort(
      (left, right) =>
        left.priority - right.priority || left.name.localeCompare(right.name),
    );
  }
}

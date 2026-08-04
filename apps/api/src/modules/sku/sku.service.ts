import {
  createSkuRequestSchema,
  skuSchema,
  updateSkuRequestSchema,
  type Sku,
  type SkuOem,
} from "@kv-infra/shared";

import { AppError } from "../../lib/app-error.js";
import type { SkuRecord, SkuRepository } from "./sku.repository.js";

const withoutRow = ({ rowNumber: _rowNumber, ...sku }: SkuRecord): Sku => sku;

const OEM_PREFIX: Record<SkuOem, string> = {
  Bajaj: "B",
  TVS: "T",
  Piaggio: "P",
  Other: "X",
};

export const generateNextSkuCode = (
  skus: Array<Pick<Sku, "sku">>,
  oem: SkuOem,
) => {
  const prefix = OEM_PREFIX[oem];
  const pattern = new RegExp(`^(?:DELETED-)?KV-${prefix}(\\d{6,})$`);
  const highestSequence = skus.reduce((highest, item) => {
    const match = pattern.exec(item.sku);
    if (!match) return highest;
    const sequence = Number(match[1]);
    return Number.isSafeInteger(sequence)
      ? Math.max(highest, sequence)
      : highest;
  }, 0);

  return `KV-${prefix}${String(highestSequence + 1).padStart(6, "0")}`;
};

export class SkuService {
  constructor(private readonly repository: SkuRepository) {}

  async list() {
    return (await this.repository.listSkus())
      .filter((sku) => !sku.sku.startsWith("DELETED-"))
      .map(withoutRow);
  }

  async get(rawSku: string) {
    const skuCode = skuSchema.shape.sku.parse(rawSku);
    const found = (await this.repository.listSkus()).find(
      (item) => item.sku === skuCode,
    );
    if (!found)
      throw new AppError(404, "SKU_NOT_FOUND", `SKU ${skuCode} was not found`);
    return withoutRow(found);
  }

  async create(input: unknown) {
    const { oem, ...details } = createSkuRequestSchema.parse(input);
    const [skus, inventory] = await Promise.all([
      this.repository.listSkus(),
      this.repository.listInventory(),
    ]);
    const sku = { sku: generateNextSkuCode(skus, oem), ...details };

    await this.repository.appendSku(sku);
    await this.repository.appendInventory(sku, inventory.length + 2);

    return sku;
  }

  async update(rawSku: string, input: unknown) {
    const skuCode = skuSchema.shape.sku.parse(rawSku);
    const updates = updateSkuRequestSchema.parse(input);
    const sku = { sku: skuCode, ...updates };
    const [skus, inventory] = await Promise.all([
      this.repository.listSkus(),
      this.repository.listInventory(),
    ]);
    const existing = skus.find((item) => item.sku === skuCode);
    if (!existing)
      throw new AppError(404, "SKU_NOT_FOUND", `SKU ${skuCode} was not found`);

    await this.repository.updateSku(existing.rowNumber, sku);
    const inventoryRecord = inventory.find((item) => item.sku === skuCode);
    if (inventoryRecord) {
      await this.repository.updateInventoryIdentity(
        inventoryRecord.rowNumber,
        sku,
      );
    } else {
      await this.repository.appendInventory(sku, inventory.length + 2);
    }
    return sku;
  }

  async delete(rawSku: string) {
    const skuCode = skuSchema.shape.sku.parse(rawSku);
    const [skus, inventory] = await Promise.all([
      this.repository.listSkus(),
      this.repository.listInventory(),
    ]);
    const existing = skus.find((item) => item.sku === skuCode);
    if (!existing)
      throw new AppError(404, "SKU_NOT_FOUND", `SKU ${skuCode} was not found`);

    const inventoryRecord = inventory.find((item) => item.sku === skuCode);
    await this.repository.archiveSku(
      existing.rowNumber,
      inventoryRecord?.rowNumber,
      withoutRow(existing),
    );
    return { sku: skuCode };
  }
}

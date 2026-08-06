export const skuPackingNumericFields = [
  "quantityPerCarton",
  "weightPerCarton",
  "length",
  "breadth",
  "height",
] as const;

export type SkuPackingNumericField = (typeof skuPackingNumericFields)[number];

export type SkuPackingDetails = Record<SkuPackingNumericField, number>;

export const missingSkuPackingFields = (sku: SkuPackingDetails) =>
  skuPackingNumericFields.filter((field) => sku[field] <= 0);

export const hasMissingSkuPackingDetails = (sku: SkuPackingDetails) =>
  missingSkuPackingFields(sku).length > 0;

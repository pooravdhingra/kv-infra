const round = (value: number) =>
  Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;

export const calculateInventoryTotals = (
  quantityPerCarton: number,
  packedCartons: number,
  totalAssigned: number,
) => {
  const packedTotalQuantity = round(packedCartons * quantityPerCarton);
  const availableQuantity = round(packedTotalQuantity - totalAssigned);
  if (availableQuantity < 0) {
    throw new RangeError("Total assigned cannot exceed packed total quantity");
  }
  return { packedTotalQuantity, availableQuantity };
};

export const calculateOrderLineTotals = (input: {
  cartons: number;
  quantityPerCarton: number;
  weightPerCarton: number;
  length: number;
  breadth: number;
  height: number;
}) => ({
  totalQuantity: round(input.cartons * input.quantityPerCarton),
  grossWeight: round(input.cartons * input.weightPerCarton),
  volume: round(
    (input.length * input.breadth * input.height * input.cartons) / 1_000_000,
  ),
});

export const calculateStockCheck = (input: {
  requiredQuantity: number;
  availableQuantity: number;
  unpackedQuantity: number;
}) => {
  const shortfallQuantity = round(
    Math.max(input.requiredQuantity - input.availableQuantity, 0),
  );
  const stockStatus =
    input.requiredQuantity <= input.availableQuantity
      ? ("READY_TO_RESERVE" as const)
      : input.requiredQuantity <=
          input.availableQuantity + input.unpackedQuantity
        ? ("NEEDS_PACKING" as const)
        : ("NEEDS_SUPPLIER" as const);
  return { shortfallQuantity, stockStatus };
};

export const orderActions = [
  "RESERVE_STOCK",
  "START_PACKING",
  "REQUEST_SUPPLIER",
  "MARK_RECEIVED",
  "RECEIVE_MATERIAL",
  "NO_ACTION",
] as const;

export type OrderAction = (typeof orderActions)[number];

export const getSuggestedAction = (input: {
  requiredQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  unpackedQuantity: number;
  supplierRequestStatus: "SENT" | "CONFIRMED" | "RECEIVED" | null;
}) => {
  const remainingQuantity = round(
    Math.max(input.requiredQuantity - input.reservedQuantity, 0),
  );
  let suggestedAction: OrderAction;
  if (remainingQuantity === 0) suggestedAction = "NO_ACTION";
  else if (input.availableQuantity >= remainingQuantity)
    suggestedAction = "RESERVE_STOCK";
  else if (
    input.supplierRequestStatus &&
    input.supplierRequestStatus !== "RECEIVED"
  )
    suggestedAction = "MARK_RECEIVED";
  else if (
    (input.supplierRequestStatus === "RECEIVED" &&
      input.unpackedQuantity > 0) ||
    input.availableQuantity + input.unpackedQuantity >= remainingQuantity
  )
    suggestedAction = "START_PACKING";
  else suggestedAction = "REQUEST_SUPPLIER";

  const alternatives: OrderAction[] = [];
  if (remainingQuantity > 0) {
    alternatives.push("RECEIVE_MATERIAL");
    if (input.availableQuantity > 0) alternatives.push("RESERVE_STOCK");
    if (input.unpackedQuantity > 0) alternatives.push("START_PACKING");
    if (!input.supplierRequestStatus) alternatives.push("REQUEST_SUPPLIER");
  }
  return {
    remainingQuantity,
    suggestedAction,
    alternativeActions: [...new Set(alternatives)].filter(
      (action) => action !== suggestedAction,
    ),
  };
};

export const receiveInventoryTransition = (
  unpackedQuantity: number,
  quantityReceived: number,
) => {
  if (quantityReceived <= 0) throw new RangeError("Receipt must be positive");
  return round(unpackedQuantity + quantityReceived);
};

export const startPackingTransition = (input: {
  unpackedQuantity: number;
  inPackingQuantity: number;
  quantityTaken: number;
}) => {
  if (input.quantityTaken <= 0)
    throw new RangeError("Packing quantity must be positive");
  if (input.quantityTaken > input.unpackedQuantity)
    throw new RangeError("Packing quantity exceeds unpacked stock");
  return {
    unpackedQuantity: round(input.unpackedQuantity - input.quantityTaken),
    inPackingQuantity: round(input.inPackingQuantity + input.quantityTaken),
  };
};

export const finishPackingTransition = (input: {
  quantityPerCarton: number;
  inPackingQuantity: number;
  packedCartons: number;
  defectiveShortQuantity: number;
  quantityTaken: number;
  goodQuantity: number;
  finishedCartons: number;
  defectiveQuantity: number;
  shortQuantity: number;
}) => {
  const accounted = round(
    input.goodQuantity + input.defectiveQuantity + input.shortQuantity,
  );
  if (accounted !== round(input.quantityTaken))
    throw new RangeError("Packing outcome does not reconcile");
  if (
    round(input.finishedCartons * input.quantityPerCarton) !==
    round(input.goodQuantity)
  )
    throw new RangeError("Good quantity must equal complete packed cartons");
  if (input.quantityTaken > input.inPackingQuantity)
    throw new RangeError("Packing session exceeds in-packing stock");
  return {
    inPackingQuantity: round(input.inPackingQuantity - input.quantityTaken),
    packedCartons: round(input.packedCartons + input.finishedCartons),
    defectiveShortQuantity: round(
      input.defectiveShortQuantity +
        input.defectiveQuantity +
        input.shortQuantity,
    ),
  };
};

export const assignInventoryTransition = (input: {
  quantityPerCarton: number;
  packedCartons: number;
  totalAssigned: number;
  quantityAssigned: number;
}) => {
  if (input.quantityAssigned <= 0)
    throw new RangeError("Assigned quantity must be positive");
  const { availableQuantity } = calculateInventoryTotals(
    input.quantityPerCarton,
    input.packedCartons,
    input.totalAssigned,
  );
  if (input.quantityAssigned > availableQuantity)
    throw new RangeError("Assigned quantity exceeds available stock");
  return round(input.totalAssigned + input.quantityAssigned);
};

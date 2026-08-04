const quantityLabel = (quantity: number) => String(quantity);

export type SupplierMessageItem = {
  itemDescription: string;
  quantity: number;
  unit: string;
};

export const initialOrderMessage = (items: SupplierMessageItem[]) =>
  `Hello Bhaiya, how are you? Please note new order:\n\n${items
    .map(
      (item, index) =>
        `${index + 1}. ${item.itemDescription.toUpperCase()} - ${quantityLabel(item.quantity)} ${item.unit.toUpperCase()}`,
    )
    .join("\n")}\n\nKab tak bhijva sakte ho?`;

const editableItemLines = (
  messageBody: string,
  fallback: SupplierMessageItem,
) => {
  const match =
    /Please note new order:\s*\n+([\s\S]*?)\n+\s*Kab tak bhijva sakte ho\?/i.exec(
      messageBody.trim(),
    );
  if (match?.[1])
    return match[1]
      .split("\n")
      .map((line) => line.trim().replace(/^\d+\.\s*/, ""))
      .filter(Boolean);
  const edited = messageBody.replace(/\s+/g, " ").trim();
  return edited
    ? [edited]
    : [
        `${fallback.itemDescription.toUpperCase()} - ${quantityLabel(fallback.quantity)} ${fallback.unit.toUpperCase()}`,
      ];
};

export const combineInitialOrderMessages = (
  messages: Array<{ messageBody: string; item: SupplierMessageItem }>,
) => {
  if (messages.length === 1) return messages[0]!.messageBody;
  const lines = messages.flatMap(({ messageBody, item }) =>
    editableItemLines(messageBody, item),
  );
  return `Hello Bhaiya, how are you? Please note new order:\n\n${lines
    .map((line, index) => `${index + 1}. ${line}`)
    .join("\n")}\n\nKab tak bhijva sakte ho?`;
};

export const followUpMessage = (items: SupplierMessageItem[]) =>
  `Hello Bhaiya, ye items pending hain:\n\n${items
    .map(
      (item, index) =>
        `${index + 1}. ${item.itemDescription} - ${quantityLabel(item.quantity)} ${item.unit.toLowerCase()}`,
    )
    .join("\n")}\n\nkab tak bhijvaoge?`;

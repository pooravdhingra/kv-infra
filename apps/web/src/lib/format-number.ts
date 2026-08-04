export const formatDecimal = (value: number, maximumDecimalPlaces = 10) =>
  Number(value.toFixed(maximumDecimalPlaces)).toString();

/**
 * Format a number as a USD currency string.
 * @param value Number to format.
 * @returns String with a leading '$' and the value formatted to 7 decimal places.
 */
export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 7,
    maximumFractionDigits: 7,
  }).format(value);
}

/**
 * Format a number as a percentage string.
 * @param value Number to format (e.g. 0.156 for 15.6%).
 * @returns String with '%' symbol (2 decimal places).
 */
export function formatPercentage(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format a number as USD currency
 * @param value Number to format
 * @returns Formatted string with $ and appropriate decimal places
 */
export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format a number as a percentage
 * @param value Number to format (e.g., 0.156 for 15.6%)
 * @returns Formatted string with % symbol
 */
export function formatPercentage(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

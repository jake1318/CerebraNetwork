// src/utils/numberFormat.ts
// Created: 2025-07-19 06:53:35 UTC by jake1318

/**
 * Format a number with commas as thousands separators
 * @param value The number to format
 * @param fixed Number of decimal places
 * @returns Formatted string with commas
 */
export function formatWithCommas(
  value: number | string,
  fixed: number = 2
): string {
  if (typeof value === "string") {
    value = parseFloat(value);
    if (isNaN(value)) return "0.00";
  }

  if (typeof value !== "number") return "0.00";

  // Handle special cases for very small or very large numbers
  if (Math.abs(value) < 0.000001 && value !== 0) {
    return value.toExponential(fixed);
  }

  // Format with fixed decimal places
  const fixedValue = value.toFixed(fixed);

  // Add commas for thousands
  const parts = fixedValue.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return parts.join(".");
}

/**
 * Format a number as USD currency
 * @param value The number to format as currency
 * @param includeSymbol Whether to include the $ symbol
 * @returns Formatted USD currency string
 */
export function formatUSD(
  value: number,
  includeSymbol: boolean = true
): string {
  if (typeof value !== "number" || isNaN(value)) {
    return includeSymbol ? "$0.00" : "0.00";
  }

  // Format small values more precisely
  let result = "";
  if (Math.abs(value) < 0.01 && value !== 0) {
    result = value.toFixed(4);
  } else if (Math.abs(value) < 1) {
    result = value.toFixed(3);
  } else {
    result = formatWithCommas(value, 2);
  }

  return includeSymbol ? `$${result}` : result;
}

/**
 * Format a number as a percentage
 * @param value The number to format as a percentage
 * @param decimals Number of decimal places
 * @returns Formatted percentage string
 */
export function formatPercentage(value: number, decimals: number = 2): string {
  if (typeof value !== "number" || isNaN(value)) {
    return "0.00%";
  }

  // Format with fixed decimal places
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format a number to a compact representation
 * @param value The number to format
 * @returns Compact representation (e.g., 1.2K, 2.5M)
 */
export function formatCompact(value: number): string {
  if (typeof value !== "number" || isNaN(value)) {
    return "0";
  }

  const absValue = Math.abs(value);

  if (absValue >= 1e9) {
    return `${(value / 1e9).toFixed(1)}B`;
  } else if (absValue >= 1e6) {
    return `${(value / 1e6).toFixed(1)}M`;
  } else if (absValue >= 1e3) {
    return `${(value / 1e3).toFixed(1)}K`;
  } else {
    return value.toFixed(1);
  }
}

/**
 * Format large numbers with K, M, B, T suffixes
 */
export function formatLargeNumber(num: number): string {
  if (num === 0) return "0";

  if (num < 1000) {
    return num.toLocaleString();
  }

  const units = ["", "K", "M", "B", "T"];
  const unitIndex = Math.floor(Math.log10(num) / 3);
  const unitValue = num / Math.pow(10, 3 * unitIndex);

  return unitValue.toFixed(2) + units[unitIndex];
}

/**
 * Format dollar amounts with $ prefix and appropriate decimal places
 */
export function formatDollars(amount: number): string {
  // Ensure we're working with a number
  const numericAmount =
    typeof amount === "string" ? parseFloat(amount) : amount;

  // Force to 0 if NaN or undefined
  if (isNaN(numericAmount) || numericAmount === undefined) return "$0.00";

  // For very small values, show with more decimals
  if (numericAmount === 0) return "$0.00";

  // For very small values, show with more decimals
  if (numericAmount < 0.01 && numericAmount > 0) {
    return "$<0.01";
  }

  // For negative small values
  if (numericAmount > -0.01 && numericAmount < 0) {
    return "-$<0.01";
  }

  // For small values (< $1), show up to 4 decimal places
  if (Math.abs(numericAmount) < 1) {
    return numericAmount >= 0
      ? `$${numericAmount.toFixed(4)}`
      : `-$${Math.abs(numericAmount).toFixed(4)}`;
  }

  // For medium values ($1-$1000), show up to 2 decimal places
  if (Math.abs(numericAmount) < 1000) {
    return numericAmount >= 0
      ? `$${numericAmount.toFixed(2)}`
      : `-$${Math.abs(numericAmount).toFixed(2)}`;
  }

  // For large values, format with K, M, B suffixes
  const units = ["", "K", "M", "B", "T"];
  const unitIndex = Math.floor(Math.log10(Math.abs(numericAmount)) / 3);
  const unitValue = numericAmount / Math.pow(10, 3 * unitIndex);

  return numericAmount >= 0
    ? `$${unitValue.toFixed(2)}${units[unitIndex]}`
    : `-$${Math.abs(unitValue).toFixed(2)}${units[unitIndex]}`;
}

/**
 * Format percentages with % suffix and appropriate decimal places
 */
export function formatPercentage(value: number): string {
  if (isNaN(value)) return "0.00%";

  // For very small values
  if (Math.abs(value) < 0.01) {
    return value === 0 ? "0.00%" : value > 0 ? "<0.01%" : ">-0.01%";
  }

  // For normal values, show 2 decimal places
  return `${value.toFixed(2)}%`;
}

/**
 * Format numbers with commas and limited decimal places
 */
export function formatNumber(value: number, decimals: number = 2): string {
  // Handle edge cases
  if (value === null || value === undefined || isNaN(value)) return "0";
  if (value === 0) return "0";
  if (value > 0 && value < 0.01) return "<0.01";
  if (value < 0 && value > -0.01) return ">-0.01";

  // Format with the specified number of decimal places
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format a pool ID by stripping any 0x prefix if present
 * This is needed because some APIs require the ID without the 0x prefix
 * @param poolId The pool ID to format
 * @returns Formatted pool ID
 */
export function formatPoolId(poolId: string): string {
  // If pool ID starts with 0x, remove it
  if (poolId.startsWith("0x")) {
    return poolId.substring(2);
  }
  return poolId;
}

/**
 * Format an address for display by truncating the middle
 * @param address The full address to format
 * @param prefixLength Number of characters to show at the start
 * @param suffixLength Number of characters to show at the end
 * @returns Truncated address string
 */
export function formatAddress(
  address: string,
  prefixLength: number = 6,
  suffixLength: number = 4
): string {
  if (!address) return "";
  if (address.length <= prefixLength + suffixLength) return address;

  const prefix = address.substring(0, prefixLength);
  const suffix = address.substring(address.length - suffixLength);

  return `${prefix}...${suffix}`;
}

/**
 * Format token amount based on its size
 * @param amount Token amount to format
 * @param decimals Number of decimal places to display
 * @returns Formatted token amount
 */
export function formatTokenAmount(
  amount: string | number,
  decimals: number = 6
): string {
  const value = typeof amount === "string" ? parseFloat(amount) : amount;

  if (isNaN(value) || value === undefined) return "0";
  if (value === 0) return "0";

  // For different sizes, use different precision
  if (value >= 1000) return value.toFixed(2);
  if (value >= 100) return value.toFixed(4);
  if (value >= 1) return value.toFixed(6);

  return value.toFixed(8);
}

import BN from "bn.js";

/**
 * Extract a readable symbol from a coin type
 * @param coinType Full coin type string (e.g. "0x2::sui::SUI")
 * @returns The extracted symbol or shortened version
 */
export function extractCoinSymbol(coinType: string): string {
  try {
    // Format: "0xHEX::module::SYMBOL"
    const parts = coinType.split("::");
    if (parts.length === 3) {
      return parts[2]; // Return the symbol part
    }

    // If it doesn't follow the expected format, return a shortened version
    return shortenAddress(coinType);
  } catch (e) {
    return shortenAddress(coinType);
  }
}

/**
 * Shorten an address or long string for display
 */
export function shortenAddress(address: string): string {
  if (!address) return "";
  if (address.length <= 10) return address;
  return `${address.substring(0, 6)}...${address.substring(
    address.length - 4
  )}`;
}

/**
 * Format number with commas for thousands
 */
export function formatNumberWithCommas(value: number | string | BN): string {
  if (value instanceof BN) {
    return Number(value.toString()).toLocaleString();
  }
  return Number(value).toLocaleString();
}

/**
 * Format token amount considering decimals
 */
export function formatTokenAmount(
  amount: string | BN,
  decimals: number = 9
): string {
  if (!amount) return "0";

  const amountBN = amount instanceof BN ? amount : new BN(amount);
  const divisor = new BN(10).pow(new BN(decimals));

  // Integer part
  const integer = amountBN.div(divisor);

  // Fractional part
  const remainder = amountBN.mod(divisor);
  const fractionalStr = remainder.toString().padStart(decimals, "0");

  // Combine with proper formatting
  return `${integer.toString()}.${fractionalStr}`;
}

/**
 * Format APR as percentage
 */
export function formatApr(apr: number): string {
  return `${(apr * 100).toFixed(2)}%`;
}

/**
 * Calculate and format price from sqrt price
 */
export function formatSqrtPrice(
  sqrtPrice: string | BN,
  decimalsA: number = 9,
  decimalsB: number = 9
): string {
  const sqrtPriceBN =
    typeof sqrtPrice === "string" ? new BN(sqrtPrice) : sqrtPrice;
  const price = sqrtPriceBN.mul(sqrtPriceBN);
  const decimalsDiff = decimalsA - decimalsB;

  let adjustedPrice: BN;
  if (decimalsDiff > 0) {
    adjustedPrice = price.div(new BN(10).pow(new BN(decimalsDiff)));
  } else if (decimalsDiff < 0) {
    adjustedPrice = price.mul(new BN(10).pow(new BN(-decimalsDiff)));
  } else {
    adjustedPrice = price;
  }

  return formatTokenAmount(adjustedPrice.toString(), 18);
}

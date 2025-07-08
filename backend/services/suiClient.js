// services/suiClient.js
// Created: 2025-05-14 19:02:12 UTC by jake1318

import { SuiClient } from "@mysten/sui.js/client";

// Configure SuiClient with appropriate RPC URL
const SUI_RPC_URL =
  process.env.SUI_RPC_URL || "https://fullnode.mainnet.sui.io:443";

// Cached instance of the Sui client
let suiClientInstance = null;

/**
 * Get a singleton instance of SuiClient
 * @returns {Promise<SuiClient>} The Sui client instance
 */
export async function getSuiClient() {
  if (!suiClientInstance) {
    suiClientInstance = new SuiClient({
      url: SUI_RPC_URL,
    });
    console.log(`SuiClient initialized with RPC URL: ${SUI_RPC_URL}`);
  }

  return suiClientInstance;
}

/**
 * Utility to convert Sui types between different formats
 * @param {string} address - The address to format
 * @returns {string} The normalized address with 0x prefix
 */
export function formatAddress(address) {
  if (!address) return null;

  // Make sure the address has 0x prefix
  if (!address.startsWith("0x")) {
    return "0x" + address;
  }

  return address;
}

/**
 * Formats a Sui amount considering decimals
 * @param {BigInt|string|number} amount - Raw amount
 * @param {number} decimals - Number of decimals (9 for SUI)
 * @returns {string} Formatted amount with proper decimal places
 */
export function formatAmount(amount, decimals = 9) {
  if (!amount) return "0";

  // Convert to BigInt if not already
  const amountBigInt =
    typeof amount === "bigint" ? amount : BigInt(amount.toString());

  // Calculate divisor (10^decimals)
  const divisor = BigInt(10) ** BigInt(decimals);

  // Get whole and fractional parts
  const wholePart = amountBigInt / divisor;
  const fractionalPart = amountBigInt % divisor;

  // Create the fractional string with padding
  let fractionalStr = fractionalPart.toString().padStart(decimals, "0");

  // Trim trailing zeros
  while (fractionalStr.endsWith("0") && fractionalStr.length > 1) {
    fractionalStr = fractionalStr.slice(0, -1);
  }

  // If fractional part is 0, return only whole part
  if (fractionalStr === "0") {
    return wholePart.toString();
  }

  return `${wholePart}.${fractionalStr}`;
}

/**
 * Parses a human-readable amount to on-chain representation
 * @param {string|number} amount - Amount with decimal places
 * @param {number} decimals - Number of decimals (9 for SUI)
 * @returns {BigInt} The on-chain amount representation
 */
export function parseAmount(amount, decimals = 9) {
  if (!amount) return BigInt(0);

  const amountStr = amount.toString();
  const [wholePart, fractionalPart = ""] = amountStr.split(".");

  // Calculate the multiplier (10^decimals)
  const multiplier = BigInt(10) ** BigInt(decimals);

  // Convert whole part
  const wholeValue = BigInt(wholePart) * multiplier;

  // Convert fractional part (if any)
  let fractionalValue = BigInt(0);
  if (fractionalPart.length > 0) {
    // Pad or truncate fractional part as needed
    const paddedFractional = fractionalPart
      .padEnd(decimals, "0")
      .slice(0, decimals);
    fractionalValue = BigInt(paddedFractional);
  }

  return wholeValue + fractionalValue;
}

// Export all utilities
export default {
  getSuiClient,
  formatAddress,
  formatAmount,
  parseAmount,
};

// src/scallop/config.ts
// Last updated: 2025-07-20 05:05:06 UTC by jake1318

// Determine network type - default to mainnet for browser environment
// Use window._env_ if available (for runtime environment variables)
const getNetworkType = () => {
  try {
    // Check for runtime injected environment variables
    if (window._env_ && window._env_.REACT_APP_NETWORK_TYPE) {
      return window._env_.REACT_APP_NETWORK_TYPE;
    }
    // Check for compile-time environment variables (import.meta.env for Vite or process.env for CRA)
    if (typeof import.meta !== "undefined" && import.meta.env) {
      return import.meta.env.VITE_NETWORK_TYPE || "mainnet";
    }
    // Fallback
    return "mainnet";
  } catch (e) {
    // Default to mainnet if anything fails
    return "mainnet";
  }
};

const networkType = getNetworkType();

export const SUI_NETWORK_CONFIG = {
  networkType,
  rpcUrl:
    networkType === "mainnet"
      ? "https://fullnode.mainnet.sui.io:443"
      : "https://fullnode.testnet.sui.io:443",
  explorerUrl:
    networkType === "mainnet"
      ? "https://suivision.xyz/"
      : "https://testnet.suivision.xyz/",
};

// Scallop package IDs
export const SCALLOP_PACKAGE_IDS = {
  BORROW: "0x83bbe0b3985c5e3857803e2678899b03f3c4a31be75006ab03faf268c014ce41",
  ORACLE: "0x897ebc619bdb4c3d9e8d86fb85b86cfd5d861b1696d26175c55ed14903a372f6",
  RULE: "0x1cf913c825c202cbbb71c378edccb9c04723fa07a73b88677b2ef89c6e203a85",
  USER: "0x35241d7ff3bf163c2fbd3c2b11fb5710d3946c56ccc9c80813a1f8c6f6acdd67",
};

// Coin types
export const COIN_TYPES = {
  SUI: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI",
  USDC: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
};

// Configuration for coins
export const COIN_CONFIG = {
  SUI: {
    symbol: "SUI",
    decimals: 9,
    name: "sui",
    type: COIN_TYPES.SUI,
  },
  USDC: {
    symbol: "USDC",
    decimals: 6,
    name: "usdc",
    type: COIN_TYPES.USDC,
  },
};

// Common objects used in transactions
export const COMMON_OBJECTS = {
  SYSTEM_CLOCK:
    "0x0000000000000000000000000000000000000000000000000000000000000006",
  ORACLE: "0x93d5bf0936b71eb27255941e532fac33b5a5c7759e377b4923af0a1359ad494f",
};

// Known market object IDs for SUI
export const SUI_MARKET_OBJECTS = {
  MARKET: "0x1f9310238ee9298fb703c3419030b35b22bb1cc37113e3bb5007c99aec79e5b8",
  RESERVE: "0x801dbc2f0053d34734814b2d6df491ce7807a725fe9a01ad74a07e9c51396c37",
  VAULT: "0x352c9600e69ff6469f9fc7cd1d0cd5f88264caa5f8908102a223ce663fbb360c",
};

// Known Scallop global objects
export const SCALLOP_GLOBALS = {
  STATE: "0x07871c4b3c847a0f674510d4978d5cf6f960452795e8ff6f189fd2088a3f6ac7",
  REFERRAL_VAULT:
    "0x2f403f4bbec40e1836baf2b0ef5e32e5827357100869e0426ad0da25fafde485",
  REFERRAL_GLOBAL:
    "0xa757975255146dc9686aa823b7838b507f315d704f428cbadad2f4ea061939d9",
};

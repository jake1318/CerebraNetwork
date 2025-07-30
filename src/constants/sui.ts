// src/constants/sui.ts
// Created: 2025-07-19 06:46:08 UTC by jake1318

/**
 * Constants for SUI blockchain interactions
 */

// Mainnet chain identifier
export const SUI_CHAIN_ENV = "mainnet";

// SUI Objects for Scallop Protocol
export const SUI_OBJECTS = {
  // Scallop core objects
  SCALLOP_PACKAGE_ID:
    "0x69a9f7b93a44f5337274027d76771560db35dbffd93e1af9b4a3f752badb9561",
  SCALLOP_MARKET_MANAGER:
    "0x200a694ebdadb198e4ca8a07cd6d0aaa42ba09b6fc99457766a2cefc01933722",
  SCALLOP_INCENTIVE_MANAGER:
    "0x7e0aef2a8c9119e0e5b14e956f0e5d25ff3af4f98671b655fb1102e9423fb00e",
  SCALLOP_INCENTIVE_POOL:
    "0xcddaa56b35e975ce3b7e89baa321a22f8276dde2e3487ceb2b3c1b6d494514e9",

  // System objects
  SUI_SYSTEM_STATE:
    "0x0000000000000000000000000000000000000000000000000000000000000006",
};

// Display names for protocols
export const PROTOCOL_DISPLAY_NAMES = {
  cetus: "Cetus",
  bluefin: "BlueMove",
  scallop: "Scallop",
  suilend: "SuiLend",
};

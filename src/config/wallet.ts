import { getFullnodeUrl } from "@mysten/sui/client";

// Configure network
export const NETWORK = "mainnet";
export const SUI_FULLNODE_URL = getFullnodeUrl(NETWORK);

// Configure RPC URL based on environment
export const getRpcUrl = () => {
  return SUI_FULLNODE_URL;
};

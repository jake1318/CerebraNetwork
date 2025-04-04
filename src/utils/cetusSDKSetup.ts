import {
  CetusClmmSDK,
  type SDK as CetusSDK,
} from "@cetusprotocol/cetus-sui-clmm-sdk";
import { SuiClient } from "@mysten/sui/client";
import { TransactionBlock } from "@mysten/sui";

// Load the proxied RPC URL from the environment variable
const ankrRpcUrl = import.meta.env.VITE_SUI_RPC_URL;
console.log("[Cetus SDK Setup] Using RPC:", ankrRpcUrl);

// Initialize Sui client
const suiClient = new SuiClient({ url: ankrRpcUrl });

// Create Cetus SDK instance with mainnet config
// We initialize without a specific wallet address
export const cetusSdk: CetusSDK = new CetusClmmSDK({
  network: "mainnet",
  fullRpcUrl: ankrRpcUrl,
  // We don't set a specific wallet address here since this will be dynamically updated
  // when a user connects their wallet
});

// Helper function to initialize SDK with connected wallet address
export const initializeCetusSdk = async (
  walletAddress: string
): Promise<CetusSDK> => {
  if (!walletAddress) {
    throw new Error("Wallet address is required");
  }

  // Update the SDK with the connected user's wallet address
  cetusSdk.senderAddress = walletAddress;
  await cetusSdk.refresh();
  return cetusSdk;
};

// Helper for creating a transaction block
export const createTxBlock = (): TransactionBlock => {
  return new TransactionBlock();
};

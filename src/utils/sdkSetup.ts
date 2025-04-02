// src/utils/sdkSetup.ts
import { SuiClient } from "@mysten/sui/client";
import { Network, TurbosSdk } from "turbos-clmm-sdk";

// Load the full Ankr RPC URL from the environment variable.
const ankrRpcUrl = import.meta.env.VITE_SUI_RPC_URL;
console.log("[SDK Setup] Using Ankr RPC:", ankrRpcUrl);

const suiClient = new SuiClient({ url: ankrRpcUrl });
export const sdk = new TurbosSdk(Network.mainnet, suiClient);

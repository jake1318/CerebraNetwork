import { WalletProvider } from "@suiet/wallet-kit";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { ReactNode, useEffect } from "react";
import { setSuiClient } from "@7kprotocol/sdk-ts";
import "@suiet/wallet-kit/style.css";

interface SuiProviderProps {
  children: ReactNode;
}

export function SuiProvider({ children }: SuiProviderProps) {
  useEffect(() => {
    // Initialize SDK with SUI client for mainnet
    const network = "mainnet";
    const suiClient = new SuiClient({ url: getFullnodeUrl(network) });
    setSuiClient(suiClient);

    console.log("Initialized SDK with SUI client for", network);
  }, []);

  return <WalletProvider>{children}</WalletProvider>;
}

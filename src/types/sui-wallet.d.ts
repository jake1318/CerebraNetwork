interface Window {
  suiWallet?: {
    requestPermissions: () => Promise<{
      success: boolean;
      error?: string;
    }>;
    getAccounts: () => Promise<string[]>;
    signAndExecuteTransaction: (transaction: any) => Promise<any>;
  };
}

// Define custom event for Sui wallet account changes
interface WindowEventMap {
  suiWalletAccountChange: CustomEvent;
}

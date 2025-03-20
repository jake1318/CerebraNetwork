import React, { createContext, useContext, useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { SuiClient } from "@mysten/sui/client";
import { DeepBookService } from "../services/deepBookService";
import { Transaction } from "@mysten/sui/transactions";

interface DeepBookContextType {
  isInitialized: boolean;
  hasBalanceManager: boolean;
  deepBookService: DeepBookService | null;
  pools: any[];
  createBalanceManager: () => Promise<Transaction>;
  createBalanceManagerAndExecute: () => Promise<boolean>;
  refreshBalanceManagerStatus: () => Promise<boolean>;
  placeLimitOrder: (params: LimitOrderParams) => Transaction;
  placeMarketOrder: (params: MarketOrderParams) => Transaction;
  cancelOrder: (poolKey: string, orderId: string) => Transaction;
  depositIntoManager: (coinType: string, amount: number) => Transaction;
  withdrawFromManager: (coinType: string, amount: number) => Transaction;
  checkManagerBalance: (coinType: string) => Promise<number>;
  getUserOrders: (poolKey: string) => Promise<any[]>;
  getOrderBook: (
    poolKey: string,
    depth?: number
  ) => Promise<{ bids: any[]; asks: any[] }>;
  loading: boolean;
  error: string | null;
}

interface LimitOrderParams {
  poolKey: string;
  price: number;
  quantity: number;
  isBid: boolean;
  // balanceManagerKey and clientOrderId will be injected
}

interface MarketOrderParams {
  poolKey: string;
  quantity: number;
  isBid: boolean;
  // balanceManagerKey and clientOrderId will be injected
}

const DeepBookContext = createContext<DeepBookContextType>({
  isInitialized: false,
  hasBalanceManager: false,
  deepBookService: null,
  pools: [],
  createBalanceManager: async () => new Transaction(),
  createBalanceManagerAndExecute: async () => false,
  refreshBalanceManagerStatus: async () => false,
  placeLimitOrder: () => new Transaction(),
  placeMarketOrder: () => new Transaction(),
  cancelOrder: () => new Transaction(),
  depositIntoManager: () => new Transaction(),
  withdrawFromManager: () => new Transaction(),
  checkManagerBalance: async () => 0,
  getUserOrders: async () => [],
  getOrderBook: async () => ({ bids: [], asks: [] }),
  loading: false,
  error: null,
});

export const useDeepBook = () => useContext(DeepBookContext);

export const DeepBookProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { connected, account, signAndExecuteTransactionBlock } = useWallet();
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [hasBalanceManager, setHasBalanceManager] = useState<boolean>(false);
  const [deepBookService, setDeepBookService] =
    useState<DeepBookService | null>(null);
  const [pools, setPools] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize DeepBook service
  useEffect(() => {
    const initializeDeepBook = async () => {
      try {
        setLoading(true);
        const suiClient = new SuiClient({
          url: "https://fullnode.mainnet.sui.io",
        });
        console.log("Initialized SDK with SUI client for mainnet");
        const service = new DeepBookService(suiClient, "mainnet");
        setDeepBookService(service);
        setIsInitialized(true);
      } catch (err: any) {
        console.error("Error initializing DeepBook:", err);
        setError("Failed to initialize DeepBook service: " + err.message);
      } finally {
        setLoading(false);
      }
    };

    initializeDeepBook();
  }, []);

  // Function to check if the user has a balance manager
  const refreshBalanceManagerStatus = async (): Promise<boolean> => {
    if (!deepBookService || !connected || !account) {
      setHasBalanceManager(false);
      return false;
    }

    try {
      setLoading(true);

      // Try checking up to 3 times with increasing delays between checks
      let hasManager = false;
      let retries = 0;
      const maxRetries = 5;

      while (!hasManager && retries < maxRetries) {
        console.log(
          `Checking balance manager (attempt ${retries + 1}/${maxRetries})...`
        );

        hasManager = await deepBookService.hasBalanceManager(account.address);

        if (hasManager) {
          console.log("Balance manager found!");
          break;
        }

        // Exponential backoff: wait longer between each retry
        const delayMs = 1000 * Math.pow(1.5, retries);
        console.log(
          `No balance manager found yet. Waiting ${delayMs}ms before retrying...`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        retries++;
      }

      console.log(
        `Final balance manager status: ${hasManager ? "Found" : "Not found"}`
      );
      setHasBalanceManager(hasManager);

      if (hasManager) {
        await refreshPools();
      }

      return hasManager;
    } catch (err: any) {
      console.error("Error checking balance manager:", err);
      setError("Failed to check balance manager status: " + err.message);
      setHasBalanceManager(false);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Check if user has a balance manager when wallet connects
  useEffect(() => {
    refreshBalanceManagerStatus();
  }, [deepBookService, connected, account]);

  // Create a balance manager transaction
  const createBalanceManager = async (): Promise<Transaction> => {
    if (!deepBookService || !account) {
      throw new Error(
        "DeepBook service not initialized or wallet not connected"
      );
    }
    try {
      return await deepBookService.createBalanceManager(account.address);
    } catch (err) {
      console.error("Error creating balance manager:", err);
      throw err;
    }
  };

  // Create and execute a balance manager transaction
  const createBalanceManagerAndExecute = async (): Promise<boolean> => {
    if (!deepBookService || !account || !signAndExecuteTransactionBlock) {
      throw new Error(
        "DeepBook service not initialized or wallet not connected"
      );
    }

    try {
      setLoading(true);

      // Create the transaction
      const txb = await deepBookService.createBalanceManager(account.address);

      // Execute the transaction
      const response = await signAndExecuteTransactionBlock({
        transactionBlock: txb,
      });

      console.log("Balance manager creation transaction executed:", response);

      // Wait for transaction to be confirmed and check for balance manager
      if (response) {
        // Poll for balance manager existence
        let hasManager = false;
        let attempts = 0;
        const maxAttempts = 10;

        while (!hasManager && attempts < maxAttempts) {
          console.log(
            `Polling for balance manager (attempt ${
              attempts + 1
            }/${maxAttempts})...`
          );

          // Wait with exponential backoff
          const delayMs = 1000 * Math.pow(1.5, attempts);
          await new Promise((resolve) => setTimeout(resolve, delayMs));

          // Check if balance manager exists
          hasManager = await deepBookService.hasBalanceManager(account.address);

          if (hasManager) {
            console.log("Balance manager confirmed!");
            setHasBalanceManager(true);
            await refreshPools();
            return true;
          }

          attempts++;
        }

        if (!hasManager) {
          console.error(
            "Failed to confirm balance manager creation after multiple attempts"
          );
          setError(
            "Transaction completed but balance manager not detected. Please try refreshing the page."
          );
          return false;
        }
      }

      return false;
    } catch (err: any) {
      console.error(
        "Error creating and executing balance manager transaction:",
        err
      );
      setError("Failed to create balance manager: " + err.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Refresh pools
  const refreshPools = async () => {
    if (!deepBookService) return;
    try {
      const allPools = await deepBookService.getPools();
      setPools(allPools);
    } catch (err: any) {
      console.error("Error fetching pools:", err);
      setError("Failed to fetch trading pools: " + err.message);
    }
  };

  // Place limit order
  const placeLimitOrder = (params: LimitOrderParams): Transaction => {
    if (!deepBookService || !account) {
      throw new Error(
        "DeepBook service not initialized or wallet not connected"
      );
    }
    return deepBookService.placeLimitOrder({
      ...params,
      balanceManagerKey: "CEREBRA_MANAGER",
      clientOrderId: Date.now().toString(),
      address: account.address,
    });
  };

  // Place market order
  const placeMarketOrder = (params: MarketOrderParams): Transaction => {
    if (!deepBookService || !account) {
      throw new Error(
        "DeepBook service not initialized or wallet not connected"
      );
    }
    return deepBookService.placeMarketOrder({
      ...params,
      balanceManagerKey: "CEREBRA_MANAGER",
      clientOrderId: Date.now().toString(),
      address: account.address,
    });
  };

  // Cancel order
  const cancelOrder = (poolKey: string, orderId: string): Transaction => {
    if (!deepBookService || !account) {
      throw new Error(
        "DeepBook service not initialized or wallet not connected"
      );
    }
    return deepBookService.cancelOrder(poolKey, orderId, account.address);
  };

  // Deposit into manager
  const depositIntoManager = (
    coinType: string,
    amount: number
  ): Transaction => {
    if (!deepBookService || !account) {
      throw new Error(
        "DeepBook service not initialized or wallet not connected"
      );
    }
    return deepBookService.depositIntoManager(
      coinType,
      amount,
      account.address
    );
  };

  // Withdraw from manager
  const withdrawFromManager = (
    coinType: string,
    amount: number
  ): Transaction => {
    if (!deepBookService || !account) {
      throw new Error(
        "DeepBook service not initialized or wallet not connected"
      );
    }
    return deepBookService.withdrawFromManager(
      coinType,
      amount,
      account.address
    );
  };

  // Check manager balance
  const checkManagerBalance = async (coinType: string): Promise<number> => {
    if (!deepBookService || !account) {
      return 0;
    }
    try {
      return await deepBookService.checkManagerBalance(
        coinType,
        account.address
      );
    } catch (err) {
      console.error("Error checking manager balance:", err);
      return 0;
    }
  };

  // Get user orders
  const getUserOrders = async (poolKey: string): Promise<any[]> => {
    if (!deepBookService || !connected || !account) {
      return [];
    }
    try {
      return await deepBookService.getUserOrders(poolKey, account.address);
    } catch (err) {
      console.error("Error fetching user orders:", err);
      return [];
    }
  };

  // Get order book
  const getOrderBook = async (
    poolKey: string,
    depth: number = 10
  ): Promise<{ bids: any[]; asks: any[] }> => {
    if (!deepBookService) {
      return { bids: [], asks: [] };
    }
    try {
      return await deepBookService.getOrderBook(poolKey, depth);
    } catch (err) {
      console.error("Error fetching order book:", err);
      return { bids: [], asks: [] };
    }
  };

  return (
    <DeepBookContext.Provider
      value={{
        isInitialized,
        hasBalanceManager,
        deepBookService,
        pools,
        createBalanceManager,
        createBalanceManagerAndExecute,
        refreshBalanceManagerStatus,
        placeLimitOrder,
        placeMarketOrder,
        cancelOrder,
        depositIntoManager,
        withdrawFromManager,
        checkManagerBalance,
        getUserOrders,
        getOrderBook,
        loading,
        error,
      }}
    >
      {children}
    </DeepBookContext.Provider>
  );
};

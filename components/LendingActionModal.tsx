// src/components/LendingActionModal.tsx
// Last Updated: 2025-07-25 01:55:14 UTC by jake1318

import React, { useState, useEffect, useMemo } from "react";
import { useWallet } from "@suiet/wallet-kit";
import scallopService, { SCALLOP_PACKAGE_ID } from "../scallop/ScallopService";
import blockvisionService from "../services/blockvisionService";
import "../styles/LendingActionModal.scss";

// A *dynamic* registry that we fill once the market list is known
type CoinRegistry = Record<
  string,
  {
    symbol: string; // "WAL"
    name: string; // "wal"
    decimals: number; // 6 or 9
    icon: string; // optional, for UI
    coinTypes: string[]; // Move types recognised by the wallet
  }
>;

// Simple utility functions
const formatNumber = (num: number, decimals: number = 2): string => {
  return num.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const truncateAddress = (address: string): string => {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// Info icon component
const InfoIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="16" x2="12" y2="12"></line>
    <line x1="12" y1="8" x2="12.01" y2="8"></line>
  </svg>
);

// Modified function to get total balance across all coin types with the same symbol
function getTotalCoinBalance(coins: any[], coinConfig: any): number {
  if (!coins || !coinConfig || !coinConfig.coinTypes) return 0;

  let totalBalance = 0;

  // Check each possible coin type for the symbol and sum their balances
  for (const coinType of coinConfig.coinTypes) {
    if (!coinType) continue; // Skip null/undefined entries

    const matchingCoins = coins.filter((coin) => {
      // Normalize coin types for comparison (SUI especially)
      const normalizedCoinType = coinType.toLowerCase();
      const normalizedCoin = coin.coinType.toLowerCase();

      // Check if the coin matches any of our coin types (with normalization)
      return (
        normalizedCoin === normalizedCoinType ||
        normalizedCoin.endsWith(normalizedCoinType) ||
        normalizedCoin.includes(`::${normalizedCoinType.split("::").pop()}`)
      );
    });

    for (const coin of matchingCoins) {
      if (coin && coin.balance) {
        // Apply correct decimals (from coin.decimals if available, otherwise from coinConfig)
        const decimals = coin.decimals || coinConfig.decimals;
        const balanceValue = parseFloat(coin.balance);

        // Only add if it's a valid number
        if (!isNaN(balanceValue)) {
          totalBalance += balanceValue / Math.pow(10, decimals);
        }
      }
    }
  }

  return totalBalance;
}

// Common safe amounts for depositing/withdrawing
const SAFE_AMOUNTS = {
  SUI: 0.01, // 0.01 SUI
  USDC: 0.1, // 0.1 USDC
  USDT: 0.1, // 0.1 USDT
  CETUS: 1.0, // 1 CETUS
};

interface LendingActionModalProps {
  onClose: () => void;
  asset?: any;
  action: "deposit" | "withdraw" | "borrow" | "repay" | "claim";
  onSuccess?: () => void;
  open: boolean;
}

const LendingActionModal: React.FC<LendingActionModalProps> = ({
  onClose,
  asset,
  action,
  onSuccess,
  open,
}) => {
  const wallet = useWallet();

  // State
  const [amount, setAmount] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [useMaxWithdraw, setUseMax] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [transactionResult, setTransactionResult] = useState<any>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [currentSupply, setCurrentSupply] = useState<number | null>(null);
  const [accountCoins, setAccountCoins] = useState<any[]>([]);
  const [registry, setRegistry] = useState<CoinRegistry>({});

  // Track whether the modal should be rendered
  const [shouldRender, setShouldRender] = useState<boolean>(false);

  // FIX #1: Check if registry is ready with useMemo
  const registryReady = useMemo(
    () => Object.keys(registry).length > 0,
    [registry]
  );

  // FIX #1: Build registry once at app start with the real s-coin types from the pool info directly
  useEffect(() => {
    (async () => {
      if (registryReady) return;

      try {
        // Get basic market assets
        const list = await scallopService.fetchMarketAssets();

        // Get the SDK query object for fetching market data
        const sdk = await scallopService.getSDKInstance();
        const q = await sdk.createScallopQuery();
        await q.init();

        // Get full market data
        const market = await q.queryMarket();
        console.log("Market data fetched:", market);

        const map: CoinRegistry = {};

        list.forEach((p) => {
          const sym = p.symbol.toUpperCase();
          const poolKey = p.symbol.toLowerCase();
          const poolInfo = market.pools?.[poolKey] ?? {};

          // Use directly available fields from the pool object
          const sCoin =
            poolInfo.marketCoinType || // v2.2.2 canonical
            poolInfo.sCoinType || // some older snapshots
            null; // last-resort: null

          map[sym] = {
            symbol: sym,
            name: poolKey, // what the SDK expects (lowercase)
            decimals: p.decimals ?? 9,
            icon: `/icons/${poolKey}-icon.svg`,
            coinTypes: [
              p.coinType, // underlying
              `${SCALLOP_PACKAGE_ID}::lending::PoolCoin<${p.coinType}>`, // legacy format
              sCoin, // the real s-coin type
            ].filter(Boolean), // Remove null/undefined entries
          };

          console.log(`Registry for ${sym}:`, {
            symbol: sym,
            underlying: p.coinType,
            legacy: `${SCALLOP_PACKAGE_ID}::lending::PoolCoin<${p.coinType}>`,
            sCoin: sCoin,
          });
        });

        setRegistry(map);
        console.log("Complete coin registry built:", map);
      } catch (error) {
        console.error("Error building coin registry:", error);
      }
    })();
  }, [registryReady]);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      // FIX #2: Only fetch wallet data when registry is ready
      if (registryReady && wallet.connected && asset?.symbol) {
        fetchWalletData();
      }
    }
  }, [open, registryReady, wallet.connected, asset?.symbol]);

  // Animation end handler
  const handleAnimationEnd = () => {
    if (!open) {
      setShouldRender(false);
    }
  };

  // Fetch wallet data on component mount or when wallet changes
  const fetchWalletData = async () => {
    if (!wallet.connected || !wallet.address || !asset) return;

    try {
      console.log(
        `Fetching wallet data for ${wallet.address} and asset ${asset.symbol}`
      );

      // Fetch current supply amount from the ScallopService
      if (action === "withdraw") {
        const userPositions = await scallopService.fetchUserPositions(
          wallet.address
        );

        // Find the supplied asset - match by symbol
        const suppliedAsset =
          userPositions.suppliedAssets?.find(
            (a: any) => a.symbol.toLowerCase() === asset.symbol.toLowerCase()
          ) ||
          userPositions.lendings?.find(
            (l: any) =>
              (l.symbol || l.coinName || "").toLowerCase() ===
              asset.symbol.toLowerCase()
          );

        if (suppliedAsset) {
          // FIX #3: Read the amount field that we actually stored
          const supplyAmount = Number(
            suppliedAsset.amount ?? suppliedAsset.suppliedCoin
          );
          setCurrentSupply(supplyAmount);
          console.log(
            `[supply] Found supplied asset for ${asset.symbol} → ${supplyAmount}`
          );
        } else {
          setCurrentSupply(0);
          console.log(`[supply] No supplied asset found for ${asset.symbol}`);
        }
      }

      // Fetch wallet coins using blockvisionService
      try {
        console.log(
          `Fetching account coins from BlockVision for ${wallet.address}`
        );
        const coinsResponse = await blockvisionService.getAccountCoins(
          wallet.address
        );
        const coins = coinsResponse.data || [];
        console.log(`Retrieved ${coins.length} coins from BlockVision`);
        setAccountCoins(coins);

        // Match the asset with its coin config
        const assetSymbol = asset.symbol.toUpperCase();
        console.log(`Looking for coin config for symbol: ${assetSymbol}`);

        const coinConfig = Object.values(registry).find(
          (coin) => coin.symbol === assetSymbol
        );

        if (coinConfig) {
          console.log(`Found coin config for ${assetSymbol}:`, coinConfig);

          // Calculate total balance for this asset across all its coin types
          const balance = getTotalCoinBalance(coins, coinConfig);
          console.log(
            `Calculated total balance for ${assetSymbol}: ${balance}`
          );
          setWalletBalance(balance);

          // Debug: Log the matching coins that were found
          const matchingCoins = coins.filter((coin) => {
            const normalizedCoin = coin.coinType.toLowerCase();
            return coinConfig.coinTypes.some((coinType) => {
              if (!coinType) return false;
              const normalizedCoinType = coinType.toLowerCase();
              return (
                normalizedCoin === normalizedCoinType ||
                normalizedCoin.endsWith(normalizedCoinType) ||
                normalizedCoin.includes(
                  `::${normalizedCoinType.split("::").pop()}`
                )
              );
            });
          });

          console.log(
            `Matched coins for ${assetSymbol}:`,
            matchingCoins.map(
              (c) =>
                `${c.symbol} (${c.coinType}): ${c.balance} (decimals: ${c.decimals})`
            )
          );
        } else {
          console.warn(`No coin config found for ${assetSymbol}`);

          // As fallback, try to find by matching symbol directly
          const matchingCoin = coins.find(
            (c) => c.symbol.toUpperCase() === assetSymbol
          );

          if (matchingCoin) {
            console.log(
              `Found matching coin by symbol: ${matchingCoin.symbol} with balance ${matchingCoin.balance}`
            );
            const decimals = matchingCoin.decimals || 9;
            const balance =
              parseFloat(matchingCoin.balance) / Math.pow(10, decimals);
            setWalletBalance(balance);
          } else {
            console.log(`No matching coin found by symbol either`);
            setWalletBalance(0);
          }
        }
      } catch (err) {
        console.error("Error fetching account coins:", err);
        setWalletBalance(0);
      }
    } catch (error) {
      console.error("Error fetching wallet data:", error);
      setWalletBalance(0);
      setCurrentSupply(0);
    }
  };

  // Handle amount change
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow only numbers and a single decimal point
    if (value === "" || /^[0-9]*\.?[0-9]*$/.test(value)) {
      setAmount(value);
      setError(null); // Clear any previous error
      setUseMax(false); // Cancel the max flag when the user types
    }
  };

  // Use max amount based on action type
  const handleUseMaxAmount = () => {
    if (action === "deposit" && walletBalance !== null) {
      setAmount(walletBalance.toString());
      setUseMax(false);
    } else if (action === "withdraw" && currentSupply !== null) {
      setAmount(currentSupply.toString());
      setUseMax(true); // remember that the user pressed "Max"
    }
  };

  // Use safe amount
  const handleUseSafeAmount = () => {
    const symbol = asset?.symbol.toUpperCase();
    const safeAmount =
      SAFE_AMOUNTS[symbol as keyof typeof SAFE_AMOUNTS] || SAFE_AMOUNTS.USDC;
    setAmount(safeAmount.toString());
    setUseMax(false);
  };

  // Validate form before submission
  const validateForm = (): boolean => {
    if (!wallet.connected) {
      setError("Please connect your wallet first");
      return false;
    }

    // FIX #5: Allow MAX withdrawals with any amount
    if (action === "withdraw" && useMaxWithdraw) {
      return true;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError("Please enter a valid amount");
      return false;
    }

    const numAmount = parseFloat(amount);

    if (action === "deposit") {
      if (walletBalance !== null && numAmount > walletBalance) {
        setError(
          `You don't have enough ${
            asset.symbol
          } in your wallet. Balance: ${formatNumber(walletBalance, 6)}`
        );
        return false;
      }
    } else if (action === "withdraw") {
      if (currentSupply !== null && numAmount > currentSupply) {
        setError(
          `You only have ${formatNumber(currentSupply, 6)} ${
            asset.symbol
          } supplied`
        );
        return false;
      }
    }

    return true;
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!validateForm() || !wallet.connected || !asset) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let result;
      const numAmount = parseFloat(amount);

      // Find the correct coin configuration
      const coinConfig = Object.values(registry).find(
        (coin) => coin.symbol === asset.symbol.toUpperCase()
      );

      if (!coinConfig) {
        throw new Error(`Unsupported coin: ${asset.symbol}`);
      }

      // Convert to base units (e.g. from 1.0 SUI to 1,000,000,000 base units)
      const baseUnits = Math.floor(
        numAmount * Math.pow(10, coinConfig.decimals)
      );

      if (action === "deposit") {
        result = await scallopService.depositAsset(
          wallet,
          coinConfig.name,
          baseUnits
        );
      } else if (action === "withdraw") {
        // FIX: Use the underlying Move type instead of just the name
        result = await scallopService.withdrawAsset(
          wallet,
          coinConfig.coinTypes[0], // Pass the full Move type (e.g., 0x356a…::wal::WAL)
          baseUnits,
          useMaxWithdraw
        );
      }

      if (result && result.success) {
        setTransactionResult({
          success: true,
          message: `${
            action === "deposit" ? "Deposited" : "Withdrawn"
          } ${numAmount} ${asset.symbol} successfully`,
          txHash: result.digest,
          txLink: result.txLink,
        });

        if (onSuccess) {
          onSuccess();
        }
      } else {
        setTransactionResult({
          success: false,
          message: `Transaction failed: ${result?.error || "Unknown error"}`,
          error: result?.error,
        });
        setError(result?.error || "Transaction failed");
      }
    } catch (err: any) {
      console.error(`Error in ${action} transaction:`, err);
      setTransactionResult({
        success: false,
        message: `Error ${
          action === "deposit" ? "depositing" : "withdrawing"
        } ${asset.symbol}`,
        error: err.message || String(err),
      });
      setError(
        err.message ||
          `An error occurred while ${
            action === "deposit" ? "depositing" : "withdrawing"
          } ${asset.symbol}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Don't render if not open and animation has ended
  if (!shouldRender) return null;

  return (
    <div
      className={`modal-overlay ${open ? "visible" : "hidden"}`}
      onAnimationEnd={handleAnimationEnd}
    >
      <div className={`modal-container ${open ? "slide-in" : "slide-out"}`}>
        <div className="modal-header">
          <h2>
            {action === "deposit" ? "Deposit" : "Withdraw"} {asset?.symbol}
          </h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {isLoading ? (
            <div className="loading-container">
              <span className="loader"></span>
              <p>Processing...</p>
              <p className="small-text">
                This may take a moment while we process your transaction.
              </p>
            </div>
          ) : transactionResult ? (
            <div
              className={`result-container ${
                transactionResult.success ? "success" : "error"
              }`}
            >
              <h3>
                {transactionResult.success
                  ? "Transaction Successful"
                  : "Transaction Failed"}
              </h3>
              <p>{transactionResult.message}</p>

              {transactionResult.txHash && (
                <div className="tx-details">
                  <p>
                    Transaction Hash:{" "}
                    <span className="tx-hash">
                      {transactionResult.txHash.slice(0, 10)}...
                      {transactionResult.txHash.slice(-8)}
                    </span>
                  </p>
                  {transactionResult.txLink && (
                    <a
                      href={transactionResult.txLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tx-link"
                    >
                      View Transaction
                    </a>
                  )}
                </div>
              )}

              {transactionResult.error && (
                <p className="error-message">
                  Error: {transactionResult.error}
                </p>
              )}

              <div className="action-buttons">
                <button
                  className="primary-btn"
                  onClick={
                    transactionResult.success
                      ? onClose
                      : () => setTransactionResult(null)
                  }
                >
                  {transactionResult.success ? "Close" : "Try Again"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="amount-section">
                <div className="label">
                  Amount to {action === "deposit" ? "Deposit" : "Withdraw"}
                </div>
                <div className="input-container">
                  <input
                    type="text"
                    value={amount}
                    onChange={handleAmountChange}
                    placeholder="0.00"
                    className="amount-input"
                  />
                  <div className="button-group">
                    <button
                      className="safe-amount-btn"
                      onClick={handleUseSafeAmount}
                    >
                      Use Safe Amount
                    </button>
                    <button className="max-btn" onClick={handleUseMaxAmount}>
                      Max
                    </button>
                  </div>
                </div>
              </div>

              <div className="info-section">
                <div className="info-row">
                  <InfoIcon />
                  <span>
                    {action === "deposit"
                      ? "Wallet balance"
                      : "Currently supplied"}
                    :{" "}
                    {action === "deposit"
                      ? walletBalance !== null
                        ? formatNumber(walletBalance, 6)
                        : "Loading..."
                      : currentSupply !== null
                      ? formatNumber(currentSupply, 6)
                      : "Loading..."}{" "}
                    {asset?.symbol}
                  </span>
                </div>

                <div className="info-row">
                  <InfoIcon />
                  <span>
                    {action === "deposit" ? "Deposit" : "Withdraw"} APY:{" "}
                    {asset?.depositApy.toFixed(2)}%
                  </span>
                </div>
              </div>

              <div className="wallet-status">
                <div className="status-indicator">
                  <span className="status-dot"></span>
                  Connected ({truncateAddress(wallet.address || "")})
                </div>
              </div>

              {error && <div className="error-message">{error}</div>}

              <button
                className={`action-btn ${action}-btn`}
                onClick={handleSubmit}
                disabled={
                  !wallet.connected ||
                  isLoading ||
                  (!useMaxWithdraw && amount === "")
                }
              >
                {action === "deposit" ? "Deposit" : "Withdraw"} {asset?.symbol}
              </button>
            </>
          )}
        </div>

        <div className="modal-footer">
          <p className="disclaimer">
            {action === "deposit"
              ? `By depositing ${asset?.symbol}, you'll earn interest based on the current APY.`
              : `You can withdraw your supplied ${asset?.symbol} at any time, provided it's not used as collateral.`}
          </p>
        </div>
      </div>
    </div>
  );
};

export default LendingActionModal;

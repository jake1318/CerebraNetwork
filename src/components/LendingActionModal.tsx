// src/components/LendingActionModal.tsx
// Last updated: 2025-07-24 01:18:31 UTC by jake1318

import React, { useState, useEffect, useMemo } from "react";
import { useWallet } from "@suiet/wallet-kit";
import scallopService from "../scallop/ScallopService";
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

  // One-time: pull every pool once the modal is ever opened
  useEffect(() => {
    if (Object.keys(registry).length) return; // already done
    (async () => {
      const assets = await scallopService.fetchMarketAssets();
      const map: CoinRegistry = {};
      assets.forEach((a: any) => {
        map[a.symbol.toUpperCase()] = {
          symbol: a.symbol.toUpperCase(),
          name: a.symbol.toLowerCase(),
          decimals: a.decimals ?? 9,
          icon: `/icons/${a.symbol.toLowerCase()}-icon.svg`,
          coinTypes: [a.coinType], // ← canonical type
        };
      });
      // (optional) add aliases that are not returned by the pool list,
      // e.g. wrapped vs. underlying – here is where you'd merge arrays
      setRegistry(map);
    })();
  }, []);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      fetchWalletData();
    }
  }, [open, asset?.symbol, wallet.connected]);

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

        // ❶ **NEW – robust rule for human‑readable amount**
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
          const {
            suppliedCoin,
            amount: sdkIndex,
            coinDecimals = 9,
          } = suppliedAsset as any;

          // a) normal case – SDK already gives the human amount
          if (suppliedCoin !== undefined && Number(suppliedCoin) > 0) {
            setCurrentSupply(Number(suppliedCoin));
            console.log(
              `[supply] using suppliedCoin → ${Number(suppliedCoin)} ${
                asset.symbol
              }`
            );
          }
          // b) fallback – only the tiny index is present; scale it up
          else if (sdkIndex !== undefined) {
            const human = Number(sdkIndex) * Math.pow(10, coinDecimals);
            setCurrentSupply(human);
            console.log(
              `[supply] scaled SDK index (${sdkIndex}) × 10^${coinDecimals} → ${human} ${asset.symbol}`
            );
          } else {
            setCurrentSupply(0);
          }
        } else {
          setCurrentSupply(0);
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

        // Debug: Log all coins received
        console.log(
          "All coins from BlockVision:",
          coins.map((c) => `${c.symbol} (${c.coinType}): ${c.balance}`)
        );

        // Match the asset with its coin config
        const assetSymbol = asset.symbol.toLowerCase();
        console.log(`Looking for coin config for symbol: ${assetSymbol}`);

        const coinConfig = Object.values(registry).find(
          (coin) => coin.symbol.toLowerCase() === assetSymbol
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
          const matchedCoins = coins.filter((coin) => {
            const normalizedCoin = coin.coinType.toLowerCase();
            return coinConfig.coinTypes.some((coinType) => {
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
            matchedCoins.map(
              (c) =>
                `${c.symbol} (${c.coinType}): ${c.balance} (decimals: ${c.decimals})`
            )
          );
        } else {
          console.warn(`No coin config found for ${assetSymbol}`);

          // As fallback, try to find by matching symbol directly
          const matchingCoin = coins.find(
            (c) => c.symbol.toLowerCase() === assetSymbol
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
        (coin) => coin.symbol.toLowerCase() === asset.symbol.toLowerCase()
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
        result = await scallopService.withdrawAsset(
          wallet,
          coinConfig.name,
          baseUnits,
          useMaxWithdraw // pass the flag
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
                disabled={!wallet.connected || isLoading || amount === ""}
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

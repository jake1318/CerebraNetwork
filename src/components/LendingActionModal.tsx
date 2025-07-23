// src/components/LendingActionModal.tsx
// Last updated: 2025-07-23 19:10:44 UTC by jake1318

import React, { useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import scallopService from "../scallop/ScallopService";
import blockvisionService from "../services/blockvisionService";
import "../styles/LendingActionModal.scss";

// Constants for coin configuration
const COINS = {
  SUI: {
    symbol: "SUI",
    name: "sui",
    decimals: 9,
    icon: "/icons/sui-icon.svg",
    coinTypes: ["0x2::sui::SUI"],
  },
  USDC: {
    symbol: "USDC",
    name: "usdc",
    decimals: 6,
    icon: "/icons/usdc-icon.svg",
    coinTypes: [
      "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
      "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
      "0xc3f8927de33d3deb52c282a836082a413bc73c6ee0bd4d7ec7e3b6b4c28e9abf::coin::COIN",
    ],
  },
  USDT: {
    symbol: "USDT",
    name: "usdt",
    decimals: 6,
    icon: "/icons/usdt-icon.svg",
    coinTypes: [
      "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN",
      "0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT",
    ],
  },
  CETUS: {
    symbol: "CETUS",
    name: "cetus",
    decimals: 9,
    icon: "/icons/cetus-icon.svg",
    coinTypes: [
      "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS",
    ],
  },
};

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
    const matchingCoins = coins.filter((coin) => coin.coinType === coinType);

    for (const coin of matchingCoins) {
      if (coin && coin.balance) {
        // Apply correct decimals (from coin.decimals if available, otherwise from coinConfig)
        const decimals = coin.decimals || coinConfig.decimals;
        totalBalance += Number(coin.balance) / Math.pow(10, decimals);
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
  const [error, setError] = useState<string | null>(null);
  const [transactionResult, setTransactionResult] = useState<any>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [currentSupply, setCurrentSupply] = useState<number | null>(null);
  const [accountCoins, setAccountCoins] = useState<any[]>([]); // Store all account coins

  // Track whether the modal should be rendered
  const [shouldRender, setShouldRender] = useState<boolean>(false);

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
      // Fetch current supply amount from the ScallopService
      if (action === "withdraw") {
        const userPositions = await scallopService.fetchUserPositions(
          wallet.address
        );
        const suppliedAsset =
          userPositions.suppliedAssets?.find(
            (a: any) => a.symbol.toLowerCase() === asset.symbol.toLowerCase()
          ) ||
          // Try to find in legacy format
          userPositions.lendings?.find(
            (l: any) =>
              (l.symbol || l.coinName || "").toLowerCase() ===
              asset.symbol.toLowerCase()
          );

        setCurrentSupply(
          suppliedAsset ? suppliedAsset.amount || suppliedAsset.suppliedCoin : 0
        );
      }

      // Fetch wallet coins using blockvisionService
      try {
        // Use the imported blockvisionService to get account coins
        const coinsResponse = await blockvisionService.getAccountCoins(
          wallet.address
        );
        const coins = coinsResponse.data || [];
        setAccountCoins(coins);

        // Match the asset with its coin config
        const coinConfig = Object.values(COINS).find(
          (coin) => coin.symbol.toLowerCase() === asset.symbol.toLowerCase()
        );

        if (coinConfig) {
          // Calculate total balance for this asset across all its coin types
          const balance = getTotalCoinBalance(coins, coinConfig);
          setWalletBalance(balance);
        } else {
          console.warn(`No coin config found for ${asset.symbol}`);
          setWalletBalance(0);
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
    }
  };

  // Use max amount based on action type
  const handleUseMaxAmount = () => {
    if (action === "deposit" && walletBalance !== null) {
      setAmount(walletBalance.toString());
    } else if (action === "withdraw" && currentSupply !== null) {
      setAmount(currentSupply.toString());
    }
  };

  // Use safe amount
  const handleUseSafeAmount = () => {
    const symbol = asset?.symbol.toUpperCase();
    const safeAmount =
      SAFE_AMOUNTS[symbol as keyof typeof SAFE_AMOUNTS] || SAFE_AMOUNTS.USDC;
    setAmount(safeAmount.toString());
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
      const coinConfig = Object.values(COINS).find(
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
          baseUnits
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

import React, { useState, useEffect } from "react";
import { useDeepBook } from "../../contexts/DeepBookContext";
import { useWallet } from "@suiet/wallet-kit";
import { Transaction } from "@mysten/sui/transactions";
import OrderBook from "../../components/OrderBook/OrderBook";
import OrderForm from "../../components/OrderForm/OrderForm";
import UserOrders from "../../components/UserOrders/UserOrders";
import "./AdvancedTrading.scss";

const AdvancedTrading: React.FC = () => {
  const { connected, account } = useWallet();
  const {
    isInitialized,
    hasBalanceManager,
    pools,
    createBalanceManagerAndExecute,
    refreshBalanceManagerStatus,
    loading,
    error,
  } = useDeepBook();

  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<"limit" | "market">("limit");
  const [setupInProgress, setSetupInProgress] = useState<boolean>(false);
  const [setupSuccess, setSetupSuccess] = useState<boolean>(false);
  const [setupMessage, setSetupMessage] = useState<string>("");

  // Set default pool when pools are loaded
  useEffect(() => {
    if (pools.length > 0 && !selectedPool) {
      setSelectedPool(pools[0].pool_id);
    }
  }, [pools]);

  // Handle manual refresh of balance manager status
  const handleRefreshStatus = async () => {
    try {
      setSetupMessage("Checking balance manager status...");
      const result = await refreshBalanceManagerStatus();
      if (result) {
        setSetupSuccess(true);
        setSetupMessage(
          "Balance manager found! Redirecting to trading interface..."
        );
        // Brief delay before UI update
        setTimeout(() => {
          setSetupInProgress(false);
        }, 1000);
      } else {
        setSetupMessage(
          "Balance manager not found. You may need to create one."
        );
        setSetupInProgress(false);
      }
    } catch (err) {
      console.error("Error refreshing status:", err);
      setSetupMessage("Error checking balance manager status.");
      setSetupInProgress(false);
    }
  };

  const handleCreateBalanceManager = async () => {
    if (!connected) return;

    try {
      setSetupInProgress(true);
      setSetupMessage("Creating balance manager...");

      // Use the combined function that creates, executes, and confirms the balance manager
      const success = await createBalanceManagerAndExecute();

      if (success) {
        setSetupSuccess(true);
        setSetupMessage("Balance manager created successfully!");

        // No need to reload - the context state is now updated
        // Just wait a moment for UI to show success message
        setTimeout(() => {
          setSetupInProgress(false);
        }, 1500);
      } else {
        setSetupMessage(
          "Transaction completed but balance manager not detected. Try refreshing status."
        );
        setSetupInProgress(false);
      }
    } catch (err: any) {
      console.error("Error creating balance manager:", err);
      setSetupMessage(
        `Error: ${err.message || "Failed to create balance manager"}`
      );
      setSetupInProgress(false);
    }
  };

  if (!connected) {
    return (
      <div className="advanced-trading">
        <div className="vertical-scan"></div>
        <div className="glow-1"></div>
        <div className="glow-2"></div>

        <div className="advanced-trading__container">
          <div className="advanced-trading__header">
            <h1>Advanced Trading</h1>
            <p>
              Connect your wallet to access limit orders and advanced trading
              features
            </p>
          </div>

          <div className="connect-prompt">
            <h2>Connect Wallet</h2>
            <p>Please connect your wallet to start advanced trading</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || loading) {
    return (
      <div className="advanced-trading">
        <div className="vertical-scan"></div>
        <div className="glow-1"></div>
        <div className="glow-2"></div>

        <div className="advanced-trading__container">
          <div className="advanced-trading__header">
            <h1>Advanced Trading</h1>
            <p>Loading trading interface...</p>
          </div>

          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Initializing trading services</p>
          </div>
        </div>
      </div>
    );
  }

  if (!hasBalanceManager && !setupSuccess) {
    return (
      <div className="advanced-trading">
        <div className="vertical-scan"></div>
        <div className="glow-1"></div>
        <div className="glow-2"></div>

        <div className="advanced-trading__container">
          <div className="advanced-trading__header">
            <h1>Advanced Trading</h1>
            <p>Set up your trading account to continue</p>
          </div>

          <div className="setup-container">
            <h2>Create Trading Account</h2>
            <p>
              You need to create a balance manager to use advanced trading
              features. This is a one-time setup.
            </p>
            {setupMessage && (
              <div className="setup-message">{setupMessage}</div>
            )}
            <div className="setup-actions">
              <button
                className="btn btn--primary"
                onClick={handleCreateBalanceManager}
                disabled={setupInProgress}
              >
                {setupInProgress ? "Processing..." : "Create Trading Account"}
              </button>

              <button
                className="btn btn--secondary"
                onClick={handleRefreshStatus}
                disabled={setupInProgress}
              >
                Refresh Status
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="advanced-trading">
      <div className="vertical-scan"></div>
      <div className="glow-1"></div>
      <div className="glow-2"></div>

      <div className="advanced-trading__container">
        <div className="advanced-trading__header">
          <h1>Advanced Trading</h1>
          <p>
            Access limit orders and advanced trading features on Cerebra DEX
          </p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="pool-selector">
          <label>Trading Pair:</label>
          <select
            value={selectedPool || ""}
            onChange={(e) => setSelectedPool(e.target.value)}
          >
            {pools.map((pool) => (
              <option key={pool.pool_id} value={pool.pool_id}>
                {pool.pool_name} ({pool.base_asset_symbol}/
                {pool.quote_asset_symbol})
              </option>
            ))}
          </select>
        </div>

        <div className="trading-layout">
          <div className="trading-layout__orderbook">
            {selectedPool && <OrderBook poolKey={selectedPool} />}
          </div>

          <div className="trading-layout__order-form">
            <div className="order-type-tabs">
              <button
                className={`tab ${orderType === "limit" ? "active" : ""}`}
                onClick={() => setOrderType("limit")}
              >
                Limit
              </button>
              <button
                className={`tab ${orderType === "market" ? "active" : ""}`}
                onClick={() => setOrderType("market")}
              >
                Market
              </button>
            </div>
            {selectedPool && (
              <OrderForm poolKey={selectedPool} orderType={orderType} />
            )}
          </div>

          <div className="trading-layout__user-orders">
            <h3>Your Open Orders</h3>
            {selectedPool && <UserOrders poolKey={selectedPool} />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdvancedTrading;

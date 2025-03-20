import React, { useState, useEffect } from "react";
import { useDeepBook } from "../../contexts/DeepBookContext";
import { useWallet } from "@suiet/wallet-kit";
import { Transaction } from "@mysten/sui/transactions";
import OrderBook from "../../components/OrderBook/OrderBook";
import OrderForm from "../../components/OrderForm/OrderForm";
import UserOrders from "../../components/UserOrders/UserOrders";
import "./AdvancedTrading.scss";

const AdvancedTrading: React.FC = () => {
  const { connected, account, signAndExecuteTransactionBlock } = useWallet();
  const {
    isInitialized,
    hasBalanceManager,
    pools,
    createBalanceManager,
    loading,
    error,
  } = useDeepBook();

  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<"limit" | "market">("limit");
  const [setupInProgress, setSetupInProgress] = useState<boolean>(false);

  // Set default pool when pools are loaded
  useEffect(() => {
    if (pools.length > 0 && !selectedPool) {
      setSelectedPool(pools[0].pool_id);
    }
  }, [pools]);

  const handleCreateBalanceManager = async () => {
    if (!connected) return;

    try {
      setSetupInProgress(true);
      const txb = await createBalanceManager();

      if (txb) {
        await signAndExecuteTransactionBlock({
          transactionBlock: txb,
        });

        // Wait a moment and refresh the page to detect the new balance manager
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    } catch (err) {
      console.error("Error creating balance manager:", err);
    } finally {
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

  if (!hasBalanceManager) {
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
            <button
              className="btn btn--primary"
              onClick={handleCreateBalanceManager}
              disabled={setupInProgress}
            >
              {setupInProgress ? "Creating..." : "Create Trading Account"}
            </button>
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

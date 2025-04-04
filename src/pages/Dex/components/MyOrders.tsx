import React, { useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import {
  getOpenLimitOrders,
  getClosedLimitOrders,
  cancelLimitOrder,
  claimExpiredLimitOrder,
} from "@7kprotocol/sdk-ts";
import "./MyOrders.scss";

interface MyOrdersProps {
  onOrderCancel?: () => void;
  onOrderClaim?: () => void;
}

const MyOrders: React.FC<MyOrdersProps> = ({ onOrderCancel, onOrderClaim }) => {
  const { connected, account } = useWallet();
  const [activeTab, setActiveTab] = useState<"open" | "closed">("open");
  const [openOrders, setOpenOrders] = useState<any[]>([]);
  const [closedOrders, setClosedOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<{
    id: string;
    action: string;
  } | null>(null);

  // Function to load orders
  const loadOrders = async () => {
    if (!connected || !account) return;

    setIsLoading(true);
    setError(null);

    try {
      // Load open orders
      const openOrdersData = await getOpenLimitOrders({
        owner: account.address,
        offset: 0,
        limit: 20,
      });
      setOpenOrders(openOrdersData);

      // Load closed orders
      const closedOrdersData = await getClosedLimitOrders({
        owner: account.address,
        offset: 0,
        limit: 20,
      });
      setClosedOrders(closedOrdersData);
    } catch (err) {
      console.error("Error loading orders:", err);
      setError("Failed to load orders. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Load orders on component mount and when wallet connects
  useEffect(() => {
    if (connected) {
      loadOrders();
    } else {
      setOpenOrders([]);
      setClosedOrders([]);
    }
  }, [connected, account]);

  // Handle cancel order
  const handleCancelOrder = async (order: any) => {
    if (!connected || !account) return;

    setActionInProgress({ id: order.id, action: "cancel" });

    try {
      await cancelLimitOrder({
        orderId: order.id,
        payCoinType: order.payCoinType,
        targetCoinType: order.targetCoinType,
      });

      // Refresh orders after cancellation
      await loadOrders();
      if (onOrderCancel) onOrderCancel();
    } catch (err) {
      console.error("Error canceling order:", err);
      setError(`Failed to cancel order: ${err.message || "Unknown error"}`);
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle claim expired order
  const handleClaimOrder = async (order: any) => {
    if (!connected || !account) return;

    setActionInProgress({ id: order.id, action: "claim" });

    try {
      await claimExpiredLimitOrder({
        orderId: order.id,
        payCoinType: order.payCoinType,
        targetCoinType: order.targetCoinType,
      });

      // Refresh orders after claiming
      await loadOrders();
      if (onOrderClaim) onOrderClaim();
    } catch (err) {
      console.error("Error claiming order:", err);
      setError(`Failed to claim order: ${err.message || "Unknown error"}`);
    } finally {
      setActionInProgress(null);
    }
  };

  // Format timestamp to readable date
  const formatDate = (timestamp: string) => {
    return new Date(parseInt(timestamp)).toLocaleString();
  };

  // Calculate status text and determine if order is claimable
  const getOrderStatus = (order: any) => {
    const now = Date.now();
    const isExpired = parseInt(order.expireTs) < now;

    if (isExpired) {
      return { status: "Expired", isClaimable: true };
    }

    return { status: "Active", isClaimable: false };
  };

  // Format amount with appropriate precision
  const formatAmount = (amount: string, precision: number = 6) => {
    return parseFloat(amount).toFixed(precision);
  };

  return (
    <div className="my-orders">
      <div className="my-orders-header">
        <h3>My Orders</h3>
        <div className="order-tabs">
          <button
            className={activeTab === "open" ? "active" : ""}
            onClick={() => setActiveTab("open")}
          >
            Open Orders
          </button>
          <button
            className={activeTab === "closed" ? "active" : ""}
            onClick={() => setActiveTab("closed")}
          >
            Order History
          </button>
        </div>
        {connected && (
          <button
            className="refresh-button"
            onClick={loadOrders}
            disabled={isLoading}
          >
            ↻
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {!connected ? (
        <div className="connect-message">
          Please connect your wallet to view your orders
        </div>
      ) : isLoading ? (
        <div className="loading-message">Loading orders...</div>
      ) : (
        <div className="orders-content">
          {activeTab === "open" ? (
            <>
              {openOrders.length > 0 ? (
                <div className="orders-list">
                  <div className="order-header-row">
                    <span>Pair</span>
                    <span>Type</span>
                    <span>Amount</span>
                    <span>Price</span>
                    <span>Expires</span>
                    <span>Actions</span>
                  </div>
                  <div className="order-rows">
                    {openOrders.map((order) => {
                      const { status, isClaimable } = getOrderStatus(order);
                      return (
                        <div key={order.id} className="order-row">
                          <div className="order-pair">{order.tokenPair}</div>
                          <div className="order-type">{order.orderType}</div>
                          <div className="order-amount">
                            {formatAmount(order.amount)}
                          </div>
                          <div className="order-price">
                            {formatAmount(order.price)}
                          </div>
                          <div className="order-expires">
                            {formatDate(order.expireTs)}
                          </div>
                          <div className="order-actions">
                            <button
                              onClick={() => handleCancelOrder(order)}
                              disabled={actionInProgress !== null}
                              className="cancel-button"
                            >
                              {actionInProgress?.id === order.id &&
                              actionInProgress?.action === "cancel"
                                ? "Canceling..."
                                : "Cancel"}
                            </button>
                            {isClaimable && (
                              <button
                                onClick={() => handleClaimOrder(order)}
                                disabled={actionInProgress !== null}
                                className="claim-button"
                              >
                                {actionInProgress?.id === order.id &&
                                actionInProgress?.action === "claim"
                                  ? "Claiming..."
                                  : "Claim"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="no-orders-message">No open orders found</div>
              )}
            </>
          ) : (
            <>
              {closedOrders.length > 0 ? (
                <div className="orders-list">
                  <div className="order-header-row">
                    <span>Pair</span>
                    <span>Type</span>
                    <span>Amount</span>
                    <span>Price</span>
                    <span>Status</span>
                    <span>Closed At</span>
                  </div>
                  <div className="order-rows">
                    {closedOrders.map((order) => (
                      <div key={order.id} className="order-row">
                        <div className="order-pair">{order.tokenPair}</div>
                        <div className="order-type">{order.orderType}</div>
                        <div className="order-amount">
                          {formatAmount(order.amount)}
                        </div>
                        <div className="order-price">
                          {formatAmount(order.price)}
                        </div>
                        <div className="order-status">{order.status}</div>
                        <div className="order-closed-at">
                          {formatDate(order.closedAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="no-orders-message">No order history found</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default MyOrders;

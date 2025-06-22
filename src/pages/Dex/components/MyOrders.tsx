/**
 * MyOrders.tsx
 * Last updated: 2025-05-02 05:25:54 UTC
 * Updated by: jake1318
 * Changes: Simplified transaction handling to match working order placement implementation
 */

import React, { useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import {
  getOpenLimitOrders,
  getClosedLimitOrders,
  cancelLimitOrder,
  claimExpiredLimitOrder,
} from "@7kprotocol/sdk-ts";
import "./MyOrders.scss";

interface OrderData {
  id: string;
  orderId: string;
  payCoinType: string;
  targetCoinType: string;
  expireTs: string;
  payCoinAmount: string;
  targetCoinAmount: string;
  filledTargetAmount?: string;
  filledPayAmount?: string;
  rate: string;
  status?: string;
  tokenPair?: string;
  price?: string;
  amount?: string;
  orderType?: string;
  closedAt?: string;
}

interface StatusMessage {
  type: "success" | "error" | "info";
  text: string;
}

interface ActionProgress {
  id: string;
  action: string;
}

interface MyOrdersProps {
  onOrderCancel?: () => void;
  onOrderClaim?: () => void;
}

const MyOrders: React.FC<MyOrdersProps> = ({ onOrderCancel, onOrderClaim }) => {
  const { connected, account, signAndExecuteTransactionBlock } = useWallet();
  const [activeTab, setActiveTab] = useState<"open" | "closed">("open");
  const [openOrders, setOpenOrders] = useState<OrderData[]>([]);
  const [closedOrders, setClosedOrders] = useState<OrderData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(
    null
  );
  const [actionInProgress, setActionInProgress] =
    useState<ActionProgress | null>(null);

  // Pagination state
  const [openOffset, setOpenOffset] = useState(0);
  const [closedOffset, setClosedOffset] = useState(0);
  const ordersLimit = 20;
  const [openHasMore, setOpenHasMore] = useState(true);
  const [closedHasMore, setClosedHasMore] = useState(true);

  // Helper functions
  const isOrderExpired = (order: OrderData): boolean => {
    if (!order.expireTs) return false;

    const now = Date.now();
    let expTs: number = parseInt(order.expireTs, 10);

    if (expTs < 10000000000) {
      expTs *= 1000;
    }

    return expTs <= now;
  };

  const processOrderData = (orders: any[], isOpen: boolean): OrderData[] => {
    return orders.map((order) => {
      const orderId = order.orderId || order.id;
      const id = order.id || order.orderId;
      const payCoinType = order.payCoinType || "";
      const targetCoinType = order.targetCoinType || "";
      const paySymbol = formatCoinSymbol(payCoinType);
      const targetSymbol = formatCoinSymbol(targetCoinType);
      const tokenPair = order.tokenPair || `${targetSymbol}-${paySymbol}`;

      let price = order.price;
      if (!price && order.rate) {
        const rateBig = Number(order.rate);
        price = (1 / (rateBig / 1e12)).toFixed(6);
      }

      let amount = order.amount;
      if (!amount && order.targetCoinAmount) {
        amount = order.targetCoinAmount;
      } else if (!amount && order.payCoinAmount && price) {
        amount = (Number(order.payCoinAmount) / Number(price)).toFixed(6);
      }

      const orderType = order.orderType || "limit";
      const expireTs = order.expireTs ? String(order.expireTs) : "";

      return {
        id,
        orderId,
        payCoinType,
        targetCoinType,
        expireTs,
        payCoinAmount: order.payCoinAmount?.toString() || "0",
        targetCoinAmount: order.targetCoinAmount?.toString() || "0",
        filledTargetAmount: order.filledTargetAmount?.toString(),
        filledPayAmount: order.filledPayAmount?.toString(),
        rate: order.rate?.toString() || "0",
        status: order.status,
        tokenPair,
        price: price?.toString(),
        amount: amount?.toString(),
        orderType,
        closedAt: isOpen
          ? undefined
          : order.closedAt || new Date().toISOString(),
      };
    });
  };

  const formatCoinSymbol = (coinType: string): string => {
    if (!coinType) return "";
    const parts = coinType.split("::");
    return parts[parts.length - 1] || coinType;
  };

  const loadOrders = async (reset: boolean = true) => {
    if (!connected || !account) return;

    setIsLoading(true);
    setStatusMessage(null);

    try {
      const openOrdersData = await getOpenLimitOrders({
        owner: account.address,
        offset: reset ? 0 : openOffset,
        limit: ordersLimit,
      });

      const processedOpenOrders = processOrderData(openOrdersData, true);

      if (reset) {
        setOpenOrders(processedOpenOrders);
        setOpenOffset(0);
      } else {
        setOpenOrders((prev) => [...prev, ...processedOpenOrders]);
      }

      setOpenHasMore(processedOpenOrders.length >= ordersLimit);

      if (activeTab === "closed") {
        await loadClosedOrders(reset);
      }
    } catch (err: any) {
      console.error("Error loading orders:", err);
      setStatusMessage({
        type: "error",
        text: `Failed to load orders: ${err.message || "Unknown error"}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadClosedOrders = async (reset: boolean = true) => {
    if (!connected || !account) return;

    setIsLoading(true);

    try {
      const closedOrdersData = await getClosedLimitOrders({
        owner: account.address,
        offset: reset ? 0 : closedOffset,
        limit: ordersLimit,
      });

      const processedClosedOrders = processOrderData(closedOrdersData, false);

      if (reset) {
        setClosedOrders(processedClosedOrders);
        setClosedOffset(0);
      } else {
        setClosedOrders((prev) => [...prev, ...processedClosedOrders]);
      }

      setClosedHasMore(processedClosedOrders.length >= ordersLimit);
    } catch (err: any) {
      console.error("Error loading closed orders:", err);
      setStatusMessage({
        type: "error",
        text: `Failed to load order history: ${err.message || "Unknown error"}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelOrder = async (order: OrderData) => {
    if (!connected || !account || !signAndExecuteTransactionBlock) {
      setStatusMessage({
        type: "error",
        text: "Wallet not connected or signer not available",
      });
      return;
    }

    setActionInProgress({ id: order.orderId, action: "cancel" });

    try {
      const txBlock = await cancelLimitOrder({
        orderId: order.orderId,
        payCoinType: order.payCoinType,
        targetCoinType: order.targetCoinType,
      });

      // Simplified transaction execution
      const response = await signAndExecuteTransactionBlock({
        transactionBlock: txBlock,
      });

      console.log("Cancel transaction executed successfully:", response);

      await loadOrders();
      setStatusMessage({
        type: "success",
        text: "Order successfully cancelled",
      });

      if (onOrderCancel) onOrderCancel();
    } catch (error: any) {
      console.error("Cancel order failed:", error);
      setStatusMessage({
        type: "error",
        text: `Failed to cancel order: ${error.message || "Unknown error"}`,
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleClaimOrder = async (order: OrderData) => {
    if (!connected || !account || !signAndExecuteTransactionBlock) {
      setStatusMessage({
        type: "error",
        text: "Wallet not connected or signer not available",
      });
      return;
    }

    setActionInProgress({ id: order.orderId, action: "claim" });

    try {
      const txBlock = await claimExpiredLimitOrder({
        orderId: order.orderId,
        payCoinType: order.payCoinType,
        targetCoinType: order.targetCoinType,
      });

      // Simplified transaction execution
      const response = await signAndExecuteTransactionBlock({
        transactionBlock: txBlock,
      });

      console.log("Claim transaction executed successfully:", response);

      await loadOrders();
      setStatusMessage({
        type: "success",
        text: "Expired order successfully claimed",
      });

      if (onOrderClaim) onOrderClaim();
    } catch (error: any) {
      console.error("Claim order failed:", error);
      setStatusMessage({
        type: "error",
        text: `Failed to claim order: ${error.message || "Unknown error"}`,
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const formatDate = (timestamp: string) => {
    if (!timestamp) return "Unknown";

    let ts = parseInt(timestamp, 10);
    if (ts < 10000000000) {
      ts *= 1000;
    }

    return new Date(ts).toLocaleString();
  };

  const getOrderStatus = (order: OrderData) => {
    if (order.status) {
      return {
        status: order.status,
        isClaimable: order.status === "Expired",
      };
    }

    const expired = isOrderExpired(order);
    return {
      status: expired ? "Expired" : "Active",
      isClaimable: expired,
    };
  };

  const formatAmount = (amount: string | undefined, precision: number = 6) => {
    if (!amount) return "0.00";
    return parseFloat(amount).toFixed(precision);
  };

  const handleTabSwitch = (tab: "open" | "closed") => {
    setActiveTab(tab);
    if (tab === "closed" && closedOrders.length === 0) {
      loadClosedOrders();
    }
  };

  useEffect(() => {
    if (connected) {
      loadOrders();
    } else {
      setOpenOrders([]);
      setClosedOrders([]);
    }
  }, [connected, account]);

  useEffect(() => {
    if (connected && activeTab === "closed" && closedOrders.length === 0) {
      loadClosedOrders();
    }
  }, [activeTab, connected]);

  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => {
        setStatusMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  return (
    <div className="my-orders">
      <div className="my-orders-header">
        <h3>My Orders</h3>
        <div className="order-tabs">
          <button
            className={activeTab === "open" ? "active" : ""}
            onClick={() => handleTabSwitch("open")}
          >
            Open Orders
          </button>
          <button
            className={activeTab === "closed" ? "active" : ""}
            onClick={() => handleTabSwitch("closed")}
          >
            Order History
          </button>
        </div>
        {connected && (
          <button
            className="refresh-button"
            onClick={() => loadOrders()}
            disabled={isLoading}
          >
            ↻
          </button>
        )}
      </div>

      {statusMessage && (
        <div className={`status-message ${statusMessage.type}`}>
          <span>{statusMessage.text}</span>
          <button className="close-btn" onClick={() => setStatusMessage(null)}>
            ×
          </button>
        </div>
      )}

      {!connected ? (
        <div className="connect-message">
          Please connect your wallet to view your orders
        </div>
      ) : isLoading &&
        ((activeTab === "open" && openOrders.length === 0) ||
          (activeTab === "closed" && closedOrders.length === 0)) ? (
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
                      const paySymbol = formatCoinSymbol(order.payCoinType);
                      const targetSymbol = formatCoinSymbol(
                        order.targetCoinType
                      );

                      return (
                        <div
                          key={order.id}
                          className={`order-row ${
                            isClaimable ? "expired-order" : ""
                          }`}
                        >
                          <div className="order-pair" data-label="Pair">
                            {targetSymbol}/{paySymbol}
                          </div>
                          <div className="order-type" data-label="Type">
                            {order.orderType || "Limit"}
                          </div>
                          <div className="order-amount" data-label="Amount">
                            {formatAmount(order.amount)} {targetSymbol}
                          </div>
                          <div className="order-price" data-label="Price">
                            {formatAmount(order.price)} {paySymbol}
                          </div>
                          <div className="order-expires" data-label="Expires">
                            {formatDate(order.expireTs)}
                          </div>
                          <div className="order-actions">
                            {!isClaimable && (
                              <button
                                onClick={() => handleCancelOrder(order)}
                                disabled={actionInProgress !== null}
                                className="cancel-button"
                              >
                                {actionInProgress?.id === order.orderId &&
                                actionInProgress?.action === "cancel"
                                  ? "Canceling..."
                                  : "Cancel"}
                              </button>
                            )}
                            {isClaimable && (
                              <button
                                onClick={() => handleClaimOrder(order)}
                                disabled={actionInProgress !== null}
                                className="claim-button"
                              >
                                {actionInProgress?.id === order.orderId &&
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

                  {openHasMore && (
                    <div className="load-more">
                      <button
                        className="load-more-button"
                        onClick={() => {
                          setOpenOffset((prev) => prev + ordersLimit);
                          loadOrders(false);
                        }}
                        disabled={isLoading}
                      >
                        {isLoading ? "Loading..." : "Load More"}
                      </button>
                    </div>
                  )}
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
                    {closedOrders.map((order) => {
                      const paySymbol = formatCoinSymbol(order.payCoinType);
                      const targetSymbol = formatCoinSymbol(
                        order.targetCoinType
                      );

                      return (
                        <div key={order.id} className="order-row">
                          <div className="order-pair" data-label="Pair">
                            {targetSymbol}/{paySymbol}
                          </div>
                          <div className="order-type" data-label="Type">
                            {order.orderType || "Limit"}
                          </div>
                          <div className="order-amount" data-label="Amount">
                            {formatAmount(order.amount)} {targetSymbol}
                          </div>
                          <div className="order-price" data-label="Price">
                            {formatAmount(order.price)} {paySymbol}
                          </div>
                          <div
                            className={`order-status status-${(
                              order.status || "closed"
                            ).toLowerCase()}`}
                            data-label="Status"
                          >
                            {order.status || "Closed"}
                          </div>
                          <div className="order-closed-at" data-label="Closed">
                            {order.closedAt
                              ? formatDate(order.closedAt)
                              : "Unknown"}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {closedHasMore && (
                    <div className="load-more">
                      <button
                        className="load-more-button"
                        onClick={() => {
                          setClosedOffset((prev) => prev + ordersLimit);
                          loadClosedOrders(false);
                        }}
                        disabled={isLoading}
                      >
                        {isLoading ? "Loading..." : "Load More"}
                      </button>
                    </div>
                  )}
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

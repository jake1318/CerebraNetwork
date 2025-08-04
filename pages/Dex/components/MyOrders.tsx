/**
 * MyOrders.tsx
 * Last updated: 2025-07-19 06:05:23 UTC
 * Updated by: jake1318
 * Changes:
 * - Improved response mapping to properly display order data
 * - Fixed field mapping for actual 7K Protocol API response structure
 * - Added proper formatting for SUI and USDC amounts
 * - Enhanced order display with better field recognition
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
  filled?: number;
  paidAmount?: string;
  obtainedAmount?: string;
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

    // Convert to milliseconds if needed
    if (expTs < 10000000000) {
      expTs *= 1000;
    }

    return expTs <= now;
  };

  const processOrderData = (orders: any[], isOpen: boolean): OrderData[] => {
    if (!orders || !Array.isArray(orders)) return [];

    return orders
      .map((order) => {
        // Ensure we have all the required fields
        if (!order) return null;

        // Handle the actual response format from the 7K Protocol API
        const orderId = order.orderId || order.id || "";
        const id =
          order.id || order.orderId || `order-${Date.now()}-${Math.random()}`;

        // Handle coin type naming convention from API
        const payCoinType = order.payCoinName || order.payCoinType || "";
        const targetCoinType =
          order.targetCoinName || order.targetCoinType || "";

        // Extract readable symbols
        const paySymbol = formatCoinSymbol(payCoinType);
        const targetSymbol = formatCoinSymbol(targetCoinType);
        const tokenPair = `${targetSymbol}/${paySymbol}`;

        // Calculate price from rate using correct decimal conversion
        let price;
        if (order.rate) {
          try {
            // Convert rate to decimal form for display
            // For SUI/USDC pair, the rate is typically a large number
            const rate = BigInt(order.rate);

            // Different calculation based on coin types due to decimal differences
            if (targetSymbol === "SUI" && paySymbol === "USDC") {
              // For SUI/USDC: price in USDC per SUI
              const rateDecimal = Number(rate) / 1e12;
              price = (1 / rateDecimal).toFixed(6);
            } else {
              // Generic calculation
              price = (1 / (Number(rate) / 1e12)).toFixed(6);
            }
          } catch (e) {
            console.error("Error calculating price from rate:", e);
            price = "0";
          }
        } else {
          price = order.price || "0";
        }

        // Calculate total amount from pay/target amounts
        let amount;
        // For SUI/USDC we get totalPayAmount in USDC and need to calculate SUI amount
        if (
          targetSymbol === "SUI" &&
          paySymbol === "USDC" &&
          order.totalPayAmount &&
          price
        ) {
          // Convert USDC amount (6 decimals) to SUI amount
          const usdcAmount = Number(order.totalPayAmount) / 1e6;
          amount = (usdcAmount / Number(price)).toFixed(9);
        }
        // If we have targetBalance directly
        else if (order.targetBalance) {
          amount = formatTokenAmount(order.targetBalance, targetSymbol);
        }
        // If we have totalPayAmount and no targetAmount, estimate it
        else if (order.totalPayAmount && price && Number(price) > 0) {
          const payAmount = formatTokenAmount(order.totalPayAmount, paySymbol);
          amount = (Number(payAmount) / Number(price)).toFixed(9);
        }
        // Default fallback
        else {
          amount = order.amount || "0";
        }

        // Status normalization
        let status = order.status || (isOpen ? "ACTIVE" : "CLOSED");
        if (
          status === "ACTIVE" &&
          isOrderExpired({ ...order, expireTs: order.expireTs })
        ) {
          status = "EXPIRED";
        }

        // Handle filled amount and percentage
        const filled = order.filled || 0;
        const paidAmount = order.paidAmount || "0";
        const obtainedAmount = order.obtainedAmount || "0";

        // Convert timestamp to readable format
        const expireTs = order.expireTs ? String(order.expireTs) : "";

        return {
          id,
          orderId,
          payCoinType,
          targetCoinType,
          expireTs,
          payCoinAmount:
            order.totalPayAmount?.toString() ||
            order.payBalance?.toString() ||
            "0",
          targetCoinAmount: order.targetBalance?.toString() || "0",
          filledTargetAmount: obtainedAmount,
          filledPayAmount: paidAmount,
          rate: order.rate?.toString() || "0",
          status,
          tokenPair,
          price: price?.toString(),
          amount: amount?.toString(),
          orderType: "limit", // 7K protocol currently only supports limit orders
          filled,
          closedAt: isOpen
            ? undefined
            : order.closedAt || order.canceledTs || new Date().toISOString(),
          paidAmount,
          obtainedAmount,
        };
      })
      .filter(Boolean); // Filter out any null entries
  };

  const formatCoinSymbol = (coinType: string): string => {
    if (!coinType) return "Unknown";

    // Extract symbol from coin type
    try {
      const parts = coinType.split("::");
      return parts[parts.length - 1] || "Unknown";
    } catch (e) {
      console.error("Error formatting coin symbol:", e);
      return "Unknown";
    }
  };

  const formatTokenAmount = (amount: string, symbol: string): string => {
    if (!amount) return "0";

    try {
      const amountNum = Number(amount);

      // Apply different decimals based on token type
      if (symbol === "USDC") {
        return (amountNum / 1e6).toFixed(6); // USDC has 6 decimals
      } else if (symbol === "SUI") {
        return (amountNum / 1e9).toFixed(9); // SUI has 9 decimals
      } else {
        // Default to 9 decimals for unknown tokens
        return (amountNum / 1e9).toFixed(9);
      }
    } catch (e) {
      console.error(`Error formatting ${symbol} amount:`, e);
      return "0";
    }
  };

  const loadOrders = async (reset: boolean = true) => {
    if (!connected || !account) {
      console.log("Wallet not connected, cannot load orders");
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);

    try {
      console.log(
        `Fetching open orders for ${account.address}, offset: ${
          reset ? 0 : openOffset
        }, limit: ${ordersLimit}`
      );

      const openOrdersData = await getOpenLimitOrders({
        owner: account.address,
        offset: reset ? 0 : openOffset,
        limit: ordersLimit,
      });

      console.log("Open orders data received:", openOrdersData);

      const processedOpenOrders = processOrderData(openOrdersData, true);
      console.log("Processed open orders:", processedOpenOrders);

      if (reset) {
        setOpenOrders(processedOpenOrders);
        setOpenOffset(0);
      } else {
        setOpenOrders((prev) => [...prev, ...processedOpenOrders]);
        setOpenOffset((prev) => prev + ordersLimit);
      }

      setOpenHasMore(processedOpenOrders.length >= ordersLimit);

      if (activeTab === "closed") {
        await loadClosedOrders(reset);
      }
    } catch (err: any) {
      console.error("Error loading open orders:", err);
      setStatusMessage({
        type: "error",
        text: `Failed to load orders: ${err.message || "Unknown error"}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadClosedOrders = async (reset: boolean = true) => {
    if (!connected || !account) {
      console.log("Wallet not connected, cannot load closed orders");
      return;
    }

    setIsLoading(true);

    try {
      console.log(
        `Fetching closed orders for ${account.address}, offset: ${
          reset ? 0 : closedOffset
        }, limit: ${ordersLimit}`
      );

      const closedOrdersData = await getClosedLimitOrders({
        owner: account.address,
        offset: reset ? 0 : closedOffset,
        limit: ordersLimit,
      });

      console.log("Closed orders data received:", closedOrdersData);

      const processedClosedOrders = processOrderData(closedOrdersData, false);
      console.log("Processed closed orders:", processedClosedOrders);

      if (reset) {
        setClosedOrders(processedClosedOrders);
        setClosedOffset(0);
      } else {
        setClosedOrders((prev) => [...prev, ...processedClosedOrders]);
        setClosedOffset((prev) => prev + ordersLimit);
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

    if (!order.orderId || !order.payCoinType || !order.targetCoinType) {
      setStatusMessage({
        type: "error",
        text: "Order information is incomplete, cannot cancel order",
      });
      console.error("Incomplete order data:", order);
      return;
    }

    setActionInProgress({ id: order.orderId, action: "cancel" });

    try {
      console.log("Canceling order:", {
        orderId: order.orderId,
        payCoinType: order.payCoinType,
        targetCoinType: order.targetCoinType,
      });

      const txBlock = await cancelLimitOrder({
        orderId: order.orderId,
        payCoinType: order.payCoinType,
        targetCoinType: order.targetCoinType,
      });

      console.log("Cancel transaction block created:", txBlock);

      // Execute the transaction
      const response = await signAndExecuteTransactionBlock({
        transactionBlock: txBlock,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      console.log("Cancel transaction executed successfully:", response);

      // Refresh the orders list after a short delay to allow blockchain state to update
      setTimeout(() => loadOrders(), 2000);

      setStatusMessage({
        type: "success",
        text: "Order successfully cancelled",
      });

      if (onOrderCancel) onOrderCancel();
    } catch (error: any) {
      console.error("Cancel order failed:", error);

      // Provide a more detailed error message if possible
      const errorMsg = error.message || "Unknown error";
      const detailedError = error.stack
        ? `${errorMsg}\n${error.stack}`
        : errorMsg;

      console.error("Detailed cancel order error:", detailedError);

      setStatusMessage({
        type: "error",
        text: `Failed to cancel order: ${errorMsg}`,
      });

      // Refresh orders list anyway in case the transaction succeeded but we got an error
      setTimeout(() => loadOrders(), 3000);
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

    if (!order.orderId || !order.payCoinType || !order.targetCoinType) {
      setStatusMessage({
        type: "error",
        text: "Order information is incomplete, cannot claim order",
      });
      console.error("Incomplete order data for claim:", order);
      return;
    }

    setActionInProgress({ id: order.orderId, action: "claim" });

    try {
      console.log("Claiming expired order:", {
        orderId: order.orderId,
        payCoinType: order.payCoinType,
        targetCoinType: order.targetCoinType,
      });

      const txBlock = await claimExpiredLimitOrder({
        orderId: order.orderId,
        payCoinType: order.payCoinType,
        targetCoinType: order.targetCoinType,
      });

      console.log("Claim transaction block created:", txBlock);

      // Execute the transaction
      const response = await signAndExecuteTransactionBlock({
        transactionBlock: txBlock,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      console.log("Claim transaction executed successfully:", response);

      // Refresh the orders list after a short delay
      setTimeout(() => loadOrders(), 2000);

      setStatusMessage({
        type: "success",
        text: "Expired order successfully claimed",
      });

      if (onOrderClaim) onOrderClaim();
    } catch (error: any) {
      console.error("Claim order failed:", error);

      // Provide a more detailed error message
      const errorMsg = error.message || "Unknown error";
      const detailedError = error.stack
        ? `${errorMsg}\n${error.stack}`
        : errorMsg;

      console.error("Detailed claim order error:", detailedError);

      setStatusMessage({
        type: "error",
        text: `Failed to claim order: ${errorMsg}`,
      });

      // Refresh orders list anyway
      setTimeout(() => loadOrders(), 3000);
    } finally {
      setActionInProgress(null);
    }
  };

  const formatDate = (timestamp: string) => {
    if (!timestamp) return "Unknown";

    try {
      let ts = parseInt(timestamp, 10);

      // Convert to milliseconds if needed
      if (ts < 10000000000) {
        ts *= 1000;
      }

      return new Date(ts).toLocaleString();
    } catch (e) {
      console.error("Error formatting date:", e);
      return "Invalid Date";
    }
  };

  const getOrderStatus = (order: OrderData) => {
    // If order has a status field, use it
    if (order.status) {
      return {
        status: order.status,
        isClaimable: order.status.toLowerCase() === "expired",
      };
    }

    // Otherwise calculate based on expiration time
    const expired = isOrderExpired(order);
    return {
      status: expired ? "EXPIRED" : "ACTIVE",
      isClaimable: expired,
    };
  };

  const formatAmount = (
    amount: string | undefined,
    symbol: string = "",
    precision: number = 6
  ) => {
    if (!amount) return "0.00";

    try {
      // Apply special formatting based on token
      if (symbol === "SUI") {
        precision = 9;
      } else if (symbol === "USDC") {
        precision = 6;
      }

      const num = parseFloat(amount);
      if (isNaN(num)) return "0.00";

      // Handle scientific notation and large numbers properly
      if (Math.abs(num) < 0.000001 && num !== 0) {
        return num.toExponential(precision);
      }

      // Format with the appropriate precision and remove trailing zeros
      return num.toFixed(precision).replace(/\.?0+$/, "");
    } catch (e) {
      console.error("Error formatting amount:", e);
      return "0.00";
    }
  };

  const handleTabSwitch = (tab: "open" | "closed") => {
    setActiveTab(tab);
    if (tab === "closed" && closedOrders.length === 0) {
      loadClosedOrders();
    }
  };

  const calculateFilled = (order: OrderData): string => {
    // If the API provides a filled percentage directly, use it
    if (order.filled !== undefined) {
      return `${order.filled * 100}%`;
    }

    // Otherwise calculate from filled amounts
    if (order.filledTargetAmount && order.targetCoinAmount) {
      try {
        const filled = parseFloat(order.filledTargetAmount);
        const total = parseFloat(order.targetCoinAmount);

        if (isNaN(filled) || isNaN(total) || total === 0) return "0%";

        const percentage = (filled / total) * 100;
        return `${percentage.toFixed(2)}%`;
      } catch (e) {
        console.error("Error calculating filled percentage:", e);
      }
    }

    return "0%";
  };

  // Load orders when wallet connects
  useEffect(() => {
    if (connected) {
      console.log("Wallet connected, loading orders");
      loadOrders();
    } else {
      console.log("Wallet disconnected, clearing orders");
      setOpenOrders([]);
      setClosedOrders([]);
    }
  }, [connected, account?.address]);

  // Load closed orders when switching to closed tab
  useEffect(() => {
    if (connected && activeTab === "closed" && closedOrders.length === 0) {
      loadClosedOrders();
    }
  }, [activeTab, connected]);

  // Auto-hide status messages after delay
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
            onClick={() =>
              activeTab === "open" ? loadOrders() : loadClosedOrders()
            }
            disabled={isLoading}
            title="Refresh Orders"
          >
            {isLoading ? "⟳" : "↻"}
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
        <div className="loading-message">
          <div className="spinner"></div>
          <span>Loading orders...</span>
        </div>
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
                    <span>Filled</span>
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
                      const filledPercentage = calculateFilled(order);

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
                            Limit
                          </div>
                          <div className="order-amount" data-label="Amount">
                            {formatAmount(order.amount, targetSymbol)}{" "}
                            {targetSymbol}
                          </div>
                          <div className="order-filled" data-label="Filled">
                            {filledPercentage}
                          </div>
                          <div className="order-price" data-label="Price">
                            {formatAmount(order.price, paySymbol)} {paySymbol}
                          </div>
                          <div className="order-expires" data-label="Expires">
                            {formatDate(order.expireTs)}
                          </div>
                          <div className="order-actions">
                            {!isClaimable && (
                              <button
                                onClick={() => handleCancelOrder(order)}
                                disabled={!!actionInProgress}
                                className="cancel-button"
                                title="Cancel Order"
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
                                disabled={!!actionInProgress}
                                className="claim-button"
                                title="Claim Expired Order"
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
                        onClick={() => loadOrders(false)}
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

                      // Determine the status class for styling
                      const statusClass = order.status
                        ? order.status.toLowerCase().replace(/\s+/g, "-")
                        : "closed";

                      return (
                        <div key={order.id} className="order-row">
                          <div className="order-pair" data-label="Pair">
                            {targetSymbol}/{paySymbol}
                          </div>
                          <div className="order-type" data-label="Type">
                            Limit
                          </div>
                          <div className="order-amount" data-label="Amount">
                            {formatAmount(order.amount, targetSymbol)}{" "}
                            {targetSymbol}
                          </div>
                          <div className="order-price" data-label="Price">
                            {formatAmount(order.price, paySymbol)} {paySymbol}
                          </div>
                          <div
                            className={`order-status status-${statusClass}`}
                            data-label="Status"
                          >
                            {order.status || "CLOSED"}
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
                        onClick={() => loadClosedOrders(false)}
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

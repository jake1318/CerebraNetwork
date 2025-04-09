import React, { useEffect, useState } from "react";
import {
  getOpenLimitOrders,
  getClosedLimitOrders,
  cancelLimitOrder,
  claimExpiredLimitOrder,
} from "@7kprotocol/sdk-ts";
// Import your wallet hook (adjust path if needed)
import { useWallet } from "@suiet/wallet-kit";
import "./LimitOrderManager.scss";

interface LimitOrder {
  orderId: string;
  payCoinType: string;
  targetCoinType: string;
  expireTs: bigint | number | string;
  payCoinAmount?: bigint | string;
  targetCoinAmount?: bigint | string;
  filledTargetAmount?: bigint | string;
  filledPayAmount?: bigint | string;
  rate?: bigint | string;
  status?: string; // possibly provided for closed orders
}

type LimitOrderManagerProps = {
  selectedPair?: string; // optional filter like "TOKENA-TOKENB"
};

const LimitOrderManager: React.FC<LimitOrderManagerProps> = ({
  selectedPair,
}) => {
  const { address: ownerAddress } = useWallet(); // assume useWallet provides the connected address
  const owner = ownerAddress; // rename for clarity
  const [activeTab, setActiveTab] = useState<"open" | "closed">("open");

  // Open orders state
  const [openOrders, setOpenOrders] = useState<LimitOrder[]>([]);
  const [openLoading, setOpenLoading] = useState(false);
  const [openError, setOpenError] = useState<Error | null>(null);
  const [openOffset, setOpenOffset] = useState(0);
  const openLimit = 10;
  const [openHasMore, setOpenHasMore] = useState(true);

  // Closed orders state
  const [closedOrders, setClosedOrders] = useState<LimitOrder[]>([]);
  const [closedLoading, setClosedLoading] = useState(false);
  const [closedError, setClosedError] = useState<Error | null>(null);
  const [closedOffset, setClosedOffset] = useState(0);
  const closedLimit = 10;
  const [closedHasMore, setClosedHasMore] = useState(true);

  // Helper: format coin type string to a short symbol (e.g., extract "USDC" from the type string)
  const formatCoinSymbol = (coinType: string): string => {
    if (!coinType) return "";
    const parts = coinType.split("::");
    return parts[parts.length - 1] || coinType;
  };

  // Helper: shorten a long ID (order ID) for display (e.g., show first 6 and last 4 chars)
  const shortenId = (id: string): string => {
    if (!id) return "";
    if (id.length <= 10) return id;
    return `${id.slice(0, 6)}...${id.slice(-4)}`;
  };

  // Helper: determine if an open order is expired (based on current time and expireTs)
  const isOrderExpired = (order: LimitOrder): boolean => {
    if (!order.expireTs) return false;
    const now = Date.now();
    const expTs =
      typeof order.expireTs === "bigint"
        ? Number(order.expireTs)
        : Number(order.expireTs);
    // If expireTs is likely in milliseconds (typically Unix timestamp in ms):
    return expTs <= now;
  };

  // Fetch open orders (with current offset and filters)
  const fetchOpenOrders = async (reset: boolean = false) => {
    if (!owner) return;
    setOpenLoading(true);
    setOpenError(null);
    try {
      const result: LimitOrder[] = await getOpenLimitOrders({
        owner,
        offset: reset ? 0 : openOffset,
        limit: openLimit,
        ...(selectedPair ? { tokenPair: selectedPair } : {}),
      });
      if (reset) {
        setOpenOrders(result);
        setOpenOffset(0);
      } else {
        setOpenOrders((prev) => [...prev, ...result]);
      }
      // Determine if more data might be available
      if (result.length < openLimit) {
        setOpenHasMore(false);
      } else {
        setOpenHasMore(true);
      }
    } catch (err: any) {
      setOpenError(err);
    } finally {
      setOpenLoading(false);
    }
  };

  // Fetch closed orders (with current offset and filters)
  const fetchClosedOrders = async (reset: boolean = false) => {
    if (!owner) return;
    setClosedLoading(true);
    setClosedError(null);
    try {
      const result: LimitOrder[] = await getClosedLimitOrders({
        owner,
        offset: reset ? 0 : closedOffset,
        limit: closedLimit,
        ...(selectedPair ? { tokenPair: selectedPair } : {}),
      });
      if (reset) {
        setClosedOrders(result);
        setClosedOffset(0);
      } else {
        setClosedOrders((prev) => [...prev, ...result]);
      }
      if (result.length < closedLimit) {
        setClosedHasMore(false);
      } else {
        setClosedHasMore(true);
      }
    } catch (err: any) {
      setClosedError(err);
    } finally {
      setClosedLoading(false);
    }
  };

  // Initial load: fetch open orders when component mounts or when owner/selectedPair changes
  useEffect(() => {
    if (owner) {
      setOpenOffset(0);
      setClosedOffset(0);
      fetchOpenOrders(true); // reset and fetch open orders
      // We will fetch closed orders on demand (when the tab is activated)
      setClosedOrders([]);
      setClosedHasMore(true);
    } else {
      // If no wallet connected, clear any existing data
      setOpenOrders([]);
      setClosedOrders([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, selectedPair]);

  // Fetch closed orders the first time the Closed tab is shown (or if owner/pair changed)
  useEffect(() => {
    if (
      owner &&
      activeTab === "closed" &&
      closedOrders.length === 0 &&
      !closedLoading
    ) {
      fetchClosedOrders(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, owner]);

  // Handler: switch tabs
  const handleTabSwitch = (tab: "open" | "closed") => {
    setActiveTab(tab);
    // If switching to closed and we haven't loaded them yet, trigger fetch (covered in useEffect above)
  };

  // Handler: Cancel an open order
  const handleCancel = async (order: LimitOrder) => {
    if (!owner) return;
    try {
      // Call the SDK to cancel the order
      await cancelLimitOrder({
        orderId: order.orderId,
        payCoinType: order.payCoinType,
        targetCoinType: order.targetCoinType,
      });
      // On success, update the open orders list by removing the cancelled order
      setOpenOrders((prev) => prev.filter((o) => o.orderId !== order.orderId));
      // Optionally, you could refresh closed orders to reflect the newly closed order
      // but this may not be necessary until the user switches tab.
    } catch (error: any) {
      console.error("Cancel order failed:", error);
      alert(`Failed to cancel order: ${error.message}`);
    }
  };

  // Handler: Claim an expired order
  const handleClaim = async (order: LimitOrder) => {
    if (!owner) return;
    try {
      await claimExpiredLimitOrder({
        orderId: order.orderId,
        payCoinType: order.payCoinType,
        targetCoinType: order.targetCoinType,
      });
      // Remove the order from open list after claiming
      setOpenOrders((prev) => prev.filter((o) => o.orderId !== order.orderId));
      // (You might also refresh closed orders here to show it under closed tab if needed)
    } catch (error: any) {
      console.error("Claim order failed:", error);
      alert(`Failed to claim order: ${error.message}`);
    }
  };

  // If no wallet is connected, prompt to connect
  if (!owner) {
    return (
      <div className="limit-order-manager">
        <p>Please connect your wallet to view your orders.</p>
      </div>
    );
  }

  return (
    <div className="limit-order-manager">
      {/* Tab Switch Buttons */}
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
          Closed Orders
        </button>
      </div>

      {/* Open Orders List */}
      {activeTab === "open" && (
        <div className="open-orders-section">
          {openLoading && openOrders.length === 0 && (
            <p>Loading open orders...</p>
          )}
          {openError && (
            <p className="error">
              Error loading open orders: {openError.message}
            </p>
          )}
          {!openLoading && openOrders.length === 0 && !openError && (
            <p>No open orders to show.</p>
          )}
          {openOrders.length > 0 && (
            <table className="orders-table open-orders-table">
              <thead>
                <tr>
                  <th>Pair</th>
                  <th>Price</th>
                  <th>Amount</th>
                  <th>Expiration</th>
                  <th>Order ID</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {openOrders.map((order) => {
                  const paySymbol = formatCoinSymbol(order.payCoinType);
                  const targetSymbol = formatCoinSymbol(order.targetCoinType);
                  // Determine price and amount display:
                  // Assume the pair format is Target-Pay (e.g. SUI-USDC), treat target as base asset and pay as quote.
                  // Price: quote per base (e.g. USDC per SUI), Amount: base amount.
                  let priceDisplay: string;
                  let amountDisplay: string;
                  if (order.rate && order.payCoinAmount) {
                    // Calculate target (base) amount from pay amount and rate if possible
                    // (This assumes rate is scaled as per SDK docs: rate = target_per_pay * 10^(12 + decimalsDiff))
                    const payAmt = Number(order.payCoinAmount);
                    const rateBig = Number(order.rate);
                    // If we had coin decimals, we could compute precisely. For simplicity, derive target amount and price approximately:
                    // targetAmount = payAmt * (rate / 10^12) (assuming rate already adjusted for decimals difference)
                    const targetAmt =
                      rateBig && payAmt ? payAmt * (rateBig / 1e12) : 0;
                    // Price as quote per base = payAmt / targetAmt (if targetAmt > 0)
                    const price = targetAmt ? payAmt / targetAmt : 0;
                    priceDisplay = price ? price.toFixed(6) : "-";
                    amountDisplay = targetAmt ? targetAmt.toFixed(4) : "-";
                  } else {
                    // Fallback if rate or amount not available
                    priceDisplay = "-";
                    amountDisplay = "-";
                  }
                  // Format expiration timestamp to readable date/time
                  const expTs =
                    typeof order.expireTs === "bigint"
                      ? Number(order.expireTs)
                      : Number(order.expireTs);
                  const expDate = expTs ? new Date(expTs) : null;
                  const expDisplay = expDate ? expDate.toLocaleString() : "-";

                  return (
                    <tr key={order.orderId}>
                      <td>
                        {targetSymbol}/{paySymbol}
                      </td>
                      <td>
                        {priceDisplay} {paySymbol}
                      </td>
                      <td>
                        {amountDisplay} {targetSymbol}
                      </td>
                      <td>{expDisplay}</td>
                      <td title={order.orderId}>{shortenId(order.orderId)}</td>
                      <td>
                        {!isOrderExpired(order) ? (
                          <button onClick={() => handleCancel(order)}>
                            Cancel
                          </button>
                        ) : (
                          <button onClick={() => handleClaim(order)}>
                            Claim
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {/* Pagination - Load more open orders if available */}
          {openOrders.length > 0 && openHasMore && !openLoading && (
            <div className="load-more">
              <button
                onClick={() => {
                  setOpenOffset((prev) => prev + openLimit);
                  fetchOpenOrders(false);
                }}
              >
                Load More
              </button>
            </div>
          )}
        </div>
      )}

      {/* Closed Orders List */}
      {activeTab === "closed" && (
        <div className="closed-orders-section">
          {closedLoading && closedOrders.length === 0 && (
            <p>Loading closed orders...</p>
          )}
          {closedError && (
            <p className="error">
              Error loading closed orders: {closedError.message}
            </p>
          )}
          {!closedLoading && closedOrders.length === 0 && !closedError && (
            <p>No closed orders to show.</p>
          )}
          {closedOrders.length > 0 && (
            <table className="orders-table closed-orders-table">
              <thead>
                <tr>
                  <th>Pair</th>
                  <th>Status</th>
                  <th>Fill Details</th>
                </tr>
              </thead>
              <tbody>
                {closedOrders.map((order) => {
                  const paySymbol = formatCoinSymbol(order.payCoinType);
                  const targetSymbol = formatCoinSymbol(order.targetCoinType);
                  // Determine final status
                  let statusText = order.status || "Closed";
                  let detailsText = "";
                  // If status not directly provided, infer from filled amounts vs total
                  const filled = order.filledTargetAmount
                    ? Number(order.filledTargetAmount)
                    : 0;
                  const totalTarget = order.targetCoinAmount
                    ? Number(order.targetCoinAmount)
                    : 0;
                  const expTs =
                    typeof order.expireTs === "bigint"
                      ? Number(order.expireTs)
                      : Number(order.expireTs);
                  const isExpired = expTs && expTs <= Date.now();
                  if (!order.status) {
                    if (filled > 0 && totalTarget > 0) {
                      if (filled >= totalTarget) {
                        statusText = "Filled";
                      } else if (isExpired) {
                        statusText = "Expired";
                      } else {
                        statusText = "Cancelled";
                      }
                    } else {
                      // No fill at all
                      statusText = isExpired ? "Expired" : "Cancelled";
                    }
                  }
                  // Fill details text
                  if (filled > 0) {
                    if (totalTarget > 0) {
                      // Partial or full fill
                      const filledAmt = filled.toFixed(4);
                      const totalAmt = totalTarget.toFixed(4);
                      detailsText =
                        filled >= totalTarget
                          ? `Filled ${filledAmt} ${targetSymbol}`
                          : `Filled ${filledAmt} of ${totalAmt} ${targetSymbol}`;
                    } else {
                      detailsText = `Filled ${filled} ${targetSymbol}`;
                    }
                  } else {
                    detailsText = "No fills"; // not filled at all
                  }

                  return (
                    <tr key={order.orderId}>
                      <td>
                        {targetSymbol}/{paySymbol}
                      </td>
                      <td>{statusText}</td>
                      <td>{detailsText}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {/* Pagination - Load more closed orders if available */}
          {closedOrders.length > 0 && closedHasMore && !closedLoading && (
            <div className="load-more">
              <button
                onClick={() => {
                  setClosedOffset((prev) => prev + closedLimit);
                  fetchClosedOrders(false);
                }}
              >
                Load More
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LimitOrderManager;

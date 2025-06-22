import React, { useEffect, useState, useRef } from "react";
import {
  getOpenLimitOrders,
  getClosedLimitOrders,
  cancelLimitOrder,
  claimExpiredLimitOrder,
} from "@7kprotocol/sdk-ts";
import { useWallet } from "@suiet/wallet-kit";
import "./LimitOrderManager.scss";

interface LimitOrder {
  orderId: string;
  /* SDK returns these two sets of fields, so we cover both */
  payCoinType?: string;
  targetCoinType?: string;
  payCoinName?: string;
  targetCoinName?: string;

  expireTs?: bigint | number | string;
  rate?: string;
  targetBalance?: string;
  status?: string;
  closedAt?: string;
}

interface StatusMessage {
  type: "success" | "error" | "info";
  text: string;
}
interface ActionProgress {
  id: string;
  action: "cancel" | "claim";
}

type Props = { selectedPair?: string };

const LimitOrderManager: React.FC<Props> = ({ selectedPair }) => {
  const { address: owner, signAndExecuteTransactionBlock } = useWallet();
  const [activeTab, setActiveTab] = useState<"open" | "closed">("open");

  // Refs for scroll control
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);

  // Open orders
  const [openOrders, setOpenOrders] = useState<LimitOrder[]>([]);
  const [openLoading, setOpenLoading] = useState(false);
  const [openError, setOpenError] = useState<Error | null>(null);
  const [openOffset, setOpenOffset] = useState(0);
  const openLimit = 10;
  const [openHasMore, setOpenHasMore] = useState(true);

  // Closed orders
  const [closedOrders, setClosedOrders] = useState<LimitOrder[]>([]);
  const [closedLoading, setClosedLoading] = useState(false);
  const [closedError, setClosedError] = useState<Error | null>(null);
  const [closedOffset, setClosedOffset] = useState(0);
  const closedLimit = 10;
  const [closedHasMore, setClosedHasMore] = useState(true);

  // Status & actions
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(
    null
  );
  const [actionInProgress, setActionInProgress] =
    useState<ActionProgress | null>(null);

  // Helpers
  const formatSymbol = (order: LimitOrder, side: "pay" | "target") => {
    // prefer Name, fallback to Type
    const raw =
      side === "pay"
        ? order.payCoinName ?? order.payCoinType
        : order.targetCoinName ?? order.targetCoinType;
    if (!raw) return "";
    const parts = raw.split("::");
    return parts[parts.length - 1] || raw;
  };

  const shorten = (id: string) =>
    id.length > 10 ? `${id.slice(0, 6)}...${id.slice(-4)}` : id;

  const expired = (ts?: bigint | number | string) => {
    if (!ts) return false;
    let n =
      typeof ts === "bigint"
        ? Number(ts)
        : typeof ts === "string"
        ? parseInt(ts, 10)
        : ts;
    if (n < 1e10) n *= 1000;
    return n <= Date.now();
  };

  const fmtDate = (ts?: bigint | number | string) => {
    if (!ts) return "–";
    let n =
      typeof ts === "bigint"
        ? Number(ts)
        : typeof ts === "string"
        ? parseInt(ts, 10)
        : ts;
    if (n < 1e10) n *= 1000;
    return new Date(n).toLocaleString();
  };

  // Scroll handling
  const handleScrollBarScroll = () => {
    if (scrollbarRef.current && contentRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollbarRef.current;
      const scrollPercentage = scrollLeft / (scrollWidth - clientWidth);

      const content = contentRef.current;
      const maxContentScroll = content.scrollWidth - content.clientWidth;
      content.scrollLeft = maxContentScroll * scrollPercentage;
    }
  };

  // Fetch
  const fetchOpen = async (reset = false) => {
    if (!owner) return;
    setOpenLoading(true);
    setOpenError(null);
    try {
      const orders = await getOpenLimitOrders({
        owner,
        offset: reset ? 0 : openOffset,
        limit: openLimit,
        ...(selectedPair ? { tokenPair: selectedPair } : {}),
      });
      setOpenOrders(reset ? orders : openOrders.concat(orders));
      setOpenOffset(reset ? 0 : openOffset);
      setOpenHasMore(orders.length >= openLimit);
    } catch (e: any) {
      setOpenError(e);
      setStatusMessage({
        type: "error",
        text: `Open orders failed: ${e.message}`,
      });
    } finally {
      setOpenLoading(false);
    }
  };

  const fetchClosed = async (reset = false) => {
    if (!owner) return;
    setClosedLoading(true);
    setClosedError(null);
    try {
      const orders = await getClosedLimitOrders({
        owner,
        offset: reset ? 0 : closedOffset,
        limit: closedLimit,
        ...(selectedPair ? { tokenPair: selectedPair } : {}),
      });
      setClosedOrders(reset ? orders : closedOrders.concat(orders));
      setClosedOffset(reset ? 0 : closedOffset);
      setClosedHasMore(orders.length >= closedLimit);
    } catch (e: any) {
      setClosedError(e);
      setStatusMessage({
        type: "error",
        text: `Closed orders failed: ${e.message}`,
      });
    } finally {
      setClosedLoading(false);
    }
  };

  // Actions
  const doCancel = async (o: LimitOrder) => {
    if (!owner || !signAndExecuteTransactionBlock) {
      return setStatusMessage({ type: "error", text: "Connect your wallet" });
    }
    setActionInProgress({ id: o.orderId, action: "cancel" });
    try {
      const tx = await cancelLimitOrder({
        orderId: o.orderId,
        payCoinType: o.payCoinName ?? o.payCoinType!,
        targetCoinType: o.targetCoinName ?? o.targetCoinType!,
      });
      await signAndExecuteTransactionBlock({ transactionBlock: tx });
      setOpenOrders(openOrders.filter((x) => x.orderId !== o.orderId));
      setStatusMessage({ type: "success", text: "Order cancelled" });
    } catch (e: any) {
      setStatusMessage({ type: "error", text: `Cancel failed: ${e.message}` });
    } finally {
      setActionInProgress(null);
    }
  };

  const doClaim = async (o: LimitOrder) => {
    if (!owner || !signAndExecuteTransactionBlock) {
      return setStatusMessage({ type: "error", text: "Connect your wallet" });
    }
    setActionInProgress({ id: o.orderId, action: "claim" });
    try {
      const tx = await claimExpiredLimitOrder({
        orderId: o.orderId,
        payCoinType: o.payCoinName ?? o.payCoinType!,
        targetCoinType: o.targetCoinName ?? o.targetCoinType!,
      });
      await signAndExecuteTransactionBlock({ transactionBlock: tx });
      setOpenOrders(openOrders.filter((x) => x.orderId !== o.orderId));
      setStatusMessage({ type: "success", text: "Expired order claimed" });
    } catch (e: any) {
      setStatusMessage({ type: "error", text: `Claim failed: ${e.message}` });
    } finally {
      setActionInProgress(null);
    }
  };

  // Effects
  useEffect(() => {
    if (owner) {
      fetchOpen(true);
      setClosedOrders([]);
      setClosedHasMore(true);
    } else {
      setOpenOrders([]);
      setClosedOrders([]);
    }
  }, [owner, selectedPair]);

  useEffect(() => {
    if (
      owner &&
      activeTab === "closed" &&
      !closedLoading &&
      !closedOrders.length
    ) {
      fetchClosed(true);
    }
  }, [activeTab, owner]);

  // Connect scrollbar to content
  useEffect(() => {
    const handleContentScroll = () => {
      if (contentRef.current && scrollbarRef.current) {
        const content = contentRef.current;
        const scrollbar = scrollbarRef.current;

        if (content.scrollWidth <= content.clientWidth) {
          // No scroll needed
          return;
        }

        const contentScrollPercentage =
          content.scrollLeft / (content.scrollWidth - content.clientWidth);
        const scrollbarMaxScroll =
          scrollbar.scrollWidth - scrollbar.clientWidth;

        // Update scrollbar position without triggering its scroll event
        scrollbar.removeEventListener("scroll", handleScrollBarScroll);
        scrollbar.scrollLeft = contentScrollPercentage * scrollbarMaxScroll;
        setTimeout(() => {
          scrollbar.addEventListener("scroll", handleScrollBarScroll);
        }, 10);
      }
    };

    const content = contentRef.current;
    const scrollbar = scrollbarRef.current;

    if (content && scrollbar) {
      content.addEventListener("scroll", handleContentScroll);
      scrollbar.addEventListener("scroll", handleScrollBarScroll);
    }

    return () => {
      if (content && scrollbar) {
        content.removeEventListener("scroll", handleContentScroll);
        scrollbar.removeEventListener("scroll", handleScrollBarScroll);
      }
    };
  }, [activeTab, openOrders.length, closedOrders.length]);

  // Render
  if (!owner) {
    return (
      <div className="limit-order-manager">Please connect your wallet.</div>
    );
  }

  return (
    <div className="limit-order-manager">
      {statusMessage && (
        <div className={`status-message ${statusMessage.type}`}>
          {statusMessage.text}
          <button onClick={() => setStatusMessage(null)}>×</button>
        </div>
      )}

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
          Closed Orders
        </button>
        <button
          className="refresh-btn"
          onClick={() =>
            activeTab === "open" ? fetchOpen(true) : fetchClosed(true)
          }
          disabled={activeTab === "open" ? openLoading : closedLoading}
        >
          ↻
        </button>
      </div>

      {activeTab === "open" ? (
        <div className="orders-section">
          {openLoading && !openOrders.length && <p>Loading…</p>}
          {openError && <p className="error">{openError.message}</p>}
          {!openLoading && !openOrders.length && !openError && (
            <p>No open orders.</p>
          )}

          {!!openOrders.length && (
            <div className="content-wrapper" ref={contentRef}>
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Pair</th>
                    <th>Amount</th>
                    <th>Price</th>
                    <th>Expires</th>
                    <th>Order ID</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {openOrders.map((o) => {
                    const pay = formatSymbol(o, "pay");
                    const tgt = formatSymbol(o, "target");
                    const isExp = expired(o.expireTs);

                    return (
                      <tr key={o.orderId}>
                        <td>
                          {tgt}/{pay}
                        </td>
                        <td>
                          {o.targetBalance ?? "–"} {tgt}
                        </td>
                        <td>
                          {o.rate ?? "–"} {pay}
                        </td>
                        <td>{fmtDate(o.expireTs)}</td>
                        <td title={o.orderId}>{shorten(o.orderId)}</td>
                        <td>
                          {!isExp ? (
                            <button
                              disabled={actionInProgress?.action === "cancel"}
                              onClick={() => doCancel(o)}
                            >
                              {actionInProgress?.action === "cancel"
                                ? "Cancelling…"
                                : "Cancel"}
                            </button>
                          ) : (
                            <button
                              disabled={actionInProgress?.action === "claim"}
                              onClick={() => doClaim(o)}
                            >
                              {actionInProgress?.action === "claim"
                                ? "Claiming…"
                                : "Claim"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {openHasMore && !openLoading && (
            <button onClick={() => fetchOpen()} className="load-more">
              Load More
            </button>
          )}
        </div>
      ) : (
        <div className="orders-section">
          {closedLoading && !closedOrders.length && <p>Loading…</p>}
          {closedError && <p className="error">{closedError.message}</p>}
          {!closedLoading && !closedOrders.length && !closedError && (
            <p>No closed orders.</p>
          )}

          {!!closedOrders.length && (
            <div className="content-wrapper" ref={contentRef}>
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Pair</th>
                    <th>Amount</th>
                    <th>Price</th>
                    <th>Status</th>
                    <th>Closed At</th>
                  </tr>
                </thead>
                <tbody>
                  {closedOrders.map((o) => {
                    const pay = formatSymbol(o, "pay");
                    const tgt = formatSymbol(o, "target");
                    return (
                      <tr key={o.orderId}>
                        <td>
                          {tgt}/{pay}
                        </td>
                        <td>
                          {o.targetBalance ?? "–"} {tgt}
                        </td>
                        <td>
                          {o.rate ?? "–"} {pay}
                        </td>
                        <td>{o.status ?? "Closed"}</td>
                        <td>
                          {o.closedAt
                            ? new Date(o.closedAt).toLocaleString()
                            : "–"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {closedHasMore && !closedLoading && (
            <button onClick={() => fetchClosed()} className="load-more">
              Load More
            </button>
          )}
        </div>
      )}

      {/* The table container at the bottom of the component */}
      {((activeTab === "open" && !!openOrders.length) ||
        (activeTab === "closed" && !!closedOrders.length)) && (
        <div className="table-container" ref={scrollbarRef}>
          {/* This is just a wrapper for the horizontal scrollbar */}
          <div className="scrollbar-content"></div>
        </div>
      )}
    </div>
  );
};

export default LimitOrderManager;

import React, { useEffect, useState } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { FaExclamationTriangle, FaHistory } from "react-icons/fa";
import {
  getAccountActivities,
  AccountActivity,
} from "../../../services/blockvisionService";
import "./TradeHistory.scss";

const PAGE_SIZE = 20;

const TradeHistory: React.FC = () => {
  const { account } = useWallet();
  const [rows, setRows] = useState<AccountActivity[]>([]);
  const [cursor, setCursor] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const load = async (fresh = false) => {
    if (!account?.address || loading) return;
    setLoading(true);
    setError(undefined);
    try {
      const data = await getAccountActivities(
        account.address,
        PAGE_SIZE,
        fresh ? undefined : cursor
      );
      setRows(fresh ? data.data : [...rows, ...data.data]);
      setCursor(data.nextPageCursor);
    } catch (e: any) {
      setError(e.message ?? "Failed to fetch");
    } finally {
      setLoading(false);
    }
  };

  // first load & refresh when wallet changes
  useEffect(() => {
    if (account?.address) load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.address]);

  // Show loading state
  if (loading && rows.length === 0) {
    return (
      <div className="trade-history-card">
        <h3>Trade History</h3>
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <div className="loading-text">Loading Trade History</div>
          <div className="loading-subtext">
            Fetching your transaction history from the blockchain...
          </div>
        </div>
      </div>
    );
  }

  // Show empty state
  if (!loading && rows.length === 0 && !error) {
    return (
      <div className="trade-history-card">
        <h3>Trade History</h3>
        <div className="empty-state">
          <div className="empty-icon">
            <FaHistory />
          </div>
          <h3>No Transaction History</h3>
          <p>Once you make transactions, they'll appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="trade-history-card">
      <h3>Trade&nbsp;History</h3>
      {error && <p className="error">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Type</th>
            <th>Status</th>
            <th>Amount (summary)</th>
            <th>Gas</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((tx) => (
            <tr key={tx.digest}>
              <td>{new Date(+tx.timestampMs).toLocaleString()}</td>
              <td>{tx.type}</td>
              <td className={tx.status}>{tx.status}</td>
              <td>
                {tx.coinChanges
                  ?.slice(0, 2) // first two coins
                  .map(
                    (c) => `${Number(c.amount) / 10 ** c.decimal} ${c.symbol}`
                  )
                  .join(", ") || "—"}
              </td>
              <td>{tx.gasFee}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {cursor && (
        <button disabled={loading} onClick={() => load(false)}>
          {loading ? "Loading…" : "Load More"}
        </button>
      )}
    </div>
  );
};

export default TradeHistory;

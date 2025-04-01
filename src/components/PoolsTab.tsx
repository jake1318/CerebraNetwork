import React, { useEffect, useState } from "react";
import axios from "axios";

interface PoolInfo {
  id: string;
  coinTypeA: string;
  coinTypeB: string;
  feeBps: number | null;
  liquidity: string;
  isLocked: boolean;
}

const PoolsTab: React.FC = () => {
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [hideInactive, setHideInactive] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    axios
      .get("/api/pools")
      .then((res) => {
        setPools(res.data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch pools", err);
        setError("Failed to load pools");
        setLoading(false);
      });
  }, []);

  const displayedPools = pools.filter((pool) => {
    if (!hideInactive) return true;
    return !pool.isLocked && pool.liquidity !== "0";
  });

  if (loading) return <div>Loading pools...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="pools-tab">
      <h2>Liquidity Pools</h2>
      <label>
        <input
          type="checkbox"
          checked={hideInactive}
          onChange={(e) => setHideInactive(e.target.checked)}
        />
        Hide pools with zero liquidity or locked
      </label>
      <table className="pools-table">
        <thead>
          <tr>
            <th>Pool (Coin A / Coin B)</th>
            <th>Fee</th>
            <th>Liquidity</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {displayedPools.map((pool) => {
            const symbolA = pool.coinTypeA.split("::").pop() || pool.coinTypeA;
            const symbolB = pool.coinTypeB.split("::").pop() || pool.coinTypeB;
            const feeDisplay =
              pool.feeBps !== null
                ? (pool.feeBps / 100).toFixed(2) + "%"
                : "N/A";
            const status = pool.isLocked
              ? "Locked"
              : pool.liquidity === "0"
              ? "Empty"
              : "Active";
            return (
              <tr key={pool.id}>
                <td>
                  {symbolA} / {symbolB}
                </td>
                <td>{feeDisplay}</td>
                <td>{pool.liquidity}</td>
                <td>{status}</td>
                <td>
                  <button onClick={() => alert(`Deposit for pool ${pool.id}`)}>
                    Add Liquidity
                  </button>
                  <button onClick={() => alert(`Withdraw for pool ${pool.id}`)}>
                    Remove Liquidity
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default PoolsTab;

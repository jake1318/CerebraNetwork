// src/components/PoolsTab.tsx
import React, { useEffect, useState } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { sdk } from "../utils/sdkSetup";

interface PoolInfo {
  id: string;
  coinTypeA: string;
  coinTypeB: string;
  feeBps: number | null;
  liquidity: number;
}

const PoolsTab: React.FC = () => {
  const { address, connected } = useWallet();
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPools() {
      setLoading(true);
      try {
        // Fetch all pools using Turbos SDK
        const fetchedPools = await sdk.pool.getPools();
        setPools(fetchedPools);
      } catch (err: any) {
        console.error("Error loading pools:", err);
        setError("Failed to load pools");
      } finally {
        setLoading(false);
      }
    }
    loadPools();
  }, []);

  if (loading) return <div>Loading pools...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="pools-tab">
      <h2>Liquidity Pools (Mainnet)</h2>
      <table>
        <thead>
          <tr>
            <th>Pool (Coin A / Coin B)</th>
            <th>Fee</th>
            <th>Liquidity</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {pools.map((pool) => {
            const symbolA = pool.coinTypeA.split("::").pop() || pool.coinTypeA;
            const symbolB = pool.coinTypeB.split("::").pop() || pool.coinTypeB;
            const feeDisplay =
              pool.feeBps !== null
                ? (pool.feeBps / 100).toFixed(2) + "%"
                : "N/A";

            return (
              <tr key={pool.id}>
                <td>
                  {symbolA} / {symbolB}
                </td>
                <td>{feeDisplay}</td>
                <td>{pool.liquidity.toLocaleString()}</td>
                <td>
                  <button
                    onClick={() => alert(`Add Liquidity for pool ${pool.id}`)}
                  >
                    Add Liquidity
                  </button>
                  <button
                    onClick={() =>
                      alert(`Remove Liquidity for pool ${pool.id}`)
                    }
                  >
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

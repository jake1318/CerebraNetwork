import React, { useEffect, useState } from "react";
import axios from "axios";

interface VaultStrategy {
  strategyId: string;
  poolId: string | null;
  coinTypeA: string | null;
  coinTypeB: string | null;
  isActive: boolean;
}

const VaultsTab: React.FC = () => {
  const [strategies, setStrategies] = useState<VaultStrategy[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    axios
      .get("/api/pools/vault-strategies")
      .then((res) => {
        setStrategies(res.data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch vault strategies", err);
        setError("Failed to load vault strategies");
        setLoading(false);
      });
  }, []);

  if (loading) return <div>Loading vault strategies...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="vaults-tab">
      <h2>Vault Strategies</h2>
      <ul className="strategies-list">
        {strategies.map((strategy) => {
          const symbolA = strategy.coinTypeA
            ? strategy.coinTypeA.split("::").pop()
            : "Unknown";
          const symbolB = strategy.coinTypeB
            ? strategy.coinTypeB.split("::").pop()
            : "Unknown";
          const pairLabel = strategy.poolId
            ? `${symbolA}/${symbolB}`
            : "Unknown Pair";
          return (
            <li key={strategy.strategyId} style={{ marginBottom: "1em" }}>
              <strong>{pairLabel}</strong> {strategy.isActive ? "" : "(Paused)"}{" "}
              <button
                onClick={() =>
                  alert(`Deposit for vault ${strategy.strategyId}`)
                }
              >
                Deposit
              </button>{" "}
              <button
                onClick={() =>
                  alert(`Withdraw for vault ${strategy.strategyId}`)
                }
              >
                Withdraw
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default VaultsTab;

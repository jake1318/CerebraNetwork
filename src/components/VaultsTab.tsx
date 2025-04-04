// src/components/VaultsTab.tsx
import React, { useEffect, useState } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { sdk } from "../utils/sdkSetup";

interface VaultStrategy {
  strategyId: string;
  poolId: string | null;
  coinTypeA: string | null;
  coinTypeB: string | null;
  isActive: boolean;
}

const VaultsTab: React.FC = () => {
  const { address, connected } = useWallet();
  const [vaultStrategies, setVaultStrategies] = useState<VaultStrategy[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadVaults() {
      setLoading(true);
      try {
        const strategies = await sdk.vault.getVaultStrategies();
        setVaultStrategies(strategies);
      } catch (err: any) {
        console.error("Error loading vault strategies:", err);
        setError("Failed to load vault strategies");
      } finally {
        setLoading(false);
      }
    }
    loadVaults();
  }, []);

  if (loading) return <div>Loading vault strategies...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="vaults-tab">
      <h2>Vault Strategies (Mainnet)</h2>
      <ul>
        {vaultStrategies.map((strategy) => {
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
            <li key={strategy.strategyId}>
              <strong>{pairLabel}</strong> {strategy.isActive ? "" : "(Paused)"}
              <button
                onClick={() =>
                  alert(`Deposit into vault ${strategy.strategyId}`)
                }
              >
                Deposit
              </button>
              <button
                onClick={() =>
                  alert(`Withdraw from vault ${strategy.strategyId}`)
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

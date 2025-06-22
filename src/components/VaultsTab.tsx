import React, { useEffect, useState } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { sdk } from "../utils/sdkSetup";
import { Tag } from "antd";
import "../styles/Vaults.scss";

interface VaultStrategy {
  strategyId: string;
  poolId: string | null;
  coinTypeA: string | null;
  coinTypeB: string | null;
  isActive: boolean;
}

const VaultsTab: React.FC = () => {
  const { connected } = useWallet();
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

  if (loading) {
    return (
      <div className="vaults-page loading-state">
        <div className="spinner" />
        Loading vault strategies...
      </div>
    );
  }

  if (error) {
    return (
      <div className="vaults-page empty-state">
        <h3>Error</h3>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="vaults-page">
      <div className="vaults-header">
        <h2>Vault Strategies (Mainnet)</h2>
        <p className="description">
          Automated LP strategies—deposit assets and earn with auto-compounding.
        </p>
      </div>

      <ul className="vaults-grid">
        {vaultStrategies.map((s) => {
          const symbolA = s.coinTypeA?.split("::").pop() || "Unknown";
          const symbolB = s.coinTypeB?.split("::").pop() || "Unknown";
          const pairLabel = s.poolId ? `${symbolA}/${symbolB}` : "Unknown Pair";

          return (
            <li key={s.strategyId} className="vault-card">
              <div className="vault-header">
                <div className="vault-title">
                  <h3>{pairLabel}</h3>
                  {!s.isActive && (
                    <Tag color="warning" className="protocol-badge">
                      Paused
                    </Tag>
                  )}
                </div>
              </div>
              <div className="vault-body">
                <div className="action-buttons">
                  <button
                    className="btn btn--primary"
                    onClick={() => alert(`Deposit into ${s.strategyId}`)}
                    disabled={!connected}
                  >
                    Deposit
                  </button>
                  <button
                    className="btn btn--secondary"
                    onClick={() => alert(`Withdraw from ${s.strategyId}`)}
                    disabled={!connected}
                  >
                    Withdraw
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default VaultsTab;

import React from "react";
import { useWallet } from "@suiet/wallet-kit";
import "./Pools.scss";

const Pools: React.FC = () => {
  const { connected } = useWallet();

  return (
    <div className="pools-page">
      {/* Add glow effects */}
      <div className="glow-1"></div>
      <div className="glow-2"></div>

      {/* Add vertical scan line */}
      <div className="vertical-scan"></div>

      <div className="pools-page__container">
        <div className="pools-page__header">
          <h1>Liquidity Pools</h1>
          <p>Provide liquidity and earn trading fees</p>
        </div>

        <div className="pools-page__content">
          {connected ? (
            <div className="pools-grid">
              {/* Placeholder for pools list */}
              <div className="pool-card placeholder">
                <div className="pool-card__header">
                  <div className="pool-tokens">
                    <span className="token-pair">SUI / USDC</span>
                  </div>
                  <div className="pool-apr">
                    <span className="apr-label">APR</span>
                    <span className="apr-value">4.2%</span>
                  </div>
                </div>
                <div className="pool-card__content">
                  <div className="pool-info-row">
                    <span className="info-label">TVL:</span>
                    <span className="info-value">$1,245,678</span>
                  </div>
                  <div className="pool-info-row">
                    <span className="info-label">Your Share:</span>
                    <span className="info-value">0.00%</span>
                  </div>
                  <div className="pool-info-row">
                    <span className="info-label">24h Volume:</span>
                    <span className="info-value">$342,560</span>
                  </div>
                </div>
                <div className="pool-card__actions">
                  <button className="action-button">Add Liquidity</button>
                </div>
              </div>

              <div className="pool-card placeholder">
                <div className="pool-card__header">
                  <div className="pool-tokens">
                    <span className="token-pair">BTC / USDC</span>
                  </div>
                  <div className="pool-apr">
                    <span className="apr-label">APR</span>
                    <span className="apr-value">3.8%</span>
                  </div>
                </div>
                <div className="pool-card__content">
                  <div className="pool-info-row">
                    <span className="info-label">TVL:</span>
                    <span className="info-value">$2,567,890</span>
                  </div>
                  <div className="pool-info-row">
                    <span className="info-label">Your Share:</span>
                    <span className="info-value">0.00%</span>
                  </div>
                  <div className="pool-info-row">
                    <span className="info-label">24h Volume:</span>
                    <span className="info-value">$876,321</span>
                  </div>
                </div>
                <div className="pool-card__actions">
                  <button className="action-button">Add Liquidity</button>
                </div>
              </div>

              <div className="pool-card placeholder">
                <div className="pool-card__header">
                  <div className="pool-tokens">
                    <span className="token-pair">ETH / SUI</span>
                  </div>
                  <div className="pool-apr">
                    <span className="apr-label">APR</span>
                    <span className="apr-value">5.1%</span>
                  </div>
                </div>
                <div className="pool-card__content">
                  <div className="pool-info-row">
                    <span className="info-label">TVL:</span>
                    <span className="info-value">$987,654</span>
                  </div>
                  <div className="pool-info-row">
                    <span className="info-label">Your Share:</span>
                    <span className="info-value">0.00%</span>
                  </div>
                  <div className="pool-info-row">
                    <span className="info-label">24h Volume:</span>
                    <span className="info-value">$456,789</span>
                  </div>
                </div>
                <div className="pool-card__actions">
                  <button className="action-button">Add Liquidity</button>
                </div>
              </div>

              {/* Create Pool Card */}
              <div className="pool-card create-pool">
                <div className="create-pool__content">
                  <div className="plus-icon">+</div>
                  <h3>Create New Pool</h3>
                  <p>Add liquidity and create a new trading pair</p>
                </div>
                <div className="pool-card__actions">
                  <button className="action-button create">Create Pool</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="connect-prompt">
              <h2>Connect Wallet</h2>
              <p>
                Please connect your wallet to view and interact with liquidity
                pools
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Pools;

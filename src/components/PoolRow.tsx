// src/components/PoolRow.tsx
// Last Updated: 2025-05-03 07:57:55 UTC by jake1318

import React from "react";
import { PoolInfo } from "../services/coinGeckoService";
import TokenIcon from "./TokenIcon";

interface PoolRowProps {
  pool: PoolInfo;
  onDeposit: (pool: PoolInfo) => void;
  isDexSupported: (dex: string) => boolean;
  connected: boolean;
  getAprClass: (apr: number) => string;
  getDexDisplayName: (dexId: string) => string;
}

const PoolRow: React.FC<PoolRowProps> = ({
  pool,
  onDeposit,
  isDexSupported,
  connected,
  getAprClass,
  getDexDisplayName,
}) => {
  // Helper function to format numbers with commas and limited decimal places
  const formatNumber = (value: number, decimals: number = 2): string => {
    if (!value && value !== 0) return "0";
    if (value > 0 && value < 0.01) return "<0.01";

    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: decimals,
    }).format(value);
  };

  return (
    <tr>
      <td className="pool-cell">
        <div className="pool-item">
          <div className="token-icons">
            <TokenIcon
              token={{
                symbol: pool.tokenA,
                name: pool.tokenA,
                address: pool.tokenAMetadata?.address,
              }}
              metadata={pool.tokenAMetadata}
              size="medium"
            />
            <TokenIcon
              token={{
                symbol: pool.tokenB,
                name: pool.tokenB,
                address: pool.tokenBMetadata?.address,
              }}
              metadata={pool.tokenBMetadata}
              size="medium"
            />
          </div>

          <div className="pool-info">
            <div className="pair-name">
              {pool.tokenA} / {pool.tokenB}
            </div>
            {pool.name && pool.name.match(/(\d+(\.\d+)?)%/) && (
              <div className="fee-tier">
                {pool.name.match(/(\d+(\.\d+)?)%/)![0]}
              </div>
            )}
          </div>
        </div>
      </td>

      <td>
        <span className={`dex-badge ${pool.dex.toLowerCase()}`}>
          {getDexDisplayName(pool.dex)}
        </span>
      </td>

      <td className="align-right">${formatNumber(pool.liquidityUSD)}</td>

      <td className="align-right">${formatNumber(pool.volumeUSD)}</td>

      <td className="align-right">${formatNumber(pool.feesUSD)}</td>

      <td className="align-right">
        <span className={`apr-value ${getAprClass(pool.apr)}`}>
          {formatNumber(pool.apr)}%
        </span>
      </td>

      <td className="actions-cell">
        <button
          className={`btn ${
            isDexSupported(pool.dex) ? "btn--primary" : "btn--secondary"
          }`}
          onClick={() => (isDexSupported(pool.dex) ? onDeposit(pool) : null)}
          disabled={!isDexSupported(pool.dex) || !connected}
        >
          {isDexSupported(pool.dex) ? "Deposit" : "Coming Soon"}
        </button>
      </td>
    </tr>
  );
};

export default PoolRow;

// src/components/PoolTable.tsx
// Last Updated: 2025-05-03 06:35:59 UTC by jake1318

import React from "react";
import { PoolInfo } from "../services/coinGeckoService";
import "../styles/components/PoolTable.scss";

interface Props {
  pools: PoolInfo[];
  sortColumn: keyof PoolInfo;
  sortOrder: "asc" | "desc";
  onSortChange: (col: keyof PoolInfo) => void;
  onDeposit: (pool: PoolInfo) => void;
}

// Helper function to get the token logo URL
const getTokenLogo = (metadata: any): string | null => {
  if (!metadata) return null;
  return (
    metadata.logoUrl ||
    metadata.logo_uri ||
    metadata.logoURI ||
    metadata.logo ||
    null
  );
};

const PoolTable: React.FC<Props> = ({
  pools,
  sortColumn,
  sortOrder,
  onSortChange,
  onDeposit,
}) => {
  const headers: Array<{ key: keyof PoolInfo | "action"; label: string }> = [
    { key: "dex", label: "DEX" },
    { key: "liquidityUSD", label: "Liquidity (USD)" },
    { key: "volumeUSD", label: "Volume (24h)" },
    { key: "feesUSD", label: "Fees (24h)" },
    { key: "apr", label: "APR" },
    { key: "action", label: "Action" },
  ];

  // Function to handle image loading errors
  const handleImageError = (
    e: React.SyntheticEvent<HTMLImageElement, Event>
  ) => {
    e.currentTarget.style.display = "none";
    e.currentTarget.nextElementSibling?.classList.remove("hidden");
  };

  return (
    <table className="pool-table">
      <thead>
        <tr>
          {headers.map((h) => (
            <th
              key={h.key}
              onClick={() =>
                h.key !== "action" && onSortChange(h.key as keyof PoolInfo)
              }
            >
              {h.label}
              {sortColumn === h.key && (
                <span className="sort-indicator">
                  {sortOrder === "asc" ? "↑" : "↓"}
                </span>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {pools.length === 0 && (
          <tr>
            <td colSpan={6} className="empty">
              No pools found
            </td>
          </tr>
        )}
        {pools.map((p) => {
          // safely extract fee tier from name
          const m = p.name.match(/(\d+(\.\d+)?)%/);
          const feeTier = m ? m[0] : "";

          // Get token logos
          const tokenALogo = getTokenLogo(p.tokenAMetadata);
          const tokenBLogo = getTokenLogo(p.tokenBMetadata);

          return (
            <tr key={p.address}>
              <td>
                <div className="pair">
                  <div className="token-icons">
                    {tokenALogo ? (
                      <>
                        <img
                          src={tokenALogo}
                          alt={p.tokenA}
                          className="logo"
                          onError={handleImageError}
                        />
                        <div className="logo placeholder hidden">
                          {p.tokenA.charAt(0)}
                        </div>
                      </>
                    ) : (
                      <div className="logo placeholder">
                        {p.tokenA.charAt(0)}
                      </div>
                    )}

                    {tokenBLogo ? (
                      <>
                        <img
                          src={tokenBLogo}
                          alt={p.tokenB}
                          className="logo"
                          onError={handleImageError}
                        />
                        <div className="logo placeholder hidden">
                          {p.tokenB.charAt(0)}
                        </div>
                      </>
                    ) : (
                      <div className="logo placeholder">
                        {p.tokenB.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="pair-info">
                    <span className="name">{p.name}</span>
                    <span className="fee">{feeTier}</span>
                  </div>
                </div>
              </td>
              <td>{p.dex.charAt(0).toUpperCase() + p.dex.slice(1)}</td>
              <td>${p.liquidityUSD.toLocaleString()}</td>
              <td>${p.volumeUSD.toLocaleString()}</td>
              <td>${p.feesUSD.toLocaleString()}</td>
              <td>{p.apr.toFixed(2)}%</td>
              <td>
                <button onClick={() => onDeposit(p)}>Deposit</button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

export default PoolTable;

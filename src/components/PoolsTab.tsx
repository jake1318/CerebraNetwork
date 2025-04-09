//src/components/PoolsTab
import React, { useEffect, useRef, useState } from "react";
import { useWallet } from "@suiet/wallet-kit";

interface PoolInfo {
  id: string;
  feeBps: number | null;
  liquidity: number;
  symbolA: string;
  symbolB: string;
  priceA?: string;
  tvl_usd: number;
  volume24h: number;
  apy?: string;
}

const PoolsTab: React.FC = () => {
  const { address, connected } = useWallet();
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [visibleCount, setVisibleCount] = useState<number>(8);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Get your upgraded (production) API key from an environment variable
  const API_KEY = import.meta.env.VITE_GECKO_API_KEY;

  // Fetch trending pools using the production endpoint.
  useEffect(() => {
    async function loadPools() {
      setLoading(true);
      try {
        const response = await fetch(
          "https://pro-api.coingecko.com/api/v3/onchain/networks/sui/trending_pools?include=base_token,quote_token&page=1",
          {
            headers: {
              accept: "application/json",
              "x-cg-pro-api-key": API_KEY,
            },
          }
        );
        const json = await response.json();
        if (json && json.data) {
          // Build a map of token ID to token attributes from the included section
          const tokenMap: Record<string, any> = {};
          if (json.included && Array.isArray(json.included)) {
            json.included.forEach((item: any) => {
              if (item.type === "tokens" && item.id) {
                tokenMap[item.id] = item.attributes;
              }
            });
          }
          const fetchedPools: PoolInfo[] = json.data.map((pool: any) => {
            const attr = pool.attributes;
            // Attempt to split the pool name into two tokens (e.g. "TOKEN1/TOKEN2" or "TOKEN1 / TOKEN2")
            const tokens = attr.name
              ? attr.name.split(/\/| \/ /).map((s: string) => s.trim())
              : ["Unknown", "Unknown"];
            let tokenA = tokens[0] || "Unknown";
            let tokenB = tokens[1] || "Unknown";

            // Override with metadata from the included tokens if available
            if (pool.relationships && pool.relationships.base_token?.data?.id) {
              const baseId = pool.relationships.base_token.data.id;
              if (tokenMap[baseId] && tokenMap[baseId].symbol) {
                tokenA = tokenMap[baseId].symbol;
              }
            }
            if (
              pool.relationships &&
              pool.relationships.quote_token?.data?.id
            ) {
              const quoteId = pool.relationships.quote_token.data.id;
              if (tokenMap[quoteId] && tokenMap[quoteId].symbol) {
                tokenB = tokenMap[quoteId].symbol;
              }
            }

            const liquidity = Number(attr.reserve_in_usd) || 0;
            const volume24h =
              attr.volume_usd && attr.volume_usd["24h"]
                ? Number(attr.volume_usd["24h"])
                : 0;
            // Assume a default fee rate (0.25%) if not provided.
            const feeRate = 0.0025;
            // Compute APY as (volume24h * feeRate / liquidity) * 365 * 100
            const apy =
              liquidity > 0
                ? ((volume24h * feeRate) / liquidity) * 365 * 100
                : 0;

            return {
              id: attr.address, // Use the pool's on-chain address as a stable unique key
              feeBps: feeRate * 10000, // e.g. 0.0025 * 10000 = 25 basis points
              liquidity: liquidity,
              symbolA: tokenA,
              symbolB: tokenB,
              priceA: attr.base_token_price_usd,
              tvl_usd: liquidity,
              volume24h: volume24h,
              apy: apy.toFixed(2) + "%",
            };
          });
          setPools(fetchedPools);
        } else {
          setError("No pool data received");
        }
      } catch (err: any) {
        console.error("Error loading pools:", err);
        setError("Failed to load pools");
      } finally {
        setLoading(false);
      }
    }
    loadPools();
  }, [API_KEY]);

  // Infinite scroll: load more pools when the sentinel comes into view.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + 8, pools.length));
        }
      },
      { threshold: 0.1 }
    );
    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }
    return () => {
      if (loadMoreRef.current) observer.unobserve(loadMoreRef.current);
    };
  }, [pools]);

  if (loading) return <div>Loading pools...</div>;
  if (error) return <div className="error">{error}</div>;

  const visiblePools = pools.slice(0, visibleCount);

  return (
    <div className="pools-tab">
      <h2>Liquidity Pools (Sui)</h2>
      <table>
        <thead>
          <tr>
            <th>Pool (Coin A / Coin B)</th>
            <th>Fee</th>
            <th>Liquidity</th>
            <th>TVL (USD)</th>
            <th>24h Volume</th>
            <th>APY</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {visiblePools.map((pool) => (
            <tr key={pool.id}>
              <td>
                {pool.symbolA} / {pool.symbolB}
              </td>
              <td>
                {pool.feeBps !== null
                  ? (pool.feeBps / 100).toFixed(2) + "%"
                  : "N/A"}
              </td>
              <td>{pool.liquidity.toLocaleString()}</td>
              <td>
                {pool.tvl_usd ? "$" + pool.tvl_usd.toLocaleString() : "N/A"}
              </td>
              <td>
                {pool.volume24h ? "$" + pool.volume24h.toLocaleString() : "N/A"}
              </td>
              <td>{pool.apy || "N/A"}</td>
              <td>
                <button
                  onClick={() => alert(`Add Liquidity for pool ${pool.id}`)}
                >
                  Add Liquidity
                </button>
                <button
                  onClick={() => alert(`Remove Liquidity for pool ${pool.id}`)}
                >
                  Remove Liquidity
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div ref={loadMoreRef} style={{ height: "50px" }} />
      {visibleCount < pools.length && (
        <div style={{ textAlign: "center", marginTop: "1rem" }}>
          Loading more pools...
        </div>
      )}
    </div>
  );
};

export default PoolsTab;

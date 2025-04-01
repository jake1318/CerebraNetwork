import React, { useEffect, useState } from "react";

// Define the shape of pool data based on API fields
interface PoolInfo {
  symbolA: string;
  symbolB: string;
  poolAddress: string;
  feeRatePct?: number; // fee tier percentage (if provided by API)
  apr?: number; // pool APR (if provided by API, used if feeRatePct is not present)
  tvlUsd: number; // total value locked in USD
  rewardApy?: number; // reward APY (if any)
}

const Pools: React.FC = () => {
  // State for pool list, current page, loading status, error message, and all-loaded flag
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [allLoaded, setAllLoaded] = useState<boolean>(false);

  // Helper function to format large numbers (TVL) into human-readable strings (e.g., 1.2M)
  const formatNumber = (value: number): string => {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      compactDisplay: "short",
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Fetch pool data for a given page from the API
  const fetchPools = async (pageToLoad: number) => {
    setLoading(true);
    setError(null);
    try {
      // Assuming your backend is running on port 5000
      const API_BASE_URL = "http://localhost:5000";
      const res = await fetch(
        `${API_BASE_URL}/api/pools?page=${pageToLoad}&limit=8`
      );

      console.log(
        `Fetching pools from: ${API_BASE_URL}/api/pools?page=${pageToLoad}&limit=8`
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      console.log("API Response:", data); // Debug logging

      // Assume the data is either an array of pools or an object with a 'pools' array
      const newPools: PoolInfo[] = Array.isArray(data) ? data : data.pools;

      // Update state: append new pools if not the first page, otherwise replace
      setPools((prevPools) =>
        pageToLoad === 1 ? newPools : [...prevPools, ...newPools]
      );

      setPage(pageToLoad); // update current page

      // Check if we've reached the end of available pools
      const isLastPage = pageToLoad >= data.totalPages;
      const hasFullPage = newPools.length === 8;

      if (!hasFullPage || isLastPage) {
        setAllLoaded(true);
      }
    } catch (err: any) {
      console.error("Failed to fetch pools:", err);
      setError("Failed to load pools. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Load initial pools on component mount (page 1)
  useEffect(() => {
    fetchPools(1);
  }, []);

  // Handler for clicking "Load More"
  const handleLoadMore = () => {
    if (loading || allLoaded) return;
    fetchPools(page + 1);
  };

  // Placeholder: Add Liquidity action
  const handleAddLiquidity = (pool: PoolInfo) => {
    console.log(`Add Liquidity clicked for pool: ${pool.poolAddress}`);
    // TODO: open a form/modal to specify amounts, then call transaction logic
  };

  // Placeholder: Withdraw action
  const handleWithdraw = (pool: PoolInfo) => {
    console.log(`Withdraw clicked for pool: ${pool.poolAddress}`);
    // TODO: open a form/modal to specify how much to withdraw, then call transaction logic
  };

  return (
    <div className="pools-container">
      {/* Error message */}
      {error && (
        <div
          className="error-message"
          style={{ color: "red", marginBottom: "1rem" }}
        >
          {error}
        </div>
      )}

      {/* No pools found message */}
      {!loading && !error && pools.length === 0 && (
        <div className="no-pools" style={{ fontStyle: "italic" }}>
          No pools found.
        </div>
      )}

      {/* Pools table */}
      {pools.length > 0 && (
        <table
          className="pool-list"
          style={{ width: "100%", borderCollapse: "collapse" }}
        >
          <thead>
            <tr>
              <th align="left">Pair</th>
              <th align="left">Pool Address</th>
              <th align="right">Fee Tier</th>
              <th align="right">TVL (USD)</th>
              <th align="right">Reward APY</th>
              {/* New Actions column */}
              <th align="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pools.map((pool) => {
              // Determine fee or APR display value
              const feeValue =
                pool.feeRatePct !== undefined ? pool.feeRatePct : pool.apr;
              const feeDisplay =
                feeValue !== undefined ? `${feeValue}%` : "N/A";

              // Format TVL with abbreviation and prepend $
              const tvlDisplay = `$${formatNumber(pool.tvlUsd)}`;

              // Reward APY display
              const apyDisplay =
                pool.rewardApy !== undefined ? `${pool.rewardApy}%` : "—";

              return (
                <tr key={pool.poolAddress}>
                  <td>
                    {pool.symbolA} / {pool.symbolB}
                  </td>
                  <td>{pool.poolAddress}</td>
                  <td align="right">{feeDisplay}</td>
                  <td align="right">{tvlDisplay}</td>
                  <td align="right">{apyDisplay}</td>
                  {/* Render Add Liquidity & Withdraw buttons */}
                  <td align="right">
                    <button
                      onClick={() => handleAddLiquidity(pool)}
                      style={{ marginRight: "0.5rem" }}
                    >
                      Add Liquidity
                    </button>
                    <button onClick={() => handleWithdraw(pool)}>
                      Withdraw
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="loading" style={{ margin: "1rem 0" }}>
          Loading...
        </div>
      )}

      {/* Load More button */}
      {!loading && !allLoaded && pools.length > 0 && (
        <button
          className="load-more"
          onClick={handleLoadMore}
          style={{ marginTop: "1rem" }}
        >
          Load More
        </button>
      )}
    </div>
  );
};

export default Pools;

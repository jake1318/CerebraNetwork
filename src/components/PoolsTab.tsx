// src/components/PoolsTab.tsx
import React, { useEffect, useState } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { cetusSdk, initializeCetusSdk } from "../utils/cetusSDKSetup";
import {
  extractCoinSymbol,
  formatNumberWithCommas,
  formatSqrtPrice,
} from "../utils/formatting";
import AddLiquidityModal from "./AddLiquidityModal";
import RemoveLiquidityModal from "./RemoveLiquidityModal";
import BN from "bn.js";

interface PoolInfo {
  id: string;
  coinTypeA: string;
  coinTypeB: string;
  feeTier: number;
  liquidity: string;
  symbolA: string;
  symbolB: string;
  decimalsA: number;
  decimalsB: number;
  apr: number;
  price: string;
  volume24h: string;
}

interface ModalState {
  type: "add" | "remove" | null;
  poolId: string | null;
  poolData: PoolInfo | null;
}

const PoolsTab: React.FC = () => {
  const { address, connected } = useWallet();
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ModalState>({
    type: null,
    poolId: null,
    poolData: null,
  });
  const [sortConfig, setSortConfig] = useState<{
    key: keyof PoolInfo;
    direction: "ascending" | "descending";
  }>({
    key: "volume24h",
    direction: "descending",
  });

  useEffect(() => {
    loadPools();
  }, [address, connected]);

  const loadPools = async () => {
    setLoading(true);
    setError(null);

    try {
      // Initialize SDK with connected wallet if available
      if (connected && address) {
        await initializeCetusSdk(address);
      }

      // Fetch all pools using Cetus SDK
      const poolsData = await cetusSdk.Pool.getPools();

      if (!poolsData || poolsData.length === 0) {
        setPools([]);
        setError("No liquidity pools available");
        return;
      }

      // Get volume and APR data
      let volumeAndApr: any = {};
      try {
        // This endpoint might be different depending on Cetus API structure
        volumeAndApr = await cetusSdk.Pool.getPoolsAPR();
      } catch (err) {
        console.warn("Could not fetch pool statistics:", err);
      }

      // Process and format pool data
      const formattedPools: PoolInfo[] = await Promise.all(
        poolsData.map(async (pool) => {
          // Get coin metadata for proper formatting
          const [coinMetadataA, coinMetadataB] = await Promise.all([
            cetusSdk.Coin.getCoinMetadata(pool.coinTypeA),
            cetusSdk.Coin.getCoinMetadata(pool.coinTypeB),
          ]);

          const symbolA = extractCoinSymbol(pool.coinTypeA);
          const symbolB = extractCoinSymbol(pool.coinTypeB);
          const decimalsA = coinMetadataA?.decimals || 9;
          const decimalsB = coinMetadataB?.decimals || 9;

          // Get pool statistics
          const poolStats = volumeAndApr[pool.poolAddress] || {};

          return {
            id: pool.poolAddress,
            coinTypeA: pool.coinTypeA,
            coinTypeB: pool.coinTypeB,
            symbolA,
            symbolB,
            decimalsA,
            decimalsB,
            feeTier: Number(pool.fee_rate) / 10000, // Convert to percentage
            liquidity: pool.liquidity || "0",
            apr: poolStats?.apr || 0,
            price: formatSqrtPrice(
              pool.current_sqrt_price || "0",
              decimalsA,
              decimalsB
            ),
            volume24h: poolStats?.volume24h || "0",
          };
        })
      );

      // Sort pools based on current sort configuration
      const sortedPools = [...formattedPools].sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === "ascending" ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === "ascending" ? 1 : -1;
        }
        return 0;
      });

      setPools(sortedPools);
    } catch (err: any) {
      console.error("Error loading pools:", err);
      setError("Failed to load pools: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (key: keyof PoolInfo) => {
    let direction: "ascending" | "descending" = "ascending";
    if (sortConfig.key === key && sortConfig.direction === "ascending") {
      direction = "descending";
    }
    setSortConfig({ key, direction });

    const sortedPools = [...pools].sort((a, b) => {
      if (a[key] < b[key]) {
        return direction === "ascending" ? -1 : 1;
      }
      if (a[key] > b[key]) {
        return direction === "ascending" ? 1 : -1;
      }
      return 0;
    });

    setPools(sortedPools);
  };

  const handleAddLiquidity = (poolId: string) => {
    if (!connected || !address) {
      alert("Please connect your wallet first");
      return;
    }

    const poolData = pools.find((pool) => pool.id === poolId) || null;
    setModalState({
      type: "add",
      poolId,
      poolData,
    });
  };

  const handleRemoveLiquidity = (poolId: string) => {
    if (!connected || !address) {
      alert("Please connect your wallet first");
      return;
    }

    const poolData = pools.find((pool) => pool.id === poolId) || null;
    setModalState({
      type: "remove",
      poolId,
      poolData,
    });
  };

  const handleCloseModal = () => {
    setModalState({
      type: null,
      poolId: null,
      poolData: null,
    });
  };

  const handleSuccess = () => {
    // Refresh pools data after successful operation
    setModalState({
      type: null,
      poolId: null,
      poolData: null,
    });

    // Trigger reload of pools data
    loadPools();
  };

  const formatLiquidity = (liquidity: string): string => {
    // Convert to a number for formatting (may lose precision for very large values)
    const liquidityValue = new BN(liquidity);
    // Format with commas for readability
    return formatNumberWithCommas(liquidityValue);
  };

  if (loading)
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <div>Loading pools data...</div>
      </div>
    );

  if (error) return <div className="error-container">{error}</div>;

  return (
    <div className="pools-tab">
      <h2>Liquidity Pools (Mainnet)</h2>

      <div className="table-container">
        <table className="pools-table">
          <thead>
            <tr>
              <th onClick={() => handleSort("symbolA")}>Pool</th>
              <th onClick={() => handleSort("feeTier")}>Fee</th>
              <th onClick={() => handleSort("price")}>Price</th>
              <th onClick={() => handleSort("liquidity")}>TVL</th>
              <th onClick={() => handleSort("apr")}>APR</th>
              <th onClick={() => handleSort("volume24h")}>24h Volume</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pools.map((pool) => {
              return (
                <tr key={pool.id}>
                  <td className="pool-name">
                    {pool.symbolA} / {pool.symbolB}
                  </td>
                  <td>{pool.feeTier.toFixed(2)}%</td>
                  <td className="price-cell">{pool.price}</td>
                  <td>${formatLiquidity(pool.liquidity)}</td>
                  <td className="apr-cell">{(pool.apr * 100).toFixed(2)}%</td>
                  <td>${formatNumberWithCommas(pool.volume24h)}</td>
                  <td className="action-buttons">
                    <button
                      className="add-liquidity-btn"
                      onClick={() => handleAddLiquidity(pool.id)}
                      disabled={!connected}
                    >
                      Add
                    </button>
                    <button
                      className="remove-liquidity-btn"
                      onClick={() => handleRemoveLiquidity(pool.id)}
                      disabled={!connected}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pools.length === 0 && !error && !loading && (
        <div className="no-pools-message">No pools available at this time</div>
      )}

      {!connected && (
        <div className="wallet-notice">
          Connect your wallet to add or remove liquidity
        </div>
      )}

      {modalState.type === "add" && modalState.poolData && (
        <AddLiquidityModal
          poolId={modalState.poolId!}
          coinTypeA={modalState.poolData.coinTypeA}
          coinTypeB={modalState.poolData.coinTypeB}
          symbolA={modalState.poolData.symbolA}
          symbolB={modalState.poolData.symbolB}
          onClose={handleCloseModal}
          onSuccess={handleSuccess}
        />
      )}

      {modalState.type === "remove" && modalState.poolData && (
        <RemoveLiquidityModal
          poolId={modalState.poolId!}
          coinTypeA={modalState.poolData.coinTypeA}
          coinTypeB={modalState.poolData.coinTypeB}
          symbolA={modalState.poolData.symbolA}
          symbolB={modalState.poolData.symbolB}
          onClose={handleCloseModal}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
};

export default PoolsTab;

import { useEffect, useRef, useState } from "react";
import cetusSDK from "@cetusprotocol/cetus-sui-clmm-sdk";
import BN from "bn.js";
import { useWallet } from "@suiet/wallet-kit";
import "./Pools.scss";

const { initCetusSDK, TickMath, ClmmPoolUtil } = cetusSDK;

type PoolInfo = {
  id: string;
  coinTypeA: string;
  coinTypeB: string;
  symbolA: string;
  symbolB: string;
  coinA_amount: number;
  coinB_amount: number;
  tvlUsd: number;
  feeRatePct: string;
  rewardApyPct: string;
};

type PositionInfo = {
  posId: string;
  coinTypeA: string;
  coinTypeB: string;
  symbolA: string;
  symbolB: string;
  tickLower: number;
  tickUpper: number;
  liquidity: BN;
};

export default function Pools() {
  const { connected, account, signAndExecuteTransactionBlock } = useWallet();
  const walletAddress = account?.address;
  const sdkRef = useRef<any>(null);

  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [positions, setPositions] = useState<PositionInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Helper to get coin symbol from coin type (last part of type string)
  const getSymbol = (coinType: string) => {
    const parts = coinType.split("::");
    return parts[parts.length - 1] || coinType;
  };

  // Helper to get decimals for common coins (for price calculations)
  const getDecimals = (coinType: string) => {
    if (coinType.includes("::sui::SUI")) return 9;
    if (
      coinType.toUpperCase().includes("::USDC::") ||
      coinType.toUpperCase().includes("::USDT::")
    )
      return 6;
    return 9;
  };

  // Format a price number for display
  const formatPrice = (p: number) => {
    if (p === Infinity || isNaN(p)) return "∞";
    if (p >= 100) return p.toFixed(0);
    if (p >= 1) return p.toFixed(2);
    if (p === 0) return "0";
    return p.toFixed(6);
  };

  // Initialize SDK and load pools & positions when wallet is connected
  useEffect(() => {
    if (!connected || !walletAddress) return;

    setLoading(true);
    setError(null);

    try {
      sdkRef.current = initCetusSDK({
        network: "mainnet",
        wallet: walletAddress,
      });
    } catch (e) {
      console.error("SDK init error:", e);
      setError("Failed to initialize Cetus SDK.");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        // 1. Fetch all pools
        const poolDataList = await sdkRef.current.Pool.getPoolsWithPage([]);
        const poolInfos: PoolInfo[] = [];
        const priceMap: Record<string, number> = {};
        for (const pd of poolDataList) {
          const ctA = pd.coinTypeA || pd.coin_type_a;
          const ctB = pd.coinTypeB || pd.coin_type_b;
          const symA = getSymbol(ctA);
          const symB = getSymbol(ctB);
          if (!priceMap[ctA] && (symA === "USDC" || symA === "USDT"))
            priceMap[ctA] = 1;
          if (!priceMap[ctB] && (symB === "USDC" || symB === "USDT"))
            priceMap[ctB] = 1;
        }
        for (const pd of poolDataList) {
          const ctA = pd.coinTypeA || pd.coin_type_a;
          const ctB = pd.coinTypeB || pd.coin_type_b;
          const decA = getDecimals(ctA);
          const decB = getDecimals(ctB);
          const sqrtPriceX64 = new BN(
            pd.current_sqrt_price || pd.current_sqrt_price_x64 || "0"
          );
          let priceRatio = 0;
          if (!sqrtPriceX64.isZero()) {
            const priceBN = TickMath.sqrtPriceX64ToPrice
              ? TickMath.sqrtPriceX64ToPrice(sqrtPriceX64, decA, decB)
              : (() => {
                  const sqrtP = sqrtPriceX64.div(new BN(2).pow(new BN(64)));
                  const sqrtPNum = parseFloat(sqrtP.toString());
                  return sqrtPNum * sqrtPNum * Math.pow(10, decB - decA);
                })();
            priceRatio =
              typeof priceBN === "object" && priceBN.toString
                ? parseFloat(priceBN.toString())
                : Number(priceBN);
          }
          if (priceRatio > 0) {
            if (priceMap[ctA] && !priceMap[ctB])
              priceMap[ctB] = priceRatio * priceMap[ctA];
            else if (priceMap[ctB] && !priceMap[ctA])
              priceMap[ctA] =
                priceRatio === 0 ? 0 : (1 / priceRatio) * priceMap[ctB];
          }
          let amtA = 0,
            amtB = 0;
          if (pd.coinA?.balance) {
            amtA = parseInt(pd.coinA.balance);
            amtB = parseInt(pd.coinB.balance);
          } else if (pd.coinA && pd.coinB) {
            amtA = Number(pd.coinA) || 0;
            amtB = Number(pd.coinB) || 0;
          }
          const coinAValue = amtA / Math.pow(10, decA);
          const coinBValue = amtB / Math.pow(10, decB);
          let tvl = 0;
          if (priceMap[ctA] && priceMap[ctA] === 1)
            tvl = coinAValue + coinBValue * (priceMap[ctB] || 0);
          else if (priceMap[ctB] && priceMap[ctB] === 1)
            tvl = coinBValue + coinAValue * (priceMap[ctA] || 0);
          else if (priceMap[ctA] && priceMap[ctB])
            tvl = coinAValue * priceMap[ctA] + coinBValue * priceMap[ctB];
          else tvl = 0;
          const feeNum = pd.fee_rate ?? pd.feeRate ?? 0;
          const feeRatePct = (Number(feeNum) / 10000 || 0).toFixed(2) + "%";
          let rewardApyPct = "-";
          try {
            const dailyEmissions =
              await sdkRef.current.Rewarder.emissionsEveryDay({
                pool_id: pd.poolAddress || pd.id,
              });
            if (dailyEmissions && dailyEmissions.length > 0 && tvl > 0) {
              let dailyUSD = 0;
              for (const reward of dailyEmissions) {
                const rewardType = reward.coinType || reward.rewarder_coin_type;
                const rewardDec = getDecimals(rewardType);
                const dailyAmount =
                  Number(
                    reward.emission_amount ||
                      reward.emission_per_day ||
                      reward.amount
                  ) || 0;
                const rewardCount = dailyAmount / Math.pow(10, rewardDec);
                const rewardPrice =
                  priceMap[rewardType] ||
                  (getSymbol(rewardType) === "SUI"
                    ? priceMap[
                        Object.keys(priceMap).find((ct) =>
                          ct.includes("::sui::SUI")
                        )!
                      ]
                    : 0);
                if (rewardPrice && rewardPrice > 0)
                  dailyUSD += rewardCount * rewardPrice;
              }
              if (dailyUSD > 0) {
                const apr = (dailyUSD * 365) / tvl;
                rewardApyPct = (apr * 100).toFixed(2) + "%";
              } else rewardApyPct = "0%";
            }
          } catch {
            rewardApyPct = "-";
          }
          poolInfos.push({
            id: pd.poolAddress || pd.id,
            coinTypeA: ctA,
            coinTypeB: ctB,
            symbolA: getSymbol(ctA),
            symbolB: getSymbol(ctB),
            coinA_amount: amtA,
            coinB_amount: amtB,
            tvlUsd: tvl,
            feeRatePct,
            rewardApyPct: rewardApyPct || "-",
          });
        }
        setPools(poolInfos);

        // 3. Fetch all positions of the connected wallet
        const positionData = await sdkRef.current.Position.getPositionList(
          walletAddress,
          []
        );
        const positionInfos: PositionInfo[] = [];
        for (const pos of positionData || []) {
          const posId = pos.pos_object_id || pos.posId || pos.id;
          const ctA = pos.coin_type_a || pos.coinTypeA;
          const ctB = pos.coin_type_b || pos.coinTypeB;
          const liqStr = pos.liquidity ?? pos.liquidity_amount ?? "0";
          const liquidityBN = new BN(liqStr);
          const tickLower = Number(
            pos.tick_lower_index || pos.tick_lower || pos.lowerTickIndex || 0
          );
          const tickUpper = Number(
            pos.tick_upper_index || pos.tick_upper || pos.upperTickIndex || 0
          );
          let lowerPrice = 0,
            upperPrice = 0;
          try {
            if (TickMath.tickIndexToPrice) {
              const lp = TickMath.tickIndexToPrice(
                tickLower,
                getDecimals(ctA),
                getDecimals(ctB)
              );
              const up = TickMath.tickIndexToPrice(
                tickUpper,
                getDecimals(ctA),
                getDecimals(ctB)
              );
              lowerPrice = parseFloat(lp.toString());
              upperPrice = parseFloat(up.toString());
            } else {
              lowerPrice =
                Math.pow(1.0001, tickLower) *
                Math.pow(10, getDecimals(ctB) - getDecimals(ctA));
              upperPrice =
                Math.pow(1.0001, tickUpper) *
                Math.pow(10, getDecimals(ctB) - getDecimals(ctA));
            }
          } catch {}
          positionInfos.push({
            posId,
            coinTypeA: ctA,
            coinTypeB: ctB,
            symbolA: getSymbol(ctA),
            symbolB: getSymbol(ctB),
            tickLower,
            tickUpper,
            liquidity: liquidityBN,
          });
        }
        setPositions(positionInfos);
      } catch (err: any) {
        console.error("Error loading pools/positions:", err);
        setError("Failed to load pool or position data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [connected, walletAddress]);

  // Handlers for user actions:
  const handleOpenPosition = async (pool: PoolInfo) => {
    if (!sdkRef.current) return;
    try {
      const priceMinStr = prompt(
        `Enter lower price for ${pool.symbolA}/${pool.symbolB} (in ${pool.symbolB} per ${pool.symbolA}):`
      );
      const priceMaxStr = prompt(
        `Enter upper price for ${pool.symbolA}/${pool.symbolB}:`
      );
      const amtAStr = prompt(`Enter amount of ${pool.symbolA} to deposit:`);
      if (!priceMinStr || !priceMaxStr || !amtAStr) return;
      const priceMin = parseFloat(priceMinStr);
      const priceMax = parseFloat(priceMaxStr);
      const amountA = new BN(
        (
          parseFloat(amtAStr) * Math.pow(10, getDecimals(pool.coinTypeA))
        ).toString()
      );
      const tickLower = TickMath.priceToTickIndex
        ? TickMath.priceToTickIndex(
            priceMin,
            getDecimals(pool.coinTypeA),
            getDecimals(pool.coinTypeB)
          )
        : Math.floor(
            Math.log(
              priceMin /
                Math.pow(
                  10,
                  getDecimals(pool.coinTypeB) - getDecimals(pool.coinTypeA)
                )
            ) / Math.log(1.0001)
          );
      const tickUpper = TickMath.priceToTickIndex
        ? TickMath.priceToTickIndex(
            priceMax,
            getDecimals(pool.coinTypeA),
            getDecimals(pool.coinTypeB)
          )
        : Math.floor(
            Math.log(
              priceMax /
                Math.pow(
                  10,
                  getDecimals(pool.coinTypeB) - getDecimals(pool.coinTypeA)
                )
            ) / Math.log(1.0001)
          );
      const spacing = sdkRef.current.Pool.getTickSpacing
        ? await sdkRef.current.Pool.getTickSpacing(pool.id)
        : (pool as any).tickSpacing || 1;
      const alignedLower = Math.floor(tickLower / spacing) * spacing;
      const alignedUpper = Math.floor(tickUpper / spacing) * spacing;
      if (alignedUpper <= alignedLower) {
        alert("Invalid range: upper tick must be greater than lower tick.");
        return;
      }
      const curPrice =
        pool.tvlUsd && pool.coinA_amount
          ? pool.tvlUsd /
            Math.pow(10, getDecimals(pool.coinTypeB)) /
            (pool.coinA_amount / Math.pow(10, getDecimals(pool.coinTypeA)))
          : 0;
      let amountB: BN;
      if (ClmmPoolUtil.estLiquidityAndcoinAmountFromOneAmounts) {
        const est = ClmmPoolUtil.estLiquidityAndcoinAmountFromOneAmounts(
          alignedLower,
          alignedUpper,
          amountA,
          true,
          true,
          0.005,
          new BN(pool.tvlUsd ? 0 : 0)
        );
        const tokenMaxB = est.tokenMaxB ?? est.amountB ?? est.requiredCoinB;
        amountB = tokenMaxB ? new BN(tokenMaxB.toString()) : new BN(0);
      } else {
        amountB = new BN(
          Math.floor(
            parseFloat(amtAStr) *
              (curPrice || 0) *
              Math.pow(10, getDecimals(pool.coinTypeB))
          ).toString()
        );
      }
      const params = {
        coinTypeA: pool.coinTypeA,
        coinTypeB: pool.coinTypeB,
        pool_id: pool.id,
        tick_lower: alignedLower.toString(),
        tick_upper: alignedUpper.toString(),
        fix_amount_a: true,
        amount_a: amountA.toString(),
        amount_b: amountB.toString(),
        slippage: 0.005,
        is_open: true,
        rewarder_coin_types: [],
        collect_fee: false,
      };
      const txPayload =
        await sdkRef.current.Position.createAddLiquidityFixTokenPayload(params);
      const result = await signAndExecuteTransactionBlock({
        transactionBlock: txPayload,
      });
      console.log("Opened position:", result);
      alert(`Position opened in pool ${pool.symbolA}/${pool.symbolB}!`);
      const updatedPositions = await sdkRef.current.Position.getPositionList(
        walletAddress,
        []
      );
      // Update positions in state (for brevity, re-fetching positions is recommended)
    } catch (err) {
      console.error("Open position error:", err);
      alert("Failed to open position: " + (err as any)?.message);
    }
  };

  const handleAddLiquidity = async (pos: PositionInfo) => {
    if (!sdkRef.current) return;
    try {
      const addAmtStr = prompt(
        `Enter amount of ${pos.symbolA} to add to position ${pos.symbolA}/${pos.symbolB}:`
      );
      if (!addAmtStr) return;
      const addAmountA = new BN(
        (
          parseFloat(addAmtStr) * Math.pow(10, getDecimals(pos.coinTypeA))
        ).toString()
      );
      const pool = pools.find(
        (p) => p.coinTypeA === pos.coinTypeA && p.coinTypeB === pos.coinTypeB
      );
      const curPrice =
        pool && pool.tvlUsd
          ? pool.tvlUsd /
            Math.pow(10, getDecimals(pos.coinTypeB)) /
            (pool.coinA_amount / Math.pow(10, getDecimals(pos.coinTypeA)))
          : 0;
      const addAmountB = new BN(
        Math.floor(
          parseFloat(addAmtStr) *
            (curPrice || 0) *
            Math.pow(10, getDecimals(pos.coinTypeB))
        ).toString()
      );
      const params = {
        coinTypeA: pos.coinTypeA,
        coinTypeB: pos.coinTypeB,
        pool_id: pools.find(
          (p) => p.coinTypeA === pos.coinTypeA && p.coinTypeB === pos.coinTypeB
        )?.id,
        tick_lower: pos.tickLower.toString(),
        tick_upper: pos.tickUpper.toString(),
        fix_amount_a: true,
        amount_a: addAmountA.toString(),
        amount_b: addAmountB.toString(),
        slippage: 0.005,
        is_open: false,
        pos_id: pos.posId,
        rewarder_coin_types: [],
        collect_fee: false,
      };
      const txPayload =
        await sdkRef.current.Position.createAddLiquidityFixTokenPayload(params);
      const result = await signAndExecuteTransactionBlock({
        transactionBlock: txPayload,
      });
      console.log("Added liquidity:", result);
      alert("Liquidity added to position!");
      // Optionally, refresh positions
    } catch (err) {
      console.error("Add liquidity error:", err);
      alert("Failed to add liquidity: " + (err as any)?.message);
    }
  };

  const handleRemoveLiquidity = async (pos: PositionInfo) => {
    if (!sdkRef.current) return;
    try {
      const percentStr = prompt(
        `Enter percentage of liquidity to remove from position ${pos.symbolA}/${pos.symbolB} (0-100):`
      );
      if (!percentStr) return;
      const percent = parseFloat(percentStr);
      if (isNaN(percent) || percent <= 0 || percent > 100) {
        alert("Invalid percentage");
        return;
      }
      const deltaLiq = pos.liquidity.muln(Math.min(percent, 100)).divn(100);
      if (deltaLiq.isZero()) {
        alert("No liquidity to remove.");
        return;
      }
      const pool = pools.find(
        (p) => p.coinTypeA === pos.coinTypeA && p.coinTypeB === pos.coinTypeB
      );
      const params = {
        coinTypeA: pos.coinTypeA,
        coinTypeB: pos.coinTypeB,
        pool_id: pool?.id,
        pos_id: pos.posId,
        delta_liquidity: deltaLiq.toString(),
        min_amount_a: "0",
        min_amount_b: "0",
        collect_fee: false,
        rewarder_coin_types: [],
      };
      const txPayload =
        sdkRef.current.Position.removeLiquidityTransactionPayload(params);
      const result = await signAndExecuteTransactionBlock({
        transactionBlock: txPayload,
      });
      console.log("Removed liquidity:", result);
      alert(`Removed ${percent}% liquidity from position.`);
    } catch (err) {
      console.error("Remove liquidity error:", err);
      alert("Failed to remove liquidity: " + (err as any)?.message);
    }
  };

  const handleCollectFees = async (pos: PositionInfo) => {
    if (!sdkRef.current) return;
    try {
      const pool = pools.find(
        (p) => p.coinTypeA === pos.coinTypeA && p.coinTypeB === pos.coinTypeB
      );
      const params = {
        pool_id: pool?.id,
        pos_id: pos.posId,
        coinTypeA: pos.coinTypeA,
        coinTypeB: pos.coinTypeB,
      };
      const txPayload =
        sdkRef.current.Position.collectFeeTransactionPayload(params);
      const result = await signAndExecuteTransactionBlock({
        transactionBlock: txPayload,
      });
      console.log("Fees collected:", result);
      alert("Collected fees for position!");
    } catch (err) {
      console.error("Collect fees error:", err);
      alert("Failed to collect fees: " + (err as any)?.message);
    }
  };

  const handleCollectRewards = async (pos: PositionInfo) => {
    if (!sdkRef.current) return;
    try {
      const pool = pools.find(
        (p) => p.coinTypeA === pos.coinTypeA && p.coinTypeB === pos.coinTypeB
      );
      let rewarderTypes: string[] = [];
      try {
        const rewardList = await sdkRef.current.Pool.fetchPositionRewardList({
          pool_id: pool?.id,
          coinTypeA: pos.coinTypeA,
          coinTypeB: pos.coinTypeB,
        });
        rewarderTypes =
          rewardList?.map((r: any) => r.rewarder_coin_type || r.coinType) || [];
      } catch {
        try {
          const rewardsInfo = await sdkRef.current.Rewarder.posRewardersAmount(
            pool?.id,
            null,
            pos.posId
          );
          rewarderTypes = rewardsInfo.map((item: any) => item.coin_address);
        } catch {
          rewarderTypes = [];
        }
      }
      const params = {
        pool_id: pool?.id,
        pos_id: pos.posId,
        rewarder_coin_types: rewarderTypes,
      };
      const txPayload =
        sdkRef.current.Rewarder.collectRewarderTransactionPayload(params);
      const result = await signAndExecuteTransactionBlock({
        transactionBlock: txPayload,
      });
      console.log("Rewards collected:", result);
      alert("Collected rewards for position!");
    } catch (err) {
      console.error("Collect rewards error:", err);
      alert("Failed to collect rewards: " + (err as any)?.message);
    }
  };

  const handleClosePosition = async (pos: PositionInfo) => {
    if (!sdkRef.current) return;
    try {
      const confirm = window.confirm(
        `Close position ${pos.symbolA}/${pos.symbolB}? This will withdraw all liquidity and rewards.`
      );
      if (!confirm) return;
      const pool = pools.find(
        (p) => p.coinTypeA === pos.coinTypeA && p.coinTypeB === pos.coinTypeB
      );
      let rewarderTypes: string[] = [];
      try {
        const rewardList = await sdkRef.current.Pool.fetchPositionRewardList({
          pool_id: pool?.id,
          coinTypeA: pos.coinTypeA,
          coinTypeB: pos.coinTypeB,
        });
        rewarderTypes =
          rewardList?.map((r: any) => r.rewarder_coin_type || r.coinType) || [];
      } catch {
        try {
          const rewardsInfo = await sdkRef.current.Rewarder.posRewardersAmount(
            pool?.id,
            null,
            pos.posId
          );
          rewarderTypes = rewardsInfo.map((item: any) => item.coin_address);
        } catch {
          rewarderTypes = [];
        }
      }
      const params = {
        coinTypeA: pos.coinTypeA,
        coinTypeB: pos.coinTypeB,
        pool_id: pool?.id,
        pos_id: pos.posId,
        min_amount_a: "0",
        min_amount_b: "0",
        rewarder_coin_types: rewarderTypes,
        collect_fee: true,
      };
      const txPayload =
        sdkRef.current.Position.closePositionTransactionPayload(params);
      const result = await signAndExecuteTransactionBlock({
        transactionBlock: txPayload,
      });
      console.log("Position closed:", result);
      alert("Position closed and liquidity withdrawn!");
      setPositions((prev) => prev.filter((p) => p.posId !== pos.posId));
    } catch (err) {
      console.error("Close position error:", err);
      alert("Failed to close position: " + (err as any)?.message);
    }
  };

  return (
    <div className="pools-page">
      <div className="vertical-scan"></div>
      <div className="glow-1"></div>
      <div className="glow-2"></div>

      <div className="pools-page__container">
        <div className="pools-page__header">
          <h1>Liquidity Pools</h1>
          <p>Add liquidity to earn fees and farm rewards</p>
        </div>

        <div className="pools-page__content">
          {!connected ? (
            <div className="connect-prompt">
              <h2>Connect Wallet</h2>
              <p>
                Please connect your wallet to view and manage liquidity pools
              </p>
            </div>
          ) : loading ? (
            <div className="loading-indicator">
              Loading pools and positions...
            </div>
          ) : error ? (
            <div className="error-message">Error: {error}</div>
          ) : (
            <>
              <h2>All Pools</h2>
              <table className="pools-table">
                <thead>
                  <tr>
                    <th>Pool</th>
                    <th>Liquidity</th>
                    <th>TVL</th>
                    <th>Fee Rate</th>
                    <th>Reward APY</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pools.map((pool) => (
                    <tr key={pool.id}>
                      <td>
                        <span>
                          {pool.symbolA}/{pool.symbolB}
                        </span>
                      </td>
                      <td>
                        {(
                          pool.coinA_amount /
                          Math.pow(10, getDecimals(pool.coinTypeA))
                        ).toFixed(2)}{" "}
                        {pool.symbolA} +{" "}
                        {(
                          pool.coinB_amount /
                          Math.pow(10, getDecimals(pool.coinTypeB))
                        ).toFixed(2)}{" "}
                        {pool.symbolB}
                      </td>
                      <td>${pool.tvlUsd.toFixed(2)}</td>
                      <td>{pool.feeRatePct}</td>
                      <td>{pool.rewardApyPct}</td>
                      <td>
                        <button onClick={() => handleOpenPosition(pool)}>
                          Open Position
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h2>Your Positions</h2>
              {positions.length === 0 ? (
                <div>No positions found.</div>
              ) : (
                <table className="positions-table">
                  <thead>
                    <tr>
                      <th>Pool</th>
                      <th>Range</th>
                      <th>Liquidity</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos) => (
                      <tr key={pos.posId}>
                        <td>
                          {pos.symbolA}/{pos.symbolB}
                        </td>
                        <td>
                          {formatPrice(Math.pow(1.0001, pos.tickLower))} -{" "}
                          {formatPrice(Math.pow(1.0001, pos.tickUpper))}{" "}
                          {pos.symbolB}/{pos.symbolA}
                        </td>
                        <td>{pos.liquidity.toString()}</td>
                        <td>
                          <button onClick={() => handleAddLiquidity(pos)}>
                            Add
                          </button>
                          <button onClick={() => handleRemoveLiquidity(pos)}>
                            Remove
                          </button>
                          <button onClick={() => handleCollectFees(pos)}>
                            Collect Fees
                          </button>
                          <button onClick={() => handleCollectRewards(pos)}>
                            Collect Rewards
                          </button>
                          <button onClick={() => handleClosePosition(pos)}>
                            Close
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

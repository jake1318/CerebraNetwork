import React, { useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { cetusSdk, initializeCetusSdk } from "../utils/cetusSDKSetup";
import { formatNumberWithCommas } from "../utils/formatting";
import { TransactionBlock } from "@mysten/sui";
import BN from "bn.js";

interface AddLiquidityModalProps {
  poolId: string;
  coinTypeA: string;
  coinTypeB: string;
  symbolA: string;
  symbolB: string;
  onClose: () => void;
  onSuccess: () => void;
}

const AddLiquidityModal: React.FC<AddLiquidityModalProps> = ({
  poolId,
  coinTypeA,
  coinTypeB,
  symbolA,
  symbolB,
  onClose,
  onSuccess,
}) => {
  const { address, signAndExecuteTransactionBlock } = useWallet();
  const [amountA, setAmountA] = useState<string>("");
  const [amountB, setAmountB] = useState<string>("");
  const [slippage, setSlippage] = useState<number>(0.5);
  const [loading, setLoading] = useState<boolean>(false);
  const [fetchingData, setFetchingData] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<{ [key: string]: BN }>({});
  const [poolDetail, setPoolDetail] = useState<any>(null);
  const [decimalsA, setDecimalsA] = useState<number>(9);
  const [decimalsB, setDecimalsB] = useState<number>(9);

  useEffect(() => {
    const fetchData = async () => {
      if (!address) return;

      setFetchingData(true);
      try {
        // Initialize SDK with the user's wallet address
        await initializeCetusSdk(address);

        // Fetch pool details for the selected pool
        const poolData = await cetusSdk.Pool.getPool(poolId);
        setPoolDetail(poolData);

        // Get coin decimals
        const coinMetadataA = await cetusSdk.Coin.getCoinMetadata(coinTypeA);
        const coinMetadataB = await cetusSdk.Coin.getCoinMetadata(coinTypeB);

        setDecimalsA(coinMetadataA?.decimals || 9);
        setDecimalsB(coinMetadataB?.decimals || 9);

        // Fetch token balances
        const coinsA = await cetusSdk.Coin.getCoinBalance(address, coinTypeA);
        const coinsB = await cetusSdk.Coin.getCoinBalance(address, coinTypeB);

        setBalances({
          [coinTypeA]: coinsA,
          [coinTypeB]: coinsB,
        });
      } catch (err: any) {
        console.error("Error fetching data:", err);
        setError("Failed to fetch pool data or balances");
      } finally {
        setFetchingData(false);
      }
    };

    fetchData();
  }, [address, poolId, coinTypeA, coinTypeB]);

  const handleAddLiquidity = async () => {
    if (!address || !poolDetail) {
      setError("Wallet not connected or pool data not loaded");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Ensure SDK is initialized with the user's address
      await initializeCetusSdk(address);

      // Convert user input to the right format with proper decimals
      const amountAValue = new BN(
        parseFloat(amountA) * Math.pow(10, decimalsA)
      );
      const amountBValue = new BN(
        parseFloat(amountB) * Math.pow(10, decimalsB)
      );

      // Check for valid amounts
      if (amountAValue.lte(new BN(0)) || amountBValue.lte(new BN(0))) {
        throw new Error("Please enter valid amounts greater than 0");
      }

      // Check if user has enough balance
      if (amountAValue.gt(balances[coinTypeA] || new BN(0))) {
        throw new Error(`Insufficient ${symbolA} balance`);
      }

      if (amountBValue.gt(balances[coinTypeB] || new BN(0))) {
        throw new Error(`Insufficient ${symbolB} balance`);
      }

      // Create transaction block
      const tx = new TransactionBlock();

      // Calculate the tick range based on current pool price
      const currentPrice = poolDetail.current_sqrt_price;
      const currentTick = poolDetail.current_tick_index;

      // Default to a common range around current price (adjust as needed)
      const lowerTick = Math.floor(currentTick - 500);
      const upperTick = Math.floor(currentTick + 500);

      // Add liquidity transaction
      const addLiquidityPayload = await cetusSdk.Liquidity.addLiquidity({
        coinTypeA,
        coinTypeB,
        poolAddress: poolId,
        amountA: amountAValue.toString(),
        amountB: amountBValue.toString(),
        fixedAmount: "a", // Fix amount A, calculate B based on price
        tickLower: lowerTick,
        tickUpper: upperTick,
        transactionBlock: tx,
        slippage: slippage / 100, // Convert from percentage to decimal
      });

      // Execute transaction
      const response = await signAndExecuteTransactionBlock({
        transactionBlock: tx,
      });

      console.log("Add liquidity transaction successful:", response);
      onSuccess();
    } catch (err: any) {
      console.error("Failed to add liquidity:", err);
      setError(err.message || "Failed to add liquidity");
    } finally {
      setLoading(false);
    }
  };

  const formatBalance = (bn: BN | undefined, decimals: number): string => {
    if (!bn) return "0";
    return (Number(bn.toString()) / Math.pow(10, decimals)).toFixed(decimals);
  };

  if (fetchingData) {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <div className="modal-header">
            <h3>Loading Pool Data...</h3>
            <button className="close-button" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="modal-body">
            <div className="loading-spinner"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3>Add Liquidity</h3>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="pool-info">
            <span>
              Pool: {symbolA}/{symbolB}
            </span>
          </div>

          <div className="input-group">
            <label>Amount of {symbolA}</label>
            <input
              type="number"
              value={amountA}
              onChange={(e) => setAmountA(e.target.value)}
              placeholder="0.00"
              disabled={loading}
            />
            {balances[coinTypeA] && (
              <div className="balance-info">
                Balance: {formatBalance(balances[coinTypeA], decimalsA)}
                <button
                  className="max-button"
                  onClick={() =>
                    setAmountA(formatBalance(balances[coinTypeA], decimalsA))
                  }
                  disabled={loading}
                >
                  MAX
                </button>
              </div>
            )}
          </div>

          <div className="input-group">
            <label>Amount of {symbolB}</label>
            <input
              type="number"
              value={amountB}
              onChange={(e) => setAmountB(e.target.value)}
              placeholder="0.00"
              disabled={loading}
            />
            {balances[coinTypeB] && (
              <div className="balance-info">
                Balance: {formatBalance(balances[coinTypeB], decimalsB)}
                <button
                  className="max-button"
                  onClick={() =>
                    setAmountB(formatBalance(balances[coinTypeB], decimalsB))
                  }
                  disabled={loading}
                >
                  MAX
                </button>
              </div>
            )}
          </div>

          <div className="slippage-settings">
            <label>Slippage Tolerance</label>
            <div className="slippage-buttons">
              <button
                className={slippage === 0.1 ? "active" : ""}
                onClick={() => setSlippage(0.1)}
                disabled={loading}
              >
                0.1%
              </button>
              <button
                className={slippage === 0.5 ? "active" : ""}
                onClick={() => setSlippage(0.5)}
                disabled={loading}
              >
                0.5%
              </button>
              <button
                className={slippage === 1.0 ? "active" : ""}
                onClick={() => setSlippage(1.0)}
                disabled={loading}
              >
                1.0%
              </button>
              <input
                type="number"
                value={slippage}
                onChange={(e) => setSlippage(parseFloat(e.target.value))}
                placeholder="Custom"
                min="0.01"
                max="50"
                disabled={loading}
              />
              <span>%</span>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            className="confirm-button"
            onClick={handleAddLiquidity}
            disabled={loading || !amountA || !amountB || fetchingData}
          >
            {loading ? "Processing..." : "Add Liquidity"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddLiquidityModal;

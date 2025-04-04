import React, { useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { cetusSdk, initializeCetusSdk } from "../utils/cetusSDKSetup";
import { formatNumberWithCommas } from "../utils/formatting";
import { TransactionBlock } from "@mysten/sui";
import BN from "bn.js";

interface Position {
  positionId: string;
  liquidity: string;
  tokenAAmount: string;
  tokenBAmount: string;
  tickLower: number;
  tickUpper: number;
}

interface RemoveLiquidityModalProps {
  poolId: string;
  coinTypeA: string;
  coinTypeB: string;
  symbolA: string;
  symbolB: string;
  onClose: () => void;
  onSuccess: () => void;
}

const RemoveLiquidityModal: React.FC<RemoveLiquidityModalProps> = ({
  poolId,
  coinTypeA,
  coinTypeB,
  symbolA,
  symbolB,
  onClose,
  onSuccess,
}) => {
  const { address, signAndExecuteTransactionBlock } = useWallet();
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
  const [percentToRemove, setPercentToRemove] = useState<number>(100);
  const [slippage, setSlippage] = useState<number>(0.5);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [decimalsA, setDecimalsA] = useState<number>(9);
  const [decimalsB, setDecimalsB] = useState<number>(9);

  useEffect(() => {
    const fetchPositions = async () => {
      if (!address) return;

      try {
        // Initialize SDK with the user's wallet address
        await initializeCetusSdk(address);

        // Get coin decimals
        const coinMetadataA = await cetusSdk.Coin.getCoinMetadata(coinTypeA);
        const coinMetadataB = await cetusSdk.Coin.getCoinMetadata(coinTypeB);

        setDecimalsA(coinMetadataA?.decimals || 9);
        setDecimalsB(coinMetadataB?.decimals || 9);

        // Fetch user positions for this pool
        const userPositions = await cetusSdk.Position.getPositions({
          owner: address,
          pool_id: poolId,
        });

        if (!userPositions || userPositions.length === 0) {
          setError("You don't have any liquidity positions in this pool");
        } else {
          // Format positions for display
          const formattedPositions = userPositions.map((pos) => {
            const tokenAAmount = formatTokenAmount(pos.amount_a, decimalsA);
            const tokenBAmount = formatTokenAmount(pos.amount_b, decimalsB);

            return {
              positionId: pos.pos_object_id,
              liquidity: pos.liquidity,
              tokenAAmount,
              tokenBAmount,
              tickLower: pos.tick_lower_index,
              tickUpper: pos.tick_upper_index,
            };
          });

          setPositions(formattedPositions);
          if (formattedPositions.length > 0) {
            setSelectedPosition(formattedPositions[0].positionId);
          }
        }
      } catch (err: any) {
        console.error("Error fetching positions:", err);
        setError("Failed to fetch your positions in this pool");
      } finally {
        setLoading(false);
      }
    };

    fetchPositions();
  }, [address, poolId, coinTypeA, coinTypeB, decimalsA, decimalsB]);

  const formatTokenAmount = (amount: string, decimals: number): string => {
    const amountValue = new BN(amount);
    return (Number(amountValue.toString()) / Math.pow(10, decimals)).toFixed(
      decimals
    );
  };

  const handleRemoveLiquidity = async () => {
    if (!address || !selectedPosition) {
      setError("Please select a position");
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      // Ensure SDK is initialized with the user's address
      await initializeCetusSdk(address);

      // Get selected position
      const position = positions.find((p) => p.positionId === selectedPosition);
      if (!position) throw new Error("Position not found");

      // Calculate liquidity to remove based on percentage
      const liquidityToRemove = new BN(position.liquidity)
        .mul(new BN(percentToRemove))
        .div(new BN(100));

      // Create transaction block
      const tx = new TransactionBlock();

      // Remove liquidity transaction
      await cetusSdk.Liquidity.removeLiquidity({
        coinTypeA,
        coinTypeB,
        positionId: selectedPosition,
        liquidity: liquidityToRemove.toString(),
        slippage: slippage / 100, // Convert from percentage to decimal
        transactionBlock: tx,
      });

      // Execute transaction
      const response = await signAndExecuteTransactionBlock({
        transactionBlock: tx,
      });

      console.log("Remove liquidity transaction successful:", response);
      onSuccess();
    } catch (err: any) {
      console.error("Failed to remove liquidity:", err);
      setError(err.message || "Failed to remove liquidity");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading)
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <div className="modal-header">
            <h3>Loading positions...</h3>
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

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3>Remove Liquidity</h3>
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

          {positions.length === 0 ? (
            <div className="no-positions-message">
              You don't have any liquidity positions in this pool
            </div>
          ) : (
            <>
              <div className="position-selector">
                <label>Select Position</label>
                <select
                  value={selectedPosition || ""}
                  onChange={(e) => setSelectedPosition(e.target.value)}
                  disabled={actionLoading}
                >
                  {positions.map((pos) => (
                    <option key={pos.positionId} value={pos.positionId}>
                      {pos.tokenAAmount} {symbolA} + {pos.tokenBAmount}{" "}
                      {symbolB}
                    </option>
                  ))}
                </select>
              </div>

              <div className="percentage-selector">
                <label>Amount to Remove: {percentToRemove}%</label>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={percentToRemove}
                  onChange={(e) => setPercentToRemove(parseInt(e.target.value))}
                  disabled={actionLoading}
                />
                <div className="percentage-buttons">
                  <button
                    onClick={() => setPercentToRemove(25)}
                    disabled={actionLoading}
                  >
                    25%
                  </button>
                  <button
                    onClick={() => setPercentToRemove(50)}
                    disabled={actionLoading}
                  >
                    50%
                  </button>
                  <button
                    onClick={() => setPercentToRemove(75)}
                    disabled={actionLoading}
                  >
                    75%
                  </button>
                  <button
                    onClick={() => setPercentToRemove(100)}
                    disabled={actionLoading}
                  >
                    100%
                  </button>
                </div>
              </div>

              <div className="slippage-settings">
                <label>Slippage Tolerance</label>
                <div className="slippage-buttons">
                  <button
                    className={slippage === 0.1 ? "active" : ""}
                    onClick={() => setSlippage(0.1)}
                    disabled={actionLoading}
                  >
                    0.1%
                  </button>
                  <button
                    className={slippage === 0.5 ? "active" : ""}
                    onClick={() => setSlippage(0.5)}
                    disabled={actionLoading}
                  >
                    0.5%
                  </button>
                  <button
                    className={slippage === 1.0 ? "active" : ""}
                    onClick={() => setSlippage(1.0)}
                    disabled={actionLoading}
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
                    disabled={actionLoading}
                  />
                  <span>%</span>
                </div>
              </div>

              {error && <div className="error-message">{error}</div>}

              <button
                className="confirm-button"
                onClick={handleRemoveLiquidity}
                disabled={actionLoading || !selectedPosition}
              >
                {actionLoading ? "Processing..." : "Remove Liquidity"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RemoveLiquidityModal;

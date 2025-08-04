// src/components/WithdrawModal.tsx
// Updated: 2025-07-18 02:56:22 UTC by jake1318

import React, { useState, useEffect, useMemo } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { BN } from "bn.js";
import { CetusClmmSDK } from "@cetusprotocol/sui-clmm-sdk";
import {
  TickMath,
  ClmmPoolUtil,
  Percentage,
  adjustForCoinSlippage,
} from "@cetusprotocol/common-sdk";
import { formatDollars } from "../utils/formatters";
import { withdraw as sdkWithdraw } from "../services/cetusService";
import "../styles/components/WithdrawModal.scss";

interface WithdrawModalProps {
  isOpen?: boolean;
  poolAddress: string;
  positionIds: string[];
  totalLiquidity: number;
  valueUsd: number;
  onConfirm: (options: {
    withdrawPercent: number;
    collectFees: boolean;
    closePosition: boolean;
    slippage: number;
  }) => Promise<{ success: boolean; digests: string[] }>;
  onClose: () => void;
}

// Helper function to check if a pool address is from Bluefin
function isBluefinPool(poolAddress: string): boolean {
  // Check if the pool address contains 'bluefin' identifier or matches known Bluefin package patterns
  return poolAddress.toLowerCase().includes("bluefin");
}

const WithdrawModal: React.FC<WithdrawModalProps> = ({
  isOpen = true,
  poolAddress,
  positionIds,
  totalLiquidity,
  valueUsd,
  onConfirm,
  onClose,
}) => {
  const wallet = useWallet();
  const [withdrawPercent, setWithdrawPercent] = useState<number>(100); // Default to 100% (full withdrawal)
  const [slippage, setSlippage] = useState<string>("0.5");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [collectFees, setCollectFees] = useState<boolean>(true);
  const [closePosition, setClosePosition] = useState<boolean>(true);
  const [txNotification, setTxNotification] = useState<{
    message: string;
    isSuccess: boolean;
    txDigest?: string;
    pairName?: string;
  } | null>(null);
  const [txDigests, setTxDigests] = useState<string[]>([]);

  // Check if this is a Bluefin pool
  const isBluefin = useMemo(() => isBluefinPool(poolAddress), [poolAddress]);

  // Compute pair name once
  const pairNameMemo = useMemo(() => {
    return "USDC/SUI"; // Replace with actual dynamic pair name if available
  }, []);

  // Initialize SDK once and cache it - only for non-Bluefin pools
  const sdk = useMemo(() => {
    // Skip SDK initialization for Bluefin pools
    if (isBluefin) {
      console.log("Bluefin pool detected, skipping Cetus SDK initialization");
      return null;
    }

    try {
      console.log(
        "Initializing Cetus SDK with address:",
        wallet.account?.address || "none"
      );
      const sdkInstance = CetusClmmSDK.createSDK({
        env: "mainnet",
        senderAddress: wallet.account?.address,
      });

      console.log("SDK initialized successfully");
      return sdkInstance;
    } catch (error) {
      console.error("Failed to initialize Cetus SDK:", error);
      return null;
    }
  }, [wallet.account?.address, isBluefin]);

  // Update sender address when wallet changes - only for non-Bluefin pools
  useEffect(() => {
    if (sdk && wallet.account?.address && !isBluefin) {
      console.log("Setting sender address:", wallet.account.address);
      sdk.setSenderAddress(wallet.account.address);
    }
  }, [wallet.account?.address, sdk, isBluefin]);

  // Handle percentage select buttons
  const handlePercentSelect = (percent: number) => {
    setWithdrawPercent(percent);
    // If selecting 100%, automatically set closePosition to true
    if (percent === 100) {
      setClosePosition(true);
    } else {
      // Can't close position with partial withdrawal
      setClosePosition(false);
    }
  };

  const handleSubmit = async () => {
    if (!positionIds || positionIds.length === 0) {
      console.error("No position IDs provided");
      return;
    }

    setIsSubmitting(true);

    try {
      // Use the onConfirm callback which now handles both Bluefin and Cetus
      const result = await onConfirm({
        withdrawPercent,
        collectFees,
        closePosition,
        slippage: parseFloat(slippage),
      });

      console.log("Transaction result:", result);

      if (result.success) {
        // Store all transaction digests
        setTxDigests(result.digests);

        // Set success notification
        setTxNotification({
          message: closePosition
            ? "Position successfully closed"
            : `Withdrew ${withdrawPercent}% liquidity`,
          isSuccess: true,
          txDigest: result.digests.length > 0 ? result.digests[0] : undefined,
          pairName: pairNameMemo,
        });
      } else {
        throw new Error("Transaction failed");
      }
    } catch (error) {
      console.error("Error in withdrawal:", error);
      setTxNotification({
        message: `${closePosition ? "Close" : "Withdraw"} failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        isSuccess: false,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModalClose = () => {
    setTxNotification(null);
    setTxDigests([]);
    onClose();
  };

  // Function to format digest for display
  const formatTxDigest = (digest: string) => {
    return `${digest.slice(0, 8)}...${digest.slice(-6)}`;
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="withdraw-modal">
        <div className="modal-header">
          <h3>
            {txNotification?.isSuccess
              ? closePosition
                ? "Close Position"
                : "Withdraw Liquidity"
              : closePosition && withdrawPercent === 100
              ? "Close Position"
              : "Withdraw Liquidity"}
            {isBluefin && (
              <span className="protocol-badge bluefin-badge">Bluefin</span>
            )}
          </h3>
          <button
            className="close-button"
            onClick={handleModalClose}
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path
                d="M18 6L6 18M6 6L18 18"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          </button>
        </div>

        {txNotification?.isSuccess ? (
          <div className="success-confirmation">
            {/* Success Check Icon - Matching the deposit modal */}
            <div className="success-check-icon">
              <svg
                width="80"
                height="80"
                viewBox="0 0 80 80"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle
                  cx="40"
                  cy="40"
                  r="38"
                  stroke="#2EC37C"
                  strokeWidth="4"
                />
                <path
                  d="M24 40L34 50L56 28"
                  stroke="#2EC37C"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            {/* Title and Message - Matching the deposit modal */}
            <h2 className="success-title">
              {closePosition ? "Close Successful!" : "Withdraw Successful!"}
            </h2>

            <p className="success-message">
              {closePosition
                ? `Closed position${
                    positionIds.length > 1 ? "s" : ""
                  } for ${pairNameMemo}`
                : `Withdrew ${withdrawPercent}% from ${pairNameMemo}`}
              {isBluefin && " (Bluefin)"}
            </p>

            {/* Transaction digests section - IMPROVED */}
            <div className="transaction-digests">
              <h4>Transaction{txDigests.length > 1 ? "s" : ""}:</h4>
              {txDigests.length > 0 ? (
                <ul className="tx-list">
                  {txDigests.map((digest, index) => (
                    <li key={digest}>
                      <a
                        href={`https://suivision.xyz/txblock/${digest}`}
                        target="_blank"
                        rel="noreferrer"
                        className="tx-link"
                      >
                        {index + 1}. {formatTxDigest(digest)}
                        <svg
                          className="external-link-icon"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                          <path
                            d="M15 3h6v6"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M10 14L21 3"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No transaction details available</p>
              )}
            </div>

            {/* Action Buttons - Simplified for clarity */}
            <div className="success-actions">
              <button className="done-button" onClick={handleModalClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="modal-body">
            {/* Position Info */}
            <div className="position-info">
              <div className="position-header">
                <div className="token-pair">
                  <span className="token-name">{pairNameMemo}</span>
                  <span
                    className={`range-badge ${
                      isBluefin ? "bluefin-badge" : "in-range"
                    }`}
                  >
                    {isBluefin ? "Bluefin" : "Pool"} Position
                  </span>
                </div>
                <div className="position-value">
                  <span className="label">Value:</span>
                  <span className="value">{formatDollars(valueUsd)}</span>
                </div>
              </div>

              <div className="position-id">
                {positionIds.length > 1
                  ? `${positionIds.length} positions selected`
                  : `Position ID: ${positionIds[0]?.slice(
                      0,
                      8
                    )}...${positionIds[0]?.slice(-4)}`}
              </div>
            </div>

            {/* Withdrawal Amount Selection */}
            <div className="withdrawal-percent">
              <h4>Withdraw Amount</h4>
              <div className="percent-options">
                <button
                  className={withdrawPercent === 25 ? "selected" : ""}
                  onClick={() => handlePercentSelect(25)}
                >
                  25%
                </button>
                <button
                  className={withdrawPercent === 50 ? "selected" : ""}
                  onClick={() => handlePercentSelect(50)}
                >
                  50%
                </button>
                <button
                  className={withdrawPercent === 75 ? "selected" : ""}
                  onClick={() => handlePercentSelect(75)}
                >
                  75%
                </button>
                <button
                  className={withdrawPercent === 100 ? "selected" : ""}
                  onClick={() => handlePercentSelect(100)}
                >
                  100%
                </button>
              </div>

              <div className="custom-percent">
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={withdrawPercent}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setWithdrawPercent(value);
                    // Can only close position with 100% withdrawal
                    if (value < 100) {
                      setClosePosition(false);
                    }
                  }}
                  className="percent-slider"
                  style={{ "--value": withdrawPercent } as React.CSSProperties}
                />
                <div className="percent-display">
                  <span>{withdrawPercent}%</span>
                </div>
              </div>
            </div>

            {/* Options */}
            <div className="withdrawal-options">
              <div className="option-toggle">
                <label className="checkbox-container">
                  <input
                    type="checkbox"
                    checked={collectFees}
                    onChange={(e) => setCollectFees(e.target.checked)}
                  />
                  <span className="checkmark"></span>
                  Collect {isBluefin ? "fees and rewards" : "fees"}
                </label>
              </div>

              {withdrawPercent === 100 && (
                <div className="option-toggle">
                  <label className="checkbox-container">
                    <input
                      type="checkbox"
                      checked={closePosition}
                      onChange={(e) => setClosePosition(e.target.checked)}
                    />
                    <span className="checkmark"></span>
                    Close position
                  </label>
                </div>
              )}
            </div>

            {/* Slippage Settings */}
            <div className="slippage-setting">
              <label>Slippage Tolerance:</label>
              <div className="slippage-options">
                <button
                  type="button"
                  className={slippage === "0.1" ? "selected" : ""}
                  onClick={() => setSlippage("0.1")}
                  disabled={isSubmitting}
                >
                  0.1%
                </button>
                <button
                  type="button"
                  className={slippage === "0.5" ? "selected" : ""}
                  onClick={() => setSlippage("0.5")}
                  disabled={isSubmitting}
                >
                  0.5%
                </button>
                <button
                  type="button"
                  className={slippage === "1" ? "selected" : ""}
                  onClick={() => setSlippage("1")}
                  disabled={isSubmitting}
                >
                  1%
                </button>
                <div className="custom-slippage">
                  <input
                    type="text"
                    value={slippage}
                    onChange={(e) =>
                      setSlippage(e.target.value.replace(/[^0-9.]/g, ""))
                    }
                    placeholder="Custom"
                    disabled={isSubmitting}
                  />
                  <span className="percent-sign">%</span>
                </div>
              </div>
            </div>

            {/* Transaction Info */}
            <div className="transaction-info">
              <h4>Transaction Summary</h4>
              <div className="transaction-details">
                <div className="transaction-item">
                  <span className="item-label">Action:</span>
                  <span className="item-value">
                    {withdrawPercent === 100 && closePosition
                      ? "Close Position" + (positionIds.length > 1 ? "s" : "")
                      : `Withdraw ${withdrawPercent}% Liquidity`}
                  </span>
                </div>
                <div className="transaction-item">
                  <span className="item-label">Protocol:</span>
                  <span
                    className={`item-value ${isBluefin ? "bluefin-text" : ""}`}
                  >
                    {isBluefin ? "Bluefin" : "Cetus"}
                  </span>
                </div>
                <div className="transaction-item">
                  <span className="item-label">Collect Fees:</span>
                  <span className="item-value">
                    {collectFees ? "Yes" : "No"}
                  </span>
                </div>
                <div className="transaction-item">
                  <span className="item-label">Slippage Tolerance:</span>
                  <span className="item-value">{slippage}%</span>
                </div>
                {positionIds.length > 1 && (
                  <div className="transaction-item">
                    <span className="item-label">Positions:</span>
                    <span className="item-value">
                      {positionIds.length} selected
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Withdrawal Warning */}
            {withdrawPercent === 100 && closePosition && (
              <div className="warning-message">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
                    stroke="#F29821"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 8V12"
                    stroke="#F29821"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 16H12.01"
                    stroke="#F29821"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>
                  Closing {positionIds.length > 1 ? "positions" : "a position"}{" "}
                  will permanently remove{" "}
                  {positionIds.length > 1 ? "them" : "it"}.
                </span>
              </div>
            )}

            {/* Processing notification */}
            {isSubmitting && (
              <div className="processing-notification">
                <div className="spinner"></div>
                <span>
                  Processing transaction{positionIds.length > 1 ? "s" : ""}...
                </span>
              </div>
            )}
          </div>
        )}

        {!txNotification?.isSuccess && !isSubmitting && (
          <div className="modal-footer">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleModalClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              className={`btn-primary ${isBluefin ? "bluefin-button" : ""}`}
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {closePosition && withdrawPercent === 100
                ? "Close Position" + (positionIds.length > 1 ? "s" : "")
                : "Withdraw"}
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        .transaction-digests {
          margin-top: 1rem;
          width: 100%;
        }

        .transaction-digests h4 {
          margin-bottom: 0.5rem;
          font-size: 1rem;
          color: #a0a0c0;
        }

        .tx-list {
          list-style: none;
          padding: 0;
          margin: 0;
          width: 100%;
        }

        .tx-list li {
          margin-bottom: 0.5rem;
          padding: 0.5rem;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 6px;
        }

        .tx-link {
          display: flex;
          align-items: center;
          justify-content: space-between;
          text-decoration: none;
          color: #64e3ff;
          font-family: monospace;
          transition: color 0.2s;
          width: 100%;
        }

        .tx-link:hover {
          color: #ffffff;
        }

        .external-link-icon {
          opacity: 0.6;
          margin-left: 4px;
        }

        .tx-link:hover .external-link-icon {
          opacity: 1;
        }
      `}</style>
    </div>
  );
};

export default WithdrawModal;

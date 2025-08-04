// src/components/ClaimRewardsModal.tsx
// Last Updated: 2025-07-19 06:53:35 UTC by jake1318

import React, { useState } from "react";
import { useWallet } from "@suiet/wallet-kit";
import TokenIcon from "./TokenIcon";
import { claimAllRewards } from "../scallop/rewardService";
import type { ClaimResult } from "../scallop/rewardService";
import scallopService from "../scallop/ScallopService"; // Import as default export
import "../styles/ClaimRewardsModal.scss";

// Minimum claimable amount in USD value to prevent dust-level claims
const MIN_CLAIM_USD = 0.001;

// Simple formatter functions
const formatUSD = (value: number): string => {
  return `$${value.toFixed(4)}`;
};

const formatWithCommas = (value: number): string => {
  return value.toFixed(6);
};

interface RewardInfo {
  symbol: string;
  coinType: string;
  amount: number;
  valueUSD: number;
  logoUrl?: string;
}

interface Props {
  /** List of pending rewards from your lending page state */
  pendingRewards: RewardInfo[];
  /** Called when the modal should be closed */
  onClose: () => void;
  /** Called after a successful or failed claim */
  onClaimed: (result: ClaimResult) => void;
  /** User portfolio data */
  userPortfolio?: any;
}

export default function ClaimRewardsModal({
  pendingRewards,
  onClose,
  onClaimed,
  userPortfolio,
}: Props) {
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [txDigest, setTxDigest] = useState("");

  // total USD across all pending rewards
  const totalUsd = pendingRewards.reduce(
    (total, reward) => total + reward.valueUSD,
    0
  );
  const belowThreshold = totalUsd < MIN_CLAIM_USD;

  const handleClaim = async () => {
    if (!connected || !account || !wallet) {
      setError("Wallet not connected");
      return;
    }

    setLoading(true);
    setError(null);
    console.log("Initiating claim rewards transaction");
    try {
      // Check if we have a valid obligation ID directly from the portfolio
      let obligationId = null;

      // First try to get the obligation ID from the portfolio
      if (userPortfolio?.borrowings && userPortfolio.borrowings.length > 0) {
        obligationId = userPortfolio.borrowings[0].obligationId;
        console.log(`Found obligation ID from portfolio: ${obligationId}`);
      }

      // If no obligation ID found in portfolio, use general claim rewards function
      if (!obligationId) {
        console.log(
          "No valid obligation found in portfolio, using general claim rewards flow"
        );
        const result = await claimAllRewards(wallet);

        if (result.success) {
          console.log("Claim result:", result);
          setSuccess(true);
          setTxDigest(result.digest || "");
          onClaimed(result);
        } else {
          throw new Error(result.error || "Transaction failed");
        }
      } else {
        // Use the obligation ID we found to claim rewards
        console.log(
          `Using obligation ${obligationId} from portfolio to claim rewards`
        );

        // Check if scallopService is initialized
        if (!scallopService.client) {
          await scallopService.init();
        }

        // Import the claim function dynamically to avoid import issues
        const { claimScallopRewards } = await import(
          "../scallop/ScallopIncentiveService"
        );
        const result = await claimScallopRewards(wallet, obligationId);

        if (result.success) {
          console.log("Claim result:", result);
          setSuccess(true);
          setTxDigest(result.digest || "");
          onClaimed(result);
        } else {
          throw new Error(result.error || "Transaction failed");
        }
      }
    } catch (err) {
      console.error("Error claiming rewards:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      onClaimed({ success: false, error: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  // Handle close
  const handleClose = () => {
    if (success) {
      // Refresh data before closing
      onClose();
    } else {
      onClose();
    }
  };

  // Destructure properties from wallet
  const { connected, account } = wallet;

  return (
    <div className="rewards-modal-overlay">
      <div className="rewards-modal">
        <div className="rewards-modal-header">
          <h2>Claim Rewards</h2>
          <button className="close-button" onClick={handleClose}>
            ×
          </button>
        </div>

        <div className="modal-content">
          {success ? (
            <div className="success-container">
              <div className="success-icon">✅</div>
              <h4>Rewards claimed successfully!</h4>
              {txDigest && (
                <div className="tx-details">
                  <p>Transaction ID:</p>
                  <a
                    href={`https://explorer.sui.io/txblock/${txDigest}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tx-link"
                  >
                    {`${txDigest.slice(0, 8)}...${txDigest.slice(-8)}`}
                  </a>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="rewards-list">
                <div className="rewards-header">
                  <div>Reward</div>
                  <div>Amount</div>
                  <div>Value</div>
                </div>

                {pendingRewards.map((reward, index) => (
                  <div key={index} className="reward-item">
                    <div className="reward-token">
                      <TokenIcon
                        symbol={reward.symbol}
                        logoUrl={reward.logoUrl}
                        size="sm"
                      />
                      <span>{reward.symbol}</span>
                    </div>
                    <div className="reward-amount">
                      {formatWithCommas(reward.amount)}
                    </div>
                    <div className="reward-value">
                      {formatUSD(reward.valueUSD)}
                    </div>
                  </div>
                ))}

                <div className="rewards-total">
                  <div>Total Value:</div>
                  <div>{formatUSD(totalUsd)}</div>
                </div>
              </div>

              {error && <div className="error-message">{error}</div>}

              <div className="modal-actions">
                <button
                  className="secondary-button"
                  onClick={handleClose}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  onClick={handleClaim}
                  disabled={
                    loading || pendingRewards.length === 0 || belowThreshold
                  }
                >
                  {loading ? "Claiming..." : "Claim All Rewards"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

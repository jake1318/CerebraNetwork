// src/components/VaultWithdrawModal.tsx
// Last Updated: 2025-05-21 06:52:31 UTC by jake1318

import React, { useState, useEffect } from "react";
import "../styles/components/Modal.scss";

interface VaultWithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWithdraw: (
    lpAmount: string,
    slippage: string,
    isOneSided: boolean,
    oneSidedToken?: "A" | "B"
  ) => Promise<{ success: boolean; digest: string }>;
  vault: any;
  walletConnected: boolean;
  vaultBalance: number;
}

const VaultWithdrawModal: React.FC<VaultWithdrawModalProps> = ({
  isOpen,
  onClose,
  onWithdraw,
  vault,
  walletConnected,
  vaultBalance,
}) => {
  // State variables
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [withdrawType, setWithdrawType] = useState<"both" | "one-sided">(
    "both"
  );
  const [oneSidedToken, setOneSidedToken] = useState<"A" | "B">("A");

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setAmount("");
      setSlippage("0.5");
      setErrorMessage("");
      setIsSubmitting(false);
      setWithdrawType("both");
      setOneSidedToken("A");
    }
  }, [isOpen]);

  const handleChangeSlippage = (value: string) => {
    setSlippage(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate input
    if (!amount) {
      setErrorMessage("Please enter withdrawal amount");
      return;
    }

    const lpAmount = parseFloat(amount);
    if (isNaN(lpAmount) || lpAmount <= 0) {
      setErrorMessage("Please enter a valid amount");
      return;
    }

    if (lpAmount > vaultBalance) {
      setErrorMessage("Insufficient LP token balance");
      return;
    }

    if (!walletConnected) {
      setErrorMessage("Please connect your wallet first");
      return;
    }

    setErrorMessage("");
    setIsSubmitting(true);

    try {
      await onWithdraw(
        amount,
        slippage,
        withdrawType === "one-sided",
        withdrawType === "one-sided" ? oneSidedToken : undefined
      );
      onClose();
    } catch (error: any) {
      console.error("Withdrawal error:", error);
      setErrorMessage(error.message || "Transaction failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const setMaxAmount = () => {
    setAmount(vaultBalance.toString());
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Withdraw from Vault</h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="vault-info">
            <div className="vault-name">{vault.name} Vault</div>
            <div className="vault-pair">
              {vault.coin_a_symbol}/{vault.coin_b_symbol}
            </div>
          </div>

          <div className="balance-info">
            <div className="balance-label">Your LP Balance:</div>
            <div className="balance-value">
              {vaultBalance.toFixed(6)} LP
              <button className="max-button" onClick={setMaxAmount}>
                MAX
              </button>
            </div>
          </div>

          <div className="withdraw-type-toggle">
            <div className="toggle-label">Receive:</div>
            <div className="toggle-controls">
              <button
                className={`toggle-button ${
                  withdrawType === "both" ? "active" : ""
                }`}
                onClick={() => setWithdrawType("both")}
              >
                Both Tokens
              </button>
              <button
                className={`toggle-button ${
                  withdrawType === "one-sided" ? "active" : ""
                }`}
                onClick={() => setWithdrawType("one-sided")}
              >
                Single Token
              </button>
            </div>
          </div>

          {withdrawType === "one-sided" && (
            <div className="token-select">
              <div className="select-label">Select Token:</div>
              <div className="token-select-controls">
                <button
                  className={`token-button ${
                    oneSidedToken === "A" ? "active" : ""
                  }`}
                  onClick={() => setOneSidedToken("A")}
                >
                  {vault.coin_a_symbol}
                </button>
                <button
                  className={`token-button ${
                    oneSidedToken === "B" ? "active" : ""
                  }`}
                  onClick={() => setOneSidedToken("B")}
                >
                  {vault.coin_b_symbol}
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label>LP Amount to Withdraw</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter LP amount"
                disabled={isSubmitting}
                step="any"
                min="0"
                max={vaultBalance.toString()}
              />
            </div>

            <div className="slippage-control">
              <label>Slippage Tolerance</label>
              <div className="slippage-buttons">
                {["0.1", "0.5", "1.0"].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`slippage-btn ${
                      slippage === value ? "active" : ""
                    }`}
                    onClick={() => handleChangeSlippage(value)}
                  >
                    {value}%
                  </button>
                ))}
                <div className="slippage-input">
                  <input
                    type="number"
                    value={slippage}
                    onChange={(e) => handleChangeSlippage(e.target.value)}
                    step="0.1"
                    min="0.1"
                    max="20"
                  />
                  <span>%</span>
                </div>
              </div>
            </div>

            {errorMessage && (
              <div className="error-message">{errorMessage}</div>
            )}

            <div className="modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={isSubmitting || !walletConnected}
              >
                {isSubmitting ? "Processing..." : "Withdraw"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default VaultWithdrawModal;

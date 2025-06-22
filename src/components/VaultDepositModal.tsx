// src/components/VaultDepositModal.tsx
// Last Updated: 2025-05-21 06:47:10 UTC by jake1318

import React, { useState, useEffect } from "react";
import "../styles/components/Modal.scss";

interface VaultDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeposit: (
    amountA: string,
    amountB: string,
    slippage: string,
    isOneSided: boolean,
    oneSidedToken: "A" | "B"
  ) => Promise<{ success: boolean; digest: string }>;
  vault: any;
  walletConnected: boolean;
}

const VaultDepositModal: React.FC<VaultDepositModalProps> = ({
  isOpen,
  onClose,
  onDeposit,
  vault,
  walletConnected,
}) => {
  // State variables
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [depositType, setDepositType] = useState<"both" | "one-sided">("both");
  const [oneSidedToken, setOneSidedToken] = useState<"A" | "B">("A");

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setAmountA("");
      setAmountB("");
      setSlippage("0.5");
      setErrorMessage("");
      setIsSubmitting(false);
      setDepositType("both");
      setOneSidedToken("A");
    }
  }, [isOpen]);

  const handleChangeSlippage = (value: string) => {
    setSlippage(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate input
    if (depositType === "both" && (!amountA || !amountB)) {
      setErrorMessage("Please enter both amounts");
      return;
    }

    if (depositType === "one-sided" && !getOneSidedAmount()) {
      setErrorMessage("Please enter amount");
      return;
    }

    if (!walletConnected) {
      setErrorMessage("Please connect your wallet first");
      return;
    }

    setErrorMessage("");
    setIsSubmitting(true);

    try {
      await onDeposit(
        amountA,
        amountB,
        slippage,
        depositType === "one-sided",
        oneSidedToken
      );
      onClose();
    } catch (error: any) {
      console.error("Deposit error:", error);
      setErrorMessage(error.message || "Transaction failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getOneSidedAmount = () => {
    return oneSidedToken === "A" ? amountA : amountB;
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Deposit to Vault</h2>
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

          <div className="deposit-type-toggle">
            <div className="toggle-label">Deposit Type:</div>
            <div className="toggle-controls">
              <button
                className={`toggle-button ${
                  depositType === "both" ? "active" : ""
                }`}
                onClick={() => setDepositType("both")}
              >
                Both Tokens
              </button>
              <button
                className={`toggle-button ${
                  depositType === "one-sided" ? "active" : ""
                }`}
                onClick={() => setDepositType("one-sided")}
              >
                Single Token
              </button>
            </div>
          </div>

          {depositType === "one-sided" && (
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
            {depositType === "both" ? (
              // Both tokens input
              <>
                <div className="input-group">
                  <label>Amount {vault.coin_a_symbol}</label>
                  <input
                    type="number"
                    value={amountA}
                    onChange={(e) => setAmountA(e.target.value)}
                    placeholder={`Enter ${vault.coin_a_symbol} amount`}
                    disabled={isSubmitting}
                    step="any"
                    min="0"
                  />
                </div>
                <div className="input-group">
                  <label>Amount {vault.coin_b_symbol}</label>
                  <input
                    type="number"
                    value={amountB}
                    onChange={(e) => setAmountB(e.target.value)}
                    placeholder={`Enter ${vault.coin_b_symbol} amount`}
                    disabled={isSubmitting}
                    step="any"
                    min="0"
                  />
                </div>
              </>
            ) : (
              // One-sided token input
              <div className="input-group">
                <label>
                  Amount{" "}
                  {oneSidedToken === "A"
                    ? vault.coin_a_symbol
                    : vault.coin_b_symbol}
                </label>
                <input
                  type="number"
                  value={oneSidedToken === "A" ? amountA : amountB}
                  onChange={(e) => {
                    if (oneSidedToken === "A") {
                      setAmountA(e.target.value);
                      setAmountB("");
                    } else {
                      setAmountB(e.target.value);
                      setAmountA("");
                    }
                  }}
                  placeholder={`Enter amount`}
                  disabled={isSubmitting}
                  step="any"
                  min="0"
                />
              </div>
            )}

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
                {isSubmitting ? "Processing..." : "Deposit"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default VaultDepositModal;

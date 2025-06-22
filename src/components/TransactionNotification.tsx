// src/components/TransactionNotification.tsx
// Last Updated: 2025-05-08 07:20:14 UTC by jake1318

import React from "react";
import "../styles/components/TransactionNotification.scss";

interface TransactionNotificationProps {
  message: string;
  isSuccess: boolean;
  txDigest?: string;
  onClose?: () => void;
  asModal?: boolean; // New prop to control display mode
  poolName?: string; // For showing additional context about the transaction
}

/**
 * Component to display transaction notifications with links to SuiVision explorer
 * Can display as either an inline notification or a modal
 */
const TransactionNotification: React.FC<TransactionNotificationProps> = ({
  message,
  isSuccess,
  txDigest,
  onClose,
  asModal = false,
  poolName,
}) => {
  // Generate SuiVision link for the transaction
  const suiVisionLink = txDigest
    ? `https://suivision.xyz/txblock/${txDigest}`
    : "";

  // Format digest for display (truncate in the middle)
  const formatDigest = (digest: string): string => {
    if (!digest) return "";
    if (digest.length <= 16) return digest;
    return `${digest.substring(0, 8)}...${digest.substring(digest.length - 8)}`;
  };

  // If showing as a modal, use the deposit-style confirmation screen
  if (asModal && isSuccess) {
    return (
      <div className="modal-overlay">
        <div className="transaction-modal">
          <div className="modal-header">
            <h3>
              {message.includes("Close") ? "Close Position" : "Transaction"}
            </h3>
            <button
              className="close-button"
              onClick={onClose}
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

          <div className="modal-success-content">
            {/* Green checkmark icon */}
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

            {/* Success message */}
            <h2 className="success-title">{message}</h2>

            {/* Pool info */}
            {poolName && <p className="success-message">{poolName}</p>}

            {/* Transaction ID */}
            {txDigest && (
              <p className="transaction-id">Transaction ID: {txDigest}</p>
            )}

            {/* Action buttons */}
            <div className="success-actions">
              {txDigest && (
                <a
                  href={suiVisionLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="view-tx-link"
                >
                  View on SuiVision
                </a>
              )}

              <button className="done-button" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Standard inline notification (original implementation)
  return (
    <div
      className={`transaction-notification ${isSuccess ? "success" : "error"}`}
    >
      <div className="notification-content">
        <div className="notification-icon">
          {isSuccess ? (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M22 11.08V12a10 10 0 1 1-5.93-9.14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M22 4L12 14.01l-3-3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <line
                x1="15"
                y1="9"
                x2="9"
                y2="15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <line
                x1="9"
                y1="9"
                x2="15"
                y2="15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
        <div className="notification-message">
          <div className="message-text">{message}</div>

          {txDigest && (
            <div className="transaction-details">
              <div className="transaction-id">
                <span className="label">Transaction: </span>
                <span className="value">{formatDigest(txDigest)}</span>
              </div>
              <a
                href={suiVisionLink}
                target="_blank"
                rel="noopener noreferrer"
                className="transaction-link"
              >
                View on SuiVision Explorer
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
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
            </div>
          )}
        </div>

        {onClose && (
          <button className="close-button" onClick={onClose} aria-label="Close">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M18 6L6 18M6 6L18 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default TransactionNotification;

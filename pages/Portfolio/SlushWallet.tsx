// src/pages/Portfolio/SlushWallet.tsx
// Last Updated: 2025-07-31 02:34:15 UTC by jake1318

import React, { useState } from "react";
import { FaTimes, FaExternalLinkAlt, FaQrcode, FaPlus } from "react-icons/fa";

interface SlushWalletProps {
  onClose: () => void;
}

// Since Slush has CSP preventing iframes, we show options to open in new window
const SlushWallet: React.FC<SlushWalletProps> = ({ onClose }) => {
  const [action, setAction] = useState<string | null>(null);

  const containerRef = React.useRef<HTMLDivElement>(null);

  // Handle opening Slush in new window
  const openSlushWallet = () => {
    window.open("https://my.slush.app", "_blank", "noopener,noreferrer");
  };

  // Close modal when clicking outside
  const handleOutsideClick = (e: React.MouseEvent) => {
    if (
      containerRef.current &&
      !containerRef.current.contains(e.target as Node)
    ) {
      onClose();
    }
  };

  return (
    <div
      className="slush-modal-overlay"
      onClick={handleOutsideClick}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9000,
        backdropFilter: "blur(10px)",
      }}
    >
      <div
        ref={containerRef}
        className="slush-modal"
        style={{
          position: "relative",
          width: "420px",
          maxWidth: "95vw",
          maxHeight: "90vh",
          backgroundColor: "#030924",
          borderRadius: "16px",
          boxShadow:
            "0 8px 32px rgba(0, 0, 0, 0.2), 0 0 20px rgba(77, 162, 255, 0.3)",
          border: "1px solid rgba(77, 162, 255, 0.1)",
          padding: "20px",
          overflow: "hidden",
        }}
      >
        <div
          className="slush-modal-header"
          style={{ marginBottom: "20px", position: "relative" }}
        >
          <button
            className="close-button"
            onClick={onClose}
            style={{
              position: "absolute",
              top: "-5px",
              right: "-5px",
              background: "none",
              border: "none",
              color: "#b1a5c8",
              cursor: "pointer",
              fontSize: "1.25rem",
              zIndex: 10,
            }}
          >
            <FaTimes />
          </button>
          <h2
            style={{
              margin: 0,
              color: "#ffffff",
              textAlign: "center",
              fontWeight: 600,
            }}
          >
            Slush Wallet
          </h2>
        </div>

        <div
          className="slush-wallet-container"
          style={{
            width: "100%",
            padding: "20px",
            borderRadius: "12px",
            backgroundColor: "#030924",
            position: "relative",
          }}
        >
          {!action ? (
            <div style={{ textAlign: "center" }}>
              {/* Logo */}
              <div style={{ marginBottom: "20px" }}>
                <img
                  src="https://slush.app/_next/static/media/slush-icon-lightmode.d02a3a1e.svg"
                  alt="Slush Logo"
                  style={{ width: "80px", height: "80px" }}
                />
              </div>

              {/* Description */}
              <p style={{ color: "#b1a5c8", marginBottom: "30px" }}>
                Slush is the official Sui wallet by Mysten Labs. It provides
                secure management of your SUI tokens, NFTs, and enables staking.
              </p>

              {/* Action Buttons */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "15px",
                }}
              >
                <button
                  onClick={openSlushWallet}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                    backgroundColor: "#4DA2FF",
                    color: "#000",
                    border: "none",
                    borderRadius: "10px",
                    padding: "15px",
                    fontSize: "16px",
                    fontWeight: "bold",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = "#3c8de6";
                    e.currentTarget.style.boxShadow =
                      "0 0 15px rgba(77, 162, 255, 0.5)";
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = "#4DA2FF";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <FaExternalLinkAlt /> Open Slush Wallet
                </button>

                <button
                  onClick={() => setAction("create")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                    backgroundColor: "rgba(77, 162, 255, 0.2)",
                    color: "#fff",
                    border: "1px solid rgba(77, 162, 255, 0.5)",
                    borderRadius: "10px",
                    padding: "15px",
                    fontSize: "16px",
                    fontWeight: "500",
                    cursor: "pointer",
                  }}
                >
                  <FaPlus /> Create New Wallet
                </button>

                <button
                  onClick={() => setAction("import")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                    backgroundColor: "rgba(77, 162, 255, 0.2)",
                    color: "#fff",
                    border: "1px solid rgba(77, 162, 255, 0.5)",
                    borderRadius: "10px",
                    padding: "15px",
                    fontSize: "16px",
                    fontWeight: "500",
                    cursor: "pointer",
                  }}
                >
                  <FaQrcode /> Import Existing Wallet
                </button>
              </div>

              {/* Info note about CSP */}
              <p
                style={{
                  fontSize: "13px",
                  color: "#b1a5c8",
                  marginTop: "25px",
                  padding: "10px",
                  backgroundColor: "rgba(0,0,0,0.3)",
                  borderRadius: "8px",
                }}
              >
                Note: Due to security policies, Slush Wallet will open in a new
                browser window.
              </p>
            </div>
          ) : action === "create" ? (
            <div style={{ textAlign: "center" }}>
              <h3 style={{ color: "#fff", marginBottom: "20px" }}>
                Create a New Wallet
              </h3>
              <p style={{ color: "#b1a5c8", marginBottom: "25px" }}>
                Follow these steps to create a new Slush Wallet:
              </p>
              <ol
                style={{
                  color: "#b1a5c8",
                  textAlign: "left",
                  marginBottom: "25px",
                  paddingLeft: "20px",
                }}
              >
                <li style={{ marginBottom: "10px" }}>
                  Click the button below to open Slush in a new tab
                </li>
                <li style={{ marginBottom: "10px" }}>
                  Select "Create new wallet"
                </li>
                <li style={{ marginBottom: "10px" }}>Set up a password</li>
                <li style={{ marginBottom: "10px" }}>
                  Securely save your recovery phrase
                </li>
                <li>Confirm your recovery phrase to complete setup</li>
              </ol>
              <button
                onClick={openSlushWallet}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  backgroundColor: "#4DA2FF",
                  color: "#000",
                  border: "none",
                  borderRadius: "10px",
                  padding: "15px",
                  fontSize: "16px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  margin: "0 auto",
                }}
              >
                <FaExternalLinkAlt /> Open Slush to Create Wallet
              </button>
              <button
                onClick={() => setAction(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#4DA2FF",
                  marginTop: "15px",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                ← Back to options
              </button>
            </div>
          ) : action === "import" ? (
            <div style={{ textAlign: "center" }}>
              <h3 style={{ color: "#fff", marginBottom: "20px" }}>
                Import an Existing Wallet
              </h3>
              <p style={{ color: "#b1a5c8", marginBottom: "25px" }}>
                You can import your existing wallet using your recovery phrase:
              </p>
              <ol
                style={{
                  color: "#b1a5c8",
                  textAlign: "left",
                  marginBottom: "25px",
                  paddingLeft: "20px",
                }}
              >
                <li style={{ marginBottom: "10px" }}>
                  Click the button below to open Slush in a new tab
                </li>
                <li style={{ marginBottom: "10px" }}>
                  Select "Import existing wallet"
                </li>
                <li style={{ marginBottom: "10px" }}>
                  Enter your recovery phrase
                </li>
                <li>Set a new password for your wallet</li>
              </ol>
              <button
                onClick={openSlushWallet}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  backgroundColor: "#4DA2FF",
                  color: "#000",
                  border: "none",
                  borderRadius: "10px",
                  padding: "15px",
                  fontSize: "16px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  margin: "0 auto",
                }}
              >
                <FaExternalLinkAlt /> Open Slush to Import Wallet
              </button>
              <button
                onClick={() => setAction(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#4DA2FF",
                  marginTop: "15px",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                ← Back to options
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default SlushWallet;

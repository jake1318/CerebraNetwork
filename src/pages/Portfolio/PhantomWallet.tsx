// src/pages/Portfolio/PhantomWallet.tsx
// Last Updated: 2025-07-31 19:41:29 UTC by jake1318

import React, { useEffect, useState, useRef } from "react";
import { FaTimes, FaExclamationTriangle, FaLock } from "react-icons/fa";
import { waitForPhantom } from "../../utils/waitForPhantom";

interface PhantomWalletProps {
  onClose: () => void;
}

const PhantomWallet: React.FC<PhantomWalletProps> = ({ onClose }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [walletType, setWalletType] = useState<"extension" | "embedded" | null>(
    null
  );
  const [securityError, setSecurityError] = useState<boolean>(false);

  // Using a ref to track component mounted state
  const isMountedRef = useRef(true);

  // Use a ref to keep track of the waitForPhantom promise
  const phantomPromiseRef = useRef<any>(null);

  useEffect(() => {
    console.log("[PhantomWallet] Component mounted, waiting for wallet...");

    // Setup the mounted flag
    isMountedRef.current = true;

    // Check if we're on a secure context
    const isSecureContext =
      window.location.protocol === "https:" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    if (!isSecureContext) {
      console.error(
        "[PhantomWallet] Not a secure context:",
        window.location.origin
      );
      if (isMountedRef.current) {
        setLoading(false);
        setSecurityError(true);
        setError(
          `Phantom requires HTTPS or localhost. Current origin: ${window.location.origin}`
        );
      }
      return;
    }

    // IMPORTANT FIX: Check if we already have a Phantom object (extension)
    if (window.phantom) {
      console.log("[PhantomWallet] Phantom object detected immediately");

      // Initialize the sui property if needed
      if (!window.phantom.sui) {
        window.phantom.sui = { isPhantom: true };
      }

      if (isMountedRef.current) {
        setWalletType("extension");
        setLoading(false);
      }

      return;
    }

    // Check if we already have the embedded wallet
    if (window.cerebraWallet?.show && window.cerebraWallet?.hide) {
      console.log("[PhantomWallet] Embedded wallet detected immediately");
      if (isMountedRef.current) {
        setWalletType("embedded");
        setLoading(false);
      }

      try {
        window.cerebraWallet!.show();
      } catch (err) {
        console.error("[PhantomWallet] Error showing embedded wallet:", err);
        if (isMountedRef.current) {
          setError(
            "Could not display the embedded wallet. Please reload the page and try again."
          );
        }
      }

      return;
    }

    // Start the detection process
    const promise = waitForPhantom(30000); // 30 second timeout
    phantomPromiseRef.current = promise;

    promise
      .then((m) => {
        if (!isMountedRef.current) return; // Skip if component unmounted

        console.log("[PhantomWallet] Wallet ready, type:", m);
        setWalletType(m);
        setLoading(false);

        if (m === "extension") {
          /* real extension */
          console.log("[PhantomWallet] Connecting to extension...");

          // Make sure the sui property exists
          if (!window.phantom.sui) {
            window.phantom.sui = { isPhantom: true };
          }

          const p = window.phantom!;
          const connector = p.sui || p.solana;

          if (connector?.connect) {
            return connector.connect().catch((err: any) => {
              console.error(
                "[PhantomWallet] Failed to connect to Phantom extension:",
                err
              );
              if (isMountedRef.current) {
                setError(
                  "Could not connect to Phantom extension. Please try again."
                );
              }
            });
          } else {
            console.log(
              "[PhantomWallet] No connect method found, but proceeding with extension mode"
            );
          }
        } else {
          /* embedded wallet */
          console.log("[PhantomWallet] Showing embedded wallet...");
          try {
            window.cerebraWallet!.show();
          } catch (err) {
            console.error(
              "[PhantomWallet] Error showing embedded wallet:",
              err
            );
            if (isMountedRef.current) {
              setError(
                "Could not display the embedded wallet. Please reload the page and try again."
              );
            }
          }
        }
      })
      .catch((err) => {
        if (!isMountedRef.current) return; // Skip if component unmounted

        console.error(
          "[PhantomWallet] Error initializing Phantom wallet:",
          err
        );

        // FALLBACK HANDLING: If we have a window.phantom object but no wallet was detected,
        // we can still show the extension UI
        if (window.phantom) {
          console.log("[PhantomWallet] Fallback to extension mode");

          // Initialize the sui property if needed
          if (!window.phantom.sui) {
            window.phantom.sui = { isPhantom: true };
          }

          setWalletType("extension");
          setLoading(false);
        } else {
          setLoading(false);
          setError(
            `Could not initialize Phantom wallet: ${err.message}. Please check your internet connection and try again.`
          );
        }
      });

    // Cleanup function
    return () => {
      console.log("[PhantomWallet] Component unmounting, cleaning up...");
      isMountedRef.current = false; // Mark component as unmounted

      // Cancel the phantom detection if it's still running
      if (phantomPromiseRef.current && phantomPromiseRef.current.cancel) {
        phantomPromiseRef.current.cancel();
        phantomPromiseRef.current = null;
      }

      // If we're in embedded mode, hide the wallet
      if (walletType === "embedded" && window.cerebraWallet?.hide) {
        console.log("[PhantomWallet] Hiding embedded wallet");
        try {
          window.cerebraWallet.hide();
        } catch (err) {
          console.error("[PhantomWallet] Error hiding embedded wallet:", err);
        }
      }
    };
  }, []);

  const handleOutsideClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Improved retry function that doesn't reload the whole page
  const handleRetry = () => {
    if (!isMountedRef.current) return;

    console.log("[PhantomWallet] Retrying...");
    setError(null);
    setLoading(true);
    setWalletType(null);

    // Check if we need to reload the page for security context issues
    if (securityError) {
      if (
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1"
      ) {
        // If we're already on localhost but with http, we just need to reload with https
        window.location.href =
          "https://" + window.location.host + window.location.pathname;
        return;
      }
      // For other non-secure contexts, just show the error
      return;
    }

    // IMPORTANT FIX: Check if we already have a Phantom object (extension)
    if (window.phantom) {
      console.log("[PhantomWallet] Phantom object detected on retry");

      // Initialize the sui property if needed
      if (!window.phantom.sui) {
        window.phantom.sui = { isPhantom: true };
      }

      if (isMountedRef.current) {
        setWalletType("extension");
        setLoading(false);
      }

      return;
    }

    // Check if we already have the embedded wallet
    if (window.cerebraWallet?.show && window.cerebraWallet?.hide) {
      console.log("[PhantomWallet] Embedded wallet detected on retry");
      if (isMountedRef.current) {
        setWalletType("embedded");
        setLoading(false);
      }

      try {
        window.cerebraWallet!.show();
      } catch (err) {
        console.error(
          "[PhantomWallet] Error showing embedded wallet on retry:",
          err
        );
        if (isMountedRef.current) {
          setError(
            "Could not display the embedded wallet. Please reload the page and try again."
          );
        }
      }

      return;
    }

    // Cancel any existing detection
    if (phantomPromiseRef.current && phantomPromiseRef.current.cancel) {
      phantomPromiseRef.current.cancel();
    }

    // Re-initialize with the same useEffect logic but don't remount the component
    const promise = waitForPhantom(30000);
    phantomPromiseRef.current = promise;

    promise
      .then((m) => {
        if (!isMountedRef.current) return;

        console.log("[PhantomWallet] Retry successful, wallet type:", m);
        setWalletType(m);
        setLoading(false);

        if (m === "extension") {
          const p = window.phantom!;
          const connector = p.sui || p.solana;
          if (connector?.connect) {
            return connector.connect().catch((err: any) => {
              if (!isMountedRef.current) return;
              console.error(
                "[PhantomWallet] Failed to connect to Phantom extension on retry:",
                err
              );
              setError(
                "Could not connect to Phantom extension. Please try again."
              );
            });
          }
        } else {
          try {
            window.cerebraWallet!.show();
          } catch (err) {
            if (!isMountedRef.current) return;
            console.error(
              "[PhantomWallet] Error showing embedded wallet on retry:",
              err
            );
            setError(
              "Could not display the embedded wallet. Please reload the page and try again."
            );
          }
        }
      })
      .catch((err) => {
        if (!isMountedRef.current) return;

        console.error(
          "[PhantomWallet] Error reinitializing Phantom wallet:",
          err
        );

        // FALLBACK HANDLING: If we have a window.phantom object but no wallet was detected,
        // we can still show the extension UI
        if (window.phantom) {
          console.log("[PhantomWallet] Fallback to extension mode on retry");

          // Initialize the sui property if needed
          if (!window.phantom.sui) {
            window.phantom.sui = { isPhantom: true };
          }

          setWalletType("extension");
          setLoading(false);
        } else {
          setLoading(false);
          setError(
            `Could not initialize Phantom wallet: ${err.message}. Please reload the page.`
          );
        }
      });
  };

  return (
    <div
      className="phantom-modal-overlay"
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
        className="phantom-modal"
        onClick={(e) => e.stopPropagation()}
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
          className="phantom-modal-header"
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
            Phantom Wallet
          </h2>
        </div>

        {/* Loading state */}
        {loading && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "650px",
              color: "#b1a5c8",
            }}
          >
            <div
              className="loading-spinner"
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                border: "3px solid transparent",
                borderTop: "3px solid #4DA2FF",
                borderRight: "3px solid #1ED760",
                borderBottom: "3px solid #FF00FF",
                animation: "spinner 1.5s linear infinite",
                marginBottom: "20px",
              }}
            />
            <p>Initializing Phantom Wallet...</p>
            <p
              style={{
                fontSize: "14px",
                opacity: 0.7,
                maxWidth: "80%",
                textAlign: "center",
                marginTop: "10px",
              }}
            >
              This may take a few moments. Please ensure you're using HTTPS or
              localhost.
            </p>
          </div>
        )}

        {/* Security Error state */}
        {securityError && !loading && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "650px",
              color: "#ff5252",
              textAlign: "center",
              padding: "20px",
            }}
          >
            <div
              style={{
                fontSize: "3rem",
                marginBottom: "20px",
                color: "#ff5252",
              }}
            >
              <FaLock />
            </div>
            <h3 style={{ marginBottom: "15px", color: "#ff5252" }}>
              Security Error
            </h3>
            <p style={{ marginBottom: "20px" }}>{error}</p>
            <div
              style={{
                backgroundColor: "rgba(255, 82, 82, 0.1)",
                padding: "15px",
                borderRadius: "8px",
                marginBottom: "20px",
              }}
            >
              <p style={{ fontWeight: "bold", marginBottom: "10px" }}>
                How to fix this:
              </p>
              <ol style={{ textAlign: "left", paddingLeft: "20px" }}>
                <li>
                  Use <code>http://localhost:3000</code> for development
                </li>
                <li>OR use HTTPS in production</li>
              </ol>
            </div>
            {window.location.hostname === "localhost" && (
              <button
                onClick={() => {
                  window.location.href =
                    "https://" +
                    window.location.host +
                    window.location.pathname;
                }}
                style={{
                  backgroundColor: "#4DA2FF",
                  border: "none",
                  borderRadius: "12px",
                  padding: "12px 24px",
                  color: "#000",
                  fontWeight: "bold",
                  fontSize: "16px",
                  cursor: "pointer",
                  marginTop: "10px",
                }}
              >
                Try with HTTPS
              </button>
            )}
          </div>
        )}

        {/* Regular Error state */}
        {error && !loading && !securityError && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "650px",
              color: "#ff5252",
              textAlign: "center",
              padding: "20px",
            }}
          >
            <div
              style={{
                fontSize: "3rem",
                marginBottom: "20px",
                color: "#ff5252",
              }}
            >
              <FaExclamationTriangle />
            </div>
            <p>{error}</p>
            <button
              onClick={handleRetry}
              style={{
                marginTop: "20px",
                padding: "10px 20px",
                backgroundColor: "rgba(77, 162, 255, 0.2)",
                border: "1px solid rgba(77, 162, 255, 0.5)",
                borderRadius: "8px",
                color: "#4DA2FF",
                cursor: "pointer",
              }}
            >
              Retry
            </button>
            <p
              style={{ fontSize: "14px", color: "#b1a5c8", marginTop: "15px" }}
            >
              Or you can{" "}
              <a
                href="https://phantom.app/download"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#4DA2FF" }}
              >
                download the Phantom extension
              </a>{" "}
              for the best experience.
            </p>
          </div>
        )}

        {/* Extension UI */}
        {!loading && !error && walletType === "extension" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "30px 20px",
              textAlign: "center",
              height: "650px",
            }}
          >
            <img
              src="https://phantom.app/img/logo.png"
              alt="Phantom Logo"
              style={{ width: "80px", height: "80px", marginBottom: "20px" }}
            />
            <h3 style={{ marginBottom: "15px", color: "#fff" }}>
              Phantom Extension Connected
            </h3>
            <p style={{ marginBottom: "25px", color: "#b1a5c8" }}>
              Your Phantom wallet is now connected. You can manage your assets
              directly through the extension.
            </p>
            <button
              onClick={() => {
                const p = window.phantom!;
                if (p.sui?.connect) {
                  p.sui.connect().catch(console.error);
                } else if (p.solana?.connect) {
                  p.solana.connect().catch(console.error);
                } else {
                  console.log(
                    "No connect method available in the Phantom extension"
                  );
                }
              }}
              style={{
                backgroundColor: "#4DA2FF",
                border: "none",
                borderRadius: "12px",
                padding: "12px 24px",
                color: "#000",
                fontWeight: "bold",
                fontSize: "16px",
                cursor: "pointer",
              }}
            >
              Open Wallet
            </button>
          </div>
        )}

        {/* Embedded wallet - just provide space */}
        {!loading && !error && walletType === "embedded" && (
          <div style={{ height: "650px" }} />
        )}
      </div>
    </div>
  );
};

export default PhantomWallet;

// Extend the Window interface to include the Phantom and cerebraWallet properties
declare global {
  interface Window {
    phantom?: any;
    cerebraWallet?: any;
  }
}

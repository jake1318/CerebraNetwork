import React, { useState, useEffect } from "react";
import {
  useWallet,
  useAccountBalance,
  useSuiProvider,
} from "@suiet/wallet-kit";
import { getQuote, buildTx, estimateGasFee } from "@7kprotocol/sdk-ts";
import BigNumber from "bignumber.js";
import TokenSelector from "./TokenSelector/TokenSelector";
import { useWalletContext } from "../contexts/WalletContext";
import { Token, fetchTokens } from "../services/tokenService";
import "./SwapForm.scss";

export default function SwapForm() {
  const wallet = useWallet();
  const provider = useSuiProvider();
  const { balance: suiBalance } = useAccountBalance();
  const { walletState, tokenMetadata, formatUsd, refreshBalances } =
    useWalletContext();

  const [tokenIn, setTokenIn] = useState<Token | null>(null);
  const [tokenOut, setTokenOut] = useState<Token | null>(null);
  const [amountIn, setAmountIn] = useState("");
  const [amountOut, setAmountOut] = useState("0");
  const [loading, setLoading] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState("");
  const [slippage, setSlippage] = useState(0.01);
  const [customSlippage, setCustomSlippage] = useState("");
  const [showCustomSlippage, setShowCustomSlippage] = useState(false);
  const [estimatedFee, setEstimatedFee] = useState<number | null>(null);
  const [suiPrice, setSuiPrice] = useState<number | null>(null);
  const [loadingTokens, setLoadingTokens] = useState(true);

  const [isTokenInSelectorOpen, setIsTokenInSelectorOpen] = useState(false);
  const [isTokenOutSelectorOpen, setIsTokenOutSelectorOpen] = useState(false);
  const [availableTokens, setAvailableTokens] = useState<Token[]>([]);

  // NEW: store transaction digest
  const [txDigest, setTxDigest] = useState<string | null>(null);

  const convertWalletBalancesToTokens = (): Token[] => {
    return walletState.balances.map((balance) => {
      const meta = tokenMetadata[balance.coinType] || {};
      const price = Number(meta.price) || 0;
      const bal = Number(balance.balance) / 10 ** balance.decimals;
      return {
        address: balance.coinType,
        symbol: balance.symbol || meta.symbol || "Unknown",
        name: balance.name || meta.name || "Unknown Token",
        logo: meta.logo || "",
        decimals: balance.decimals,
        price,
        balance: bal.toString(),
      } as Token;
    });
  };

  useEffect(() => {
    const loadTokens = async () => {
      setLoadingTokens(true);
      try {
        const apiTokens = await fetchTokens();
        const walletTokens = convertWalletBalancesToTokens();
        const map = new Map<string, Token>();
        apiTokens.forEach((t) => map.set(t.address, t));
        walletTokens.forEach((t) => {
          if (map.has(t.address)) {
            const ex = map.get(t.address)!;
            map.set(t.address, {
              ...ex,
              balance: t.balance,
              price: t.price || ex.price,
            });
          } else {
            map.set(t.address, t);
          }
        });
        setAvailableTokens(Array.from(map.values()));
        const suiMeta = tokenMetadata["0x2::sui::SUI"];
        setSuiPrice(suiMeta?.price ? Number(suiMeta.price) : 0);
      } catch (e) {
        console.error("Error loading tokens:", e);
      } finally {
        setLoadingTokens(false);
      }
    };
    loadTokens();
  }, [walletState.balances, tokenMetadata]);

  const handlePercentageClick = async (percentage: number) => {
    if (!tokenIn || !wallet.account?.address) return;

    try {
      // Handle SUI token separately since we might have direct access to balance
      if (tokenIn.address === "0x2::sui::SUI" && suiBalance) {
        const balanceInSui = parseInt(suiBalance) / 1e9;
        // Reserve a small amount of SUI for gas fees (0.05 SUI)
        const maxAmount = Math.max(0, balanceInSui - 0.05);
        const percentAmount = (maxAmount * percentage) / 100;
        setAmountIn(percentAmount.toFixed(6));
        return;
      }

      // For other tokens, check if we have the token in our wallet balances
      const walletToken = walletState.balances.find(
        (b) => b.coinType === tokenIn.address
      );

      if (walletToken) {
        // We have the token in our wallet balances
        const decimals = walletToken.decimals;
        const balanceNum = Number(walletToken.balance) / Math.pow(10, decimals);
        const percentAmount = (balanceNum * percentage) / 100;
        setAmountIn(percentAmount.toFixed(6));
      }
      // Check if the token has a balance property (from convertWalletBalancesToTokens)
      else if (tokenIn.balance) {
        const balanceNum = parseFloat(tokenIn.balance);
        const percentAmount = (balanceNum * percentage) / 100;
        setAmountIn(percentAmount.toFixed(6));
      }
      // As a fallback, try to fetch the balance directly from the provider
      else if (provider) {
        const result = await provider.getBalance({
          owner: wallet.account.address,
          coinType: tokenIn.address,
        });

        if (result?.totalBalance) {
          const decimals = tokenIn.decimals;
          const balanceNum =
            parseInt(result.totalBalance) / Math.pow(10, decimals);
          const percentAmount = (balanceNum * percentage) / 100;
          setAmountIn(percentAmount.toFixed(6));
        }
      }
    } catch (error) {
      console.error(`Error setting ${percentage}% amount:`, error);
    }
  };

  // Helper function to make MAX button more accessible
  const getMaxAmount = () => handlePercentageClick(100);

  const formatSlippage = (s: number) => (s * 100).toFixed(1);

  useEffect(() => {
    if (loadingTokens) return;
    const timer = setTimeout(() => {
      if (tokenIn && tokenOut && amountIn && +amountIn > 0) {
        getQuoteForSwap();
      } else {
        setAmountOut("0");
        setEstimatedFee(null);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [tokenIn, tokenOut, amountIn, loadingTokens]);

  const getQuoteForSwap = async () => {
    try {
      setQuoting(true);
      setError("");
      const inDecimals = tokenIn!.decimals;
      const inBase = new BigNumber(amountIn).times(10 ** inDecimals).toString();
      const qr = await getQuote({
        tokenIn: tokenIn!.address,
        tokenOut: tokenOut!.address,
        amountIn: inBase,
      });
      if (qr) {
        const outDecimals = tokenOut!.decimals;
        const outAmt = new BigNumber(qr.outAmount)
          .div(10 ** outDecimals)
          .toString();
        setAmountOut(outAmt);
        if (wallet.account?.address) {
          const feeUsd = await estimateGasFee({
            quoteResponse: qr,
            accountAddress: wallet.account.address,
            slippage,
            suiPrice: suiPrice || undefined,
            commission: { partner: wallet.account.address, commissionBps: 0 },
          });
          setEstimatedFee(feeUsd);
        }
      }
    } catch (e: any) {
      console.error("Quote error:", e);
      setError(e.message || "Failed to get quote");
      setAmountOut("0");
      setEstimatedFee(null);
    } finally {
      setQuoting(false);
    }
  };

  const swapTokens = async () => {
    if (!wallet.connected || !tokenIn || !tokenOut || +amountIn <= 0) {
      setError("Missing parameters or wallet not connected");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const inDecimals = tokenIn.decimals;
      const inBase = new BigNumber(amountIn).times(10 ** inDecimals).toString();
      const qr = await getQuote({
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        amountIn: inBase,
      });
      const { tx } = await buildTx({
        quoteResponse: qr!,
        accountAddress: wallet.account!.address,
        slippage,
        commission: { partner: wallet.account!.address, commissionBps: 0 },
      });
      const res = await wallet.signAndExecuteTransactionBlock({
        transactionBlock: tx,
      });
      if (res.digest) setTxDigest(res.digest);
      // reset & refresh
      setAmountIn("");
      setAmountOut("0");
      setEstimatedFee(null);
      await refreshBalances();
    } catch (e: any) {
      console.error("Swap error:", e);
      setError(e.message || "Swap failed");
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => setTxDigest(null);

  return (
    <div className="swap-form">
      <h2>Swap Tokens</h2>

      {/* From */}
      <div className="form-group">
        <div className="form-label-row">
          <label>From</label>
          {wallet.connected && (
            <div className="amount-buttons">
              {[25, 50, 75].map((p) => (
                <button
                  key={p}
                  className="percent-button"
                  onClick={() => handlePercentageClick(p)}
                  type="button"
                >
                  {p}%
                </button>
              ))}
              <button
                className="max-button"
                onClick={() => handlePercentageClick(100)}
                type="button"
              >
                MAX
              </button>
            </div>
          )}
        </div>
        <div className="input-with-token">
          <input
            type="number"
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
            placeholder="0.0"
            min="0"
            step="any"
          />
          <div className="token-select-wrapper">
            <button
              className="token-selector-button"
              onClick={() => setIsTokenInSelectorOpen(true)}
            >
              {tokenIn ? (
                <div className="selected-token">
                  <img
                    src={tokenIn.logo}
                    alt={tokenIn.symbol}
                    className="token-logo"
                    onError={(e) =>
                      ((e.target as HTMLImageElement).style.display = "none")
                    }
                  />
                  <span>{tokenIn.symbol}</span>
                </div>
              ) : (
                "Select Token"
              )}
            </button>
            {isTokenInSelectorOpen && (
              <TokenSelector
                isOpen
                onClose={() => setIsTokenInSelectorOpen(false)}
                onSelect={(t) => {
                  setTokenIn(t);
                  setIsTokenInSelectorOpen(false);
                }}
                excludeAddresses={tokenOut ? [tokenOut.address] : []}
              />
            )}
          </div>
        </div>
      </div>

      {/* Switch Button */}
      <button
        className="switch-button"
        onClick={() => {
          if (tokenIn && tokenOut) {
            const tmp = tokenIn;
            setTokenIn(tokenOut);
            setTokenOut(tmp);
          }
        }}
      >
        ↓↑
      </button>

      {/* To */}
      <div className="form-group">
        <label>To (Estimated)</label>
        <div className="input-with-token">
          <input
            type="text"
            value={quoting ? "Loading..." : amountOut}
            disabled
            placeholder="0.0"
          />
          <div className="token-select-wrapper">
            <button
              className="token-selector-button"
              onClick={() => setIsTokenOutSelectorOpen(true)}
            >
              {tokenOut ? (
                <div className="selected-token">
                  <img
                    src={tokenOut.logo}
                    alt={tokenOut.symbol}
                    className="token-logo"
                  />
                  <span>{tokenOut.symbol}</span>
                </div>
              ) : (
                "Select Token"
              )}
            </button>
            {isTokenOutSelectorOpen && (
              <TokenSelector
                isOpen
                onClose={() => setIsTokenOutSelectorOpen(false)}
                onSelect={(t) => {
                  setTokenOut(t);
                  setIsTokenOutSelectorOpen(false);
                }}
                excludeAddresses={tokenIn ? [tokenIn.address] : []}
              />
            )}
          </div>
        </div>
      </div>

      {/* Rate Info */}
      <div className="rate-info">
        {!quoting && tokenIn && tokenOut && +amountIn > 0 && +amountOut > 0 && (
          <div>
            1 {tokenIn.symbol} ≈{" "}
            {(Number(amountOut) / Number(amountIn)).toFixed(6)}{" "}
            {tokenOut.symbol}
          </div>
        )}
      </div>

      {/* Slippage */}
      <div className="form-group slippage-control">
        <label>Slippage Tolerance</label>
        <div className="slippage-options">
          {[0.005, 0.01, 0.02].map((s) => (
            <button
              key={s}
              className={!showCustomSlippage && slippage === s ? "active" : ""}
              onClick={() => {
                setSlippage(s);
                setShowCustomSlippage(false);
                setCustomSlippage("");
              }}
            >
              {(s * 100).toFixed(1)}%
            </button>
          ))}
          <div
            className={`custom-slippage ${showCustomSlippage ? "active" : ""}`}
          >
            <button
              className={showCustomSlippage ? "active" : ""}
              onClick={() => {
                setShowCustomSlippage(true);
                if (!customSlippage)
                  setCustomSlippage(formatSlippage(slippage));
              }}
            >
              Custom
            </button>
            {showCustomSlippage && (
              <div className="custom-slippage-input">
                <input
                  type="text"
                  value={customSlippage}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d.]/g, "");
                    const parts = v.split(".");
                    if (
                      parts.length <= 2 &&
                      (!parts[1] || parts[1].length <= 2) &&
                      +v <= 100
                    ) {
                      setCustomSlippage(v);
                      setSlippage(+v / 100);
                    }
                  }}
                  placeholder="0.0"
                  autoFocus
                />
                <span className="percentage-symbol">%</span>
              </div>
            )}
          </div>
        </div>
        {showCustomSlippage && +customSlippage > 5 && (
          <div className="slippage-warning">
            High slippage tolerance. Your trade may be frontrun.
          </div>
        )}
      </div>

      {/* Fee & Error */}
      {estimatedFee !== null && (
        <div className="fee-estimate">
          Estimated Gas Fee: ${estimatedFee.toFixed(4)} USD
        </div>
      )}
      {error && <div className="error-message">{error}</div>}

      {/* Swap Button */}
      <button
        className="swap-button"
        onClick={swapTokens}
        disabled={
          loading ||
          !wallet.connected ||
          !tokenIn ||
          !tokenOut ||
          +amountIn <= 0 ||
          quoting
        }
      >
        {loading ? "Processing..." : "Swap"}
      </button>

      {/* Connect Prompt */}
      {!wallet.connected && (
        <div className="connect-wallet-prompt">
          Please connect your wallet to perform swaps
        </div>
      )}

      {/* ===== Swap Completed Modal ===== */}
      {txDigest && (
        <div className="tx-success-modal">
          <div className="tx-success-content">
            <h3>🎉 Swap Completed!</h3>
            <p>
              Transaction:&nbsp;
              <a
                href={`https://suiscan.xyz/tx/${txDigest}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {txDigest.slice(0, 6)}…{txDigest.slice(-6)}
              </a>
            </p>
            <button className="tx-close-button" onClick={closeModal}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

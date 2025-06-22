/* ─────────────────────────────────────────────────────────────────────────────
   src/pages/Dex/components/SwapForm.tsx
   ─ Fully–integrated version – ready for the repo ─
   ──────────────────────────────────────────────────────────────────────────── */
import React, { useState, useEffect } from "react";
import {
  useWallet,
  useAccountBalance,
  useSuiProvider,
} from "@suiet/wallet-kit";
import { getQuote, buildTx, estimateGasFee } from "@7kprotocol/sdk-ts";
import BigNumber from "bignumber.js";

/* local components */
import TokenSelector from "./TokenSelector/TokenSelector";

/* hooks / services / styles */
import { useWalletContext } from "../contexts/WalletContext";
import { Token, fetchTokens } from "../services/tokenService";
import "./SwapForm.scss";

/* ─────────────────────────────────────────────────────────────────── */

export default function SwapForm() {
  /* ─────────── hooks ─────────── */
  const wallet = useWallet();
  const provider = useSuiProvider();
  const { balance: suiBalance } = useAccountBalance();
  const { walletState, tokenMetadata, refreshBalances } = useWalletContext();

  /* ─────────── state ─────────── */
  const [tokenIn, setTokenIn] = useState<Token | null>(null);
  const [tokenOut, setTokenOut] = useState<Token | null>(null);

  const [amountIn, setAmountIn] = useState("");
  const [amountOut, setAmountOut] = useState("0");

  const [loading, setLoading] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState("");

  const [slippage, setSlippage] = useState(0.01);
  const [customSlippage, setCustomSlippage] = useState("");
  const [showCustomSlip, setShowCustomSlip] = useState(false);

  const [estimatedFee, setEstimatedFee] = useState<number | null>(null);
  const [suiPrice, setSuiPrice] = useState<number | null>(null);

  const [loadingTokens, setLoadingTokens] = useState(true);
  const [availableTokens, setAvailableTokens] = useState<Token[]>([]);

  const [isInSelectorOpen, setInSelectorOpen] = useState(false);
  const [isOutSelectorOpen, setOutSelectorOpen] = useState(false);

  const [txDigest, setTxDigest] = useState<string | null>(null);

  /* ───────────────── helper: balances → Token[] ───────────────── */
  const balancesToTokens = (): Token[] =>
    walletState.balances.map((b) => {
      const m = tokenMetadata[b.coinType] ?? {};
      const price = Number(m.price) || 0;
      const bal = Number(b.balance) / 10 ** b.decimals;
      return {
        address: b.coinType,
        symbol: b.symbol || m.symbol || "UNKNOWN",
        name: b.name || m.name || "Unknown Token",
        logo: m.logo || "",
        decimals: b.decimals,
        price,
        balance: bal.toString(),
      } as Token;
    });

  /* ───────────────── load tokens when balances / metadata ready ── */
  useEffect(() => {
    (async () => {
      setLoadingTokens(true);
      try {
        const api = await fetchTokens();
        const wallet = balancesToTokens();
        const map = new Map<string, Token>();

        api.forEach((t) => map.set(t.address, t));
        wallet.forEach((t) => {
          if (map.has(t.address)) {
            const ex = map.get(t.address)!;
            map.set(t.address, {
              ...ex,
              balance: t.balance,
              price: t.price || ex.price,
            });
          } else map.set(t.address, t);
        });
        setAvailableTokens(Array.from(map.values()));

        const suiMeta = tokenMetadata["0x2::sui::SUI"];
        setSuiPrice(suiMeta?.price ? Number(suiMeta.price) : 0);
      } catch (e) {
        console.error("token load error", e);
      } finally {
        setLoadingTokens(false);
      }
    })();
  }, [walletState.balances, tokenMetadata]);

  /* ───────────────── %-quick-fill helper ──────────────────────── */
  const handlePct = async (pct: number) => {
    if (!tokenIn || !wallet.account?.address) return;
    try {
      if (tokenIn.address === "0x2::sui::SUI" && suiBalance) {
        const suiBal = parseInt(suiBalance) / 1e9 - 0.05; // reserve gas
        setAmountIn(((suiBal * pct) / 100).toFixed(6));
        return;
      }
      const wBal = walletState.balances.find(
        (b) => b.coinType === tokenIn.address
      );
      if (wBal) {
        const num = Number(wBal.balance) / 10 ** wBal.decimals;
        setAmountIn(((num * pct) / 100).toFixed(6));
        return;
      }
      if (tokenIn.balance) {
        setAmountIn(((+tokenIn.balance * pct) / 100).toFixed(6));
        return;
      }
      const res = await provider.getBalance({
        owner: wallet.account.address,
        coinType: tokenIn.address,
      });
      if (res?.totalBalance) {
        const num = parseInt(res.totalBalance) / 10 ** tokenIn.decimals;
        setAmountIn(((num * pct) / 100).toFixed(6));
      }
    } catch (e) {
      console.error(`handlePct ${pct}`, e);
    }
  };

  /* ───────────────── fallback estimate via prices ─────────────── */
  const priceEstimate = (): string => {
    if (!tokenIn || !tokenOut || !amountIn || +amountIn <= 0) return "0";
    const inP = tokenIn.price,
      outP = tokenOut.price;
    if (!inP || !outP || inP <= 0 || outP <= 0) return "0";
    const out = new BigNumber(amountIn).times(inP).div(outP);
    return out.isFinite() && !out.isNaN() && out.gt(0) ? out.toFixed(6) : "0";
  };

  /* ───────────────── debounce quoting ─────────────────────────── */
  useEffect(() => {
    if (loadingTokens) return;
    const t = setTimeout(() => {
      if (tokenIn && tokenOut && amountIn && +amountIn > 0) quote();
      else {
        setAmountOut("0");
        setEstimatedFee(null);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [tokenIn, tokenOut, amountIn, loadingTokens]);

  /* ───────────────── quote ------------------------------ */
  const quote = async () => {
    try {
      setQuoting(true);
      setError("");
      const inBase = new BigNumber(amountIn)
        .times(10 ** tokenIn!.decimals)
        .toString();
      const qr = await getQuote({
        tokenIn: tokenIn!.address,
        tokenOut: tokenOut!.address,
        amountIn: inBase,
      });
      if (qr) {
        const out = new BigNumber(qr.outAmount)
          .div(10 ** tokenOut!.decimals)
          .toString();
        setAmountOut(isNaN(+out) ? priceEstimate() : out);

        if (wallet.account?.address) {
          try {
            const feeUsd = await estimateGasFee({
              quoteResponse: qr,
              accountAddress: wallet.account.address,
              slippage,
              suiPrice: suiPrice ?? undefined,
              commission: { partner: wallet.account.address, commissionBps: 0 },
            });
            setEstimatedFee(feeUsd);
          } catch (e) {
            console.error("fee", e);
            setEstimatedFee(null);
          }
        }
      } else {
        setAmountOut(priceEstimate());
      }
    } catch (e: any) {
      console.error("quote error", e);
      setError(e.message || "Quote failed");
      setAmountOut("0");
      setEstimatedFee(null);
    } finally {
      setQuoting(false);
    }
  };

  /* ───────────────── execute swap ─────────────────────── */
  const swap = async () => {
    if (!wallet.connected || !tokenIn || !tokenOut || +amountIn <= 0) {
      setError("Missing parameters / wallet not connected");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const inBase = new BigNumber(amountIn)
        .times(10 ** tokenIn.decimals)
        .toString();
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

      setAmountIn("");
      setAmountOut("0");
      setEstimatedFee(null);
      await refreshBalances();
    } catch (e: any) {
      console.error("swap", e);
      setError(e.message || "Swap failed");
    } finally {
      setLoading(false);
    }
  };

  const closeSuccess = () => setTxDigest(null);

  /* ───────────────────────────── JSX ───────────────────────────── */
  return (
    <div className="swap-form">
      <h2>Swap Tokens</h2>

      {/* FROM */}
      <div className="form-group">
        <div className="form-label-row">
          <label>From</label>
          {wallet.connected && (
            <div className="amount-buttons">
              {[25, 50, 75].map((p) => (
                <button
                  key={p}
                  onClick={() => handlePct(p)}
                  className="percent-button"
                >
                  {p}%
                </button>
              ))}
              <button onClick={() => handlePct(100)} className="max-button">
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
              onClick={() => setInSelectorOpen(true)}
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

            {isInSelectorOpen && (
              <TokenSelector
                isOpen
                onClose={() => setInSelectorOpen(false)}
                onSelect={(t) => {
                  setTokenIn({ ...t, price: t.price || 0 });
                  setInSelectorOpen(false);
                }}
                excludeAddresses={tokenOut ? [tokenOut.address] : []}
              />
            )}
          </div>
        </div>
      </div>

      {/* SWITCH */}
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

      {/* TO */}
      <div className="form-group">
        <label>To (Estimated)</label>
        <div className="input-with-token">
          <input
            type="text"
            value={
              quoting
                ? "Calculating…"
                : amountOut === "NaN" || isNaN(+amountOut)
                ? "0"
                : amountOut
            }
            disabled
            placeholder="0.0"
          />
          <div className="token-select-wrapper">
            <button
              className="token-selector-button"
              onClick={() => setOutSelectorOpen(true)}
            >
              {tokenOut ? (
                <div className="selected-token">
                  <img
                    src={tokenOut.logo}
                    alt={tokenOut.symbol}
                    className="token-logo"
                    onError={(e) =>
                      ((e.target as HTMLImageElement).style.display = "none")
                    }
                  />
                  <span>{tokenOut.symbol}</span>
                </div>
              ) : (
                "Select Token"
              )}
            </button>

            {isOutSelectorOpen && (
              <TokenSelector
                isOpen
                onClose={() => setOutSelectorOpen(false)}
                onSelect={(t) => {
                  setTokenOut({ ...t, price: t.price || 0 });
                  setOutSelectorOpen(false);
                }}
                excludeAddresses={tokenIn ? [tokenIn.address] : []}
              />
            )}
          </div>
        </div>
      </div>

      {/* Rate line */}
      <div className="rate-info">
        {!quoting &&
          tokenIn &&
          tokenOut &&
          +amountIn > 0 &&
          +amountOut > 0 &&
          !isNaN(+amountOut) && (
            <div>
              1 {tokenIn.symbol} ≈{" "}
              {new BigNumber(amountOut).div(amountIn).toFixed(6)}{" "}
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
              className={!showCustomSlip && slippage === s ? "active" : ""}
              onClick={() => {
                setSlippage(s);
                setShowCustomSlip(false);
                setCustomSlippage("");
              }}
            >
              {(s * 100).toFixed(1)}%
            </button>
          ))}

          {/* custom */}
          <div className={`custom-slippage ${showCustomSlip ? "active" : ""}`}>
            <button
              onClick={() => {
                setShowCustomSlip(true);
                if (!customSlippage)
                  setCustomSlippage((slippage * 100).toFixed(1));
              }}
            >
              Custom
            </button>
            {showCustomSlip && (
              <div className="custom-slippage-input">
                <input
                  type="text"
                  placeholder="0.0"
                  autoFocus
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
                />
                <span className="percentage-symbol">%</span>
              </div>
            )}
          </div>
        </div>
        {showCustomSlip && +customSlippage > 5 && (
          <div className="slippage-warning">
            High slippage – trade may be frontrun.
          </div>
        )}
      </div>

      {/* Fee & error */}
      {estimatedFee !== null && (
        <div className="fee-estimate">
          Estimated Gas Fee: ${estimatedFee.toFixed(4)} USD
        </div>
      )}
      {error && <div className="error-message">{error}</div>}

      {/* Swap */}
      <button
        className="swap-button"
        onClick={swap}
        disabled={
          loading ||
          !wallet.connected ||
          !tokenIn ||
          !tokenOut ||
          +amountIn <= 0 ||
          quoting
        }
      >
        {loading ? "Processing…" : "Swap"}
      </button>

      {!wallet.connected && (
        <div className="connect-wallet-prompt">
          Please connect your wallet to perform swaps
        </div>
      )}

      {/* Success modal */}
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
            <button className="tx-close-button" onClick={closeSuccess}>
              Close
            </button>
            <div className="powered-by">
              Swap powered by{" "}
              <a
                href="https://port.7k.ag/docs"
                target="_blank"
                rel="noopener noreferrer"
              >
                7K Aggregator
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

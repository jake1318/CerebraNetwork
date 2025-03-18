import { useState, useEffect } from "react";
import {
  useWallet,
  useAccountBalance,
  useSuiProvider,
} from "@suiet/wallet-kit";
import {
  getQuote,
  buildTx,
  estimateGasFee,
  getSuiPrice,
} from "@7kprotocol/sdk-ts";
import BigNumber from "bignumber.js";
import TokenSelector from "./tokenSelector";
import { Token, fetchTokens } from "../services/tokenService";
import "./SwapForm.scss";

export default function SwapForm() {
  const wallet = useWallet();
  const provider = useSuiProvider();
  const { balance: suiBalance } = useAccountBalance();

  const [tokenIn, setTokenIn] = useState<Token | null>(null);
  const [tokenOut, setTokenOut] = useState<Token | null>(null);
  const [amountIn, setAmountIn] = useState("");
  const [amountOut, setAmountOut] = useState("0");
  const [loading, setLoading] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState("");
  const [slippage, setSlippage] = useState(0.01); // 1%
  const [customSlippage, setCustomSlippage] = useState("");
  const [showCustomSlippage, setShowCustomSlippage] = useState(false);
  const [estimatedFee, setEstimatedFee] = useState<number | null>(null);
  const [suiPrice, setSuiPrice] = useState<number | null>(null);
  const [loadingTokens, setLoadingTokens] = useState(true);

  useEffect(() => {
    const loadDefaultTokens = async () => {
      try {
        setLoadingTokens(true);
        const tokens = await fetchTokens();

        if (tokens && tokens.length >= 2) {
          const suiToken = tokens.find((t) => t.symbol === "SUI");
          const usdcToken = tokens.find((t) => t.symbol === "USDC");

          setTokenIn(suiToken || tokens[0]);
          setTokenOut(usdcToken || tokens[1]);
        }

        try {
          const price = await getSuiPrice();
          setSuiPrice(price);
        } catch (priceError) {
          console.error("Error fetching SUI price:", priceError);
          setSuiPrice(null);
        }
      } catch (error) {
        console.error("Error loading default tokens:", error);
      } finally {
        setLoadingTokens(false);
      }
    };

    loadDefaultTokens();
  }, []);

  const handlePercentageClick = async (percentage: number) => {
    if (!tokenIn || !wallet.account?.address) return;

    try {
      if (tokenIn.address === "0x2::sui::SUI" && suiBalance) {
        const balanceInSui = parseInt(suiBalance) / 1e9;
        const maxAmount = Math.max(0, balanceInSui - 0.05);
        const percentAmount = (maxAmount * percentage) / 100;
        setAmountIn(percentAmount.toFixed(4));
        return;
      }

      if (tokenIn.balance) {
        const balance = parseFloat(tokenIn.balance);
        const percentAmount = (balance * percentage) / 100;
        setAmountIn(percentAmount.toFixed(4));
      } else if (provider) {
        const result = await provider.getBalance({
          owner: wallet.account.address,
          coinType: tokenIn.address,
        });

        if (result?.totalBalance) {
          const decimals = tokenIn.decimals;
          const balance =
            parseInt(result.totalBalance) / Math.pow(10, decimals);
          const percentAmount = (balance * percentage) / 100;
          setAmountIn(percentAmount.toFixed(4));
        }
      }
    } catch (error) {
      console.error(`Error setting ${percentage}% amount:`, error);
    }
  };

  const handleCustomSlippageChange = (value: string) => {
    const cleaned = value.replace(/[^\d.]/g, "");

    const parts = cleaned.split(".");
    if (parts.length > 2) return;

    if (parts[1] && parts[1].length > 2) return;

    if (Number(cleaned) > 100) return;

    setCustomSlippage(cleaned);

    if (cleaned && Number(cleaned) > 0) {
      setSlippage(Number(cleaned) / 100);
    }
  };

  const formatSlippage = (slippageValue: number) => {
    return (slippageValue * 100).toFixed(1);
  };

  const getMaxAmount = () => handlePercentageClick(100);

  useEffect(() => {
    if (loadingTokens) return;

    const timer = setTimeout(() => {
      if (tokenIn && tokenOut && amountIn && parseFloat(amountIn) > 0) {
        getQuoteForSwap();
      } else {
        setAmountOut("0");
        setEstimatedFee(null);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [tokenIn, tokenOut, amountIn, loadingTokens]);

  const getQuoteForSwap = async () => {
    if (!tokenIn || !tokenOut || !amountIn || Number(amountIn) <= 0) {
      setAmountOut("0");
      setEstimatedFee(null);
      return;
    }

    try {
      setQuoting(true);
      setError("");

      const decimals = tokenIn.decimals;
      const amountInBaseUnits = new BigNumber(amountIn)
        .times(10 ** decimals)
        .toString();

      const quoteResponse = await getQuote({
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        amountIn: amountInBaseUnits,
      });

      if (quoteResponse) {
        const outDecimals = tokenOut.decimals;
        const outAmount = new BigNumber(quoteResponse.outAmount)
          .div(10 ** outDecimals)
          .toString();
        setAmountOut(outAmount);

        if (wallet.account?.address) {
          try {
            const feeInUsd = await estimateGasFee({
              quoteResponse,
              accountAddress: wallet.account.address,
              slippage,
              suiPrice: suiPrice || undefined,
              commission: {
                partner: wallet.account.address,
                commissionBps: 0,
              },
            });
            setEstimatedFee(feeInUsd);
          } catch (feeErr) {
            console.error("Error estimating fee:", feeErr);
          }
        }
      }
    } catch (err: any) {
      console.error("Error getting quote:", err);
      setError(err.message || "Failed to get quote");
      setAmountOut("0");
      setEstimatedFee(null);
    } finally {
      setQuoting(false);
    }
  };

  const swapTokens = async () => {
    if (!wallet.connected || !wallet.account?.address) {
      setError("Wallet not connected");
      return;
    }

    if (!tokenIn || !tokenOut) {
      setError("Please select tokens");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const decimals = tokenIn.decimals;
      const amountInBaseUnits = new BigNumber(amountIn)
        .times(10 ** decimals)
        .toString();

      const quoteResponse = await getQuote({
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        amountIn: amountInBaseUnits,
      });

      const { tx } = await buildTx({
        quoteResponse,
        accountAddress: wallet.account.address,
        slippage,
        commission: {
          partner: wallet.account.address,
          commissionBps: 0,
        },
      });

      try {
        if (!wallet.signAndExecuteTransactionBlock) {
          throw new Error("Wallet does not support transaction signing");
        }

        const result = await wallet.signAndExecuteTransactionBlock({
          transactionBlock: tx,
        });

        console.log("Swap completed:", result);
        alert("Swap completed successfully!");

        setAmountIn("");
        setAmountOut("0");
        setEstimatedFee(null);
      } catch (txErr: any) {
        console.error("Transaction error:", txErr);
        setError(txErr.message || "Transaction failed");
      }
    } catch (err: any) {
      console.error("Error preparing swap:", err);
      setError(err.message || "Failed to execute swap");
    } finally {
      setLoading(false);
    }
  };

  const switchTokens = () => {
    if (tokenIn && tokenOut) {
      const tempToken = tokenIn;
      setTokenIn(tokenOut);
      setTokenOut(tempToken);
      if (amountIn) {
        setAmountIn(amountIn);
      }
    }
  };

  if (loadingTokens) {
    return (
      <div className="swap-form loading">
        <h2>Loading Tokens...</h2>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="swap-form">
      <h2>Swap Tokens</h2>

      <div className="form-group">
        <div className="form-label-row">
          <label>From</label>
          {wallet.connected && (
            <div className="amount-buttons">
              <button
                className="percent-button"
                onClick={() => handlePercentageClick(25)}
                type="button"
              >
                25%
              </button>
              <button
                className="percent-button"
                onClick={() => handlePercentageClick(50)}
                type="button"
              >
                50%
              </button>
              <button
                className="percent-button"
                onClick={() => handlePercentageClick(75)}
                type="button"
              >
                75%
              </button>
              <button
                className="max-button"
                onClick={getMaxAmount}
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
            <TokenSelector
              onSelect={setTokenIn}
              currentToken={tokenIn || undefined}
              excludeToken={tokenOut || undefined}
            />
          </div>
        </div>
      </div>

      <button
        className="switch-button"
        onClick={switchTokens}
        title="Switch tokens"
      >
        ↓↑
      </button>

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
            <TokenSelector
              onSelect={setTokenOut}
              currentToken={tokenOut || undefined}
              excludeToken={tokenIn || undefined}
            />
          </div>
        </div>
      </div>

      <div className="rate-info">
        {!quoting &&
          tokenIn &&
          tokenOut &&
          Number(amountIn) > 0 &&
          Number(amountOut) > 0 && (
            <div>
              1 {tokenIn.symbol} ≈{" "}
              {(Number(amountOut) / Number(amountIn)).toFixed(6)}{" "}
              {tokenOut.symbol}
            </div>
          )}
      </div>

      <div className="form-group slippage-control">
        <label>Slippage Tolerance</label>
        <div className="slippage-options">
          <button
            className={
              !showCustomSlippage && slippage === 0.005 ? "active" : ""
            }
            onClick={() => {
              setSlippage(0.005);
              setShowCustomSlippage(false);
              setCustomSlippage("");
            }}
            type="button"
          >
            0.5%
          </button>
          <button
            className={!showCustomSlippage && slippage === 0.01 ? "active" : ""}
            onClick={() => {
              setSlippage(0.01);
              setShowCustomSlippage(false);
              setCustomSlippage("");
            }}
            type="button"
          >
            1.0%
          </button>
          <button
            className={!showCustomSlippage && slippage === 0.02 ? "active" : ""}
            onClick={() => {
              setSlippage(0.02);
              setShowCustomSlippage(false);
              setCustomSlippage("");
            }}
            type="button"
          >
            2.0%
          </button>
          <div
            className={`custom-slippage ${showCustomSlippage ? "active" : ""}`}
          >
            <button
              className={showCustomSlippage ? "active" : ""}
              onClick={() => {
                setShowCustomSlippage(true);
                if (!customSlippage) {
                  setCustomSlippage(formatSlippage(slippage));
                }
              }}
              type="button"
            >
              Custom
            </button>
            {showCustomSlippage && (
              <div className="custom-slippage-input">
                <input
                  type="text"
                  value={customSlippage}
                  onChange={(e) => handleCustomSlippageChange(e.target.value)}
                  placeholder="0.0"
                  autoFocus
                />
                <span className="percentage-symbol">%</span>
              </div>
            )}
          </div>
        </div>
        {showCustomSlippage && Number(customSlippage) > 5 && (
          <div className="slippage-warning">
            High slippage tolerance. Your trade may be frontrun.
          </div>
        )}
      </div>

      {estimatedFee !== null && (
        <div className="fee-estimate">
          Estimated Gas Fee: ${estimatedFee.toFixed(4)} USD
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      <button
        className="swap-button"
        onClick={swapTokens}
        disabled={
          loading ||
          !wallet.connected ||
          !wallet.account?.address ||
          !tokenIn ||
          !tokenOut ||
          Number(amountIn) <= 0 ||
          quoting
        }
        type="button"
      >
        {loading ? "Processing..." : "Swap"}
      </button>

      {!wallet.connected && (
        <div className="connect-wallet-prompt">
          Please connect your wallet to perform swaps
        </div>
      )}
    </div>
  );
}

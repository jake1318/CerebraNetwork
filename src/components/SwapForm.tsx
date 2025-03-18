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
import TokenSelector from "./TokenSelector";
import { Token, fetchTokens } from "../services/tokenService";
import "./SwapForm.css";

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
  const [estimatedFee, setEstimatedFee] = useState<number | null>(null);
  const [suiPrice, setSuiPrice] = useState<number | null>(null);
  const [loadingTokens, setLoadingTokens] = useState(true);

  // Load default tokens on component mount
  useEffect(() => {
    const loadDefaultTokens = async () => {
      try {
        setLoadingTokens(true);
        const tokens = await fetchTokens();

        if (tokens && tokens.length >= 2) {
          // Find SUI and USDC tokens
          const suiToken = tokens.find((t) => t.symbol === "SUI");
          const usdcToken = tokens.find((t) => t.symbol === "USDC");

          // Set default tokens
          setTokenIn(suiToken || tokens[0]);
          setTokenOut(usdcToken || tokens[1]);
        }

        // Get SUI price for gas estimations
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

  // Fetch quote when inputs change
  useEffect(() => {
    if (loadingTokens) return;

    const timer = setTimeout(() => {
      if (tokenIn && tokenOut && amountIn && parseFloat(amountIn) > 0) {
        getQuoteForSwap();
      } else {
        setAmountOut("0");
        setEstimatedFee(null);
      }
    }, 500); // Debounce

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

      // Convert amount to base units based on token decimals
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
        // Convert back from base units for display based on token out decimals
        const outDecimals = tokenOut.decimals;
        const outAmount = new BigNumber(quoteResponse.outAmount)
          .div(10 ** outDecimals)
          .toString();
        setAmountOut(outAmount);

        // Estimate gas fee if account is connected
        if (wallet.account?.address) {
          try {
            // Use cached SUI price if available
            const feeInUsd = await estimateGasFee({
              quoteResponse,
              accountAddress: wallet.account.address,
              slippage,
              suiPrice: suiPrice || undefined,
              commission: {
                partner: wallet.account.address, // Using user's address as partner for tracking
                commissionBps: 0,
              },
            });
            setEstimatedFee(feeInUsd);
          } catch (feeErr) {
            console.error("Error estimating fee:", feeErr);
            // Don't set error for fee estimation failure
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

      // Convert amount to base units
      const decimals = tokenIn.decimals;
      const amountInBaseUnits = new BigNumber(amountIn)
        .times(10 ** decimals)
        .toString();

      // Get quote
      const quoteResponse = await getQuote({
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        amountIn: amountInBaseUnits,
      });

      // Build transaction
      const { tx } = await buildTx({
        quoteResponse,
        accountAddress: wallet.account.address,
        slippage,
        commission: {
          partner: wallet.account.address, // Using user's address as partner for tracking
          commissionBps: 0,
        },
      });

      // Sign and execute transaction with Suiet wallet
      try {
        console.log("Executing transaction with wallet:", wallet);
        console.log("Transaction object:", tx);

        // Use the Suiet wallet to execute the transaction
        if (!wallet.signAndExecuteTransactionBlock) {
          throw new Error("Wallet does not support transaction signing");
        }

        // Execute the transaction
        const result = await wallet.signAndExecuteTransactionBlock({
          transactionBlock: tx,
        });

        console.log("Swap completed:", result);
        alert("Swap completed successfully!");

        // Reset input amount after successful swap
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
      // Reset the amount to trigger a new quote
      if (amountIn) {
        setAmountIn(amountIn);
      }
    }
  };

  // Get max amount using Suiet wallet kit
  const getMaxAmount = async () => {
    if (!tokenIn || !wallet.account?.address) return;

    try {
      // If it's SUI token, use the useAccountBalance hook result
      if (tokenIn.address === "0x2::sui::SUI" && suiBalance) {
        // Convert from MIST to SUI (divide by 10^9)
        // Keep a small amount for gas fees (0.05 SUI)
        const balanceInSui = parseInt(suiBalance) / 1e9;
        const maxAmount = Math.max(0, balanceInSui - 0.05).toFixed(4);
        setAmountIn(maxAmount);
        return;
      }

      // For other tokens, use provider to get balance
      if (tokenIn.balance) {
        // If the balance is already in the token object, use it
        setAmountIn(tokenIn.balance);
      } else if (provider) {
        // Otherwise fetch it from the provider
        const result = await provider.getBalance({
          owner: wallet.account.address,
          coinType: tokenIn.address,
        });

        if (result?.totalBalance) {
          const decimals = tokenIn.decimals;
          const formattedBalance = (
            parseInt(result.totalBalance) / Math.pow(10, decimals)
          ).toFixed(4);
          setAmountIn(formattedBalance);
        }
      }
    } catch (error) {
      console.error("Error getting max amount:", error);
    }
  };

  // Render loading state while initializing tokens
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
            <button className="max-button" onClick={getMaxAmount} type="button">
              MAX
            </button>
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
            className={slippage === 0.005 ? "active" : ""}
            onClick={() => setSlippage(0.005)}
            type="button"
          >
            0.5%
          </button>
          <button
            className={slippage === 0.01 ? "active" : ""}
            onClick={() => setSlippage(0.01)}
            type="button"
          >
            1.0%
          </button>
          <button
            className={slippage === 0.02 ? "active" : ""}
            onClick={() => setSlippage(0.02)}
            type="button"
          >
            2.0%
          </button>
        </div>
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

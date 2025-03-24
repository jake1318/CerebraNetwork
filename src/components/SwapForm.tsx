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
import TokenSelector from "./TokenSelector/TokenSelector";
import { useWalletContext } from "../contexts/WalletContext"; // Import WalletContext
import { Token, fetchTokens } from "../services/tokenService";
import "./SwapForm.scss";

export default function SwapForm() {
  const wallet = useWallet();
  const provider = useSuiProvider();
  const { balance: suiBalance } = useAccountBalance();

  // Pull from WalletContext: balances, metadata, formatting helpers, prices
  const { walletState, tokenMetadata, formatBalance, formatUsd, coinPrices } =
    useWalletContext();

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

  // Token selector modals
  const [isTokenInSelectorOpen, setIsTokenInSelectorOpen] = useState(false);
  const [isTokenOutSelectorOpen, setIsTokenOutSelectorOpen] = useState(false);

  // Final merged token list (from wallet + any external API)
  const [availableTokens, setAvailableTokens] = useState<Token[]>([]);

  // Convert wallet balances (from context) to the Token interface
  const convertWalletBalancesToTokens = (): Token[] => {
    if (!walletState.balances || walletState.balances.length === 0) return [];

    return walletState.balances.map((balance) => {
      // Attempt to fetch additional metadata from tokenMetadata
      const metadata = tokenMetadata[balance.coinType] || {};
      const price = coinPrices[balance.coinType] || 0;
      const balanceValue =
        Number(balance.balance) / Math.pow(10, balance.decimals);

      return {
        address: balance.coinType,
        symbol:
          balance.symbol ||
          metadata.symbol ||
          balance.coinType.split("::").pop() ||
          "Unknown",
        name: balance.name || metadata.name || "Unknown Token",
        logo: metadata.logo || "", // Use metadata.logo if provided
        decimals: balance.decimals,
        price: price,
        balance: balanceValue.toString(),
      } as Token;
    });
  };

  // Merge tokens from your local fetchTokens() with the wallet tokens
  useEffect(() => {
    const loadDefaultTokens = async () => {
      try {
        setLoadingTokens(true);

        // 1) Get tokens from some external API (if you want)
        const apiTokens = await fetchTokens();

        // 2) Convert wallet balances to your Token interface
        const walletTokens = convertWalletBalancesToTokens();

        // 3) Combine both lists, deduplicating by address
        const tokensMap = new Map<string, Token>();
        apiTokens.forEach((token) => tokensMap.set(token.address, token));

        walletTokens.forEach((token) => {
          if (tokensMap.has(token.address)) {
            // Merge with existing token data but keep wallet balance
            const existing = tokensMap.get(token.address)!;
            tokensMap.set(token.address, {
              ...existing,
              balance: token.balance, // prefer the wallet's balance
              price: token.price || existing.price,
              // Optionally override name/symbol/logo with wallet's data if needed
            });
          } else {
            tokensMap.set(token.address, token);
          }
        });

        const mergedTokens = Array.from(tokensMap.values());
        console.log("Merged tokens:", mergedTokens);
        setAvailableTokens(mergedTokens);

        // 4) Choose defaults for tokenIn/tokenOut
        if (mergedTokens && mergedTokens.length >= 2) {
          const suiToken = mergedTokens.find((t) => t.symbol === "SUI");
          const usdcToken = mergedTokens.find((t) => t.symbol === "USDC");

          setTokenIn(suiToken || mergedTokens[0]);
          setTokenOut(usdcToken || mergedTokens[1]);
        }

        // 5) Fetch SUI price from the context coinPrices or fallback from SDK
        try {
          if (coinPrices["0x2::sui::SUI"]) {
            setSuiPrice(coinPrices["0x2::sui::SUI"]);
          } else {
            const price = await getSuiPrice();
            setSuiPrice(price);
          }
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
  }, [walletState.balances, tokenMetadata, coinPrices]);

  // Helper to fill input by percentage
  const handlePercentageClick = async (percentage: number) => {
    if (!tokenIn || !wallet.account?.address) return;

    try {
      // If it's SUI, use suiBalance from the Suiet kit
      if (tokenIn.address === "0x2::sui::SUI" && suiBalance) {
        const balanceInSui = parseInt(suiBalance) / 1e9;
        // Keep ~0.05 SUI in wallet for gas
        const maxAmount = Math.max(0, balanceInSui - 0.05);
        const percentAmount = (maxAmount * percentage) / 100;
        setAmountIn(percentAmount.toFixed(4));
        return;
      }

      // Otherwise, find the token in walletState
      const walletToken = walletState.balances.find(
        (b) => b.coinType === tokenIn.address
      );

      if (walletToken) {
        const decimals = walletToken.decimals;
        const balanceNum = Number(walletToken.balance) / Math.pow(10, decimals);
        const percentAmount = (balanceNum * percentage) / 100;
        setAmountIn(percentAmount.toFixed(4));
      } else if (tokenIn.balance) {
        // Fallback to the merged token's stored balance
        const balanceNum = parseFloat(tokenIn.balance);
        const percentAmount = (balanceNum * percentage) / 100;
        setAmountIn(percentAmount.toFixed(4));
      } else if (provider) {
        // Last fallback: direct on-chain query
        const result = await provider.getBalance({
          owner: wallet.account.address,
          coinType: tokenIn.address,
        });
        if (result?.totalBalance) {
          const decimals = tokenIn.decimals;
          const balanceNum =
            parseInt(result.totalBalance) / Math.pow(10, decimals);
          const percentAmount = (balanceNum * percentage) / 100;
          setAmountIn(percentAmount.toFixed(4));
        }
      }
    } catch (error) {
      console.error(`Error setting ${percentage}% amount:`, error);
    }
  };

  // Slippage logic
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

  // Auto-quote after user finishes typing amountIn
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

  // Fetch swap quote
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

  // Execute the swap
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

        // Reset after success
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

  // Switch 'From' and 'To' tokens
  const switchTokens = () => {
    if (tokenIn && tokenOut) {
      const temp = tokenIn;
      setTokenIn(tokenOut);
      setTokenOut(temp);
      if (amountIn) {
        setAmountIn(amountIn);
      }
    }
  };

  // Handle token selection from the TokenSelector
  const handleTokenInSelect = (token: Token) => {
    setTokenIn(token);
    setIsTokenInSelectorOpen(false);
  };

  const handleTokenOutSelect = (token: Token) => {
    setTokenOut(token);
    setIsTokenOutSelectorOpen(false);
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
            <button
              className="token-selector-button"
              onClick={() => setIsTokenInSelectorOpen(true)}
            >
              {tokenIn ? (
                <div className="selected-token">
                  {tokenIn.logo && (
                    <img
                      src={tokenIn.logo}
                      alt={tokenIn.symbol}
                      className="token-logo"
                    />
                  )}
                  <span>{tokenIn.symbol}</span>
                </div>
              ) : (
                "Select Token"
              )}
            </button>
            {isTokenInSelectorOpen && (
              <TokenSelector
                isOpen={isTokenInSelectorOpen}
                onClose={() => setIsTokenInSelectorOpen(false)}
                onSelect={handleTokenInSelect}
                excludeAddresses={tokenOut ? [tokenOut.address] : []}
              />
            )}
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
            <button
              className="token-selector-button"
              onClick={() => setIsTokenOutSelectorOpen(true)}
            >
              {tokenOut ? (
                <div className="selected-token">
                  {tokenOut.logo && (
                    <img
                      src={tokenOut.logo}
                      alt={tokenOut.symbol}
                      className="token-logo"
                    />
                  )}
                  <span>{tokenOut.symbol}</span>
                </div>
              ) : (
                "Select Token"
              )}
            </button>
            {isTokenOutSelectorOpen && (
              <TokenSelector
                isOpen={isTokenOutSelectorOpen}
                onClose={() => setIsTokenOutSelectorOpen(false)}
                onSelect={handleTokenOutSelect}
                excludeAddresses={tokenIn ? [tokenIn.address] : []}
              />
            )}
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

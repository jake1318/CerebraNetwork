import React, { useState, useEffect, useCallback, useRef } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { PoolInfo } from "../services/coinGeckoService";
import kriyadexService from "../services/kriyadexService";
import blockvisionService from "../services/blockvisionService"; // Import BlockVision service
import EnhancedTokenIcon from "./EnhancedTokenIcon";
import { formatNumber } from "../utils/formatters";
import "../styles/components/KriyaDepositModal.scss";

interface KriyaDepositModalProps {
  visible: boolean;
  onCancel: () => void;
  onDeposit: (
    poolId: string,
    amountA: number,
    amountB: number,
    tickLower: number,
    tickUpper: number,
    slippage: number
  ) => Promise<any>;
  poolInfo: PoolInfo | null;
  tokenABalance?: string;
  tokenBBalance?: string;
}

interface BalanceCache {
  lastFetchTime: number;
  address: string;
  tokenABalance: string;
  tokenBBalance: string;
  tokenADecimals: number;
  tokenBDecimals: number;
}

/**
 * Helper function to normalize token amounts based on decimals
 * This replaces the need for blockvisionService.normalizeAmount
 */
const normalizeAmount = (
  amount: string | number,
  decimals: number = 9
): number => {
  // Convert raw blockchain amount (with decimals) to human-readable format
  const amountNum = typeof amount === "string" ? Number(amount) : amount;
  return amountNum / 10 ** decimals;
};

const KriyaDepositModal: React.FC<KriyaDepositModalProps> = ({
  visible,
  onCancel,
  onDeposit,
  poolInfo,
  tokenABalance: initialTokenABalance = "0",
  tokenBBalance: initialTokenBBalance = "0",
}) => {
  const wallet = useWallet();
  const { connected, account } = wallet;
  const refreshDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Cache reference for balance data
  const balanceCacheRef = useRef<BalanceCache>({
    lastFetchTime: 0,
    address: "",
    tokenABalance: "0",
    tokenBBalance: "0",
    tokenADecimals: 9, // Default decimals
    tokenBDecimals: 9, // Default decimals
  });

  // Form state
  const [amountA, setAmountA] = useState<string>("");
  const [amountB, setAmountB] = useState<string>("");
  const [tokenABalance, setTokenABalance] =
    useState<string>(initialTokenABalance);
  const [tokenBBalance, setTokenBBalance] =
    useState<string>(initialTokenBBalance);
  const [tokenADecimals, setTokenADecimals] = useState<number>(9); // Store decimals for accurate MAX
  const [tokenBDecimals, setTokenBDecimals] = useState<number>(9); // Store decimals for accurate MAX
  const [slippage, setSlippage] = useState<number>(0.5);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isFetchingBalances, setIsFetchingBalances] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  // Price range state
  const [rangePreset, setRangePreset] = useState<
    "narrow" | "medium" | "wide" | "custom"
  >("medium");
  const [isCustomRange, setIsCustomRange] = useState<boolean>(false);
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [tickLower, setTickLower] = useState<number>(0);
  const [tickUpper, setTickUpper] = useState<number>(0);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  // Pool data
  const [poolData, setPoolData] = useState<any>(null);
  const [isLoadingPool, setIsLoadingPool] = useState<boolean>(true);
  const [expectedAPR, setExpectedAPR] = useState<number | null>(null);

  /**
   * Fetch token balances from BlockVision API with improved matching logic
   * based on the successful implementation in TurbosDepositModal
   */
  const fetchTokenBalances = useCallback(
    async (forceRefresh = false) => {
      if (!connected || !account?.address || !poolInfo) return;

      const now = Date.now();
      const cache = balanceCacheRef.current;

      // Use cache if available and fresh (less than 30 seconds old) unless force refresh requested
      if (
        !forceRefresh &&
        cache.address === account.address &&
        now - cache.lastFetchTime < 30000
      ) {
        setTokenABalance(cache.tokenABalance);
        setTokenBBalance(cache.tokenBBalance);
        setTokenADecimals(cache.tokenADecimals);
        setTokenBDecimals(cache.tokenBDecimals);
        return;
      }

      try {
        setIsFetchingBalances(true);
        setErrorMessage(""); // Clear any previous errors

        // Get all account coins from BlockVision
        const response = await blockvisionService.getAccountCoins(
          account.address
        );
        const coins = response.data || [];

        console.log("Fetched coins from BlockVision:", coins);

        // Set up variables to track found tokens
        let foundTokenA = null;
        let foundTokenB = null;

        // Get token types/addresses from poolInfo
        const tokenAType = poolInfo.tokenAAddress || poolInfo.tokenA;
        const tokenBType = poolInfo.tokenBAddress || poolInfo.tokenB;

        console.log("Looking for token types:", { tokenAType, tokenBType });

        // STEP 1: Try exact coinType match first (case-insensitive)
        foundTokenA = coins.find(
          (coin) => coin.coinType?.toLowerCase() === tokenAType?.toLowerCase()
        );

        foundTokenB = coins.find(
          (coin) => coin.coinType?.toLowerCase() === tokenBType?.toLowerCase()
        );

        // STEP 2: If not found by coinType, try symbol matching
        if (!foundTokenA) {
          const tokenASymbol =
            poolInfo.tokenA?.split("::")?.pop()?.replace(/"/g, "") ||
            poolInfo.tokenA;

          foundTokenA = coins.find(
            (coin) => coin.symbol?.toLowerCase() === tokenASymbol?.toLowerCase()
          );

          console.log(`Trying to match tokenA by symbol: ${tokenASymbol}`);
        }

        if (!foundTokenB) {
          const tokenBSymbol =
            poolInfo.tokenB?.split("::")?.pop()?.replace(/"/g, "") ||
            poolInfo.tokenB;

          foundTokenB = coins.find(
            (coin) => coin.symbol?.toLowerCase() === tokenBSymbol?.toLowerCase()
          );

          console.log(`Trying to match tokenB by symbol: ${tokenBSymbol}`);
        }

        // Log what we found
        console.log("Found tokens:", {
          tokenA: foundTokenA,
          tokenB: foundTokenB,
        });

        // Update state with found token A balance
        if (foundTokenA) {
          const decimals = foundTokenA.decimals || 9;
          // Use our local normalizeAmount function instead of blockvisionService.normalizeAmount
          const normalizedBalance = normalizeAmount(
            foundTokenA.balance,
            decimals
          );
          setTokenABalance(normalizedBalance.toString());
          setTokenADecimals(decimals);
          console.log(
            `Found ${poolInfo.tokenA} balance:`,
            normalizedBalance.toString(),
            "with decimals:",
            decimals
          );
        } else {
          console.log(`No balance found for ${poolInfo.tokenA}`);
          setTokenABalance(initialTokenABalance);
        }

        // Update state with found token B balance
        if (foundTokenB) {
          const decimals = foundTokenB.decimals || 9;
          // Use our local normalizeAmount function instead of blockvisionService.normalizeAmount
          const normalizedBalance = normalizeAmount(
            foundTokenB.balance,
            decimals
          );
          setTokenBBalance(normalizedBalance.toString());
          setTokenBDecimals(decimals);
          console.log(
            `Found ${poolInfo.tokenB} balance:`,
            normalizedBalance.toString(),
            "with decimals:",
            decimals
          );
        } else {
          console.log(`No balance found for ${poolInfo.tokenB}`);
          setTokenBBalance(initialTokenBBalance);
        }

        // Update cache with all values
        balanceCacheRef.current = {
          lastFetchTime: now,
          address: account.address,
          tokenABalance: foundTokenA
            ? normalizeAmount(
                foundTokenA.balance,
                foundTokenA.decimals || 9
              ).toString()
            : initialTokenABalance,
          tokenBBalance: foundTokenB
            ? normalizeAmount(
                foundTokenB.balance,
                foundTokenB.decimals || 9
              ).toString()
            : initialTokenBBalance,
          tokenADecimals: foundTokenA?.decimals || 9,
          tokenBDecimals: foundTokenB?.decimals || 9,
        };
      } catch (error) {
        console.error("Failed to fetch token balances:", error);

        // More specific error handling based on error type
        if (error.response?.status === 429) {
          setErrorMessage("Rate limit exceeded. Please try again in a moment.");
        } else if (!navigator.onLine) {
          setErrorMessage("Network error. Please check your connection.");
        } else if (error.response?.status === 404) {
          console.log("No tokens found for this address");
        } else {
          // Don't show generic error messages for balance fetching
          console.error("Error fetching balances:", error);
        }

        // Keep initial balances if API call fails
        setTokenABalance(initialTokenABalance);
        setTokenBBalance(initialTokenBBalance);
      } finally {
        setIsFetchingBalances(false);
      }
    },
    [
      connected,
      account?.address,
      poolInfo,
      initialTokenABalance,
      initialTokenBBalance,
    ]
  );

  // Debounced balance refresh function
  const refreshBalances = () => {
    if (refreshDebounceRef.current) {
      clearTimeout(refreshDebounceRef.current);
    }

    refreshDebounceRef.current = setTimeout(() => {
      if (connected && account?.address) {
        fetchTokenBalances(true);
      }
      refreshDebounceRef.current = null;
    }, 300); // 300ms debounce
  };

  // Reset form when modal becomes invisible
  useEffect(() => {
    if (!visible) {
      setAmountA("");
      setAmountB("");
      setErrorMessage("");
      setSuccessMessage("");
      setIsCustomRange(false);
      setRangePreset("medium");
    } else if (poolInfo) {
      fetchPoolData();
      fetchTokenBalances();
    }

    // Clean up any pending timeouts
    return () => {
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current);
      }
    };
  }, [visible, poolInfo, account, fetchTokenBalances]);

  // Fetch pool data from Kriya service
  const fetchPoolData = useCallback(async () => {
    if (!poolInfo) return;

    try {
      setIsLoadingPool(true);

      // Get pool data from Kriya
      const pool = await kriyadexService.getPool(poolInfo.address);

      if (pool) {
        setPoolData(pool);

        // Calculate price range based on current tick
        if (pool.tickCurrent !== undefined) {
          setCurrentPrice(Math.pow(1.0001, pool.tickCurrent));

          // Set default price range (medium)
          updatePriceRangeByPreset(
            "medium",
            pool.tickCurrent,
            pool.tickSpacing || 60
          );
        }

        // Set estimated APR (this is just a placeholder - replace with actual data)
        setExpectedAPR(poolInfo.apr || 5.2);
      }
    } catch (error) {
      console.error("Failed to fetch Kriya pool data:", error);
      setErrorMessage("Failed to load pool data. Please try again later.");
    } finally {
      setIsLoadingPool(false);
    }
  }, [poolInfo]);

  // Update price range based on preset
  const updatePriceRangeByPreset = (
    preset: "narrow" | "medium" | "wide" | "custom",
    currentTick: number = poolData?.tickCurrent || 0,
    tickSpacing: number = poolData?.tickSpacing || 60
  ) => {
    setRangePreset(preset);

    if (preset === "custom") {
      setIsCustomRange(true);
      return;
    }

    setIsCustomRange(false);

    let lowerMultiplier, upperMultiplier;

    switch (preset) {
      case "narrow":
        lowerMultiplier = 4;
        upperMultiplier = 4;
        break;
      case "medium":
        lowerMultiplier = 8;
        upperMultiplier = 8;
        break;
      case "wide":
        lowerMultiplier = 16;
        upperMultiplier = 16;
        break;
      default:
        lowerMultiplier = 8;
        upperMultiplier = 8;
    }

    const newTickLower =
      Math.floor((currentTick - tickSpacing * lowerMultiplier) / tickSpacing) *
      tickSpacing;
    const newTickUpper =
      Math.ceil((currentTick + tickSpacing * upperMultiplier) / tickSpacing) *
      tickSpacing;

    setTickLower(newTickLower);
    setTickUpper(newTickUpper);

    // Calculate min and max prices from ticks
    const minPriceValue = Math.pow(1.0001, newTickLower);
    const maxPriceValue = Math.pow(1.0001, newTickUpper);

    setMinPrice(minPriceValue);
    setMaxPrice(maxPriceValue);
  };

  // Handle custom price inputs
  const handlePriceInput = (type: "min" | "max", value: string) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) return;

    if (type === "min") {
      setMinPrice(numValue);
      // Calculate tick from price: log(price) / log(1.0001)
      const calculatedTick = Math.floor(Math.log(numValue) / Math.log(1.0001));
      setTickLower(calculatedTick);
    } else {
      setMaxPrice(numValue);
      // Calculate tick from price: log(price) / log(1.0001)
      const calculatedTick = Math.ceil(Math.log(numValue) / Math.log(1.0001));
      setTickUpper(calculatedTick);
    }
  };

  // Set amount to max balance
  const handleMaxAmount = (token: "A" | "B") => {
    if (token === "A") {
      // Ensure we're using the correct value (already normalized)
      setAmountA(tokenABalance);
    } else {
      // Ensure we're using the correct value (already normalized)
      setAmountB(tokenBBalance);
    }
  };

  // Handle form submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      setErrorMessage("");
      setSuccessMessage("");

      if (!poolInfo) {
        setErrorMessage("Pool information is missing");
        return;
      }

      if (!connected) {
        setErrorMessage("Please connect your wallet");
        return;
      }

      const numAmountA = parseFloat(amountA);
      const numAmountB = parseFloat(amountB);

      if (
        isNaN(numAmountA) ||
        isNaN(numAmountB) ||
        numAmountA <= 0 ||
        numAmountB <= 0
      ) {
        setErrorMessage("Please enter valid amounts for both tokens");
        return;
      }

      // Check balances
      const balanceA = parseFloat(tokenABalance);
      const balanceB = parseFloat(tokenBBalance);

      if (numAmountA > balanceA) {
        setErrorMessage(`Insufficient ${poolInfo.tokenA} balance`);
        return;
      }

      if (numAmountB > balanceB) {
        setErrorMessage(`Insufficient ${poolInfo.tokenB} balance`);
        return;
      }

      // Validate ticks
      if (tickLower >= tickUpper) {
        setErrorMessage("Min price must be lower than max price");
        return;
      }

      try {
        setIsLoading(true);

        console.log(
          `Depositing ${numAmountA} ${poolInfo.tokenA} and ${numAmountB} ${poolInfo.tokenB}`
        );
        console.log(
          `Tick range: [${tickLower}, ${tickUpper}], Slippage: ${slippage}%`
        );

        const result = await onDeposit(
          poolInfo.address,
          numAmountA,
          numAmountB,
          tickLower,
          tickUpper,
          slippage
        );

        if (result.success) {
          setSuccessMessage(`Successfully added liquidity!`);
          // Refresh balances after successful deposit
          fetchTokenBalances(true);
          setTimeout(() => {
            onCancel();
          }, 2000);
        } else {
          setErrorMessage("Transaction failed. Please try again.");
        }
      } catch (error) {
        console.error("Deposit error:", error);
        setErrorMessage(
          error instanceof Error ? error.message : "Unknown error occurred"
        );
      } finally {
        setIsLoading(false);
      }
    },
    [
      amountA,
      amountB,
      poolInfo,
      connected,
      onDeposit,
      slippage,
      tickLower,
      tickUpper,
      tokenABalance,
      tokenBBalance,
      onCancel,
      fetchTokenBalances,
    ]
  );

  if (!visible) return null;

  return (
    <div className="modal-overlay">
      <div className="deposit-modal kriya-deposit-modal">
        <div className="modal-header">
          <h3>Add Liquidity with KriyaDEX</h3>
          <button className="close-button" onClick={onCancel}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {isLoadingPool ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <div className="loading-text">Loading pool data...</div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="pool-info">
                <div className="token-pair">
                  <div className="token-icons">
                    {poolInfo && (
                      <>
                        <EnhancedTokenIcon
                          symbol={poolInfo.tokenA}
                          logoUrl={poolInfo.tokenALogo}
                          address={poolInfo.tokenAAddress}
                          size="md"
                        />
                        <EnhancedTokenIcon
                          symbol={poolInfo.tokenB}
                          logoUrl={poolInfo.tokenBLogo}
                          address={poolInfo.tokenBAddress}
                          size="md"
                        />
                      </>
                    )}
                  </div>
                  <div className="pair-details">
                    <div className="pair-name">
                      {poolInfo?.tokenA}/{poolInfo?.tokenB}
                    </div>
                    <div className="fee-rate">Fee: 0.3%</div>
                  </div>
                </div>
                <div className="dex-badge kriya">KriyaDEX</div>
                {expectedAPR !== null && (
                  <div className="apr-badge">{expectedAPR.toFixed(2)}% APR</div>
                )}
              </div>

              <div className="input-groups">
                <div className="input-group">
                  <label>{poolInfo?.tokenA} Amount</label>
                  <div className="input-with-max">
                    <input
                      type="number"
                      className="token-input"
                      placeholder="0.0"
                      value={amountA}
                      onChange={(e) => setAmountA(e.target.value)}
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      className="max-button"
                      onClick={() => handleMaxAmount("A")}
                      disabled={isLoading}
                    >
                      MAX
                    </button>
                  </div>
                  <div className="balance-info">
                    <span className="balance-label">Balance:</span>
                    <span className="balance-value">
                      {isFetchingBalances ? (
                        <span className="loading-balance">Loading...</span>
                      ) : (
                        <>
                          {formatNumber(parseFloat(tokenABalance) || 0)}
                          <button
                            className="refresh-button"
                            onClick={(e) => {
                              e.preventDefault();
                              refreshBalances();
                            }}
                            disabled={isFetchingBalances}
                            title="Refresh balance"
                          >
                            ↻
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                </div>

                <div className="input-group">
                  <label>{poolInfo?.tokenB} Amount</label>
                  <div className="input-with-max">
                    <input
                      type="number"
                      className="token-input"
                      placeholder="0.0"
                      value={amountB}
                      onChange={(e) => setAmountB(e.target.value)}
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      className="max-button"
                      onClick={() => handleMaxAmount("B")}
                      disabled={isLoading}
                    >
                      MAX
                    </button>
                  </div>
                  <div className="balance-info">
                    <span className="balance-label">Balance:</span>
                    <span className="balance-value">
                      {isFetchingBalances ? (
                        <span className="loading-balance">Loading...</span>
                      ) : (
                        <>
                          {formatNumber(parseFloat(tokenBBalance) || 0)}
                          <button
                            className="refresh-button"
                            onClick={(e) => {
                              e.preventDefault();
                              refreshBalances();
                            }}
                            disabled={isFetchingBalances}
                            title="Refresh balance"
                          >
                            ↻
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div className="liquidity-range-selector">
                <div className="section-title">Price Range</div>

                <div className="preset-selector">
                  <button
                    type="button"
                    className={`preset-button ${
                      rangePreset === "narrow" ? "active" : ""
                    }`}
                    onClick={() => updatePriceRangeByPreset("narrow")}
                  >
                    Narrow
                  </button>
                  <button
                    type="button"
                    className={`preset-button ${
                      rangePreset === "medium" ? "active" : ""
                    }`}
                    onClick={() => updatePriceRangeByPreset("medium")}
                  >
                    Medium
                  </button>
                  <button
                    type="button"
                    className={`preset-button ${
                      rangePreset === "wide" ? "active" : ""
                    }`}
                    onClick={() => updatePriceRangeByPreset("wide")}
                  >
                    Wide
                  </button>
                  <button
                    type="button"
                    className={`preset-button ${
                      rangePreset === "custom" ? "active" : ""
                    }`}
                    onClick={() => updatePriceRangeByPreset("custom")}
                  >
                    Custom
                  </button>
                </div>

                {currentPrice && (
                  <div className="current-price">
                    <span className="label">Current Price:</span>
                    <span className="value">
                      {formatNumber(currentPrice, 6)} {poolInfo?.tokenB}/
                      {poolInfo?.tokenA}
                    </span>
                  </div>
                )}

                <div className="range-chart">
                  <div className="chart-container">
                    <div className="chart-axis"></div>
                    {currentPrice && (
                      <div
                        className="chart-current-price"
                        style={{ left: "50%" }}
                      ></div>
                    )}
                    {minPrice && maxPrice && currentPrice && (
                      <div
                        className="chart-range"
                        style={{
                          left: `${Math.max(
                            5,
                            Math.min(
                              95,
                              (Math.log(minPrice) /
                                Math.log(currentPrice * 2)) *
                                100 +
                                50
                            )
                          )}%`,
                          right: `${Math.max(
                            5,
                            Math.min(
                              95,
                              100 -
                                ((Math.log(maxPrice) /
                                  Math.log(currentPrice * 2)) *
                                  100 +
                                  50)
                            )
                          )}%`,
                        }}
                      ></div>
                    )}
                  </div>
                </div>

                <div className="price-inputs">
                  <div className="input-group">
                    <label>Min Price</label>
                    <input
                      type="number"
                      className="price-input"
                      value={minPrice?.toString() || ""}
                      onChange={(e) => handlePriceInput("min", e.target.value)}
                      disabled={!isCustomRange || isLoading}
                    />
                    <span className="token-pair">
                      {poolInfo?.tokenB}/{poolInfo?.tokenA}
                    </span>
                  </div>

                  <div className="input-group">
                    <label>Max Price</label>
                    <input
                      type="number"
                      className="price-input"
                      value={maxPrice?.toString() || ""}
                      onChange={(e) => handlePriceInput("max", e.target.value)}
                      disabled={!isCustomRange || isLoading}
                    />
                    <span className="token-pair">
                      {poolInfo?.tokenB}/{poolInfo?.tokenA}
                    </span>
                  </div>
                </div>

                <div className="position-metrics">
                  <div className="metric">
                    <span className="label">Tick Range:</span>
                    <span className="value">
                      {tickLower} to {tickUpper}
                    </span>
                  </div>
                </div>
              </div>

              <div className="slippage-setting">
                <label>Slippage Tolerance</label>
                <div className="slippage-options">
                  <button
                    type="button"
                    className={slippage === 0.1 ? "selected" : ""}
                    onClick={() => setSlippage(0.1)}
                  >
                    0.1%
                  </button>
                  <button
                    type="button"
                    className={slippage === 0.5 ? "selected" : ""}
                    onClick={() => setSlippage(0.5)}
                  >
                    0.5%
                  </button>
                  <button
                    type="button"
                    className={slippage === 1.0 ? "selected" : ""}
                    onClick={() => setSlippage(1.0)}
                  >
                    1.0%
                  </button>
                  <div className="custom-slippage">
                    <input
                      type="number"
                      placeholder="Custom"
                      value={
                        ![0.1, 0.5, 1.0].includes(slippage) ? slippage : ""
                      }
                      onChange={(e) =>
                        setSlippage(parseFloat(e.target.value) || 0.5)
                      }
                      min="0.01"
                      max="20"
                      step="0.01"
                    />
                    <span className="percent-sign">%</span>
                  </div>
                </div>
              </div>

              {errorMessage && (
                <div className="error-message">{errorMessage}</div>
              )}

              {successMessage && (
                <div className="success-message">{successMessage}</div>
              )}

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onCancel}
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!connected || isLoading}
                >
                  {isLoading ? "Processing..." : "Add Liquidity"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default KriyaDepositModal;

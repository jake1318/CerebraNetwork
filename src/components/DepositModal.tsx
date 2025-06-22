// src/components/DepositModal.tsx
// Last Updated: 2025-05-23 22:24:29 UTC by jake1318

import React, { useState, useEffect, useMemo } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { PoolInfo } from "../services/coinGeckoService";
import { formatDollars } from "../utils/formatters";
import blockvisionService, {
  AccountCoin,
} from "../services/blockvisionService";
import { birdeyeService } from "../services/birdeyeService";
import { BN } from "bn.js";
import { initCetusSDK } from "@cetusprotocol/cetus-sui-clmm-sdk";
import { getPoolDetails as getBluefinPool } from "../services/bluefinService";
import TransactionNotification from "./TransactionNotification";
import "../styles/components/DepositModal.scss";

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeposit: (
    amountA: string,
    amountB: string,
    slippage: string,
    tickLower: number,
    tickUpper: number,
    deltaLiquidity: string
  ) => Promise<{ success: boolean; digest: string }>;
  pool: PoolInfo;
  walletConnected: boolean;
}

// Constants for tick range in Sui CLMM implementation
const MAX_TICK = 443636;

// Default tick spacing if we can't get it from the pool
const DEFAULT_TICK_SPACING = 60;

// Flag to prioritize Birdeye API pricing for Cetus pools
const USE_BIRDEYE_FOR_CETUS = true;

const DepositModal: React.FC<DepositModalProps> = ({
  isOpen,
  onClose,
  onDeposit,
  pool,
  walletConnected,
}) => {
  const { account } = useWallet();
  const [amountA, setAmountA] = useState<string>("");
  const [amountB, setAmountB] = useState<string>("");
  const [slippage, setSlippage] = useState<string>("0.5");
  const [balances, setBalances] = useState<Record<string, AccountCoin | null>>({
    [pool.tokenA]: null,
    [pool.tokenB]: null,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [txNotification, setTxNotification] = useState<{
    message: string;
    isSuccess: boolean;
    txDigest?: string;
  } | null>(null);

  // Which token side is fixed
  const [fixedToken, setFixedToken] = useState<"A" | "B" | null>(null);

  // Pool / pricing state
  // Initialize with default values to avoid NaN
  const [tickLower, setTickLower] = useState<number>(0);
  const [tickUpper, setTickUpper] = useState<number>(0);
  const [minPrice, setMinPrice] = useState<string>("0");
  const [maxPrice, setMaxPrice] = useState<string>("0");
  const [leverage, setLeverage] = useState<number>(1);
  const [depositRatio, setDepositRatio] = useState<{
    tokenA: number;
    tokenB: number;
  }>({
    tokenA: 50,
    tokenB: 50,
  });
  const [currentPrice, setCurrentPrice] = useState<number>(0);

  // For liquidity based on SDK calculations
  const [deltaLiquidity, setDeltaLiquidity] = useState<string>("1000000000");

  // On-chain pool object
  const [poolObject, setPoolObject] = useState<any>(null);
  const [currentTick, setCurrentTick] = useState<number>(0);
  const [tickSpacing, setTickSpacing] = useState<number>(DEFAULT_TICK_SPACING);
  const [poolLoaded, setPoolLoaded] = useState<boolean>(false);
  const [sdkError, setSdkError] = useState<string | null>(null);

  // Add state to track pricing source
  const [priceSource, setPriceSource] = useState<
    "onchain" | "birdeye" | "manual"
  >("onchain");

  // Token decimals
  const tokenADecimals = useMemo(() => {
    if (pool.tokenA.toUpperCase() === "USDC") return 6;
    return pool.tokenAMetadata?.decimals || 9;
  }, [pool.tokenA, pool.tokenAMetadata]);
  const tokenBDecimals = useMemo(() => {
    if (pool.tokenB.toUpperCase() === "SUI") return 9;
    return pool.tokenBMetadata?.decimals || 9;
  }, [pool.tokenB, pool.tokenBMetadata]);

  // Check if this is a SUI pair which we know works correctly
  const isSuiPair = useMemo(
    () =>
      pool.tokenA.toUpperCase().includes("SUI") ||
      pool.tokenB.toUpperCase().includes("SUI"),
    [pool.tokenA, pool.tokenB]
  );

  // Check if this is a Turbos pool - if so, redirect to specialized modal
  useEffect(() => {
    // Check if pool is Turbos and redirect if needed
    if (isOpen && pool && pool.dex && pool.dex.toLowerCase() === "turbos") {
      console.log(
        "Detected Turbos pool - should use TurbosDepositModal instead"
      );
      // Close this modal and let the parent component handle the redirect
      onClose();
    }
  }, [isOpen, pool, onClose]);

  // Initialize SDK once and cache it
  const sdk = useMemo(() => {
    if (pool.dex.toLowerCase() === "turbos") {
      // Skip SDK initialization for Turbos pools
      return null;
    }

    try {
      console.log(
        "Initializing Cetus SDK with address:",
        account?.address || "none"
      );
      // Initialize SDK with network and optional wallet address
      const sdkInstance = initCetusSDK({
        network: "mainnet",
        wallet: account?.address || undefined,
      });

      console.log("SDK initialized successfully");
      return sdkInstance;
    } catch (error) {
      console.error("Failed to initialize Cetus SDK:", error);
      setSdkError(
        "Failed to initialize Cetus SDK. Please refresh the page and try again."
      );
      return null;
    }
  }, [account?.address, pool.dex]);

  // Update sender address when wallet changes
  useEffect(() => {
    if (sdk && account?.address) {
      console.log("Setting sender address:", account.address);
      sdk.senderAddress = account.address;
    }
  }, [account?.address, sdk]);

  // Fetch balances & pool data when opened
  useEffect(() => {
    if (isOpen && account?.address) {
      fetchWalletBalances();

      // For non-SUI pools on Cetus, fetch external prices first when enabled
      if (
        USE_BIRDEYE_FOR_CETUS &&
        pool.dex.toLowerCase() === "cetus" &&
        !isSuiPair
      ) {
        console.log("Non-SUI pair detected, prioritizing Birdeye pricing");
        fetchTokenPrices().then((externalPriceSuccess) => {
          // Only fetch pool data if external prices failed
          if (!externalPriceSuccess) {
            fetchPoolData();
          }
        });
      } else {
        // For SUI pairs or when flag is disabled, use original flow
        fetchPoolData();
      }
    }
  }, [isOpen, account?.address, isSuiPair]);

  // Convert display amount → base units BN
  const toBaseUnits = (amount: string, decimals: number): BN => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
      return new BN(0);
    const base = Math.floor(Number(amount) * 10 ** decimals);
    return new BN(base);
  };

  // Calculate delta liquidity when inputs change
  useEffect(() => {
    if (!poolObject || !amountA || !amountB) return;

    try {
      // Convert to base units
      const baseA = toBaseUnits(amountA, tokenADecimals);
      const baseB = toBaseUnits(amountB, tokenBDecimals);

      // Ensure we have valid ticks for calculation
      if (isNaN(tickLower) || isNaN(tickUpper) || tickUpper <= tickLower) {
        console.warn("Invalid ticks for liquidity calculation:", {
          tickLower,
          tickUpper,
        });
        return;
      }

      // Simple liquidity estimation (geometric mean of amounts)
      const estimatedLiquidity = Math.sqrt(
        parseFloat(baseA.toString()) * parseFloat(baseB.toString())
      ).toString();

      setDeltaLiquidity(estimatedLiquidity);
      console.log(
        "Using geometric mean for liquidity calculation:",
        estimatedLiquidity
      );
    } catch (error) {
      console.error("Error calculating liquidity:", error);
      // Set a fallback value to avoid NaN
      const fallbackLiquidity = "1000000000";
      setDeltaLiquidity(fallbackLiquidity);
      console.log("Using default fallback liquidity:", fallbackLiquidity);
    }
  }, [
    amountA,
    amountB,
    tickLower,
    tickUpper,
    poolObject,
    tokenADecimals,
    tokenBDecimals,
  ]);

  /**
   * Calculate correct price from tick index with special handling for problematic pairs
   */
  const calculateCorrectPrice = (
    tickIndex: number,
    decimalsA: number,
    decimalsB: number
  ): number => {
    // Standard formula: price = 1.0001^tick * 10^(decimalsA - decimalsB)
    const rawPrice = Math.pow(1.0001, tickIndex);
    const decimalAdjustment = Math.pow(10, decimalsA - decimalsB);
    let price = rawPrice * decimalAdjustment;

    // For SUI pairs, use standard calculation
    if (isSuiPair) {
      return price;
    }

    // Check if this is a WAL/USDC pool to apply special handling
    const isWalUsdc =
      (pool.tokenA.toUpperCase() === "WAL" &&
        pool.tokenB.toUpperCase() === "USDC") ||
      (pool.tokenA.toUpperCase() === "USDC" &&
        pool.tokenB.toUpperCase() === "WAL");

    if (isWalUsdc) {
      // For WAL/USDC specifically, we know the price should be around 1.5-2 USDC per WAL
      // Check if WAL is token A or token B to get direction correct
      if (pool.tokenA.toUpperCase() === "WAL") {
        // WAL is token A, so price is USDC per WAL
        // Apply correction - divide by special factor for WAL/USDC
        const correctedPrice = price / 1000;
        console.log(
          `Applied WAL/USDC price correction. Original: ${price}, Corrected: ${correctedPrice}`
        );
        return correctedPrice;
      } else {
        // WAL is token B, so price is WAL per USDC
        // Apply correction - multiply by special factor for USDC/WAL
        const correctedPrice = price * 1000;
        console.log(
          `Applied USDC/WAL price correction. Original: ${price}, Corrected: ${correctedPrice}`
        );
        return correctedPrice;
      }
    }

    // For other non-SUI pairs, apply a more general correction
    // Check if price seems very high (indicating potential issue)
    if (price > 100) {
      // Apply a more moderate correction
      const correctedPrice = price / 10;
      console.log(
        `Applied general price correction for non-SUI pair. Original: ${price}, Corrected: ${correctedPrice}`
      );
      return correctedPrice;
    }

    // For other pairs, use the standard formula
    return price;
  };

  // Enhanced fetchTokenPrices to be the primary price source for Cetus pools
  const fetchTokenPrices = async (): Promise<boolean> => {
    try {
      // If no token addresses, can't fetch prices
      if (!pool.tokenAAddress && !pool.tokenAMetadata?.address) {
        return false;
      }
      if (!pool.tokenBAddress && !pool.tokenBMetadata?.address) {
        return false;
      }

      const aAddr = pool.tokenAAddress || pool.tokenAMetadata?.address!;
      const bAddr = pool.tokenBAddress || pool.tokenBMetadata?.address!;

      console.log(
        `Fetching token prices from Birdeye API for ${pool.tokenA} (${aAddr}) and ${pool.tokenB} (${bAddr})`
      );

      const [aData, bData] = await Promise.all([
        birdeyeService.getPriceVolumeSingle(aAddr),
        birdeyeService.getPriceVolumeSingle(bAddr),
      ]);

      console.log("Birdeye token price data:", {
        [pool.tokenA]: aData,
        [pool.tokenB]: bData,
      });

      const pa = aData.price ?? aData.data?.price;
      const pb = bData.price ?? bData.data?.price;

      if (pa && pb) {
        // Calculate price ratio using USD values
        const priceRatio =
          parseFloat(pb.toString()) / parseFloat(pa.toString());
        console.log(
          `Setting price from Birdeye API: ${priceRatio} ${pool.tokenB} per ${pool.tokenA}`
        );

        setCurrentPrice(priceRatio);
        setPriceSource("birdeye");

        // Since we have the price, we can initialize the liquidity range
        initializeLiquidityRange(priceRatio);
        setPoolLoaded(true);

        // Also fetch the pool data for tick spacing and other non-price info
        await fetchPoolMetadata();

        return true;
      }

      return false;
    } catch (e) {
      console.error("fetchTokenPrices failed:", e);
      return false;
    }
  };

  // Separate function to fetch just the pool metadata, not price
  const fetchPoolMetadata = async () => {
    try {
      if (!pool.address || !sdk) return;

      console.log(`Fetching pool metadata for address: ${pool.address}`);
      const pd = await sdk.Pool.getPool(pool.address);
      if (!pd) {
        console.warn("Pool not found, but continuing with external pricing");
        return;
      }

      setPoolObject(pd);

      const ct = parseInt(pd.current_tick_index);
      const ts = parseInt(pd.tick_spacing) || DEFAULT_TICK_SPACING;
      setCurrentTick(ct);
      setTickSpacing(ts);

      // We're not setting price here as we're using Birdeye price
    } catch (e) {
      console.error("fetchPoolMetadata failed:", e);
    }
  };

  // Modified fetchPoolData to be the fallback when external prices aren't available
  const fetchPoolData = async () => {
    if (!pool.address) return;
    setLoading(true);
    setSdkError(null);

    try {
      /* -------------------------------------------------------- *
       * 1) BLUEFIN POOLS → call backend helper, skip Cetus SDK   *
       * -------------------------------------------------------- */
      if (pool.dex.toLowerCase() === "bluefin") {
        const bluefin = await getBluefinPool(pool.address);
        if (!bluefin) throw new Error("Bluefin pool not found");

        const ts = bluefin.parsed.tickSpacing ?? DEFAULT_TICK_SPACING;

        // helper: convert unsigned -> signed 32-bit (two's complement)
        const toSignedI32 = (u: number) =>
          u & 0x80000000 ? u - 0x100000000 : u;

        // `bits` is u32, turn it back into a signed tick
        const bits =
          bluefin.rawData.content.fields.current_tick_index.fields.bits;
        const ct = toSignedI32(Number(bits));

        setCurrentTick(ct);
        setTickSpacing(ts);

        // Use the corrected price calculation
        const price = calculateCorrectPrice(ct, tokenADecimals, tokenBDecimals);
        setCurrentPrice(price);
        setPriceSource("onchain");

        initializeLiquidityRange(price, ct, ts);
        setPoolLoaded(true);
        return; // ← DONE for Bluefin branch
      }

      /* -------------------------------------------------------- *
       * 2) NON-BLUEFIN → use Cetus SDK logic                    *
       * -------------------------------------------------------- */
      if (!sdk) throw new Error("Cetus SDK not initialized");

      console.log(`Fetching pool data for address: ${pool.address}`);
      const pd = await sdk.Pool.getPool(pool.address);
      if (!pd) throw new Error("Pool not found");

      setPoolObject(pd);

      const ct = parseInt(pd.current_tick_index);
      const ts = parseInt(pd.tick_spacing) || DEFAULT_TICK_SPACING;
      setCurrentTick(ct);
      setTickSpacing(ts);

      // Use the corrected price calculation, but treat as fallback
      const price = calculateCorrectPrice(ct, tokenADecimals, tokenBDecimals);
      console.log(`Using on-chain price: ${price} (fallback)`);
      setCurrentPrice(price);
      setPriceSource("onchain");

      initializeLiquidityRange(price, ct, ts);
      setPoolLoaded(true);
    } catch (e) {
      console.error("fetchPoolData failed:", e);
      setSdkError(
        "Failed to load pool data. " + (e instanceof Error ? e.message : "")
      );
      await fetchTokenPrices(); // attempt one more try with external prices
    } finally {
      setLoading(false);
    }
  };

  // Add a refresh button for pricing
  const refreshPricing = async () => {
    setLoading(true);
    const success = await fetchTokenPrices();
    if (!success) {
      // If external pricing fails, fall back to on-chain
      await fetchPoolData();
    }
    setLoading(false);
  };

  // Fetch balances
  const fetchWalletBalances = async () => {
    if (!account?.address) return;
    setLoading(true);
    try {
      const { data: coins } = await blockvisionService.getAccountCoins(
        account.address
      );
      const a = coins.find(
        (c) => c.symbol.toUpperCase() === pool.tokenA.toUpperCase()
      );
      const b = coins.find(
        (c) => c.symbol.toUpperCase() === pool.tokenB.toUpperCase()
      );
      setBalances({ [pool.tokenA]: a || null, [pool.tokenB]: b || null });
    } catch (e) {
      console.error("fetchWalletBalances failed:", e);
    } finally {
      setLoading(false);
    }
  };

  // Initialize liquidity range
  const initializeLiquidityRange = (
    price: number,
    ct?: number,
    sp?: number
  ) => {
    if (!price) return;

    try {
      const spacing = sp && !isNaN(sp) && sp > 0 ? sp : DEFAULT_TICK_SPACING;
      let low: number, high: number;

      if (ct !== undefined && !isNaN(ct)) {
        // Calculate directly from current tick with spacing
        low = Math.floor((ct - 10 * spacing) / spacing) * spacing;
        high = Math.ceil((ct + 10 * spacing) / spacing) * spacing;

        console.log(
          `Calculated tick range from current tick ${ct}: ${low} to ${high}`
        );
      } else {
        // Calculate from price manually
        const lowP = price * 0.75;
        const highP = price * 1.25;

        const lowTick = Math.floor(
          Math.log(lowP * Math.pow(10, tokenBDecimals - tokenADecimals)) /
            Math.log(1.0001)
        );
        const highTick = Math.ceil(
          Math.log(highP * Math.pow(10, tokenBDecimals - tokenADecimals)) /
            Math.log(1.0001)
        );

        low = Math.floor(lowTick / spacing) * spacing;
        high = Math.ceil(highTick / spacing) * spacing;

        console.log(
          `Calculated tick range from price ${price}: ${low} to ${high}`
        );
      }

      // Ensure minimum spacing and valid values (not NaN)
      if (isNaN(low) || isNaN(high)) {
        console.warn("Calculated invalid tick range, using defaults");
        // Fallback to defaults
        low = 0;
        high = spacing * 10;
      }

      if (high - low < spacing) {
        high = low + spacing;
      }

      // Make sure we have integer values for ticks
      low = Math.floor(low);
      high = Math.floor(high);

      console.log(`Setting tick range: lower=${low}, upper=${high}`);
      setTickLower(low);
      setTickUpper(high);

      // Calculate prices from the ticks using the corrected price calculation
      try {
        const snappedLowPrice = calculateCorrectPrice(
          low,
          tokenADecimals,
          tokenBDecimals
        );
        const snappedHighPrice = calculateCorrectPrice(
          high,
          tokenADecimals,
          tokenBDecimals
        );

        setMinPrice(snappedLowPrice.toFixed(6));
        setMaxPrice(snappedHighPrice.toFixed(6));

        console.log(`Price range: ${snappedLowPrice} - ${snappedHighPrice}`);
      } catch (error) {
        console.error("Error calculating price from ticks:", error);
        setMinPrice("0.001000");
        setMaxPrice("5.000000");
      }
    } catch (error) {
      console.error("Error in initializeLiquidityRange:", error);
      // Set safe defaults
      setTickLower(0);
      setTickUpper(DEFAULT_TICK_SPACING * 10);
      setMinPrice("0.001000");
      setMaxPrice("5.000000");
    }
  };

  // Handle amount inputs
  const handleAmountAChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/[^0-9.]/g, "");
    if ((v.match(/\./g) || []).length > 1) return;
    setAmountA(v);
    setFixedToken("A");

    // Auto-compute token B amount if price is available
    if (currentPrice > 0 && v !== "") {
      // Normal pools: price = tokenB per tokenA
      setAmountB((Number(v) * currentPrice).toFixed(6));
      console.log(
        `Normal calculation: ${v} ${pool.tokenA} → ${
          Number(v) * currentPrice
        } ${pool.tokenB}`
      );
    } else {
      setAmountB("");
    }
  };

  const handleAmountBChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/[^0-9.]/g, "");
    if ((v.match(/\./g) || []).length > 1) return;
    setAmountB(v);
    setFixedToken("B");

    // Auto-compute token A amount if price is available
    if (currentPrice > 0 && v !== "") {
      // Normal pools
      setAmountA((Number(v) / currentPrice).toFixed(6));
      console.log(
        `Normal calculation: ${v} ${pool.tokenB} → ${
          Number(v) / currentPrice
        } ${pool.tokenA}`
      );
    } else {
      setAmountA("");
    }
  };

  const handleMaxAClick = () => {
    const b = balances[pool.tokenA];
    if (!b) return;
    const max = (parseInt(b.balance) / 10 ** b.decimals).toString();
    setAmountA(max);
    setFixedToken("A");

    // Auto-compute token B amount
    if (currentPrice > 0) {
      setAmountB((Number(max) * currentPrice).toFixed(6));
    }
  };

  const handleMaxBClick = () => {
    const b = balances[pool.tokenB];
    if (!b) return;
    const max = (parseInt(b.balance) / 10 ** b.decimals).toString();
    setAmountB(max);
    setFixedToken("B");

    // Auto-compute token A amount
    if (currentPrice > 0) {
      setAmountA((Number(max) / currentPrice).toFixed(6));
    }
  };

  // Price input handlers
  const onMinPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const v = e.target.value;
      setMinPrice(v);

      const n = Number(v);
      if (isNaN(n) || n <= 0) return;

      // Use direct math calculation for reliability
      const t = Math.floor(
        Math.log(n * Math.pow(10, tokenBDecimals - tokenADecimals)) /
          Math.log(1.0001)
      );
      const spacing =
        isNaN(tickSpacing) || tickSpacing <= 0
          ? DEFAULT_TICK_SPACING
          : tickSpacing;
      const s = Math.floor(t / spacing) * spacing;

      if (isNaN(s)) {
        console.error("Calculated invalid tick value:", s);
        return;
      }

      // Check if the new tick is valid compared to upper tick
      if (!isNaN(tickUpper) && tickUpper > s && tickUpper - s < spacing) return;

      console.log(`Setting lower tick to ${s} from price ${n}`);
      setTickLower(s);

      // Update display price to match the actual tick using corrected calculation
      const actualPrice = calculateCorrectPrice(
        s,
        tokenADecimals,
        tokenBDecimals
      );
      if (!isNaN(actualPrice)) {
        setMinPrice(actualPrice.toFixed(6));
      }
    } catch (error) {
      console.error("Error in min price change:", error);
    }
  };

  const onMaxPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const v = e.target.value;
      setMaxPrice(v);

      const n = Number(v);
      if (isNaN(n) || n <= 0) return;

      // Use direct math calculation for reliability
      const t = Math.floor(
        Math.log(n * Math.pow(10, tokenBDecimals - tokenADecimals)) /
          Math.log(1.0001)
      );
      const spacing =
        isNaN(tickSpacing) || tickSpacing <= 0
          ? DEFAULT_TICK_SPACING
          : tickSpacing;
      const s = Math.ceil(t / spacing) * spacing;

      if (isNaN(s)) {
        console.error("Calculated invalid tick value:", s);
        return;
      }

      // Check if the new tick is valid compared to lower tick
      if (!isNaN(tickLower) && s > tickLower && s - tickLower < spacing) return;

      console.log(`Setting upper tick to ${s} from price ${n}`);
      setTickUpper(s);

      // Update display price to match the actual tick using corrected calculation
      const actualPrice = calculateCorrectPrice(
        s,
        tokenADecimals,
        tokenBDecimals
      );
      if (!isNaN(actualPrice)) {
        setMaxPrice(actualPrice.toFixed(6));
      }
    } catch (error) {
      console.error("Error in max price change:", error);
    }
  };

  // Set to full range following Cetus documentation guidance
  const setFullRange = async () => {
    try {
      // Make sure we have a valid tickSpacing
      const spacing =
        isNaN(tickSpacing) || tickSpacing <= 0
          ? DEFAULT_TICK_SPACING
          : tickSpacing;
      console.log(`Using tick spacing ${spacing} for full range`);

      // Following the exact Cetus documentation formula for full range:
      // tickLower: -443636 + (443636 % tickSpacing)
      // tickUpper: 443636 - (443636 % tickSpacing)
      const remainder = MAX_TICK % spacing;
      const tickLower = -MAX_TICK + remainder;
      const tickUpper = MAX_TICK - remainder;

      console.log(`Setting full range ticks: ${tickLower} to ${tickUpper}`);
      console.log(
        `Tick calculation: -${MAX_TICK} + (${MAX_TICK} % ${spacing} = ${remainder}) = ${tickLower}`
      );
      console.log(
        `Tick calculation: ${MAX_TICK} - (${MAX_TICK} % ${spacing} = ${remainder}) = ${tickUpper}`
      );

      setTickLower(tickLower);
      setTickUpper(tickUpper);

      // Calculate prices using corrected calculation
      try {
        const lowerPrice = calculateCorrectPrice(
          tickLower,
          tokenADecimals,
          tokenBDecimals
        );
        const upperPrice = calculateCorrectPrice(
          tickUpper,
          tokenADecimals,
          tokenBDecimals
        );

        // For UI display, we might want to format very small/large numbers specially
        let formattedLowerPrice, formattedUpperPrice;

        // For very small numbers, use fixed precision to avoid scientific notation
        if (lowerPrice < 0.000001) {
          formattedLowerPrice = "0.000001";
        } else {
          formattedLowerPrice = lowerPrice.toFixed(6);
        }

        // For very large numbers, cap at a reasonable display value
        if (upperPrice > 1000000) {
          formattedUpperPrice = "1000000.000000";
        } else {
          formattedUpperPrice = upperPrice.toFixed(6);
        }

        setMinPrice(formattedLowerPrice);
        setMaxPrice(formattedUpperPrice);
        console.log(
          `Full range prices: ${lowerPrice} to ${upperPrice} (displayed as ${formattedLowerPrice} to ${formattedUpperPrice})`
        );
      } catch (error) {
        console.error("Error calculating full range prices:", error);
        // Set reasonable defaults that work for typical token decimals
        setMinPrice("0.000001");
        setMaxPrice("1000000.000000");
      }
    } catch (error) {
      console.error("Error in setFullRange:", error);
      // Use hardcoded fallbacks that are very likely to work
      setTickLower(-443636); // Max negative tick
      setTickUpper(443636); // Max positive tick
      setMinPrice("0.000001");
      setMaxPrice("1000000.000000");
    }
  };

  // Add a refresh button for pricing
  const renderPriceSource = () => {
    return (
      <div className="price-source">
        <span className={`source-tag ${priceSource}`}>
          {priceSource === "birdeye"
            ? "Market Price"
            : priceSource === "onchain"
            ? "On-Chain Price"
            : "Manual Price"}
        </span>
        <button
          type="button"
          className="refresh-price-btn"
          onClick={refreshPricing}
          disabled={isSubmitting}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          Refresh
        </button>
      </div>
    );
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amountA || !amountB) return;

    // Final validation to ensure we have valid tick values
    if (isNaN(tickLower) || isNaN(tickUpper) || tickUpper <= tickLower) {
      setTxNotification({
        message: `Invalid price range. Please click "Full Range" and try again.`,
        isSuccess: false,
      });
      return;
    }

    // Check for minimum tick spacing
    const spacing =
      isNaN(tickSpacing) || tickSpacing <= 0
        ? DEFAULT_TICK_SPACING
        : tickSpacing;
    if (tickUpper - tickLower < spacing) {
      setTxNotification({
        message: `Price range too narrow. Minimum allowed: ${spacing} ticks.`,
        isSuccess: false,
      });
      return;
    }

    // Make sure ticks are within allowed range
    const maxAllowedTick = MAX_TICK;
    if (tickLower < -maxAllowedTick || tickUpper > maxAllowedTick) {
      setTxNotification({
        message: `Selected price range is outside allowed bounds. Please use "Full Range" or select a narrower range.`,
        isSuccess: false,
      });
      return;
    }

    // Ensure ticks are multiples of the tick spacing
    if (tickLower % spacing !== 0 || tickUpper % spacing !== 0) {
      setTxNotification({
        message: `Invalid ticks. Ticks must be multiples of ${spacing}. Please use "Full Range" or adjust your range.`,
        isSuccess: false,
      });
      return;
    }

    // Sanity check the tick values
    console.log(`Submitting with tick range: ${tickLower} to ${tickUpper}`);

    // Ensure we have a valid delta liquidity value
    if (!deltaLiquidity || deltaLiquidity === "0") {
      try {
        // Calculate a simple estimate based on token amounts
        const baseA = Math.floor(Number(amountA) * 10 ** tokenADecimals);
        const baseB = Math.floor(Number(amountB) * 10 ** tokenBDecimals);

        const estimatedLiquidity = Math.sqrt(baseA * baseB).toString();
        setDeltaLiquidity(estimatedLiquidity);
      } catch (error) {
        console.error("Error in final liquidity calculation:", error);
        // Set a fallback value that should be reasonable
        const fallbackLiquidity = "1000000000";
        setDeltaLiquidity(fallbackLiquidity);
      }
    }

    setIsSubmitting(true);
    setTxNotification({ message: "Processing deposit…", isSuccess: true });

    try {
      const result = await onDeposit(
        amountA,
        amountB,
        slippage,
        tickLower,
        tickUpper,
        deltaLiquidity
      );

      if (result.success) {
        setTxNotification({
          message: `Successfully deposited ${amountA} ${pool.tokenA} and ${amountB} ${pool.tokenB}`,
          isSuccess: true,
          txDigest: result.digest,
        });
        setAmountA("");
        setAmountB("");
      } else {
        throw new Error("Transaction failed");
      }
    } catch (err: any) {
      let msg = err.message || "Deposit error";

      if (msg.includes("repay_add_liquidity")) {
        msg =
          "Failed to add liquidity. The provided token amounts don't match the required ratio for this price range.";
      } else if (
        msg.includes("check_position_tick_range") ||
        (msg.includes("MoveAbort") &&
          msg.includes("position") &&
          msg.includes("5"))
      ) {
        msg =
          "Invalid price range. Please try using a narrower range or click 'Full Range' and try again.";
      } else if (msg.includes("token_amount_max_exceed")) {
        msg =
          "Token amount exceeds the maximum required. Try reducing your slippage tolerance.";
      } else if (msg.includes("liquidity_is_zero")) {
        msg =
          "The resulting liquidity would be zero. Try increasing your deposit amounts.";
      } else if (msg.includes("Cannot convert NaN to a BigInt")) {
        msg =
          "Invalid price range values. Please use the 'Full Range' button or select a valid price range.";
      }

      setTxNotification({
        message: `Deposit failed: ${msg}`,
        isSuccess: false,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatBalance = (tk: string): string => {
    const b = balances[tk];
    if (!b) return "...";
    const v = parseInt(b.balance) / 10 ** b.decimals;
    return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  };

  const isSubmitDisabled =
    !amountA ||
    !amountB ||
    !walletConnected ||
    isSubmitting ||
    isNaN(tickLower) ||
    isNaN(tickUpper) ||
    tickUpper <= tickLower ||
    (tickSpacing > 0 && tickUpper - tickLower < tickSpacing);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="deposit-modal">
        <div className="modal-header">
          <h3>Deposit Liquidity</h3>
          <button className="close-button" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path
                d="M18 6L6 18M6 6L18 18"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          </button>
        </div>

        {txNotification?.txDigest ? (
          <div className="success-confirmation">
            <div className="success-check-icon">
              <svg
                width="80"
                height="80"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="11"
                  stroke="#2EC37C"
                  strokeWidth="2"
                />
                <path
                  d="M7 12L10 15L17 8"
                  stroke="#2EC37C"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <h2 className="success-title">Deposit Successful!</h2>

            <p className="success-message">
              Added liquidity to {pool.tokenA}/{pool.tokenB}
            </p>

            <p className="transaction-id">
              Transaction ID: {txNotification.txDigest}
            </p>

            <div className="success-actions">
              <a
                href={`https://suivision.xyz/txblock/${txNotification.txDigest}`}
                target="_blank"
                rel="noopener noreferrer"
                className="view-tx-link"
              >
                View on SuiVision
              </a>

              <button className="done-button" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="modal-body">
              {/* Pool Info */}
              <div className="pool-info">
                <div className="token-pair">
                  <div className="token-icons">
                    <div className="token-icon">
                      {pool.tokenAMetadata?.logo_uri ? (
                        <img
                          src={pool.tokenAMetadata.logo_uri}
                          alt={pool.tokenA}
                        />
                      ) : (
                        <span>{pool.tokenA[0]}</span>
                      )}
                    </div>
                    <div className="token-icon">
                      {pool.tokenBMetadata?.logo_uri ? (
                        <img
                          src={pool.tokenBMetadata.logo_uri}
                          alt={pool.tokenB}
                        />
                      ) : (
                        <span>{pool.tokenB[0]}</span>
                      )}
                    </div>
                  </div>
                  <div className="pair-details">
                    <div className="pair-name">
                      {pool.tokenA} / {pool.tokenB}
                    </div>
                  </div>
                </div>
                <div className="dex-badge">{pool.dex}</div>
              </div>

              {/* Price Range */}
              <div className="liquidity-range-selector">
                <h4 className="section-title">Select Price Range</h4>
                <div className="current-price">
                  <span className="label">Current Price:</span>
                  <span className="value">
                    {(currentPrice || 0).toFixed(6)} {pool.tokenB} per{" "}
                    {pool.tokenA}
                  </span>
                </div>

                {renderPriceSource()}

                {/* Full Range Button */}
                <div className="range-presets" style={{ marginBottom: "10px" }}>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={setFullRange}
                    disabled={isSubmitting}
                  >
                    Full Range
                  </button>
                </div>

                <div className="price-inputs">
                  <div className="input-group">
                    <label htmlFor="min-price">Min Price</label>
                    <input
                      id="min-price"
                      type="text"
                      value={minPrice}
                      onChange={onMinPriceChange}
                      className="price-input"
                    />
                    <span className="token-pair">
                      {pool.tokenB} per {pool.tokenA}
                    </span>
                  </div>
                  <div className="input-group">
                    <label htmlFor="max-price">Max Price</label>
                    <input
                      id="max-price"
                      type="text"
                      value={maxPrice}
                      onChange={onMaxPriceChange}
                      className="price-input"
                    />
                    <span className="token-pair">
                      {pool.tokenB} per {pool.tokenA}
                    </span>
                  </div>
                </div>

                {/* Tick Values Display (Debug) */}
                <div
                  style={{
                    fontSize: "12px",
                    color: "#666",
                    marginTop: "5px",
                    textAlign: "center",
                  }}
                >
                  Tick Range: {tickLower} to {tickUpper}
                </div>
              </div>

              {/* Amount Inputs */}
              <div className="input-groups">
                <div className="input-group">
                  <label htmlFor="tokenA-amount">
                    Enter {pool.tokenA} amount:
                  </label>
                  <div className="input-with-max">
                    <input
                      id="tokenA-amount"
                      type="text"
                      value={amountA}
                      onChange={handleAmountAChange}
                      disabled={isSubmitting}
                      className={`token-input ${
                        fixedToken === "A" ? "fixed" : ""
                      }`}
                      placeholder="0.0"
                    />
                    <button
                      type="button"
                      className="max-button"
                      onClick={handleMaxAClick}
                      disabled={!balances[pool.tokenA] || isSubmitting}
                    >
                      MAX
                    </button>
                  </div>
                  <div className="balance-info">
                    <span className="balance-label">Balance:</span>
                    <span className="balance-value">
                      {formatBalance(pool.tokenA)} {pool.tokenA}
                    </span>
                  </div>
                </div>

                <div className="input-group">
                  <label htmlFor="tokenB-amount">
                    Enter {pool.tokenB} amount:
                  </label>
                  <div className="input-with-max">
                    <input
                      id="tokenB-amount"
                      type="text"
                      value={amountB}
                      onChange={handleAmountBChange}
                      disabled={isSubmitting}
                      className={`token-input ${
                        fixedToken === "B" ? "fixed" : ""
                      }`}
                      placeholder="0.0"
                    />
                    <button
                      type="button"
                      className="max-button"
                      onClick={handleMaxBClick}
                      disabled={!balances[pool.tokenB] || isSubmitting}
                    >
                      MAX
                    </button>
                  </div>
                  <div className="balance-info">
                    <span className="balance-label">Balance:</span>
                    <span className="balance-value">
                      {formatBalance(pool.tokenB)} {pool.tokenB}
                    </span>
                  </div>
                </div>
              </div>

              {/* Slippage */}
              <div className="slippage-setting">
                <label>Slippage Tolerance:</label>
                <div className="slippage-options">
                  <button
                    type="button"
                    className={slippage === "0.1" ? "selected" : ""}
                    onClick={() => setSlippage("0.1")}
                    disabled={isSubmitting}
                  >
                    0.1%
                  </button>
                  <button
                    type="button"
                    className={slippage === "0.5" ? "selected" : ""}
                    onClick={() => setSlippage("0.5")}
                    disabled={isSubmitting}
                  >
                    0.5%
                  </button>
                  <button
                    type="button"
                    className={slippage === "1" ? "selected" : ""}
                    onClick={() => setSlippage("1")}
                    disabled={isSubmitting}
                  >
                    1%
                  </button>
                  <div className="custom-slippage">
                    <input
                      type="text"
                      value={slippage}
                      onChange={(e) =>
                        setSlippage(e.target.value.replace(/[^0-9.]/g, ""))
                      }
                      placeholder="Custom"
                      disabled={isSubmitting}
                    />
                    <span className="percent-sign">%</span>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="summary-panel">
                <div className="summary-item">
                  <span className="item-label">Estimated APR:</span>
                  <span className="item-value highlight">
                    {pool.apr.toFixed(2)}%
                  </span>
                </div>
                <div className="summary-item">
                  <span className="item-label">Pool Liquidity:</span>
                  <span className="item-value">
                    {formatDollars(pool.liquidityUSD)}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="item-label">24h Volume:</span>
                  <span className="item-value">
                    {formatDollars(pool.volumeUSD)}
                  </span>
                </div>
              </div>

              {/* Wallet Warning */}
              {!walletConnected && (
                <div className="wallet-warning">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                  <span>Connect your wallet to deposit</span>
                </div>
              )}

              {/* SDK Error Message */}
              {sdkError && (
                <div className="error-message">
                  <svg
                    width="20"
                    height="20"
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
                    />
                    <line
                      x1="12"
                      y1="8"
                      x2="12"
                      y2="12"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <line
                      x1="12"
                      y1="16"
                      x2="12.01"
                      y2="16"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                  </svg>
                  {sdkError}
                </div>
              )}

              {/* Transaction Notification */}
              {txNotification && !txNotification.txDigest && (
                <div
                  className={`transaction-notification ${
                    txNotification.isSuccess ? "success" : "error"
                  }`}
                >
                  {txNotification.isSuccess ? (
                    <div className="spinner"></div>
                  ) : (
                    <svg
                      width="20"
                      height="20"
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
                      />
                      <line
                        x1="15"
                        y1="9"
                        x2="9"
                        y2="15"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                      <line
                        x1="9"
                        y1="9"
                        x2="15"
                        y2="15"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                    </svg>
                  )}
                  <span>{txNotification.message}</span>
                </div>
              )}
            </form>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                className="btn btn--primary"
                onClick={handleSubmit}
                disabled={isSubmitDisabled}
              >
                {isSubmitting ? (
                  <span className="loading-text">
                    <span className="spinner-small"></span>
                    Processing...
                  </span>
                ) : (
                  "Deposit"
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DepositModal;

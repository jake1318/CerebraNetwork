// src/components/DepositModal.tsx
// Current Date and Time (UTC): 2025-07-26 00:23:02
// Current User's Login: jake1318

import React, { useState, useEffect, useMemo } from "react";
import { PoolInfo } from "../services/coinGeckoService";
import { formatDollars } from "../utils/formatters";
import blockvisionService, {
  AccountCoin,
} from "../services/blockvisionService";
import { birdeyeService, TokenMetadata } from "../services/birdeyeService";
import { BN } from "bn.js";
import { CetusClmmSDK } from "@cetusprotocol/sui-clmm-sdk";
import {
  TickMath,
  ClmmPoolUtil,
  Percentage,
  adjustForCoinSlippage,
} from "@cetusprotocol/common-sdk";
import { getPoolDetails as getBluefinPool } from "../services/bluefinService";
import TransactionNotification from "./TransactionNotification";
import {
  calculateVaultDeposit,
  depositToVault,
} from "../services/cetusVaultService";
import "../styles/components/DepositModal.scss";
import { useTokenMeta } from "../hooks/useTokenMeta";
// Import BP_DENOMINATOR from cetusService
import { BP_DENOMINATOR } from "../services/cetusService";

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
  pool?: PoolInfo;
  vault?: any;
  walletConnected: boolean;
  wallet: any; // Use the wallet passed as prop
}

// Constants for tick range in Sui CLMM implementation
const MAX_TICK = 443636;

// Default tick spacing if we can't get it from the pool
const DEFAULT_TICK_SPACING = 60;

// Flag to prioritize Birdeye API pricing for Cetus pools
const USE_BIRDEYE_FOR_CETUS = true;

// Path to placeholder token icon
const TOKEN_PLACEHOLDER = "/assets/token-placeholder.png";

// Fee configuration for Cetus pool deposits
const FEE_BP = 30; // 30 basis points = 0.30%
// Add a fallback BP_DENOMINATOR in case the import fails
const LOCAL_BP_DENOMINATOR = 10_000;

const DepositModal: React.FC<DepositModalProps> = ({
  isOpen,
  onClose,
  onDeposit,
  pool,
  vault,
  walletConnected,
  wallet, // Use this wallet prop instead of useWallet()
}) => {
  // Get account from wallet prop instead of calling useWallet() again
  const account = wallet?.account;

  const [amountA, setAmountA] = useState<string>("");
  const [amountB, setAmountB] = useState<string>("");
  const [slippage, setSlippage] = useState<string>("0.5");
  const [balances, setBalances] = useState<Record<string, AccountCoin | null>>(
    pool ? { [pool.tokenA]: null, [pool.tokenB]: null } : {}
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [txNotification, setTxNotification] = useState<{
    message: string;
    isSuccess: boolean;
    txDigest?: string;
  } | null>(null);

  // State to track if we're showing the success overlay
  const [showSuccessOverlay, setShowSuccessOverlay] = useState<boolean>(false);

  // State to store token metadata for logos
  const [tokenMetadata, setTokenMetadata] = useState<{
    [address: string]: TokenMetadata | null;
  }>({});

  // Vault-specific states
  const [useOneSide, setUseOneSide] = useState<boolean>(false);
  const [activeToken, setActiveToken] = useState<"A" | "B">("A");
  const [estimations, setEstimations] = useState<{
    coinA?: string;
    coinB?: string;
    lpAmount?: string;
  }>({});

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

  // Cache for USD prices to avoid repeated calls to Birdeye
  const [usdPriceCache, setUsdPriceCache] = useState<{
    [address: string]: number;
  }>({});

  // --------------------------------------------------------------------
  // Decimals now resolved *asynchronously* by address/type‑tag
  // --------------------------------------------------------------------
  const typeA = pool?.tokenAAddress ?? pool?.tokenAMetadata?.address;
  const typeB = pool?.tokenBAddress ?? pool?.tokenBMetadata?.address;
  const metaA = useTokenMeta(typeA, vault?.decimalsA ?? 9);
  const metaB = useTokenMeta(typeB, vault?.decimalsB ?? 9);
  const tokenADecimals = metaA.decimals;
  const tokenBDecimals = metaB.decimals;

  // Get display symbols
  const symbolA = pool ? pool.tokenA : vault?.symbolA || "";
  const symbolB = pool ? pool.tokenB : vault?.symbolB || "";

  // Check if this is a SUI pair which we know works correctly
  const isSuiPair = useMemo(() => {
    if (vault) {
      return (
        (vault.symbolA || "").toUpperCase().includes("SUI") ||
        (vault.symbolB || "").toUpperCase().includes("SUI")
      );
    }
    if (!pool) return false;
    return (
      pool.tokenA.toUpperCase().includes("SUI") ||
      pool.tokenB.toUpperCase().includes("SUI")
    );
  }, [pool?.tokenA, pool?.tokenB, vault?.symbolA, vault?.symbolB]);

  // Effect to show success overlay when transaction is successful
  useEffect(() => {
    if (txNotification?.txDigest && txNotification.isSuccess) {
      setShowSuccessOverlay(true);
    } else {
      setShowSuccessOverlay(false);
    }
  }, [txNotification]);

  // Token logo handling - fetch metadata when the modal opens - with reduced logging
  useEffect(() => {
    if (isOpen && pool) {
      const tokenAAddress = pool.tokenAAddress || pool.tokenAMetadata?.address;
      const tokenBAddress = pool.tokenBAddress || pool.tokenBMetadata?.address;

      // Only log once when modal opens
      console.log(`Modal opened for ${pool.tokenA}/${pool.tokenB}`);

      if (tokenAAddress || tokenBAddress) {
        // Create an array of addresses to fetch, filtering out undefined values
        const addressesToFetch = [tokenAAddress, tokenBAddress].filter(
          (address) => !!address
        ) as string[];

        if (addressesToFetch.length > 0) {
          birdeyeService
            .getMultipleTokenMetadata(addressesToFetch)
            .then((metadata) => {
              // Log only the count of fetched metadata, not the full objects
              console.log(
                `Fetched metadata for ${Object.keys(metadata).length} tokens`
              );
              setTokenMetadata(metadata);
            })
            .catch((error) => {
              console.error("Failed to fetch token metadata:", error);
            });
        }
      }
    }
  }, [isOpen, pool]);

  // Get token logo URL with improved fallbacks and minimal logging
  const getTokenLogoUrl = (isTokenA: boolean): string => {
    try {
      // If no pool info, return placeholder
      if (!pool) return TOKEN_PLACEHOLDER;

      const symbol = isTokenA ? pool.tokenA : pool.tokenB;
      const address = isTokenA
        ? pool.tokenAAddress || pool.tokenAMetadata?.address
        : pool.tokenBAddress || pool.tokenBMetadata?.address;

      // Remove all the verbose logging here

      if (!address) {
        // Direct pool logo properties
        if (isTokenA && pool.tokenALogo) {
          return pool.tokenALogo;
        }
        if (!isTokenA && pool.tokenBLogo) {
          return pool.tokenBLogo;
        }

        // Try pool metadata
        const poolMetadata = isTokenA
          ? pool.tokenAMetadata
          : pool.tokenBMetadata;
        if (poolMetadata) {
          const logo =
            poolMetadata.logo_uri ||
            poolMetadata.logoUrl ||
            poolMetadata.logoURI ||
            poolMetadata.logo;
          if (logo) {
            return logo;
          }
        }

        return TOKEN_PLACEHOLDER;
      }

      // Try to get from our fetched Birdeye metadata
      if (tokenMetadata[address]) {
        const metadata = tokenMetadata[address];
        const logo =
          metadata.logo_uri ||
          metadata.logoUrl ||
          metadata.logoURI ||
          metadata.logo;
        if (logo) {
          return logo;
        }
      }

      // Fallbacks - try from pool object
      if (isTokenA && pool.tokenALogo) {
        return pool.tokenALogo;
      }
      if (!isTokenA && pool.tokenBLogo) {
        return pool.tokenBLogo;
      }

      // Try metadata from pool
      const poolMetadata = isTokenA ? pool.tokenAMetadata : pool.tokenBMetadata;
      if (poolMetadata) {
        const logo =
          poolMetadata.logo_uri ||
          poolMetadata.logoUrl ||
          poolMetadata.logoURI ||
          poolMetadata.logo;
        if (logo) {
          return logo;
        }
      }

      return TOKEN_PLACEHOLDER;
    } catch (error) {
      console.warn(`Failed to get token logo for ${isTokenA ? "A" : "B"}`);
      return TOKEN_PLACEHOLDER;
    }
  };

  // Handle amount changes for vault inputs
  const handleAmountChange = (token: "A" | "B", value: string) => {
    const v = value.replace(/[^0-9.]/g, "");
    if ((v.match(/\./g) || []).length > 1) return;

    if (token === "A") {
      setAmountA(v);
      setActiveToken("A");
      if (useOneSide) setAmountB("");
    } else {
      setAmountB(v);
      setActiveToken("B");
      if (useOneSide) setAmountA("");
    }
  };

  // Reset the form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setAmountA("");
      setAmountB("");
      setUseOneSide(false);
      setEstimations({});
      setTxNotification(null);
      setShowSuccessOverlay(false);
    }
  }, [isOpen]);

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
    if (pool && pool.dex.toLowerCase() === "turbos") {
      // Skip SDK initialization for Turbos pools
      return null;
    }

    try {
      console.log(
        "Initializing Cetus SDK with address:",
        account?.address || "none"
      );
      // Initialize SDK with network and optional wallet address
      const sdkInstance = CetusClmmSDK.createSDK({
        env: "mainnet",
        senderAddress: account?.address,
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
  }, [account?.address, pool?.dex]);

  // Update sender address when wallet changes
  useEffect(() => {
    if (sdk && account?.address) {
      console.log("Setting sender address:", account.address);
      sdk.setSenderAddress(account.address);
    }
  }, [account?.address, sdk]);

  // Calculate vault deposits on input changes
  useEffect(() => {
    if (vault && (parseFloat(amountA) > 0 || parseFloat(amountB) > 0)) {
      // If one-sided deposit, only one of amountA or amountB is used
      const inputAmt =
        activeToken === "A"
          ? parseFloat(amountA) || 0
          : parseFloat(amountB) || 0;
      if (inputAmt <= 0) return;

      const useCoinA = activeToken === "A";

      calculateVaultDeposit(
        vault.vault_id || vault.id,
        inputAmt,
        useCoinA,
        useOneSide
      )
        .then((result) => {
          const coinANeeded =
            result.coin_a_amount ?? result.required_coin_a_amount;
          const coinBNeeded =
            result.coin_b_amount ?? result.required_coin_b_amount;
          const lpOut = result.estimated_lp_amount;

          setEstimations({
            coinA: coinANeeded
              ? (Number(coinANeeded) / 10 ** tokenADecimals).toFixed(6)
              : undefined,
            coinB: coinBNeeded
              ? (Number(coinBNeeded) / 10 ** tokenBDecimals).toFixed(6)
              : undefined,
            lpAmount: lpOut ? (Number(lpOut) / 10 ** 9).toFixed(6) : undefined,
          });
        })
        .catch((err) => {
          console.error("Failed to calculate vault deposit", err);
          setTxNotification({
            message:
              "Failed to calculate deposit estimate. Please check your input amounts.",
            isSuccess: false,
          });
          setEstimations({});
        });
    }
  }, [
    amountA,
    amountB,
    useOneSide,
    activeToken,
    vault,
    tokenADecimals,
    tokenBDecimals,
  ]);

  // Fetch balances & pool data when opened
  useEffect(() => {
    if (isOpen && account?.address) {
      fetchWalletBalances();

      // Only need to fetch pool data when dealing with a pool, not a vault
      if (pool) {
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

        // Set full range ticks immediately when modal opens
        setFullRange();
      }
    }
  }, [isOpen, account?.address, isSuiPair, pool]);

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
    decimalsB: number,
    usdA?: number,
    usdB?: number
  ): number => {
    // Standard formula: price = 1.0001^tick * 10^(decimalsA - decimalsB)
    const rawPrice = Math.pow(1.0001, tickIndex);
    const decimalAdjustment = Math.pow(10, decimalsA - decimalsB);
    const raw = rawPrice * decimalAdjustment;

    // If we know the USD prices we can determine orientation
    if (usdA && usdB) {
      const onChainIsBperA = usdB > usdA ? raw < 1 : raw > 1;
      const wantBperA = true; // UI convention
      return onChainIsBperA === wantBperA ? raw : 1 / raw;
    }

    return raw; // fall back: assume raw already is B per A
  };

  // Enhanced fetchTokenPrices to be the primary price source for Cetus pools - with reduced logging
  const fetchTokenPrices = async (): Promise<boolean> => {
    if (!pool) return false;

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

      console.log(`Fetching prices for ${pool.tokenA}/${pool.tokenB}`);

      // Also fetch token metadata if not already available
      if (!tokenMetadata[aAddr] || !tokenMetadata[bAddr]) {
        try {
          const addresses = [aAddr, bAddr].filter((a) => !!a) as string[];
          const metadata = await birdeyeService.getMultipleTokenMetadata(
            addresses
          );
          if (Object.keys(metadata).length > 0) {
            // Simplified logging
            console.log(
              `Fetched additional metadata for ${
                Object.keys(metadata).length
              } tokens`
            );
            setTokenMetadata((prev) => ({ ...prev, ...metadata }));
          }
        } catch (metaErr) {
          console.error("Error fetching token metadata");
        }
      }

      // Check cache first to avoid duplicate calls
      const cachedPa = usdPriceCache[aAddr];
      const cachedPb = usdPriceCache[bAddr];

      let pa = cachedPa;
      let pb = cachedPb;

      // Fetch prices if not already in cache
      if (!pa || !pb) {
        const [aData, bData] = await Promise.all([
          birdeyeService.getPriceVolumeSingle(aAddr),
          birdeyeService.getPriceVolumeSingle(bAddr),
        ]);

        pa = aData?.price ?? aData?.data?.price;
        pb = bData?.price ?? bData?.data?.price;

        // Update cache
        if (pa && pb) {
          setUsdPriceCache((prev) => ({
            ...prev,
            [aAddr]: parseFloat(pa.toString()),
            [bAddr]: parseFloat(pb.toString()),
          }));
        }
      }

      if (pa && pb) {
        // Calculate price ratio correctly
        // tokenB per tokenA = (USD-price of tokenA) / (USD-price of tokenB)
        const priceRatio =
          parseFloat(pa.toString()) / parseFloat(pb.toString());

        console.log(
          `Price from Birdeye: ${priceRatio.toFixed(6)} ${pool.tokenB} per ${
            pool.tokenA
          }`
        );

        setCurrentPrice(priceRatio);
        setPriceSource("birdeye");

        // Always set full range when we get prices
        setFullRange();
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
      if (!pool || !pool.address || !sdk) return;

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
    if (!pool || !pool.address) return;
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

        // Try to get USD prices from Birdeye if available for orientation check
        let pa, pb;
        try {
          const aAddr = pool.tokenAAddress || pool.tokenAMetadata?.address;
          const bAddr = pool.tokenBAddress || pool.tokenBMetadata?.address;

          // Check cache first
          pa = aAddr ? usdPriceCache[aAddr] : undefined;
          pb = bAddr ? usdPriceCache[bAddr] : undefined;

          if (aAddr && bAddr && (!pa || !pb)) {
            const [aData, bData] = await Promise.all([
              birdeyeService.getPriceVolumeSingle(aAddr),
              birdeyeService.getPriceVolumeSingle(bAddr),
            ]);

            pa = aData?.price ?? aData?.data?.price;
            pb = bData?.price ?? bData?.data?.price;

            // Update cache
            if (pa && pb) {
              setUsdPriceCache((prev) => ({
                ...prev,
                [aAddr]: parseFloat(pa.toString()),
                [bAddr]: parseFloat(pb.toString()),
              }));
            }

            // Also fetch metadata if not already available
            if (!tokenMetadata[aAddr] || !tokenMetadata[bAddr]) {
              const addresses = [aAddr, bAddr].filter((a) => !!a) as string[];
              const metadata = await birdeyeService.getMultipleTokenMetadata(
                addresses
              );
              if (Object.keys(metadata).length > 0) {
                setTokenMetadata((prev) => ({ ...prev, ...metadata }));
              }
            }
          }
        } catch (e) {
          console.warn("Failed to get USD prices for orientation check:", e);
        }

        // Pass USD prices to calculateCorrectPrice
        const price = calculateCorrectPrice(
          ct,
          tokenADecimals,
          tokenBDecimals,
          pa ? +pa : undefined,
          pb ? +pb : undefined
        );
        setCurrentPrice(price);
        setPriceSource("onchain");

        // Always set to full range
        setFullRange();
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

      // Try to get USD prices from Birdeye if available for orientation check
      let pa, pb;
      try {
        const aAddr = pool.tokenAAddress || pool.tokenAMetadata?.address;
        const bAddr = pool.tokenBAddress || pool.tokenBMetadata?.address;

        // Check cache first
        pa = aAddr ? usdPriceCache[aAddr] : undefined;
        pb = bAddr ? usdPriceCache[bAddr] : undefined;

        if (aAddr && bAddr && (!pa || !pb)) {
          const [aData, bData] = await Promise.all([
            birdeyeService.getPriceVolumeSingle(aAddr),
            birdeyeService.getPriceVolumeSingle(bAddr),
          ]);

          pa = aData?.price ?? aData?.data?.price;
          pb = bData?.price ?? bData?.data?.price;

          // Update cache
          if (pa && pb) {
            setUsdPriceCache((prev) => ({
              ...prev,
              [aAddr]: parseFloat(pa.toString()),
              [bAddr]: parseFloat(pb.toString()),
            }));
          }

          // Also fetch metadata if not already available
          if (!tokenMetadata[aAddr] || !tokenMetadata[bAddr]) {
            const addresses = [aAddr, bAddr].filter((a) => !!a) as string[];
            const metadata = await birdeyeService.getMultipleTokenMetadata(
              addresses
            );
            if (Object.keys(metadata).length > 0) {
              setTokenMetadata((prev) => ({ ...prev, ...metadata }));
            }
          }
        }
      } catch (e) {
        console.warn("Failed to get USD prices for orientation check");
      }

      // Pass USD prices to calculateCorrectPrice
      const price = calculateCorrectPrice(
        ct,
        tokenADecimals,
        tokenBDecimals,
        pa ? +pa : undefined,
        pb ? +pb : undefined
      );
      console.log(`Using on-chain price: ${price.toFixed(6)}`);
      setCurrentPrice(price);
      setPriceSource("onchain");

      // Always set to full range
      setFullRange();
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
    if (!account?.address || !pool) return;
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

  // Calculate estimated position value
  const calculateEstimatedPositionValue = (): string => {
    if (!amountA || !amountB || !pool) return "$0.00";

    try {
      // Try to get USD prices from pool data or cache
      let tokenAPrice = pool.tokenAUsdPrice;
      let tokenBPrice = pool.tokenBUsdPrice;

      // If no direct USD prices available, try to calculate from other sources
      if (!tokenAPrice || !tokenBPrice) {
        const aAddr = pool.tokenAAddress || pool.tokenAMetadata?.address;
        const bAddr = pool.tokenBAddress || pool.tokenBMetadata?.address;

        if (aAddr && bAddr) {
          tokenAPrice = usdPriceCache[aAddr] || 0;
          tokenBPrice = usdPriceCache[bAddr] || 0;
        }
      }

      // If we still don't have prices but have currentPrice, estimate
      if ((!tokenAPrice || !tokenBPrice) && currentPrice > 0) {
        // Assume one token price if we know the ratio (currentPrice)
        if (tokenAPrice) {
          tokenBPrice = tokenAPrice / currentPrice;
        } else if (tokenBPrice) {
          tokenAPrice = tokenBPrice * currentPrice;
        } else {
          // Make a rough estimate based on typical token values
          tokenAPrice = 1; // Assume $1 as base
          tokenBPrice = currentPrice;
        }
      }

      // Default to 1 if we still have no price data
      tokenAPrice = tokenAPrice || 1;
      tokenBPrice = tokenBPrice || 1;

      const valueA = Number(amountA) * tokenAPrice;
      const valueB = Number(amountB) * tokenBPrice;
      const total = valueA + valueB;

      return formatDollars(total);
    } catch (error) {
      console.error("Error calculating position value:", error);
      return "$0.00";
    }
  };

  // Set to full range following Cetus documentation guidance
  const setFullRange = () => {
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

      // Get USD prices from cache if available
      let pa, pb;
      if (pool) {
        const aAddr = pool.tokenAAddress || pool.tokenAMetadata?.address;
        const bAddr = pool.tokenBAddress || pool.tokenBMetadata?.address;
        if (aAddr && bAddr) {
          pa = usdPriceCache[aAddr];
          pb = usdPriceCache[bAddr];
        }
      }

      // Calculate prices using corrected calculation
      try {
        const lowerPrice = calculateCorrectPrice(
          tickLower,
          tokenADecimals,
          tokenBDecimals,
          pa,
          pb
        );
        const upperPrice = calculateCorrectPrice(
          tickUpper,
          tokenADecimals,
          tokenBDecimals,
          pa,
          pb
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
          `Full range prices: ${formattedLowerPrice} to ${formattedUpperPrice}`
        );
      } catch (error) {
        console.error("Error calculating full range prices");
        // Set reasonable defaults that work for typical token decimals
        setMinPrice("0.000001");
        setMaxPrice("1000000.000000");
      }
    } catch (error) {
      console.error("Error in setFullRange");
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

  // Handle amount inputs
  const handleAmountAChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/[^0-9.]/g, "");
    if ((v.match(/\./g) || []).length > 1) return;
    setAmountA(v);

    if (vault) {
      setActiveToken("A");
      if (useOneSide) {
        setAmountB("");
      }
      return;
    }

    // Pool handling
    setFixedToken("A");

    // Auto-compute token B amount if price is available
    if (currentPrice > 0 && v !== "") {
      // Normal pools: price = tokenB per tokenA
      setAmountB((Number(v) * currentPrice).toFixed(6));
      console.log(
        `Normal calculation: ${v} ${symbolA} → ${
          Number(v) * currentPrice
        } ${symbolB}`
      );
    } else {
      setAmountB("");
    }
  };

  const handleAmountBChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/[^0-9.]/g, "");
    if ((v.match(/\./g) || []).length > 1) return;
    setAmountB(v);

    if (vault) {
      setActiveToken("B");
      if (useOneSide) {
        setAmountA("");
      }
      return;
    }

    // Pool handling
    setFixedToken("B");

    // Auto-compute token A amount if price is available
    if (currentPrice > 0 && v !== "") {
      // Normal pools
      setAmountA((Number(v) / currentPrice).toFixed(6));
      console.log(
        `Normal calculation: ${v} ${symbolB} → ${
          Number(v) / currentPrice
        } ${symbolA}`
      );
    } else {
      setAmountA("");
    }
  };

  const handleMaxAClick = () => {
    if (!pool) return;
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
    if (!pool) return;
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

  // Handle one-sided toggle for vaults
  const handleToggleOneSide = (checked: boolean) => {
    setUseOneSide(checked);

    // Clear the secondary token field when toggling modes
    if (checked) {
      // If toggling on one-sided, keep the active token field and empty the other
      if (activeToken === "A") setAmountB("");
      else setAmountA("");
    }
  };

  // Success notification component
  const SuccessOverlay = () => {
    if (!txNotification?.txDigest) return null;

    return (
      <div className="transaction-notification-overlay">
        <div className="notification success">
          <div className="success-icon">
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M8 12l3 3 5-5" />
            </svg>
          </div>

          <h3 className="notification-title success">Transaction Successful</h3>

          <p className="notification-message">{txNotification.message}</p>

          <div className="tx-digest">{txNotification.txDigest}</div>

          <div className="tx-link">
            <a
              href={`https://suivision.xyz/txblock/${txNotification.txDigest}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on SuiVision
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>

          <div className="buttons">
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if wallet is connected
    if (!wallet || !wallet.account) {
      setTxNotification({
        message: "Wallet not connected",
        isSuccess: false,
      });
      return;
    }

    // Vault deposit
    if (vault) {
      setIsSubmitting(true);
      setTxNotification({
        message: "Processing vault deposit…",
        isSuccess: true,
      });

      try {
        const amtA = parseFloat(amountA) || 0;
        const amtB = parseFloat(amountB) || 0;

        if (amtA <= 0 && amtB <= 0) {
          throw new Error("Please enter a valid amount");
        }

        // Pass the wallet to the depositToVault function
        const txnBlock = await depositToVault(
          wallet, // Pass the wallet instance from props
          vault.vault_id || vault.id,
          amtA,
          amtB
        );

        setTxNotification({
          message: `Successfully deposited to ${symbolA}-${symbolB} vault`,
          isSuccess: true,
          txDigest: txnBlock.digest,
        });

        setAmountA("");
        setAmountB("");
      } catch (err: any) {
        console.error("Vault deposit failed", err);
        setTxNotification({
          message: `Failed to deposit to vault: ${
            err.message || "Unknown error"
          }`,
          isSuccess: false,
        });
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Pool deposit
    if (!pool) return;
    if (!amountA || !amountB) return;

    // Final validation to ensure we have valid tick values
    if (isNaN(tickLower) || isNaN(tickUpper) || tickUpper <= tickLower) {
      setTxNotification({
        message: `Invalid price range. Please refresh the page and try again.`,
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
      setFullRange(); // Set to full range if ticks are out of bounds
      setTxNotification({
        message: `Setting to full range automatically...`,
        isSuccess: true,
      });
      return;
    }

    // Ensure ticks are multiples of the tick spacing
    if (tickLower % spacing !== 0 || tickUpper % spacing !== 0) {
      setFullRange(); // Set to full range if ticks aren't valid
      setTxNotification({
        message: `Setting to full range automatically...`,
        isSuccess: true,
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
        console.error("Error in final liquidity calculation");
        // Set a fallback value that should be reasonable
        const fallbackLiquidity = "1000000000";
        setDeltaLiquidity(fallbackLiquidity);
      }
    }

    setIsSubmitting(true);
    setTxNotification({ message: "Processing deposit…", isSuccess: true });

    try {
      // Use the imported BP_DENOMINATOR from cetusService or fallback to LOCAL_BP_DENOMINATOR
      const bp_denominator = BP_DENOMINATOR || LOCAL_BP_DENOMINATOR;

      // Display fee information
      const feeA = Number(amountA) * (FEE_BP / bp_denominator);
      const feeB = Number(amountB) * (FEE_BP / bp_denominator);
      const poolAmountA = Number(amountA) - feeA;
      const poolAmountB = Number(amountB) - feeB;

      console.log(
        `Depositing ${poolAmountA} ${pool.tokenA} and ${poolAmountB} ${pool.tokenB} to pool`
      );
      console.log(`Fee: ${feeA} ${pool.tokenA} and ${feeB} ${pool.tokenB}`);

      // We still send the original amounts to onDeposit - it will handle the fee internally
      const result = await onDeposit(
        amountA,
        amountB,
        slippage,
        tickLower,
        tickUpper,
        deltaLiquidity
      );

      if (result.success) {
        // Include fee information in success message
        setTxNotification({
          message: `Successfully deposited ${poolAmountA.toFixed(6)} ${
            pool.tokenA
          } and ${poolAmountB.toFixed(6)} ${pool.tokenB} (Fee: ${feeA.toFixed(
            6
          )} ${pool.tokenA}, ${feeB.toFixed(6)} ${pool.tokenB})`,
          isSuccess: true,
          txDigest: result.digest,
        });
        setShowSuccessOverlay(true);
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
        msg = "Invalid price range. Please try again with full range.";
      } else if (msg.includes("token_amount_max_exceed")) {
        msg =
          "Token amount exceeds the maximum required. Try reducing your slippage tolerance.";
      } else if (msg.includes("liquidity_is_zero")) {
        msg =
          "The resulting liquidity would be zero. Try increasing your deposit amounts.";
      } else if (msg.includes("Cannot convert NaN to a BigInt")) {
        msg =
          "Invalid price range values. Please refresh the page and try again.";
      } else if (msg.includes("BP_DENOMINATOR is not defined")) {
        msg =
          "BP_DENOMINATOR error. Please try refreshing the page and try again.";
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
    if (!pool) return "...";
    const b = balances[tk];
    if (!b) return "...";
    const v = parseInt(b.balance) / 10 ** b.decimals;
    return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  };

  const isSubmitDisabled = vault
    ? (!amountA && !amountB) || !walletConnected || isSubmitting
    : !amountA ||
      !amountB ||
      !walletConnected ||
      isSubmitting ||
      isNaN(tickLower) ||
      isNaN(tickUpper) ||
      tickUpper <= tickLower ||
      (tickSpacing > 0 && tickUpper - tickLower < tickSpacing);

  if (!isOpen) return null;

  // Render vault deposit modal
  if (vault) {
    return (
      <div className="modal-overlay">
        <div className="deposit-modal">
          <div className="modal-header">
            <h3>
              <div className="token-pair-icons">
                <img
                  className="token-icon"
                  src={getTokenLogoUrl(true)}
                  alt={symbolA}
                  onError={(e) => {
                    // Simplified error handling
                    (e.target as HTMLImageElement).src = TOKEN_PLACEHOLDER;
                  }}
                />
                <img
                  className="token-icon"
                  src={getTokenLogoUrl(false)}
                  alt={symbolB}
                  onError={(e) => {
                    // Simplified error handling
                    (e.target as HTMLImageElement).src = TOKEN_PLACEHOLDER;
                  }}
                />
              </div>
              Deposit into Vault {symbolA}-{symbolB}
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

          <div className="modal-body">
            {/* One-sided toggle for vaults */}
            <div className="toggle-one-side">
              <label>
                <input
                  type="checkbox"
                  checked={useOneSide}
                  onChange={(e) => handleToggleOneSide(e.target.checked)}
                />
                One-sided deposit
              </label>
              <div className="info-text">
                {useOneSide
                  ? "Deposit only one token. The vault will handle conversion internally."
                  : "Balanced deposit using both tokens."}
              </div>
            </div>

            {/* Amount inputs */}
            <div className="input-group">
              <div className="input-label">
                <div className="token-with-icon">
                  <img
                    className="token-icon"
                    src={getTokenLogoUrl(true)}
                    alt={symbolA}
                    onError={(e) => {
                      // Simplified error handling
                      (e.target as HTMLImageElement).src = TOKEN_PLACEHOLDER;
                    }}
                  />
                  <span>{symbolA}</span>
                </div>
                <span className="balance">
                  Balance: {formatBalance(symbolA)}
                </span>
              </div>
              <div className="input-wrapper">
                <input
                  type="number"
                  value={amountA}
                  min="0"
                  step="0.000001"
                  placeholder="0.0"
                  disabled={useOneSide && activeToken !== "A"}
                  onChange={(e) => handleAmountChange("A", e.target.value)}
                />
                <button
                  type="button"
                  className="max-button"
                  onClick={handleMaxAClick}
                  disabled={!walletConnected}
                >
                  MAX
                </button>
              </div>
              {useOneSide && activeToken === "A" && (
                <span className="badge">Single token mode</span>
              )}
            </div>

            <div className="input-group">
              <div className="input-label">
                <div className="token-with-icon">
                  <img
                    className="token-icon"
                    src={getTokenLogoUrl(false)}
                    alt={symbolB}
                    onError={(e) => {
                      // Simplified error handling
                      (e.target as HTMLImageElement).src = TOKEN_PLACEHOLDER;
                    }}
                  />
                  <span>{symbolB}</span>
                </div>
                <span className="balance">
                  Balance: {formatBalance(symbolB)}
                </span>
              </div>
              <div className="input-wrapper">
                <input
                  type="number"
                  value={amountB}
                  min="0"
                  step="0.000001"
                  placeholder="0.0"
                  disabled={useOneSide && activeToken !== "B"}
                  onChange={(e) => handleAmountChange("B", e.target.value)}
                />
                <button
                  type="button"
                  className="max-button"
                  onClick={handleMaxBClick}
                  disabled={!walletConnected}
                >
                  MAX
                </button>
              </div>
              {useOneSide && activeToken === "B" && (
                <span className="badge">Single token mode</span>
              )}
            </div>

            {Object.keys(estimations).length > 0 && (
              <div className="estimates-section">
                <h4>Deposit Summary</h4>
                <div className="estimate-item">
                  <span>You'll deposit:</span>
                  <span>
                    {activeToken === "A"
                      ? `${amountA} ${symbolA}`
                      : `${amountB} ${symbolB}`}
                  </span>
                </div>
                {useOneSide ? (
                  <div className="estimate-item">
                    <span>Vault converts to:</span>
                    <span>
                      {activeToken === "A"
                        ? `~ ${estimations.coinB || "0"} ${symbolB}`
                        : `~ ${estimations.coinA || "0"} ${symbolA}`}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="estimate-item">
                      <span>Required {symbolA}:</span>
                      <span>{estimations.coinA || "0"}</span>
                    </div>
                    <div className="estimate-item">
                      <span>Required {symbolB}:</span>
                      <span>{estimations.coinB || "0"}</span>
                    </div>
                  </>
                )}
                <div className="estimate-item">
                  <span>Estimated LP tokens:</span>
                  <span>{estimations.lpAmount || "0"}</span>
                </div>
              </div>
            )}

            {/* Fee information for vaults */}
            <div className="fee-info">
              <div className="info-icon">ℹ️</div>
              <p>Fee: 0.30% ({FEE_BP} bps) on deposits</p>
            </div>

            {/* Regular notification for non-success or non-tx notifications */}
            {txNotification && !txNotification.txDigest && (
              <div
                className={`notification ${
                  txNotification.isSuccess ? "success" : "error"
                }`}
              >
                {txNotification.message}
              </div>
            )}
          </div>

          <div className="modal-footer">
            {!walletConnected && (
              <button disabled className="submit-button">
                Connect wallet to deposit
              </button>
            )}

            {walletConnected && (
              <button
                className="submit-button"
                onClick={handleSubmit}
                disabled={isSubmitDisabled}
              >
                {isSubmitting ? "Processing..." : "Deposit to Vault"}
              </button>
            )}
          </div>

          {/* Success overlay */}
          {showSuccessOverlay && <SuccessOverlay />}
        </div>
      </div>
    );
  }

  // Render pool deposit modal (not vault)
  return (
    <div className="modal-overlay">
      <div className="deposit-modal">
        <div className="modal-header">
          <h3>
            <div className="token-pair-icons">
              <img
                className="token-icon"
                src={getTokenLogoUrl(true)}
                alt={symbolA}
                onError={(e) => {
                  // Simplified error handling
                  (e.target as HTMLImageElement).src = TOKEN_PLACEHOLDER;
                }}
              />
              <img
                className="token-icon"
                src={getTokenLogoUrl(false)}
                alt={symbolB}
                onError={(e) => {
                  // Simplified error handling
                  (e.target as HTMLImageElement).src = TOKEN_PLACEHOLDER;
                }}
              />
            </div>
            Add Liquidity to {symbolA}/{symbolB}
          </h3>
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

        <div className="modal-body">
          {/* Pool and current price */}
          <div className="current-price">
            <div className="price-label">
              Current Price:{" "}
              <span className="price-value">
                {currentPrice > 0
                  ? `${currentPrice.toFixed(6)} ${symbolB} per ${symbolA}`
                  : "Loading..."}
              </span>
            </div>
            {renderPriceSource()}
          </div>

          <form onSubmit={handleSubmit}>
            {/* Token A input */}
            <div className="input-group">
              <div className="input-label">
                <div className="token-with-icon">
                  <img
                    className="token-icon"
                    src={getTokenLogoUrl(true)}
                    alt={symbolA}
                    onError={(e) => {
                      // Simplified error handling
                      (e.target as HTMLImageElement).src = TOKEN_PLACEHOLDER;
                    }}
                  />
                  <span>{symbolA}</span>
                </div>
                <span className="balance">
                  Balance: {formatBalance(symbolA)}
                </span>
              </div>
              <div className="input-wrapper">
                <input
                  type="text"
                  value={amountA}
                  onChange={handleAmountAChange}
                  placeholder="0.0"
                />
                <button
                  type="button"
                  className="max-button"
                  onClick={handleMaxAClick}
                  disabled={!walletConnected}
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Token B input */}
            <div className="input-group">
              <div className="input-label">
                <div className="token-with-icon">
                  <img
                    className="token-icon"
                    src={getTokenLogoUrl(false)}
                    alt={symbolB}
                    onError={(e) => {
                      // Simplified error handling
                      (e.target as HTMLImageElement).src = TOKEN_PLACEHOLDER;
                    }}
                  />
                  <span>{symbolB}</span>
                </div>
                <span className="balance">
                  Balance: {formatBalance(symbolB)}
                </span>
              </div>
              <div className="input-wrapper">
                <input
                  type="text"
                  value={amountB}
                  onChange={handleAmountBChange}
                  placeholder="0.0"
                />
                <button
                  type="button"
                  className="max-button"
                  onClick={handleMaxBClick}
                  disabled={!walletConnected}
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Price range info */}
            <div className="full-range-info">
              <div className="info-content">
                <div className="info-icon">ℹ️</div>
                <p>
                  Deposits are automatically set to full range for maximum yield
                </p>
              </div>
            </div>

            {/* Fee information */}
            <div className="fee-info">
              <div className="info-icon">ℹ️</div>
              <p>Fee: 0.30% ({FEE_BP} bps) on deposits</p>
            </div>

            {/* Slippage tolerance */}
            <div className="slippage-section">
              <label>Slippage Tolerance</label>
              <div className="slippage-options">
                <button
                  type="button"
                  className={slippage === "0.1" ? "active" : ""}
                  onClick={() => setSlippage("0.1")}
                >
                  0.1%
                </button>
                <button
                  type="button"
                  className={slippage === "0.5" ? "active" : ""}
                  onClick={() => setSlippage("0.5")}
                >
                  0.5%
                </button>
                <button
                  type="button"
                  className={slippage === "1.0" ? "active" : ""}
                  onClick={() => setSlippage("1.0")}
                >
                  1.0%
                </button>
                <div className="custom-slippage">
                  <input
                    type="text"
                    value={slippage}
                    onChange={(e) => setSlippage(e.target.value)}
                    placeholder="Custom"
                    maxLength={5}
                  />
                  <span>%</span>
                </div>
              </div>
            </div>

            {/* Estimated position value with improved calculation */}
            <div className="position-summary">
              <div className="summary-item">
                <span>Est. Position Value:</span>
                <span>{calculateEstimatedPositionValue()}</span>
              </div>
            </div>

            {/* Submit button */}
            <div className="submit-section">
              {!walletConnected ? (
                <button type="button" disabled className="submit-button">
                  Connect wallet to deposit
                </button>
              ) : sdkError ? (
                <div className="error-message">{sdkError}</div>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitDisabled}
                  className="submit-button"
                >
                  {isSubmitting ? "Processing..." : "Add Liquidity"}
                </button>
              )}
            </div>

            {/* Show regular notification if exists but doesn't have txDigest */}
            {txNotification && !txNotification.txDigest && (
              <div
                className={`notification ${
                  txNotification.isSuccess ? "success" : "error"
                }`}
              >
                {txNotification.message}
              </div>
            )}
          </form>
        </div>

        {/* Success overlay */}
        {showSuccessOverlay && <SuccessOverlay />}
      </div>

      {/* Add some custom styles for the full range info box */}
      <style jsx>{`
        .full-range-info {
          background: rgba(30, 144, 255, 0.1);
          border: 1px solid rgba(30, 144, 255, 0.3);
          border-radius: 8px;
          padding: 12px;
          margin: 16px 0;
        }

        .info-content {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .info-icon {
          font-size: 18px;
        }

        .info-content p {
          margin: 0;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.9);
        }

        .fee-info {
          background: rgba(255, 165, 0, 0.1);
          border: 1px solid rgba(255, 165, 0, 0.3);
          border-radius: 8px;
          padding: 12px;
          margin: 16px 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .fee-info p {
          margin: 0;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.9);
        }
      `}</style>
    </div>
  );
};

export default DepositModal;

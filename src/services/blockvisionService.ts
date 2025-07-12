// src/services/blockvisionService.ts
// Last Updated: 2025-07-12 05:01:23 UTC by jake1318

import axios from "axios";
import {
  getTokenMetadata as getBirdeyeTokenMetadata,
  TokenMetadata,
} from "./birdeyeService";
import processDefiPortfolioData from "./blockvisionDataProcessor";
import { getCoinMeta } from "./suiMetadataService";

const BLOCKVISION_API_BASE_URL = "https://api.blockvision.org";
const BLOCKVISION_API_KEY =
  import.meta.env.VITE_BLOCKVISION_API_KEY || "2ugIlviim3ywrgFI0BMniB9wdzU";

const blockvisionApi = axios.create({
  baseURL: BLOCKVISION_API_BASE_URL,
  headers: {
    accept: "application/json",
    "x-api-key": BLOCKVISION_API_KEY,
  },
});

blockvisionApi.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error(
      "Blockvision API Error:",
      error.response?.data || error.message
    );
    return Promise.reject(error);
  }
);

// List of supported protocols by BlockVision
const SUPPORTED_PROTOCOLS = [
  "cetus",
  "turbos",
  "suilend",
  "kriya",
  "flowx",
  "navi",
  "aftermath",
  "typus",
  "bucket",
  "scallop",
  "suistake",
  "unihouse",
  "alphafi",
  "bluefin",
  "haedal", // Added Haedal protocol support
];

export interface AccountCoin {
  coinType: string;
  name: string;
  symbol: string;
  decimals: number;
  balance: string;
  verified: boolean;
  logo: string;
  usdValue: string;
  objects: number;
  price: string;
  priceChangePercentage24H: string;
}

// ─── Common Types for DeFi Portfolio ───────────────────────────────────────────
export interface RawProtocolData {
  [protocol: string]: any;
}

export interface PortfolioResponse {
  code: number;
  message: string;
  result: RawProtocolData;
}

// Reward information interface
export interface RewardInfo {
  tokenSymbol?: string;
  tokenAddress?: string;
  amount?: string;
  formatted?: string;
  decimals?: number;
  valueUsd?: number;
  metadata?: TokenMetadata;
  logoUrl?: string;
}

// Normalized position interface
export interface NormalizedPosition {
  id: string;
  liquidity: string;
  balanceA: string;
  balanceB: string;
  valueUsd: number;
  isOutOfRange: boolean;
  rewards?: RewardInfo[];
  positionType?: string;
  raw?: any;
  // Added fields for formatted balances
  formattedBalanceA?: string;
  formattedBalanceB?: string;
  feesUsd?: number;
}

// Normalized pool group
export interface PoolGroup {
  poolAddress: string;
  poolName: string;
  protocol: string;
  positions: NormalizedPosition[];
  totalLiquidity: number;
  totalValueUsd: number;
  totalFeesUsd?: number;
  totalRewardsUsd?: number;
  apr: number;
  tokenA: string;
  tokenB: string;
  tokenASymbol: string;
  tokenBSymbol: string;
  tokenALogo?: string;
  tokenBLogo?: string;
  tokenAMetadata?: TokenMetadata;
  tokenBMetadata?: TokenMetadata;
  tokenAAddress?: string;
  tokenBAddress?: string;
}

// Cetus Vault interface
export interface CetusVault {
  id: string;
  name: string;
  apy: string;
  coinA: {
    decimals: number;
    iconUrl: string;
    name: string;
    symbol: string;
  };
  coinB: {
    decimals: number;
    iconUrl: string;
    name: string;
    symbol: string;
  };
  coinAAmount: string;
  coinBAmount: string;
  coinTypeA: string;
  coinTypeB: string;
}

// Token cache to avoid repeated lookups
const tokenCache: Record<
  string,
  { symbol: string; decimals: number; price?: number; logo?: string }
> = {};

// Vault APY cache for sharing with cetusVaultService
export const vaultApyCache = new Map<string, number>();

// Birdeye API rate limiter
// Create a queue for API requests
const birdeyeQueue: (() => Promise<void>)[] = [];
let birdeyeIsProcessing = false;
let birdeyeRequestsLastSecond = 0;
let birdeyeLastTimestamp = Date.now();
const BIRDEYE_MAX_RPS = 40; // Using 40/50 to provide buffer

async function processBirdeyeQueue() {
  if (birdeyeIsProcessing) return;
  birdeyeIsProcessing = true;

  while (birdeyeQueue.length > 0) {
    // Check rate limits
    const now = Date.now();
    if (now - birdeyeLastTimestamp >= 1000) {
      // Reset counter for new second
      birdeyeRequestsLastSecond = 0;
      birdeyeLastTimestamp = now;
    }

    if (birdeyeRequestsLastSecond >= BIRDEYE_MAX_RPS) {
      // Wait until the next second
      const waitTime = 1000 - (now - birdeyeLastTimestamp);
      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
      continue;
    }

    // Process next request
    const task = birdeyeQueue.shift();
    if (task) {
      birdeyeRequestsLastSecond++;
      await task();
    }
  }

  birdeyeIsProcessing = false;
}

function enqueueBirdeyeRequest<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    birdeyeQueue.push(async () => {
      try {
        const result = await fn();
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });

    processBirdeyeQueue();
  });
}

// ─── Helper Functions for DeFi Portfolio ───────────────────────────────────────

/**
 * Extract token symbol from coinType (e.g. "0x123::coin::USDC" -> "USDC")
 */
const getSymbolFromType = (coinType: string): string => {
  if (!coinType) return "Unknown";

  // Check cache first
  if (tokenCache[coinType]?.symbol) {
    return tokenCache[coinType].symbol;
  }

  // Extract from type string
  const parts = coinType.split("::");
  const symbol = parts[parts.length - 1] || coinType.substring(0, 8);

  // Cache for future use
  if (!tokenCache[coinType]) {
    tokenCache[coinType] = { symbol, decimals: 9 }; // Default decimals
  } else {
    tokenCache[coinType].symbol = symbol;
  }

  return symbol;
};

/**
 * Normalize raw amount string using decimals
 * Handles both string and number inputs, defaults to 0 if invalid
 * Returns normalized number value
 */
export const normalizeAmount = (
  amount: string | number | undefined | null,
  decimals: number
): number => {
  if (amount === undefined || amount === null) return 0;

  try {
    // Handle both string and number inputs
    const amountStr = typeof amount === "string" ? amount : amount.toString();

    // Log for debugging
    console.log(`Normalizing amount: ${amountStr} with decimals ${decimals}`);

    // Check for hex strings (without 0x prefix) - common in some BlockVision responses
    if (/^[0-9a-f]+$/i.test(amountStr) && !/^\d+$/.test(amountStr)) {
      // Convert hex to decimal first
      const decimalValue = parseInt(amountStr, 16) / Math.pow(10, decimals);
      console.log(`Converted hex ${amountStr} to decimal: ${decimalValue}`);
      return decimalValue;
    }

    // For regular decimal strings/numbers
    const decimalValue = Number(amountStr) / Math.pow(10, decimals);
    console.log(`Converted decimal ${amountStr} to: ${decimalValue}`);
    return decimalValue;
  } catch (error) {
    console.error(
      `Failed to normalize amount: ${amount} with decimals ${decimals}`,
      error
    );
    return 0;
  }
};

/**
 * Format a numeric value with appropriate decimal places based on magnitude
 */
const formatTokenAmount = (value: number): string => {
  if (value === 0) return "0";

  if (Math.abs(value) >= 1) {
    // For values >= 1, show 2-4 decimal places
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  } else if (Math.abs(value) >= 0.01) {
    // For small values, show more precision
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 6,
    });
  } else if (Math.abs(value) > 0) {
    // For very small values, avoid showing 0
    return value > 0 ? "<0.01" : ">-0.01";
  }

  return "0";
};

/**
 * Process raw Cetus vault data into standardized PoolGroup format
 * @param rawCetusData Raw Cetus data from BlockVision API
 * @returns Processed PoolGroup[] for Cetus vaults
 */
function processCetusVaultData(rawCetusData: any): PoolGroup[] {
  console.log("Processing Cetus vault data:", rawCetusData);

  if (
    !rawCetusData ||
    !rawCetusData.vaults ||
    !Array.isArray(rawCetusData.vaults) ||
    rawCetusData.vaults.length === 0
  ) {
    console.log("No valid Cetus vault positions found");
    return [];
  }

  const poolGroups: PoolGroup[] = [];

  // Process each vault into a pool group
  for (const vault of rawCetusData.vaults) {
    if (!vault.id) continue;

    const coinTypeA = vault.coinTypeA;
    const coinTypeB = vault.coinTypeB || ""; // Some vaults might only have single asset

    const tokenASymbol = vault.coinA?.symbol || getSymbolFromType(coinTypeA);
    const tokenBSymbol = vault.coinB?.symbol || getSymbolFromType(coinTypeB);

    // Store APY in the global cache for use by the cetusVaultService
    if (vault.apy && !isNaN(parseFloat(vault.apy))) {
      const apyValue = parseFloat(vault.apy);
      vaultApyCache.set(vault.id, apyValue);
      console.log(`Cached Cetus vault APY for ${vault.id}: ${apyValue}%`);
    }

    // Create a normalized position for the vault
    const position: NormalizedPosition = {
      id: vault.id,
      liquidity: "0", // Not directly applicable for vaults
      balanceA: vault.coinAAmount || "0",
      balanceB: vault.coinBAmount || "0",
      valueUsd: 0, // Will be calculated later with token prices
      isOutOfRange: false, // Not applicable for vaults
      positionType: "cetus-vault",
      raw: vault,
    };

    // Create the pool group for this vault
    poolGroups.push({
      poolAddress: vault.id,
      poolName: vault.name || `${tokenASymbol} - ${tokenBSymbol} Vault`,
      protocol: "Cetus",
      positions: [position],
      totalLiquidity: 0, // Will be calculated later
      totalValueUsd: 0, // Will be calculated later with token prices
      apr: parseFloat(vault.apy || "0"),
      tokenA: coinTypeA,
      tokenB: coinTypeB,
      tokenASymbol,
      tokenBSymbol,
      tokenALogo: vault.coinA?.iconUrl || "",
      tokenBLogo: vault.coinB?.iconUrl || "",
    });
  }

  console.log(`Created ${poolGroups.length} Cetus vault pool groups`);
  return poolGroups;
}

/**
 * Process Cetus farms data into standardized PoolGroup format
 * @param rawCetusFarms Raw Cetus farms data from BlockVision API
 * @returns Processed PoolGroup[] for Cetus farms
 */
function processCetusFarmsData(rawCetusFarms: any[]): PoolGroup[] {
  console.log(`Processing ${rawCetusFarms.length} Cetus farms`);

  if (
    !rawCetusFarms ||
    !Array.isArray(rawCetusFarms) ||
    rawCetusFarms.length === 0
  ) {
    console.log("No valid Cetus farm positions found");
    return [];
  }

  const poolGroups: PoolGroup[] = [];

  // Process each farm into a pool group
  for (const farm of rawCetusFarms) {
    if (!farm.pool) continue;

    // Create a position for this farm
    const position: NormalizedPosition = {
      id: farm.position || `cetus-farm-${farm.pool}`,
      liquidity: "0", // Not directly applicable for farms
      balanceA: farm.balanceA || "0",
      balanceB: farm.balanceB || "0",
      valueUsd: 0, // Will be calculated later with token prices
      isOutOfRange: farm.isOut === true,
      positionType: "cetus-farm",
      raw: farm,
    };

    // Create reward info if available
    if (farm.rewards && Array.isArray(farm.rewards)) {
      position.rewards = farm.rewards.map((reward: any) => ({
        tokenSymbol: getSymbolFromType(reward.coinType),
        tokenAddress: reward.coinType,
        amount: reward.amount || "0",
        formatted: "0", // Will be calculated during enrichment
        valueUsd: 0,
        decimals: reward.decimals || 9,
      }));
    }

    // Create the pool group for this farm
    poolGroups.push({
      poolAddress: farm.pool,
      poolName: farm.name || `Cetus Farm ${farm.position}`,
      protocol: "Cetus",
      positions: [position],
      totalLiquidity: 0, // Will be calculated later
      totalValueUsd: 0, // Will be calculated later with token prices
      apr: farm.apr || 0,
      tokenA: farm.coinTypeA,
      tokenB: farm.coinTypeB || "",
      tokenASymbol: getSymbolFromType(farm.coinTypeA),
      tokenBSymbol: farm.coinTypeB ? getSymbolFromType(farm.coinTypeB) : "",
    });
  }

  console.log(`Created ${poolGroups.length} Cetus farm pool groups`);
  return poolGroups;
}

/**
 * Process Cetus LP positions into standardized PoolGroup format
 * @param rawCetusLPs Raw Cetus LP positions data from BlockVision API
 * @returns Processed PoolGroup[] for Cetus LP positions
 */
function processCetusLPsData(rawCetusLPs: any[]): PoolGroup[] {
  console.log(`Processing ${rawCetusLPs.length} Cetus LP positions`);

  if (!rawCetusLPs || !Array.isArray(rawCetusLPs) || rawCetusLPs.length === 0) {
    console.log("No valid Cetus LP positions found");
    return [];
  }

  // Group positions by pool
  const positionsByPool: Record<string, any[]> = {};
  for (const lp of rawCetusLPs) {
    if (!lp.pool) continue;

    if (!positionsByPool[lp.pool]) {
      positionsByPool[lp.pool] = [];
    }
    positionsByPool[lp.pool].push(lp);
  }

  const poolGroups: PoolGroup[] = [];

  // Process each pool group
  for (const [poolId, positions] of Object.entries(positionsByPool)) {
    if (!positions.length) continue;

    // Use first position for pool metadata
    const firstPosition = positions[0];
    const tokenASymbol = getSymbolFromType(firstPosition.coinTypeA);
    const tokenBSymbol = getSymbolFromType(firstPosition.coinTypeB);

    // Create normalized positions
    const normalizedPositions = positions.map((lp) => {
      const position: NormalizedPosition = {
        id: lp.position || `cetus-lp-${lp.pool}`,
        liquidity: "0",
        balanceA: lp.balanceA || "0",
        balanceB: lp.balanceB || "0",
        valueUsd: 0, // Will be calculated later
        isOutOfRange: lp.isOut === true,
        positionType: "cetus-lp",
        raw: lp,
      };

      // Add fees if available
      if (lp.fees) {
        position.feesUsd = 0; // Will be calculated during enrichment
      }

      // Add rewards if available
      if (lp.rewards && Array.isArray(lp.rewards)) {
        position.rewards = lp.rewards.map((reward: any) => ({
          tokenSymbol: getSymbolFromType(reward.coinType),
          tokenAddress: reward.coinType,
          amount: reward.amount || "0",
          formatted: "0", // Will be calculated during enrichment
          valueUsd: 0,
          decimals: reward.decimals || 9,
        }));
      }

      return position;
    });

    // Create pool group
    poolGroups.push({
      poolAddress: poolId,
      poolName: `${tokenASymbol}/${tokenBSymbol}`,
      protocol: "Cetus",
      positions: normalizedPositions,
      totalLiquidity: 0, // Will be calculated later
      totalValueUsd: 0, // Will be calculated later
      apr: firstPosition.apr || 0,
      tokenA: firstPosition.coinTypeA,
      tokenB: firstPosition.coinTypeB,
      tokenASymbol,
      tokenBSymbol,
    });
  }

  console.log(`Created ${poolGroups.length} Cetus LP pool groups`);
  return poolGroups;
}

/**
 * Process raw Turbos position data into standardized PoolGroup format
 * @param rawTurbosData Raw Turbos data from BlockVision API
 * @returns Processed PoolGroup[] for Turbos positions
 */
function processTurbosData(rawTurbosData: any): PoolGroup[] {
  console.log("Processing Turbos data:", rawTurbosData);

  if (!rawTurbosData) {
    console.log("No valid Turbos data found");
    return [];
  }

  const poolGroups: PoolGroup[] = [];

  // Process LP positions
  if (
    rawTurbosData.lps &&
    Array.isArray(rawTurbosData.lps) &&
    rawTurbosData.lps.length > 0
  ) {
    console.log(`Found ${rawTurbosData.lps.length} Turbos LP positions`);

    // Group positions by pool ID to create pool groups
    const positionsByPool: Record<string, any[]> = {};

    // First, organize positions by pool
    for (const lp of rawTurbosData.lps) {
      if (!lp.poolId) continue;

      if (!positionsByPool[lp.poolId]) {
        positionsByPool[lp.poolId] = [];
      }
      positionsByPool[lp.poolId].push(lp);
    }

    // Create pool groups from the grouped positions
    for (const [poolId, positions] of Object.entries(positionsByPool)) {
      if (!positions.length) continue;

      // Use the first position to get pool metadata
      const firstPosition = positions[0];
      const tokenASymbol = getSymbolFromType(firstPosition.coinTypeA);
      const tokenBSymbol = getSymbolFromType(firstPosition.coinTypeB);

      // Create normalized positions for this pool
      const normalizedPositions: NormalizedPosition[] = positions.map((pos) => {
        // Extract reward data
        let rewards: RewardInfo[] = [];
        if (pos.rewards && Array.isArray(pos.rewards)) {
          rewards = pos.rewards
            .filter((r) => r.amount && parseInt(r.amount) > 0)
            .map((r) => ({
              tokenSymbol: getSymbolFromType(r.coinType),
              tokenAddress: r.coinType,
              amount: r.amount || "0",
              formatted: normalizeAmount(r.amount, 9).toString(), // Default decimals
              valueUsd: 0, // Will be calculated later with token prices
              decimals: 9, // Default
            }));
        }

        // Handle fees if available
        const fees = {};
        if (pos.collectFees) {
          fees["feeOwedA"] = pos.collectFees.feeOwedA || "0";
          fees["feeOwedB"] = pos.collectFees.feeOwedB || "0";
        }

        // Create the position with balanced data from the Turbos format
        return {
          id: pos.positionId,
          liquidity: "0", // Not directly provided by Turbos
          balanceA: pos.balanceA || "0",
          balanceB: pos.balanceB || "0",
          valueUsd: 0, // Will be calculated later with token prices
          isOutOfRange: pos.isOut === true,
          rewards,
          positionType: "turbos-lp",
          raw: pos, // Keep raw data for reference
        };
      });

      // Create the pool group
      poolGroups.push({
        poolAddress: poolId,
        poolName: `${tokenASymbol}/${tokenBSymbol}`,
        protocol: "Turbos",
        positions: normalizedPositions,
        totalLiquidity: 0, // Will be calculated later
        totalValueUsd: 0, // Will be calculated later with token prices
        apr: 0, // Not directly provided by Turbos
        tokenA: firstPosition.coinTypeA || "",
        tokenB: firstPosition.coinTypeB || "",
        tokenASymbol,
        tokenBSymbol,
        tokenAAddress: firstPosition.coinTypeA,
        tokenBAddress: firstPosition.coinTypeB,
        // Logos will be added later in the enrichment phase
      });
    }
  }

  // Process Vaults if they exist in the future
  if (
    rawTurbosData.vaults &&
    Array.isArray(rawTurbosData.vaults) &&
    rawTurbosData.vaults.length > 0
  ) {
    console.log(
      `Found ${rawTurbosData.vaults.length} Turbos Vault positions - processing not yet implemented`
    );
    // Add vault processing here if needed in the future
  }

  console.log(`Created ${poolGroups.length} Turbos pool groups`);
  return poolGroups;
}

/**
 * Process raw Bluefin position data into standardized PoolGroup format
 * @param rawBluefinData Raw Bluefin data from BlockVision API
 * @returns Processed PoolGroup[] for Bluefin positions
 */
function processBluefinData(rawBluefinData: any): PoolGroup[] {
  console.log("Processing Bluefin data:", rawBluefinData);

  if (
    !rawBluefinData ||
    !rawBluefinData.lps ||
    !Array.isArray(rawBluefinData.lps) ||
    rawBluefinData.lps.length === 0
  ) {
    console.log("No valid Bluefin LP positions found");
    return [];
  }

  // Group positions by pool ID to create pool groups
  const positionsByPool: Record<string, any[]> = {};

  // First, organize positions by pool
  for (const lp of rawBluefinData.lps) {
    if (!lp.poolId) continue;

    if (!positionsByPool[lp.poolId]) {
      positionsByPool[lp.poolId] = [];
    }
    positionsByPool[lp.poolId].push(lp);
  }

  // Create pool groups from the grouped positions
  const poolGroups: PoolGroup[] = [];

  for (const [poolId, positions] of Object.entries(positionsByPool)) {
    if (!positions.length) continue;

    // Use the first position to get pool metadata
    const firstPosition = positions[0];

    // Create normalized positions for this pool
    const normalizedPositions: NormalizedPosition[] = positions.map((pos) => {
      // Extract reward data
      let rewards: RewardInfo[] = [];
      if (pos.reward && Array.isArray(pos.reward.rewards)) {
        rewards = pos.reward.rewards
          .filter((r) => r.coinAmount && parseInt(r.coinAmount) > 0)
          .map((r) => ({
            tokenSymbol: r.coinSymbol || getSymbolFromType(r.coinType),
            tokenAddress: r.coinType,
            amount: r.coinAmount || "0",
            formatted: normalizeAmount(
              r.coinAmount,
              r.coinDecimals || 9
            ).toString(),
            valueUsd: 0, // Will be calculated later with token prices
            decimals: r.coinDecimals || 9,
          }));
      }

      // Create the position
      return {
        id: pos.positionId,
        liquidity: "0", // Placeholder, will be calculated if needed
        balanceA: pos.coinAmountA || "0",
        balanceB: pos.coinAmountB || "0",
        valueUsd: 0, // Will be calculated later with token prices
        isOutOfRange: pos.isOut === true,
        rewards,
        positionType: "bluefin",
        raw: pos, // Keep raw data for reference
      };
    });

    // Create the pool group
    const poolName = firstPosition.poolName || "Unknown Pool";
    const [tokenASymbol, tokenBSymbol] = (poolName || "").includes("-")
      ? poolName.split("-")
      : ["Unknown", "Unknown"];

    poolGroups.push({
      poolAddress: poolId,
      poolName: poolName,
      protocol: "Bluefin", // Explicitly set to "Bluefin" with correct capitalization
      positions: normalizedPositions,
      totalLiquidity: 0, // Will be calculated later
      totalValueUsd: 0, // Will be calculated later
      apr: parseFloat(firstPosition.apr || "0"),
      tokenA: firstPosition.coinTypeA || "",
      tokenB: firstPosition.coinTypeB || "",
      tokenASymbol: tokenASymbol.trim(),
      tokenBSymbol: tokenBSymbol.trim(),
      // Logos will be added later in the enrichment phase
    });
  }

  console.log(`Created ${poolGroups.length} Bluefin pool groups`);
  return poolGroups;
}

/**
 * Process raw SuiLend position data into standardized PoolGroup format
 * @param rawSuilendData Raw SuiLend data from BlockVision API
 * @returns Processed PoolGroup[] for SuiLend positions
 */
function processSuilendData(rawSuilendData: any): PoolGroup[] {
  console.log("Processing SuiLend data:", rawSuilendData);

  if (!rawSuilendData) {
    console.log("No valid SuiLend data found");
    return [];
  }

  const poolGroups: PoolGroup[] = [];

  // Process deposited assets
  if (
    rawSuilendData.depositedAssets &&
    Array.isArray(rawSuilendData.depositedAssets) &&
    rawSuilendData.depositedAssets.length > 0
  ) {
    console.log(
      `Found ${rawSuilendData.depositedAssets.length} SuiLend deposits`
    );

    // Group deposits by coin type for better organization
    const depositsByType: Record<string, any[]> = {};

    for (const asset of rawSuilendData.depositedAssets) {
      const coinType = asset.coinType;
      if (!coinType) continue;

      if (!depositsByType[coinType]) {
        depositsByType[coinType] = [];
      }
      depositsByType[coinType].push(asset);
    }

    // Create a pool group for each coin type
    for (const [coinType, assets] of Object.entries(depositsByType)) {
      if (!assets.length) continue;

      // Get symbol from the first asset
      const firstAsset = assets[0];
      const symbol = firstAsset.symbol || getSymbolFromType(coinType);

      const positions: NormalizedPosition[] = assets.map((asset, index) => {
        return {
          id: `suilend-deposit-${coinType}-${index}`,
          liquidity: asset.amount || "0",
          balanceA: asset.amount || "0",
          balanceB: "0",
          valueUsd: 0, // Will be calculated in enrichment phase with real prices
          isOutOfRange: false,
          positionType: "suilend-deposit",
          raw: asset,
        };
      });

      poolGroups.push({
        poolAddress: `suilend-deposits-${coinType}`,
        poolName: `${symbol} Deposits`,
        protocol: "SuiLend",
        positions: positions,
        totalLiquidity: 0, // Will be calculated later
        totalValueUsd: 0, // Will be calculated later with real price data
        apr: 0, // SuiLend APR would need to be extracted if available
        tokenA: coinType,
        tokenB: "",
        tokenASymbol: symbol,
        tokenBSymbol: "",
        tokenALogo: firstAsset.iconUrl || "",
      });
    }
  }

  // Process borrowed assets
  if (
    rawSuilendData.borrowedAssets &&
    Array.isArray(rawSuilendData.borrowedAssets) &&
    rawSuilendData.borrowedAssets.length > 0
  ) {
    console.log(
      `Found ${rawSuilendData.borrowedAssets.length} SuiLend borrows`
    );

    // Group borrows by coin type for better organization
    const borrowsByType: Record<string, any[]> = {};

    for (const asset of rawSuilendData.borrowedAssets) {
      const coinType = asset.coinType;
      if (!coinType) continue;

      if (!borrowsByType[coinType]) {
        borrowsByType[coinType] = [];
      }
      borrowsByType[coinType].push(asset);
    }

    // Create a pool group for each coin type
    for (const [coinType, assets] of Object.entries(borrowsByType)) {
      if (!assets.length) continue;

      // Get symbol from the first asset
      const firstAsset = assets[0];
      const symbol = firstAsset.symbol || getSymbolFromType(coinType);

      const positions: NormalizedPosition[] = assets.map((asset, index) => {
        return {
          id: `suilend-borrow-${coinType}-${index}`,
          liquidity: asset.amount || "0",
          balanceA: asset.amount || "0",
          balanceB: "0",
          valueUsd: 0, // Will be calculated later with accurate price data
          isOutOfRange: false,
          positionType: "suilend-borrow",
          raw: asset,
        };
      });

      poolGroups.push({
        poolAddress: `suilend-borrows-${coinType}`,
        poolName: `${symbol} Borrows`,
        protocol: "SuiLend",
        positions: positions,
        totalLiquidity: 0, // Will be calculated later
        totalValueUsd: 0, // Will be calculated later
        apr: 0, // SuiLend APR would need to be extracted if available
        tokenA: coinType,
        tokenB: "",
        tokenASymbol: symbol,
        tokenBSymbol: "",
        tokenALogo: firstAsset.iconUrl || "",
      });
    }
  }

  console.log(`Created ${poolGroups.length} SuiLend pool groups`);
  return poolGroups;
}

/**
 * Process raw Haedal position data into standardized PoolGroup format
 * @param rawHaedalData Raw Haedal data from BlockVision API
 * @returns Processed PoolGroup[] for Haedal positions
 */
function processHaedalData(rawHaedalData: any): PoolGroup[] {
  console.log("Processing Haedal data:", rawHaedalData);

  if (!rawHaedalData) {
    console.log("No valid Haedal data found");
    return [];
  }

  const poolGroups: PoolGroup[] = [];

  // Process LP positions
  if (
    rawHaedalData.lps &&
    Array.isArray(rawHaedalData.lps) &&
    rawHaedalData.lps.length > 0
  ) {
    console.log(`Found ${rawHaedalData.lps.length} Haedal LP positions`);

    // Group positions by pool ID to create pool groups
    const positionsByPool: Record<string, any[]> = {};

    // First, organize positions by pool
    for (const lp of rawHaedalData.lps) {
      if (!lp.poolId) continue;

      if (!positionsByPool[lp.poolId]) {
        positionsByPool[lp.poolId] = [];
      }
      positionsByPool[lp.poolId].push(lp);
    }

    // Create pool groups from the grouped positions
    for (const [poolId, positions] of Object.entries(positionsByPool)) {
      if (!positions.length) continue;

      // Use the first position to get pool metadata
      const firstPosition = positions[0];
      const tokenASymbol = getSymbolFromType(firstPosition.coinTypeA);
      const tokenBSymbol = getSymbolFromType(firstPosition.coinTypeB);

      // Create normalized positions for this pool
      const normalizedPositions: NormalizedPosition[] = positions.map((pos) => {
        return {
          id: `haedal-lp-${poolId}`,
          liquidity: "0",
          balanceA: pos.balanceA || "0",
          balanceB: pos.balanceB || "0",
          valueUsd: 0, // Will be calculated later with token prices
          isOutOfRange: false, // Not applicable for Haedal
          positionType: "haedal-lp",
          raw: pos,
        };
      });

      // Create the pool group
      poolGroups.push({
        poolAddress: poolId,
        poolName: `${tokenASymbol}/${tokenBSymbol}`,
        protocol: "Haedal",
        positions: normalizedPositions,
        totalLiquidity: 0, // Will be calculated later
        totalValueUsd: 0, // Will be calculated later with token prices
        apr: 0, // Haedal may not provide APR directly
        tokenA: firstPosition.coinTypeA || "",
        tokenB: firstPosition.coinTypeB || "",
        tokenASymbol,
        tokenBSymbol,
        tokenAAddress: firstPosition.coinTypeA,
        tokenBAddress: firstPosition.coinTypeB,
      });
    }
  }

  // Process staking positions if they exist
  if (
    rawHaedalData.stakings &&
    Array.isArray(rawHaedalData.stakings) &&
    rawHaedalData.stakings.length > 0
  ) {
    console.log(
      `Found ${rawHaedalData.stakings.length} Haedal staking positions`
    );

    for (const staking of rawHaedalData.stakings) {
      if (!staking.coinType) continue;

      const tokenSymbol = getSymbolFromType(staking.coinType);

      const position: NormalizedPosition = {
        id: `haedal-staking-${staking.coinType}`,
        liquidity: staking.amount || "0",
        balanceA: staking.amount || "0",
        balanceB: "0",
        valueUsd: 0, // Will be calculated later
        isOutOfRange: false,
        positionType: "haedal-staking",
        raw: staking,
      };

      poolGroups.push({
        poolAddress: `haedal-staking-${staking.coinType}`,
        poolName: `${tokenSymbol} Staking`,
        protocol: "Haedal",
        positions: [position],
        totalLiquidity: 0,
        totalValueUsd: 0,
        apr: staking.apr ? parseFloat(staking.apr) : 0,
        tokenA: staking.coinType,
        tokenB: "",
        tokenASymbol: tokenSymbol,
        tokenBSymbol: "",
      });
    }
  }

  console.log(`Created ${poolGroups.length} Haedal pool groups`);
  return poolGroups;
}

/**
 * Process raw Aftermath position data into standardized PoolGroup format
 * @param rawAftermathData Raw Aftermath data from BlockVision API
 * @returns Processed PoolGroup[] for Aftermath positions
 */
function processAftermathData(rawAftermathData: any): PoolGroup[] {
  console.log("Processing Aftermath data:", rawAftermathData);

  if (!rawAftermathData) {
    console.log("No valid Aftermath data found");
    return [];
  }

  const poolGroups: PoolGroup[] = [];

  // Process LP positions
  if (
    rawAftermathData.lpPositions &&
    Array.isArray(rawAftermathData.lpPositions) &&
    rawAftermathData.lpPositions.length > 0
  ) {
    console.log(
      `Found ${rawAftermathData.lpPositions.length} Aftermath LP positions`
    );

    // Group positions by pool ID
    const positionsByPool: Record<string, any[]> = {};

    for (const lp of rawAftermathData.lpPositions) {
      if (!lp.poolId) continue;

      if (!positionsByPool[lp.poolId]) {
        positionsByPool[lp.poolId] = [];
      }
      positionsByPool[lp.poolId].push(lp);
    }

    // Create pool groups for LP positions
    for (const [poolId, positions] of Object.entries(positionsByPool)) {
      if (!positions.length) continue;

      // Extract token information from the first position
      const firstPosition = positions[0];

      // Find token A and token B from the coins array
      let tokenA = "",
        tokenB = "",
        tokenASymbol = "",
        tokenBSymbol = "";

      if (
        firstPosition.coins &&
        Array.isArray(firstPosition.coins) &&
        firstPosition.coins.length >= 2
      ) {
        tokenA = firstPosition.coins[0]?.coinType || "";
        tokenB = firstPosition.coins[1]?.coinType || "";

        tokenASymbol = getSymbolFromType(tokenA);
        tokenBSymbol = getSymbolFromType(tokenB);
      }

      // Create normalized position
      const normalizedPosition: NormalizedPosition = {
        id: `aftermath-lp-${poolId}`,
        liquidity: "0",
        balanceA: firstPosition.coins?.[0]?.amount || "0",
        balanceB: firstPosition.coins?.[1]?.amount || "0",
        valueUsd: 0, // Will be calculated later
        isOutOfRange: false, // Not applicable for Aftermath
        positionType: "aftermath-lp",
        raw: firstPosition,
      };

      // Add the pool group
      poolGroups.push({
        poolAddress: poolId,
        poolName: `${tokenASymbol}/${tokenBSymbol}`,
        protocol: "Aftermath",
        positions: [normalizedPosition],
        totalLiquidity: 0, // Will be calculated later
        totalValueUsd: 0, // Will be calculated later
        apr: 0, // Not directly available
        tokenA,
        tokenB,
        tokenASymbol,
        tokenBSymbol,
      });
    }
  }

  // Process farm positions
  if (
    rawAftermathData.farmPositions &&
    Array.isArray(rawAftermathData.farmPositions) &&
    rawAftermathData.farmPositions.length > 0
  ) {
    console.log(
      `Found ${rawAftermathData.farmPositions.length} Aftermath Farm positions`
    );

    // Group positions by pool ID
    const farmsByPool: Record<string, any[]> = {};

    for (const farm of rawAftermathData.farmPositions) {
      if (!farm.poolId) continue;

      if (!farmsByPool[farm.poolId]) {
        farmsByPool[farm.poolId] = [];
      }
      farmsByPool[farm.poolId].push(farm);
    }

    // Create pool groups for farm positions
    for (const [poolId, farms] of Object.entries(farmsByPool)) {
      if (!farms.length) continue;

      // Extract token information from the first position
      const firstFarm = farms[0];

      // Find token A and token B from the coins array
      let tokenA = "",
        tokenB = "",
        tokenASymbol = "",
        tokenBSymbol = "";

      if (
        firstFarm.coins &&
        Array.isArray(firstFarm.coins) &&
        firstFarm.coins.length >= 2
      ) {
        tokenA = firstFarm.coins[0]?.coinType || "";
        tokenB = firstFarm.coins[1]?.coinType || "";

        tokenASymbol = getSymbolFromType(tokenA);
        tokenBSymbol = getSymbolFromType(tokenB);
      }

      // Extract reward information
      const rewards: RewardInfo[] = [];

      if (firstFarm.rewards && Array.isArray(firstFarm.rewards)) {
        for (const reward of firstFarm.rewards) {
          rewards.push({
            tokenSymbol: getSymbolFromType(reward.coinType),
            tokenAddress: reward.coinType,
            amount: reward.amount || "0",
            formatted: "0", // Will be calculated during enrichment
            valueUsd: 0,
            decimals: 9, // Default
          });
        }
      }

      // Create normalized position
      const normalizedPosition: NormalizedPosition = {
        id: `aftermath-farm-${poolId}`,
        liquidity: "0",
        balanceA: firstFarm.coins?.[0]?.amount || "0",
        balanceB: firstFarm.coins?.[1]?.amount || "0",
        valueUsd: 0, // Will be calculated later
        isOutOfRange: false, // Not applicable for Aftermath
        positionType: "aftermath-farm",
        rewards,
        raw: firstFarm,
      };

      // Add the pool group
      poolGroups.push({
        poolAddress: poolId,
        poolName: `${tokenASymbol}/${tokenBSymbol} Farm`,
        protocol: "Aftermath",
        positions: [normalizedPosition],
        totalLiquidity: 0, // Will be calculated later
        totalValueUsd: 0, // Will be calculated later
        apr: 0, // Not directly available
        tokenA,
        tokenB,
        tokenASymbol,
        tokenBSymbol,
      });
    }
  }

  console.log(`Created ${poolGroups.length} Aftermath pool groups`);
  return poolGroups;
}

/**
 * Process and extract Cetus vault data from BlockVision API response
 *
 * @param rawData Raw response data from BlockVision API
 * @returns Array of processed Cetus vaults or empty array
 */
export function extractCetusVaultData(rawData: any): CetusVault[] {
  if (
    !rawData ||
    !rawData.cetus ||
    !rawData.cetus.vaults ||
    !Array.isArray(rawData.cetus.vaults)
  ) {
    console.log("No Cetus vault data found in BlockVision response");
    return [];
  }

  console.log(
    `Found ${rawData.cetus.vaults.length} Cetus vaults in BlockVision data`
  );

  // Extract and process vault data
  const vaults = rawData.cetus.vaults;

  // Store APY values in the global cache for cetusVaultService
  vaults.forEach((vault: any) => {
    if (vault.id && vault.apy && !isNaN(parseFloat(vault.apy))) {
      const apyValue = parseFloat(vault.apy);
      vaultApyCache.set(vault.id, apyValue);
      console.log(`Cached Cetus vault APY for ${vault.id}: ${apyValue}%`);
    }
  });

  return vaults;
}

/**
 * Get APY for a specific vault from the cache
 */
export function getVaultApy(vaultId: string): number | undefined {
  return vaultApyCache.get(vaultId);
}

/**
 * Clear the vault APY cache
 */
export function clearVaultApyCache(): void {
  vaultApyCache.clear();
  console.log("Vault APY cache cleared");
}

// ---------------------------------------------------------------------------
//  BlockVision – *extra* market‑data helpers (PRO endpoints)
//  last‑updated: 2025‑07‑12 05:01:23 UTC by jake1318
// ---------------------------------------------------------------------------

/** One point returned by /coin/ohlcv                                         */
export interface OhlcvPoint {
  /** start‑time of candle (unix **seconds**)            */ timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** buy‑side volume (token units)                      */ buyVolume: number;
  /** sell‑side volume (token units)                     */ sellVolume: number;
  /** buy + sell volume (token units)                    */ volume: number;
  /** BlockVision also echoes 'price' (avg)              */ price: number;
}

/** Real‑time market snapshot returned by /coin/market/pro                  */
export interface CoinMarketData {
  priceInUsd: string;
  marketCap: string;
  liquidityInUsd: string;
  fdvInUsd: string;
  circulating: string;
  supply: string;
  volume24H: number;
  tokenId: string; // Token address (type tag)
  market: {
    /** 30‑minute window   */ m30: MarketWindow;
    /** 1‑hour window      */ hour1: MarketWindow;
    /** 4‑hour window      */ hour4: MarketWindow;
    /** 24‑hour window     */ hour24: MarketWindow;
  };
}

export interface MarketWindow {
  tokenId: string;
  interval: string; // 30m / 1h / …
  priceChange: string; // percent (‑ve, +ve)
  buys: number;
  sells: number;
  buyVolume: number;
  sellVolume: number;
  buyers: number;
  sellers: number;
  txn: number;
  volume: number;
  markers: number;
}

/* ------------------------------------------------------------------------ */
/*  Shared low‑level helper                                                 */

const BLOCKVISION_BASE = "https://api.blockvision.org/v2/sui";
const BV_API_KEY =
  import.meta.env.VITE_BLOCKVISION_API_KEY || // ← Vite
  process.env.REACT_APP_BLOCKVISION_API_KEY || // ← CRA
  process.env.NEXT_PUBLIC_BLOCKVISION_API_KEY || // ← Next
  "YOUR_API_KEY_HERE"; //  Fallback

async function bvGet<T>(
  path: string,
  params: Record<string, string>
): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const url = `${BLOCKVISION_BASE}${path}?${qs}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      "x-api-key": BV_API_KEY,
    },
  });

  if (!res.ok) throw new Error(`BlockVision ${path} failed – ${res.status}`);

  const json = await res.json();
  if (json.code !== 200 || !json.result)
    throw new Error(`BlockVision ${path} unexpected payload`);

  return json.result as T;
}

/* ------------------------------------------------------------------------ */
/*  1.  Real‑time market‑data snapshot                                       */

export async function getCoinMarketDataPro(
  coinType: string // full type tag
): Promise<CoinMarketData> {
  // API default is SUI if param omitted, so always pass ours
  return await bvGet<CoinMarketData>("/coin/market/pro", { coinType });
}

/* ------------------------------------------------------------------------ */
/*  2.  OHLCV candlesticks                                                  */

export async function getCoinOhlcv(
  token: string, // full type tag
  interval:
    | "30s"
    | "1m"
    | "5m"
    | "15m"
    | "1h"
    | "4h"
    | "1d"
    | "1w"
    | "1M" = "1d",
  start?: number // unix seconds – default handled by API
): Promise<OhlcvPoint[]> {
  const params: Record<string, string> = { token, interval };
  if (start) params.start = String(start);
  const result = await bvGet<{ ohlcs: OhlcvPoint[] }>("/coin/ohlcv", params);
  return result.ohlcs;
}

/* -------------------------------------------------------------------------- */
/*  Fetch Coin Market Data for an arbitrary list of coinTypes (Pro key)       */
/*  – concurrent batches of 8, up to any length                               */
/* -------------------------------------------------------------------------- */
export async function getCoinMarketDataBatch(
  coinTypes: string[],
  concurrency: number = 8 // 8 parallel calls, tweak if you like
): Promise<Record<string, CoinMarketData>> {
  const out: Record<string, CoinMarketData> = {};
  let index = 0;

  async function worker() {
    while (index < coinTypes.length) {
      const myIndex = index++;
      const ct = coinTypes[myIndex];

      try {
        const data = await getCoinMarketDataPro(ct); // existing single‑call helper
        out[ct] = data;
      } catch (e) {
        console.warn(`BlockVision market/pro failed for ${ct}`, e);
      }
    }
  }

  // spin up N workers in parallel
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out;
}

export const blockvisionService = {
  getCoinDetail: async (coinType: string) => {
    try {
      const response = await blockvisionApi.get("/v2/sui/coin/detail", {
        params: { coinType },
      });
      const { code, message, result } = response.data;
      if (code === 200 && result) {
        // Get authoritative decimals from on-chain metadata
        const { decimals } = await getCoinMeta(coinType);

        // Cache the token info with correct decimals
        if (!tokenCache[coinType]) {
          tokenCache[coinType] = {
            symbol: result.symbol,
            decimals: decimals, // Use authoritative decimals
            price: result.price,
            logo: result.logo,
          };
        } else {
          // Update the decimals in the cache with the authoritative value
          tokenCache[coinType].decimals = decimals;
        }

        return { data: { ...result, decimals } };
      } else {
        throw new Error(
          `Blockvision getCoinDetail error: code=${code}, msg=${message}`
        );
      }
    } catch (error) {
      console.error(`Error fetching coin detail for ${coinType}:`, error);
      throw error;
    }
  },

  getAccountCoins: async (account: string) => {
    try {
      console.log(`Fetching account coins for: ${account}`);
      const response = await blockvisionApi.get("/v2/sui/account/coins", {
        params: { account },
      });
      const { code, message, result } = response.data;
      console.log(`BlockVision API response code: ${code}`);
      if (code === 200 && result && Array.isArray(result.coins)) {
        // Update cache with coin metadata - use getCoinMeta to ensure accurate decimals
        for (const coin of result.coins) {
          if (coin.coinType) {
            // Get authoritative decimals from on-chain metadata
            const { decimals: authoritativeDecimals } = await getCoinMeta(
              coin.coinType
            );

            tokenCache[coin.coinType] = {
              symbol: coin.symbol,
              decimals: authoritativeDecimals, // Use authoritative decimals
              price: parseFloat(coin.price || "0"),
              logo: coin.logo,
            };

            // Update the coin's decimals with authoritative value
            coin.decimals = authoritativeDecimals;
          }
        }

        return { data: result.coins as AccountCoin[] };
      } else {
        throw new Error(
          "Blockvision getAccountCoins error: unexpected response shape"
        );
      }
    } catch (error) {
      console.error("Error fetching account coins:", error);
      throw error;
    }
  },

  getAccountActivities: async (address: string, packageIds: string[] = []) => {
    try {
      const packageIdsParam = packageIds.length ? packageIds.join(",") : "";
      const response = await blockvisionApi.get("/v2/sui/account/activities", {
        params: { address, packageIds: packageIdsParam },
      });
      const { code, message, result } = response.data;
      if (code === 200 && result) {
        return { data: result };
      } else {
        throw new Error(
          `Blockvision getAccountActivities error: code=${code}, msg=${message}`
        );
      }
    } catch (error) {
      console.error("Error fetching account activities:", error);
      throw error;
    }
  },

  getWalletValue: async (account: string) => {
    try {
      const { data: coins } = await blockvisionService.getAccountCoins(account);
      if (!coins || !Array.isArray(coins)) {
        throw new Error("Invalid response format from getAccountCoins");
      }
      const totalUsdValue = coins
        .reduce((sum, coin) => {
          const usdValue = parseFloat(coin.usdValue || "0");
          return sum + usdValue;
        }, 0)
        .toFixed(2);
      return {
        totalUsdValue,
        coins,
      };
    } catch (error) {
      console.error("Error calculating wallet value:", error);
      throw error;
    }
  },

  /**
   * Get Scallop-specific portfolio data for a given address
   * @param address Wallet address to get Scallop data for
   * @returns Processed pool groups for Scallop positions
   */
  getScallopPortfolioData: async (address: string): Promise<any> => {
    try {
      console.log(`Fetching Scallop data for: ${address}`);

      // Call the BlockVision API specifically for Scallop
      const response = await blockvisionApi.get(
        "/v2/sui/account/defiPortfolio",
        {
          params: { address, protocol: "scallop" },
        }
      );

      const { code, result } = response.data;
      console.log(`BlockVision API response code for Scallop: ${code}`);

      if (code === 200 && result && result.scallop) {
        return result.scallop;
      } else {
        throw new Error(
          `BlockVision API returned error: ${response.data.message}`
        );
      }
    } catch (error) {
      console.error("Error fetching Scallop data:", error);
      return null; // Return empty array on error instead of throwing
    }
  },

  // Updated method to fetch DeFi portfolio that handles the protocol requirement
  // by fetching from multiple protocols and aggregating the data
  getDefiPortfolio: async (
    address: string,
    specificProtocol?: string,
    includeWalletAssets: boolean = true
  ): Promise<PoolGroup[]> => {
    try {
      console.log(
        `Fetching DeFi portfolio for: ${address}${
          specificProtocol
            ? ` (protocol: ${specificProtocol})`
            : " (all protocols)"
        }`
      );

      const protocolsToFetch = specificProtocol
        ? [specificProtocol]
        : SUPPORTED_PROTOCOLS;

      console.log(`Will fetch data for these protocols:`, protocolsToFetch);

      // Aggregate raw data from all protocols
      const combinedRawData: RawProtocolData = {};

      // Pre-load token metadata by getting account coins first
      let accountCoins: AccountCoin[] = [];
      try {
        const coinsResponse = await blockvisionService.getAccountCoins(address);
        accountCoins = coinsResponse.data || [];
        console.log("Retrieved account coins:", accountCoins.length);
      } catch (err) {
        // Non-critical - continue even if this fails
        console.warn("Failed to pre-load token metadata:", err);
      }

      // Fetch data for each protocol sequentially
      for (const protocol of protocolsToFetch) {
        try {
          console.log(`Fetching data for ${protocol}...`);
          const response = await blockvisionApi.get(
            "/v2/sui/account/defiPortfolio",
            {
              params: { address, protocol },
            }
          );

          const { code, result } = response.data;
          if (code === 200 && result) {
            // For each protocol, merge its data into our aggregate
            Object.entries(result).forEach(([key, data]) => {
              if (data) {
                if (!combinedRawData[key]) {
                  combinedRawData[key] = data;
                }
              }
            });

            console.log(`Successfully fetched ${protocol} data`);
          }
        } catch (err) {
          console.warn(`Failed to fetch ${protocol} data:`, err);
          // Continue with other protocols even if one fails
        }
      }

      console.log(
        `Finished fetching data for ${protocolsToFetch.length} protocols`
      );

      // Initialize pool groups array
      let poolGroups: PoolGroup[] = [];

      // Process Cetus data separately to ensure correct structure
      if (combinedRawData.cetus) {
        console.log("Found Cetus data, processing separately");

        // Process vaults
        if (
          combinedRawData.cetus.vaults &&
          combinedRawData.cetus.vaults.length > 0
        ) {
          console.log(
            `Processing ${combinedRawData.cetus.vaults.length} Cetus vaults`
          );
          const cetusVaultPoolGroups = processCetusVaultData(
            combinedRawData.cetus
          );

          // Add the processed Cetus vault groups to the main pool groups array
          if (cetusVaultPoolGroups.length > 0) {
            console.log(
              `Adding ${cetusVaultPoolGroups.length} Cetus vault pool groups to results`
            );
            poolGroups.push(...cetusVaultPoolGroups);
          }
        }

        // Process farms
        if (
          combinedRawData.cetus.farms &&
          combinedRawData.cetus.farms.length > 0
        ) {
          console.log(
            `Processing ${combinedRawData.cetus.farms.length} Cetus farms`
          );
          const cetusFarmPoolGroups = processCetusFarmsData(
            combinedRawData.cetus.farms
          );

          // Add the processed Cetus farm groups to the main pool groups array
          if (cetusFarmPoolGroups.length > 0) {
            console.log(
              `Adding ${cetusFarmPoolGroups.length} Cetus farm pool groups to results`
            );
            poolGroups.push(...cetusFarmPoolGroups);
          }
        }

        // Process LPs
        if (combinedRawData.cetus.lps && combinedRawData.cetus.lps.length > 0) {
          console.log(
            `Processing ${combinedRawData.cetus.lps.length} Cetus LP positions`
          );
          const cetusLPPoolGroups = processCetusLPsData(
            combinedRawData.cetus.lps
          );

          // Add the processed Cetus LP groups to the main pool groups array
          if (cetusLPPoolGroups.length > 0) {
            console.log(
              `Adding ${cetusLPPoolGroups.length} Cetus LP pool groups to results`
            );
            poolGroups.push(...cetusLPPoolGroups);
          }
        }
      }

      // Process the combined data into standardized pool groups
      const processedPoolGroups = await processDefiPortfolioData(
        combinedRawData
      );
      poolGroups = [...poolGroups, ...processedPoolGroups];

      // Process Turbos data separately to ensure correct structure
      if (combinedRawData.turbos) {
        console.log("Found Turbos data, processing separately");
        const turbosPoolGroups = processTurbosData(combinedRawData.turbos);

        // Add the processed Turbos groups to the main pool groups array
        if (turbosPoolGroups.length > 0) {
          console.log(
            `Adding ${turbosPoolGroups.length} Turbos pool groups to results`
          );
          poolGroups.push(...turbosPoolGroups);
        }
      }

      // Process Bluefin data separately to ensure correct structure
      if (combinedRawData.bluefin) {
        console.log("Found Bluefin data, processing separately");
        const bluefinPoolGroups = processBluefinData(combinedRawData.bluefin);
        // src/services/blockvisionService.ts
        // Last Updated: 2025-07-12 05:22:11 UTC by jake1318

        // Continuing from where it cut off...

        // Add the processed Bluefin groups to the main pool groups array
        if (bluefinPoolGroups.length > 0) {
          console.log(
            `Adding ${bluefinPoolGroups.length} Bluefin pool groups to results`
          );
          poolGroups.push(...bluefinPoolGroups);
        }
      }

      // Process SuiLend data separately to ensure correct structure
      if (combinedRawData.suilend) {
        console.log("Found SuiLend data, processing separately");
        const suilendPoolGroups = processSuilendData(combinedRawData.suilend);

        // Add the processed SuiLend groups to the main pool groups array
        if (suilendPoolGroups.length > 0) {
          console.log(
            `Adding ${suilendPoolGroups.length} SuiLend pool groups to results`
          );
          poolGroups.push(...suilendPoolGroups);
        }
      }

      // Process Haedal data separately to ensure correct structure
      if (combinedRawData.haedal) {
        console.log("Found Haedal data, processing separately");
        const haedalPoolGroups = processHaedalData(combinedRawData.haedal);

        // Add the processed Haedal groups to the main pool groups array
        if (haedalPoolGroups.length > 0) {
          console.log(
            `Adding ${haedalPoolGroups.length} Haedal pool groups to results`
          );
          poolGroups.push(...haedalPoolGroups);
        }
      }

      // Process Aftermath data separately to ensure correct structure
      if (combinedRawData.aftermath) {
        console.log("Found Aftermath data, processing separately");
        const aftermathPoolGroups = processAftermathData(
          combinedRawData.aftermath
        );

        // Add the processed Aftermath groups to the main pool groups array
        if (aftermathPoolGroups.length > 0) {
          console.log(
            `Adding ${aftermathPoolGroups.length} Aftermath pool groups to results`
          );
          poolGroups.push(...aftermathPoolGroups);
        }
      }

      // ─── patch START ──────────────────────────────────────────────────────
      // Now "enrich" every poolGroup & each position with real USD values
      await Promise.all(
        poolGroups.map(async (pool) => {
          // Only fetch tokens if they exist - handles empty string cases
          let tokenAInfo = { symbol: "Unknown", decimals: 9, price: 0 };
          let tokenBInfo = { symbol: "Unknown", decimals: 9, price: 0 };

          if (pool.tokenA) {
            tokenAInfo = await blockvisionService.getTokenInfo(pool.tokenA);
          }

          if (pool.tokenB) {
            tokenBInfo = await blockvisionService.getTokenInfo(pool.tokenB);
          }

          // Special handling for Cetus vaults
          if (
            pool.protocol === "Cetus" &&
            pool.positions[0]?.positionType === "cetus-vault"
          ) {
            // Get token info for proper price and decimal information
            const tokenAInfo = await blockvisionService.getTokenInfo(
              pool.tokenA
            );
            let tokenBInfo = { symbol: "Unknown", decimals: 9, price: 0 };

            if (pool.tokenB) {
              tokenBInfo = await blockvisionService.getTokenInfo(pool.tokenB);
            }

            for (const pos of pool.positions) {
              if (pos.raw) {
                const vault = pos.raw;

                // Convert raw balances to formatted values
                pos.formattedBalanceA = formatTokenAmount(
                  normalizeAmount(pos.balanceA, tokenAInfo.decimals)
                );

                if (pos.balanceB !== "0") {
                  pos.formattedBalanceB = formatTokenAmount(
                    normalizeAmount(pos.balanceB, tokenBInfo.decimals)
                  );
                } else {
                  pos.formattedBalanceB = "0";
                }

                // Calculate USD values
                const normA = normalizeAmount(
                  pos.balanceA || "0",
                  tokenAInfo.decimals
                );
                const normB = normalizeAmount(
                  pos.balanceB || "0",
                  tokenBInfo.decimals
                );
                const usdA = normA * (tokenAInfo.price || 0);
                const usdB = normB * (tokenBInfo.price || 0);
                pos.valueUsd = usdA + usdB;
              }
            }

            // Set logos for the pool if they're not already set
            if (!pool.tokenALogo && tokenAInfo.logo) {
              pool.tokenALogo = tokenAInfo.logo;
            }
            if (!pool.tokenBLogo && tokenBInfo.logo) {
              pool.tokenBLogo = tokenBInfo.logo;
            }

            // Update the total values for the pool
            pool.totalValueUsd = pool.positions.reduce(
              (sum, p) => sum + (p.valueUsd || 0),
              0
            );

            // Make sure APR is set correctly using the APY value
            if (pool.positions[0]?.raw?.apy) {
              pool.apr = parseFloat(pool.positions[0].raw.apy);
            }
          }

          // Special handling for Cetus farms
          if (
            pool.protocol === "Cetus" &&
            pool.positions[0]?.positionType === "cetus-farm"
          ) {
            // Get token info for proper price and decimal information
            const tokenAInfo = await blockvisionService.getTokenInfo(
              pool.tokenA
            );
            let tokenBInfo = { symbol: "Unknown", decimals: 9, price: 0 };

            if (pool.tokenB) {
              tokenBInfo = await blockvisionService.getTokenInfo(pool.tokenB);
            }

            for (const pos of pool.positions) {
              // Calculate USD values
              const normA = normalizeAmount(
                pos.balanceA || "0",
                tokenAInfo.decimals
              );
              const normB = normalizeAmount(
                pos.balanceB || "0",
                tokenBInfo.decimals
              );
              const usdA = normA * (tokenAInfo.price || 0);
              const usdB = normB * (tokenBInfo.price || 0);
              pos.valueUsd = usdA + usdB;

              // Format balances
              pos.formattedBalanceA = formatTokenAmount(normA);
              pos.formattedBalanceB = formatTokenAmount(normB);

              // Process rewards if available
              if (pos.rewards && Array.isArray(pos.rewards)) {
                for (const reward of pos.rewards) {
                  const rewardInfo = await blockvisionService.getTokenInfo(
                    reward.tokenAddress || ""
                  );
                  const amount = normalizeAmount(
                    reward.amount || "0",
                    rewardInfo.decimals
                  );
                  reward.formatted = formatTokenAmount(amount);
                  reward.valueUsd = amount * (rewardInfo.price || 0);
                }
              }
            }

            // Update the total values for the pool
            pool.totalValueUsd = pool.positions.reduce(
              (sum, p) => sum + (p.valueUsd || 0),
              0
            );
          }

          // Special handling for Turbos
          if (pool.protocol === "Turbos") {
            // Get token info for proper price and decimal information
            tokenAInfo = await blockvisionService.getTokenInfo(pool.tokenA);
            tokenBInfo = await blockvisionService.getTokenInfo(pool.tokenB);

            for (const pos of pool.positions) {
              if (pos.raw) {
                // Extract data from the raw response
                const rawData = pos.raw;

                // Convert raw balances to formatted values
                pos.formattedBalanceA = formatTokenAmount(
                  normalizeAmount(pos.balanceA, tokenAInfo.decimals)
                );
                pos.formattedBalanceB = formatTokenAmount(
                  normalizeAmount(pos.balanceB, tokenBInfo.decimals)
                );

                // Calculate USD values
                const normA = normalizeAmount(
                  pos.balanceA || "0",
                  tokenAInfo.decimals
                );
                const normB = normalizeAmount(
                  pos.balanceB || "0",
                  tokenBInfo.decimals
                );
                const usdA = normA * (tokenAInfo.price || 0);
                const usdB = normB * (tokenBInfo.price || 0);
                pos.valueUsd = usdA + usdB;

                // Process rewards
                if (pos.rewards && Array.isArray(pos.rewards)) {
                  for (const reward of pos.rewards) {
                    const rewardTokenInfo =
                      await blockvisionService.getTokenInfo(
                        reward.tokenAddress || ""
                      );

                    // Update reward with proper decimals
                    reward.formatted = formatTokenAmount(
                      normalizeAmount(
                        reward.amount || "0",
                        rewardTokenInfo.decimals
                      )
                    );

                    // Calculate USD value
                    const normalizedAmount = normalizeAmount(
                      reward.amount || "0",
                      rewardTokenInfo.decimals
                    );
                    reward.valueUsd =
                      normalizedAmount * (rewardTokenInfo.price || 0);
                  }
                }
              }
            }

            // Set logos for the pool
            if (!pool.tokenALogo) {
              pool.tokenALogo = tokenAInfo.logo;
            }
            if (!pool.tokenBLogo) {
              pool.tokenBLogo = tokenBInfo.logo;
            }

            // Update the total values for the pool
            pool.totalValueUsd = pool.positions.reduce(
              (sum, p) => sum + (p.valueUsd || 0),
              0
            );

            // Calculate APR if not set
            if (pool.apr === 0) {
              // As a fallback, assign a default APR of 10%
              // Or you could calculate based on fee tier if available
              pool.apr = 10;
            }
          }

          // Special handling for Bluefin
          if (pool.protocol === "Bluefin") {
            // Set token symbols correctly
            pool.tokenASymbol = pool.tokenASymbol || "SUI";
            pool.tokenBSymbol = pool.tokenBSymbol || "USDC";

            // Set token addresses if missing
            if (!pool.tokenA) {
              pool.tokenA = "0x2::sui::SUI";
            }
            if (!pool.tokenB) {
              pool.tokenB =
                "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
            }

            // Get token info for proper price and decimal information
            tokenAInfo = await blockvisionService.getTokenInfo(pool.tokenA);
            tokenBInfo = await blockvisionService.getTokenInfo(pool.tokenB);

            for (const pos of pool.positions) {
              if (pos.raw) {
                // Extract data from the raw response
                const rawData = pos.raw;

                // Handle balance amounts - convert from raw values to proper values
                if (rawData.coinAmountA) {
                  pos.balanceA = rawData.coinAmountA;
                  pos.formattedBalanceA = formatTokenAmount(
                    normalizeAmount(rawData.coinAmountA, tokenAInfo.decimals)
                  );
                }

                if (rawData.coinAmountB) {
                  pos.balanceB = rawData.coinAmountB;
                  pos.formattedBalanceB = formatTokenAmount(
                    normalizeAmount(rawData.coinAmountB, tokenBInfo.decimals)
                  );
                }

                // Calculate USD values if not provided
                if (pos.valueUsd === 0) {
                  const normA = normalizeAmount(
                    pos.balanceA || "0",
                    tokenAInfo.decimals
                  );
                  const normB = normalizeAmount(
                    pos.balanceB || "0",
                    tokenBInfo.decimals
                  );
                  const usdA = normA * (tokenAInfo.price || 0);
                  const usdB = normB * (tokenBInfo.price || 0);
                  pos.valueUsd = usdA + usdB;
                }

                // Handle fees
                if (rawData.reward && rawData.reward.fee) {
                  const feeA =
                    normalizeAmount(
                      rawData.reward.fee.coinA || "0",
                      tokenAInfo.decimals
                    ) * (tokenAInfo.price || 0);
                  const feeB =
                    normalizeAmount(
                      rawData.reward.fee.coinB || "0",
                      tokenBInfo.decimals
                    ) * (tokenBInfo.price || 0);
                  pos.feesUsd = feeA + feeB;
                }

                // Handle rewards
                if (
                  rawData.reward &&
                  rawData.reward.rewards &&
                  Array.isArray(rawData.reward.rewards)
                ) {
                  pos.rewards = rawData.reward.rewards.map((reward) => {
                    // Get token info for the reward
                    const rewardTokenInfo = tokenCache[reward.coinType] || {
                      symbol: reward.coinSymbol,
                      decimals: reward.coinDecimals || 9,
                      price: 0,
                    };

                    // Calculate reward value
                    const normalizedAmount = normalizeAmount(
                      reward.coinAmount || "0",
                      rewardTokenInfo.decimals
                    );

                    return {
                      tokenSymbol: reward.coinSymbol,
                      tokenAddress: reward.coinType,
                      amount: reward.coinAmount,
                      formatted: formatTokenAmount(normalizedAmount),
                      valueUsd: normalizedAmount * (rewardTokenInfo.price || 0),
                      decimals: rewardTokenInfo.decimals,
                    };
                  });
                }

                // Set out-of-range status
                pos.isOutOfRange = rawData.isOut === true;
              }
            }

            // Update the total values for the pool
            pool.totalValueUsd = pool.positions.reduce(
              (sum, p) => sum + (p.valueUsd || 0),
              0
            );

            pool.totalFeesUsd = pool.positions.reduce(
              (sum, p) => sum + (p.feesUsd || 0),
              0
            );

            // Set APR from the raw data if available
            if (pool.positions.length > 0 && pool.positions[0].raw?.apr) {
              pool.apr = parseFloat(pool.positions[0].raw.apr);
            }
          }

          // Special handling for SuiLend
          if (pool.protocol === "SuiLend") {
            // Make sure we have token info with proper price data
            if (pool.tokenA) {
              tokenAInfo = await blockvisionService.getTokenInfo(pool.tokenA);
              console.log(
                `SuiLend token info for ${pool.tokenA}: symbol=${tokenAInfo.symbol}, price=${tokenAInfo.price}`
              );
            }

            for (const pos of pool.positions) {
              if (pos.raw) {
                // Extract data from raw asset
                const asset = pos.raw;
                const coinType = asset.coinType;
                const decimals = asset.decimals || 9;

                // Get detailed token info to ensure we have price data
                const tokenInfo = await blockvisionService.getTokenInfo(
                  coinType
                );
                console.log(
                  `SuiLend token price for ${coinType}: $${tokenInfo.price}`
                );

                // Parse the amount string correctly
                const amount = asset.amount || "0";

                // Handle both decimal string format and raw integer format
                let normalizedAmount;
                if (typeof amount === "string" && amount.includes(".")) {
                  // Amount is already in human-readable decimal form (e.g. "0.10007528417254307397")
                  normalizedAmount = parseFloat(amount);
                  console.log(`SuiLend amount ${amount} is already normalized`);
                } else {
                  // Amount needs to be normalized with decimals
                  normalizedAmount = normalizeAmount(amount, decimals);
                  console.log(
                    `SuiLend amount ${amount} normalized to ${normalizedAmount}`
                  );
                }

                // Format for display
                pos.formattedBalanceA = formatTokenAmount(normalizedAmount);

                // Calculate USD value using actual price data - ensure we have a valid price
                const tokenPrice = tokenInfo.price || 0;
                pos.valueUsd = normalizedAmount * tokenPrice;

                console.log(
                  `SuiLend position value calculation: ${normalizedAmount} ${tokenInfo.symbol} * $${tokenPrice} = $${pos.valueUsd}`
                );
              }
            }

            // Make sure logo is set
            if (!pool.tokenALogo && tokenAInfo.logo) {
              pool.tokenALogo = tokenAInfo.logo;
            }

            // Update the total value for the pool
            pool.totalValueUsd = pool.positions.reduce(
              (sum, p) => sum + (p.valueUsd || 0),
              0
            );

            console.log(
              `Final SuiLend pool ${pool.poolName} total value: $${pool.totalValueUsd}`
            );
          }

          // Special handling for Suistake - often has SUI token info
          if (pool.protocol === "Suistake") {
            // Try to find SUI as tokenA
            const suiCoinType = "0x2::sui::SUI";
            tokenAInfo = await blockvisionService.getTokenInfo(suiCoinType);
            pool.tokenA = suiCoinType;
            pool.tokenASymbol = "SUI";

            // Extract staked amount from position.raw
            for (const pos of pool.positions) {
              if (pos.raw && pos.raw.stakeAmount) {
                pos.balanceA = pos.raw.stakeAmount;
                pos.balanceB = "0";

                // Update valueUSD from stakeUSDValue if available
                if (pos.raw.stakeUSDValue) {
                  pos.valueUsd = Number(pos.raw.stakeUSDValue);
                } else {
                  // Calculate value using SUI price
                  const normA = normalizeAmount(
                    pos.balanceA,
                    tokenAInfo.decimals
                  );
                  const usdValue = normA * tokenAInfo.price;
                  pos.valueUsd = usdValue;
                }

                // Also handle rewards
                if (
                  pos.raw.estimatedRewardAmount &&
                  pos.raw.estimatedRewardUSDValue
                ) {
                  pos.rewards = [
                    {
                      tokenSymbol: "SUI",
                      tokenAddress: suiCoinType,
                      amount: pos.raw.estimatedRewardAmount,
                      formatted: formatTokenAmount(
                        normalizeAmount(
                          pos.raw.estimatedRewardAmount,
                          tokenAInfo.decimals
                        )
                      ),
                      valueUsd: Number(pos.raw.estimatedRewardUSDValue),
                      decimals: tokenAInfo.decimals,
                    },
                  ];
                }

                // Set APY
                if (pos.raw.apy) {
                  pool.apr = parseFloat(pos.raw.apy) * 100; // Convert to percentage
                }
              }
            }
          }

          // Special handling for Haedal
          if (pool.protocol === "Haedal") {
            // Get token info for proper price and decimal information
            if (pool.tokenA) {
              tokenAInfo = await blockvisionService.getTokenInfo(pool.tokenA);
            }
            if (pool.tokenB) {
              tokenBInfo = await blockvisionService.getTokenInfo(pool.tokenB);
            }

            for (const pos of pool.positions) {
              // Calculate USD values
              if (pos.positionType === "haedal-lp") {
                const normA = normalizeAmount(
                  pos.balanceA || "0",
                  tokenAInfo.decimals
                );
                const normB = normalizeAmount(
                  pos.balanceB || "0",
                  tokenBInfo.decimals
                );
                const usdA = normA * (tokenAInfo.price || 0);
                const usdB = normB * (tokenBInfo.price || 0);
                pos.valueUsd = usdA + usdB;

                pos.formattedBalanceA = formatTokenAmount(normA);
                pos.formattedBalanceB = formatTokenAmount(normB);
              } else if (pos.positionType === "haedal-staking") {
                const normA = normalizeAmount(
                  pos.balanceA || "0",
                  tokenAInfo.decimals
                );
                pos.valueUsd = normA * (tokenAInfo.price || 0);
                pos.formattedBalanceA = formatTokenAmount(normA);
              }
            }

            // Set logos for the pool
            if (!pool.tokenALogo && tokenAInfo.logo) {
              pool.tokenALogo = tokenAInfo.logo;
            }
            if (!pool.tokenBLogo && tokenBInfo.logo) {
              pool.tokenBLogo = tokenBInfo.logo;
            }

            // Update the total values for the pool
            pool.totalValueUsd = pool.positions.reduce(
              (sum, p) => sum + (p.valueUsd || 0),
              0
            );
          }

          // Special handling for Aftermath
          if (pool.protocol === "Aftermath") {
            // Get token info for proper price and decimal information
            if (pool.tokenA) {
              tokenAInfo = await blockvisionService.getTokenInfo(pool.tokenA);
            }
            if (pool.tokenB) {
              tokenBInfo = await blockvisionService.getTokenInfo(pool.tokenB);
            }

            for (const pos of pool.positions) {
              if (pos.raw) {
                // For each position in Aftermath, calculate value from coin amounts
                if (pos.raw.coins && Array.isArray(pos.raw.coins)) {
                  let totalValue = 0;

                  // Process each coin in the position
                  for (let i = 0; i < pos.raw.coins.length; i++) {
                    const coin = pos.raw.coins[i];
                    const coinType = coin.coinType;
                    const amount = coin.amount || "0";

                    // Get token info for this coin
                    const tokenInfo = await blockvisionService.getTokenInfo(
                      coinType
                    );

                    // Calculate value
                    const normalizedAmount = normalizeAmount(
                      amount,
                      tokenInfo.decimals
                    );
                    const coinValue = normalizedAmount * (tokenInfo.price || 0);
                    totalValue += coinValue;

                    // Store formatted values
                    if (i === 0) {
                      pos.formattedBalanceA =
                        formatTokenAmount(normalizedAmount);
                    } else if (i === 1) {
                      pos.formattedBalanceB =
                        formatTokenAmount(normalizedAmount);
                    }
                  }

                  pos.valueUsd = totalValue;
                }

                // Process rewards if they exist
                if (pos.rewards && Array.isArray(pos.rewards)) {
                  for (const reward of pos.rewards) {
                    if (reward.tokenAddress) {
                      const rewardTokenInfo =
                        await blockvisionService.getTokenInfo(
                          reward.tokenAddress
                        );

                      const normalizedAmount = normalizeAmount(
                        reward.amount || "0",
                        rewardTokenInfo.decimals
                      );
                      reward.formatted = formatTokenAmount(normalizedAmount);
                      reward.valueUsd =
                        normalizedAmount * (rewardTokenInfo.price || 0);
                    }
                  }
                }
              }
            }

            // Update the total values for the pool
            pool.totalValueUsd = pool.positions.reduce(
              (sum, p) => sum + (p.valueUsd || 0),
              0
            );

            // Estimate APR if rewards exist
            if (
              pool.positions[0]?.rewards &&
              pool.positions[0]?.rewards.length > 0
            ) {
              // Simple APR estimation based on rewards value vs position value
              const rewardValue = pool.positions[0].rewards.reduce(
                (sum, r) => sum + (r.valueUsd || 0),
                0
              );

              if (pool.totalValueUsd > 0) {
                // Assume rewards are weekly, annualize to get APR
                pool.apr = (rewardValue / pool.totalValueUsd) * 52 * 100;
              }
            }
          }

          for (const pos of pool.positions) {
            // Check if value is missing
            if (pos.valueUsd === 0) {
              // parse out the raw balances
              const rawA = pos.balanceA || "0";
              const rawB = pos.balanceB || "0";

              // normalize to human numbers
              const normA = normalizeAmount(rawA, tokenAInfo.decimals);
              const normB = normalizeAmount(rawB, tokenBInfo.decimals);

              // compute USD
              const usdA = normA * (tokenAInfo.price || 0);
              const usdB = normB * (tokenBInfo.price || 0);
              const combined = usdA + usdB;

              // Log the calculation
              console.log(
                `Calculated position value: ${normA} ${tokenAInfo.symbol} * $${tokenAInfo.price} + ${normB} ${tokenBInfo.symbol} * $${tokenBInfo.price} = $${combined}`
              );

              // Override the API's valueUsd with our calculated value
              pos.valueUsd = combined;
            }
          }

          // re-sum the pool's totalValueUsd
          pool.totalValueUsd = pool.positions.reduce(
            (sum, p) => sum + (p.valueUsd || 0),
            0
          );
        })
      );

      // Add wallet balances as a separate "Wallet" pool, but only if includeWalletAssets is true
      if (includeWalletAssets && accountCoins && accountCoins.length > 0) {
        // Extract non-zero balance coins
        const nonZeroCoins = accountCoins.filter(
          (coin) =>
            parseFloat(coin.usdValue || "0") > 0 ||
            parseFloat(coin.balance || "0") > 0
        );

        if (nonZeroCoins.length > 0) {
          const walletPositions: NormalizedPosition[] = [];
          let totalWalletValue = 0;

          // Create a position for each token
          for (const coin of nonZeroCoins) {
            const valueUsd = parseFloat(coin.usdValue || "0");
            const balance = coin.balance || "0";
            const decimals = coin.decimals || 9;
            const normalizedBalance = normalizeAmount(balance, decimals);

            // Create position
            walletPositions.push({
              id: `wallet-${coin.coinType}`,
              liquidity: "0",
              balanceA: balance,
              balanceB: "0",
              valueUsd: valueUsd,
              formattedBalanceA: formatTokenAmount(normalizedBalance),
              formattedBalanceB: "0",
              isOutOfRange: false,
              positionType: "wallet",
              raw: coin,
            });

            totalWalletValue += valueUsd;
          }

          // Add wallet pool to pool groups
          if (walletPositions.length > 0) {
            poolGroups.push({
              poolAddress: "wallet",
              poolName: "Wallet",
              protocol: "Wallet",
              positions: walletPositions,
              totalLiquidity: 0,
              totalValueUsd: totalWalletValue,
              apr: 0,
              tokenA: "",
              tokenB: "",
              tokenASymbol: "Assets",
              tokenBSymbol: "",
              tokenALogo: "/assets/images/wallet.png", // Use a wallet icon
            });
          }
        }
      }
      // ─── patch END ───────────────────────────────────────────────────────

      return poolGroups;
    } catch (error) {
      console.error("Error fetching DeFi portfolio:", error);
      throw error;
    }
  },

  /**
   * Get DeFi portfolio data specifically for the user's Cetus vaults
   */
  getDefiPortfolioData: async (
    address: string
  ): Promise<{
    poolGroups: PoolGroup[];
    rawData: RawProtocolData;
  }> => {
    try {
      console.log(`Fetching DeFi portfolio data for address: ${address}`);

      // We're primarily interested in Cetus protocol data for vaults
      const response = await blockvisionApi.get(
        "/v2/sui/account/defiPortfolio",
        {
          params: { address, protocol: "cetus" },
        }
      );

      if (response.data.code !== 200) {
        throw new Error(`API error: ${response.data.message}`);
      }

      const rawData: RawProtocolData = response.data.result || {};

      // Extract Cetus vaults data and store APYs in cache
      if (
        rawData.cetus &&
        rawData.cetus.vaults &&
        Array.isArray(rawData.cetus.vaults)
      ) {
        extractCetusVaultData(rawData);
      }

      console.log("Raw BlockVision data:", rawData);

      // Process the raw data into normalized format
      const poolGroups = await processDefiPortfolioData(rawData);

      return {
        poolGroups,
        rawData,
      };
    } catch (error) {
      console.error("Error fetching DeFi portfolio data:", error);
      throw error;
    }
  },

  // Helper to look up token metadata and price using BlockVision or Birdeye
  getTokenInfo: async (coinType: string) => {
    // Sanitize input
    if (!coinType || typeof coinType !== "string") {
      return { symbol: "Unknown", decimals: 9, price: 0 };
    }

    // Check cache first
    if (tokenCache[coinType] && tokenCache[coinType].price !== undefined) {
      // If the cache still has the optimistic default (9), upgrade it silently
      if (tokenCache[coinType].decimals === 9) {
        getCoinMeta(coinType).then(({ decimals }) => {
          tokenCache[coinType].decimals = decimals;
        });
      }
      return tokenCache[coinType];
    }

    try {
      // Try BlockVision first
      const { data } = await blockvisionService.getCoinDetail(coinType);
      // Get authoritative decimals from on-chain metadata
      const { decimals } = await getCoinMeta(coinType);

      if (data.price) {
        console.log(
          `Got price for ${coinType} from BlockVision: $${data.price}`
        );
        // Update cache with authoritative decimals
        tokenCache[coinType] = {
          symbol: data.symbol,
          decimals, // Use authoritative decimals from on-chain metadata
          price: data.price,
          logo: data.logo,
        };
        return tokenCache[coinType];
      }
    } catch (err) {
      console.warn(
        `Failed to get price from BlockVision for ${coinType}:`,
        err
      );
    }

    // If Blockvision fails, try Birdeye with rate limiting
    try {
      return await enqueueBirdeyeRequest(async () => {
        const metadata = await getBirdeyeTokenMetadata(coinType);
        // Get authoritative decimals from on-chain metadata
        const coinMeta = await getCoinMeta(coinType);

        if (metadata) {
          // Make a second call to get the price from Birdeye
          const response = await fetch(
            `https://public-api.birdeye.so/defi/v3/price/multi_price?&address=${coinType}`,
            {
              headers: {
                accept: "application/json",
                "x-chain": "sui",
                "X-API-KEY": "22430f5885a74d3b97e7cbd01c2140aa",
              },
            }
          );

          if (response.ok) {
            const priceData = await response.json();
            const price = priceData?.data?.[coinType]?.value;

            if (price) {
              console.log(`Got price for ${coinType} from Birdeye: $${price}`);

              // Update cache with authoritative decimals
              tokenCache[coinType] = {
                symbol: metadata.symbol,
                decimals: coinMeta.decimals, // Use authoritative decimals from on-chain metadata
                price: price,
                logo: metadata.logo_uri,
              };
              return tokenCache[coinType];
            }
          }
        }

        // If all fails, return with authoritative decimals but fallback values for other fields
        return {
          symbol: getSymbolFromType(coinType),
          decimals: coinMeta.decimals, // Use authoritative decimals from on-chain metadata
          price: 0,
          logo: undefined,
        };
      });
    } catch (err) {
      console.warn(`Failed to get price from Birdeye for ${coinType}:`, err);

      // If all fails, at least get authoritative decimals
      const coinMeta = await getCoinMeta(coinType);
      return {
        symbol: getSymbolFromType(coinType),
        decimals: coinMeta.decimals, // Use authoritative decimals from on-chain metadata
        price: 0,
        logo: undefined,
      };
    }
  },

  // Export accessor functions for the vaultApyCache
  getVaultApy,
  clearVaultApyCache,
  extractCetusVaultData,

  // Export market data functions
  getCoinMarketDataPro,
  getCoinOhlcv,
  getCoinMarketDataBatch,
};

export default blockvisionService;
// Make getDefiPortfolioData available as a named export
export const getDefiPortfolioData = blockvisionService.getDefiPortfolioData;
// Export the new functions as named exports
export const getScallopPortfolioData =
  blockvisionService.getScallopPortfolioData;

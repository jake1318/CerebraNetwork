// src/services/blockvisionDataProcessor.ts 
// Last Updated: 2025-05-05 22:24:09 UTC by jake1318

import { RawProtocolData, PoolGroup, NormalizedPosition, RewardInfo } from './blockvisionService';
import { normalizeAmount } from './blockvisionService';

// Token cache to avoid repeated lookups (shared with blockvisionService via imports)
const tokenCache: Record<string, { symbol: string, decimals: number, price?: number, logo?: string }> = {};

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
 * Format a numeric value with appropriate decimal places based on magnitude
 */
const formatTokenAmount = (value: number): string => {
  if (value === 0) return "0";
  
  if (Math.abs(value) >= 1) {
    // For values >= 1, show 2-4 decimal places
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4
    });
  } else if (Math.abs(value) >= 0.01) {
    // For small values, show more precision
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 6
    });
  } else if (Math.abs(value) > 0) {
    // For very small values, avoid showing 0
    return value > 0 ? "<0.01" : ">-0.01";
  }
  
  return "0";
};

/**
 * Generate unique ID for a position
 */
const generateUniqueId = (protocol: string, category: string, index: number): string => {
  return `${protocol}-${category}-${index}-${Date.now()}`;
};

/**
 * Helper to extract protocol-specific fee data and calculate USD value
 */
const extractFeesUsd = (protocolData: any, protocol: string): number => {
  let result = 0;
  
  try {
    switch (protocol.toLowerCase()) {
      case "cetus":
        // Cetus often provides fee data
        if (protocolData.feeOwedA && protocolData.feeOwedB) {
          // Try to get direct USD values if available
          if (protocolData.feeOwedAUsd && protocolData.feeOwedBUsd) {
            result = Number(protocolData.feeOwedAUsd) + Number(protocolData.feeOwedBUsd);
          }
          
          // Otherwise calculate based on token A/B prices if available
          else if (protocolData.coinTypeAPrice && protocolData.coinTypeBPrice) {
            const feeA = typeof protocolData.feeOwedA === 'string' && /^[0-9a-f]+$/i.test(protocolData.feeOwedA) 
              ? parseInt(protocolData.feeOwedA, 16) 
              : Number(protocolData.feeOwedA || 0);
              
            const feeB = typeof protocolData.feeOwedB === 'string' && /^[0-9a-f]+$/i.test(protocolData.feeOwedB)
              ? parseInt(protocolData.feeOwedB, 16)
              : Number(protocolData.feeOwedB || 0);
              
            const decimalsA = protocolData.coinTypeADecimals || 9;
            const decimalsB = protocolData.coinTypeBDecimals || 9;
            
            result = (feeA / Math.pow(10, decimalsA)) * Number(protocolData.coinTypeAPrice) +
                    (feeB / Math.pow(10, decimalsB)) * Number(protocolData.coinTypeBPrice);
          }
        }
        break;
        
      case "turbos":
        // Turbos usually has unclaimedFee fields with USD prices
        result = Number(protocolData.unclaimedFeeAUsdPrice || 0) + 
               Number(protocolData.unclaimedFeeBUsdPrice || 0);
        break;
      
      default:
        result = Number(protocolData.feesUsd || 0);
        break;
    }
  } catch (err) {
    console.error("Error extracting fees:", err);
    result = 0;
  }
  
  console.log(`Extracted fees for ${protocol}: $${result}`);
  return result;
};

// Process the raw portfolio data into normalized pool groups
async function processDefiPortfolioData(rawData: RawProtocolData): Promise<PoolGroup[]> {
  // Store all pools here
  const poolGroups: Record<string, PoolGroup> = {};

  // Process each protocol's data
  for (const [protocol, data] of Object.entries(rawData)) {
    if (!data) continue;

    switch (protocol.toLowerCase()) {
      case "cetus":
        await processCetusPositions(data, poolGroups);
        break;

      case "turbos":
        await processTurbosPositions(data, poolGroups);
        break;

      case "flowx":
        await processFlowXPositions(data, poolGroups);
        break;

      case "suilend":
        await processSuiLendPositions(data, poolGroups);
        break;

      case "kriya":
        await processKriyaPositions(data, poolGroups);
        break;

      case "navi":
        await processNaviPositions(data, poolGroups);
        break;
        
      case "suistake":
        await processSuistakePositions(data, poolGroups);
        break;

      // Add more protocols as needed

      default:
        // Handle unknown protocols
        await processGenericProtocolPositions(protocol, data, poolGroups);
        break;
    }
  }

  // Return as array, sort by total value descending
  return Object.values(poolGroups).sort(
    (a, b) => b.totalValueUsd - a.totalValueUsd
  );
}

// Process Suistake positions
async function processSuistakePositions(
  data: any,
  poolGroups: Record<string, PoolGroup>
): Promise<void> {
  // Exit if no data
  if (!data || !data.stakes || !Array.isArray(data.stakes) || data.stakes.length === 0) {
    console.log("No Suistake data to process");
    return;
  }
  
  console.log(`Processing ${data.stakes.length} Suistake positions`);
  
  for (const stake of data.stakes) {
    // Generate a unique identifier for this staking position
    const timestamp = Date.now();
    const poolId = `suistake-${timestamp}`;
    
    // Extract important data from the stake object
    const stakeAmount = stake.stakeAmount || "0";
    const stakeUSDValue = parseFloat(stake.stakeUSDValue || "0");
    const estimatedRewardAmount = stake.estimatedRewardAmount || "0";
    const estimatedRewardUSDValue = parseFloat(stake.estimatedRewardUSDValue || "0");
    const apy = stake.apy || "0";
    const validatorName = stake.validatorName || "Unknown Validator";
    
    // Create normalized position - we'll update the token values in the enrichment phase
    const position: NormalizedPosition = {
      id: `Suistake-position-${Math.floor(Math.random() * 10000)}-${timestamp}`,
      liquidity: "0",
      balanceA: stakeAmount, // This is the staked SUI
      balanceB: "0", // No second token for staking
      formattedBalanceA: "0", // Will be updated later
      formattedBalanceB: "0",
      valueUsd: stakeUSDValue, // Use the USD value from the API
      isOutOfRange: false,
      positionType: "suistake",
      raw: stake // Keep the raw data for later use
    };
    
    // Add rewards if available
    if (estimatedRewardAmount !== "0" || estimatedRewardUSDValue > 0) {
      position.rewards = [{
        tokenSymbol: "SUI",
        tokenAddress: "0x2::sui::SUI",
        amount: estimatedRewardAmount,
        valueUsd: estimatedRewardUSDValue
      }];
    }
    
    // Create or get the pool group
    if (!poolGroups[poolId]) {
      poolGroups[poolId] = {
        poolAddress: poolId,
        poolName: `Staked SUI (${validatorName})`,
        protocol: "Suistake",
        positions: [],
        totalLiquidity: 0,
        totalValueUsd: 0,
        apr: parseFloat(apy) * 100, // Convert to percentage
        tokenA: "0x2::sui::SUI", // SUI is the staked token
        tokenB: "",
        tokenASymbol: "SUI",
        tokenBSymbol: "",
        tokenALogo: stake.validatorImage,
      };
    }
    
    // Add position and update totals
    poolGroups[poolId].positions.push(position);
    poolGroups[poolId].totalValueUsd += stakeUSDValue;
    
    console.log(`Added Suistake position with value: $${stakeUSDValue}`);
  }
}

// Process Cetus positions
async function processCetusPositions(
  data: any,
  poolGroups: Record<string, PoolGroup>
): Promise<void> {
  if (!data.lps || !Array.isArray(data.lps)) return;

  console.log(`Processing ${data.lps.length} Cetus positions`);

  // Process each LP position
  for (const lp of data.lps) {
    const poolAddress = lp.pool || lp.poolAddress;
    if (!poolAddress) continue;

    // Handle decimals properly - use from metadata or default to 9
    const tokenADecimals = lp.coinTypeADecimals || 9;
    const tokenBDecimals = lp.coinTypeBDecimals || 9;
    
    const tokenASymbol = getSymbolFromType(lp.coinTypeA);
    const tokenBSymbol = getSymbolFromType(lp.coinTypeB);
    
    // Store token decimals in cache
    if (lp.coinTypeA && tokenADecimals) {
      if (!tokenCache[lp.coinTypeA]) {
        tokenCache[lp.coinTypeA] = { symbol: tokenASymbol, decimals: tokenADecimals };
      } else {
        tokenCache[lp.coinTypeA].decimals = tokenADecimals;
      }
    }
    
    if (lp.coinTypeB && tokenBDecimals) {
      if (!tokenCache[lp.coinTypeB]) {
        tokenCache[lp.coinTypeB] = { symbol: tokenBSymbol, decimals: tokenBDecimals };
      } else {
        tokenCache[lp.coinTypeB].decimals = tokenBDecimals;
      }
    }

    // Normalize token amounts
    const balanceA = lp.balanceA || "0";
    const balanceB = lp.balanceB || "0";
    const normalizedBalanceA = normalizeAmount(balanceA, tokenADecimals);
    const normalizedBalanceB = normalizeAmount(balanceB, tokenBDecimals);
    
    // Format balances for display
    const formattedBalanceA = formatTokenAmount(normalizedBalanceA);
    const formattedBalanceB = formatTokenAmount(normalizedBalanceB);

    // Process rewards with proper normalization and formatting
    const rewards: RewardInfo[] = [];
    let rewardsUsd = 0;

    if (lp.rewards && Array.isArray(lp.rewards)) {
      for (const reward of lp.rewards) {
        const rewardSymbol = getSymbolFromType(reward.coinType);
        const rewardDecimals = reward.decimals || 9;
        
        // Store reward token info in cache
        if (reward.coinType) {
          if (!tokenCache[reward.coinType]) {
            tokenCache[reward.coinType] = { symbol: rewardSymbol, decimals: rewardDecimals };
          }
        }
        
        // Handle both amount_owed (old API) and amount (new API)
        const rewardAmount = reward.amount_owed || reward.amount || "0";
        const normalizedAmount = normalizeAmount(rewardAmount, rewardDecimals);
        const formattedAmount = formatTokenAmount(normalizedAmount);

        // Get USD value - directly from API if available, or calculate
        const valueUsd = reward.valueUsd || 0;
        rewardsUsd += valueUsd;

        rewards.push({
          tokenSymbol: rewardSymbol,
          tokenAddress: reward.coinType,
          amount: rewardAmount,
          formatted: formattedAmount,
          decimals: rewardDecimals,
          valueUsd: valueUsd,
          logoUrl: reward.logoUrl,
        });
      }
    }
    
    // Extract fees data
    const feesUsd = extractFeesUsd(lp, "cetus");
    
    // Get position USD value
    const valueUsd = lp.valueUsd || 0;
    console.log(`Cetus position value: $${valueUsd}`);

    // Create normalized position
    const position: NormalizedPosition = {
      id: lp.position || lp.id || generateUniqueId("Cetus", "liquidity", Math.floor(Math.random() * 10000)),
      liquidity: lp.liquidity || "0",
      balanceA: balanceA,
      balanceB: balanceB,
      formattedBalanceA,
      formattedBalanceB,
      valueUsd: valueUsd,
      isOutOfRange: lp.isOut || false,
      rewards,
      feesUsd,
      positionType: "cetus",
      raw: lp,
    };

    console.log(`Processed position with value: $${valueUsd}`);
    
    // Add to pool or create new pool
    if (!poolGroups[poolAddress]) {
      poolGroups[poolAddress] = {
        poolAddress,
        poolName: `${tokenASymbol}/${tokenBSymbol}`,
        protocol: "Cetus",
        positions: [],
        totalLiquidity: 0,
        totalValueUsd: 0,
        totalFeesUsd: 0,
        totalRewardsUsd: 0,
        apr: lp.apr || 0,
        tokenA: lp.coinTypeA,
        tokenB: lp.coinTypeB,
        tokenASymbol,
        tokenBSymbol,
        tokenALogo: lp.coinTypeALogo || lp.tokenALogo,
        tokenBLogo: lp.coinTypeBLogo || lp.tokenBLogo,
        tokenAMetadata: lp.coinTypeAMetadata,
        tokenBMetadata: lp.coinTypeBMetadata,
      };
    }

    // Add position and update pool totals
    poolGroups[poolAddress].positions.push(position);
    poolGroups[poolAddress].totalLiquidity += parseInt(position.liquidity || "0");
    poolGroups[poolAddress].totalValueUsd += position.valueUsd;
    poolGroups[poolAddress].totalFeesUsd = (poolGroups[poolAddress].totalFeesUsd || 0) + feesUsd;
    poolGroups[poolAddress].totalRewardsUsd = (poolGroups[poolAddress].totalRewardsUsd || 0) + rewardsUsd;
  }
}

// Process Turbos positions
async function processTurbosPositions(
  data: any,
  poolGroups: Record<string, PoolGroup>
): Promise<void> {
  if (!data.liquidity || !Array.isArray(data.liquidity)) return;

  console.log(`Processing ${data.liquidity.length} Turbos positions`);

  // Process each liquidity position
  for (const lp of data.liquidity) {
    const poolAddress = lp.poolAddress || lp.id || `turbos-pool-${Math.random().toString(36).substring(2, 9)}`;
    if (!poolAddress) continue;

    // Get decimals from API or use defaults
    const tokenADecimals = lp.coinA?.decimals || 9;
    const tokenBDecimals = lp.coinB?.decimals || 9;
    
    const tokenASymbol = getSymbolFromType(lp.coinAType);
    const tokenBSymbol = getSymbolFromType(lp.coinBType);

    // Store token decimals in cache
    if (lp.coinAType) {
      if (!tokenCache[lp.coinAType]) {
        tokenCache[lp.coinAType] = { symbol: tokenASymbol, decimals: tokenADecimals };
      } else {
        tokenCache[lp.coinAType].decimals = tokenADecimals;
      }
    }
    
    if (lp.coinBType) {
      if (!tokenCache[lp.coinBType]) {
        tokenCache[lp.coinBType] = { symbol: tokenBSymbol, decimals: tokenBDecimals };
      } else {
        tokenCache[lp.coinBType].decimals = tokenBDecimals;
      }
    }

    // Normalize token amounts
    const balanceA = lp.coinAAmount || "0";
    const balanceB = lp.coinBAmount || "0";
    const normalizedBalanceA = normalizeAmount(balanceA, tokenADecimals);
    const normalizedBalanceB = normalizeAmount(balanceB, tokenBDecimals);
    
    // Format balances for display
    const formattedBalanceA = formatTokenAmount(normalizedBalanceA);
    const formattedBalanceB = formatTokenAmount(normalizedBalanceB);

    // Calculate total value
    const valueUsd = Number(lp.valueUsd || lp.totalValueUsd || 0);
      
    // Extract fees
    const feesUsd = extractFeesUsd(lp, "turbos");

    // Create rewards if available
    const rewards: RewardInfo[] = [];
    let rewardsUsd = Number(lp.unclaimedRewardsUSD || 0);
    
    if (lp.rewards && Array.isArray(lp.rewards)) {
      for (const reward of lp.rewards) {
        const rewardSymbol = getSymbolFromType(reward.coinType || reward.tokenType);
        const rewardDecimals = reward.decimals || 9;
        const normalizedAmount = normalizeAmount(reward.amount, rewardDecimals);
        
        const rewardValueUsd = reward.valueUsd || 0;
        
        rewards.push({
          tokenSymbol: rewardSymbol,
          tokenAddress: reward.coinType || reward.tokenType,
          amount: reward.amount || "0",
          formatted: formatTokenAmount(normalizedAmount),
          decimals: rewardDecimals,
          valueUsd: rewardValueUsd,
          logoUrl: reward.logoUrl
        });
      }
    } else if (rewardsUsd > 0) {
      // If we only have a total value but no breakdown
      rewards.push({
        tokenSymbol: "Rewards",
        amount: "0",
        formatted: "0",
        valueUsd: rewardsUsd
      });
    }

    // Create normalized position
    const position: NormalizedPosition = {
      id: lp.id || generateUniqueId("Turbos", "liquidity", Math.floor(Math.random() * 10000)),
      liquidity: lp.liquidity || "0",
      balanceA,
      balanceB,
      formattedBalanceA,
      formattedBalanceB,
      valueUsd,
      feesUsd,
      isOutOfRange: lp.isOutOfRange || false,
      rewards,
      positionType: "turbos",
      raw: lp,
    };
    
    console.log(`Processed Turbos position with value: $${valueUsd}`);

    // Get or create pool group
    if (!poolGroups[poolAddress]) {
      poolGroups[poolAddress] = {
        poolAddress,
        poolName: `${tokenASymbol}/${tokenBSymbol}`,
        protocol: "Turbos",
        positions: [],
        totalLiquidity: 0,
        totalValueUsd: 0,
        totalFeesUsd: 0,
        totalRewardsUsd: 0,
        apr: lp.apr || 0,
        tokenA: lp.coinAType,
        tokenB: lp.coinBType,
        tokenASymbol,
        tokenBSymbol,
        tokenALogo: lp.coinA?.logoUrl || lp.coinA?.logo,
        tokenBLogo: lp.coinB?.logoUrl || lp.coinB?.logo,
      };
    }

    // Add position to pool group
    poolGroups[poolAddress].positions.push(position);
    poolGroups[poolAddress].totalLiquidity += parseInt(position.liquidity || "0");
    poolGroups[poolAddress].totalValueUsd += position.valueUsd;
    poolGroups[poolAddress].totalFeesUsd = (poolGroups[poolAddress].totalFeesUsd || 0) + feesUsd;
    poolGroups[poolAddress].totalRewardsUsd = (poolGroups[poolAddress].totalRewardsUsd || 0) + rewardsUsd;
  }
}

// Implement remaining processor functions for each protocol
async function processFlowXPositions(
  data: any,
  poolGroups: Record<string, PoolGroup>
): Promise<void> {
  // FlowX implementation...
  // (Similar processing logic as other protocols)
}

async function processSuiLendPositions(
  data: any,
  poolGroups: Record<string, PoolGroup>
): Promise<void> {
  // SuiLend implementation...
  // (Similar processing logic as other protocols)
}

async function processKriyaPositions(
  data: any,
  poolGroups: Record<string, PoolGroup>
): Promise<void> {
  // Kriya implementation...
  // (Similar processing logic as other protocols)
}

async function processNaviPositions(
  data: any,
  poolGroups: Record<string, PoolGroup>
): Promise<void> {
  // Navi implementation...
  // (Similar processing logic as other protocols)
}

async function processGenericProtocolPositions(
  protocol: string,
  data: any,
  poolGroups: Record<string, PoolGroup>
): Promise<void> {
  // Generic protocol implementation...
  // (Similar processing logic as other protocols)
}

export default processDefiPortfolioData;
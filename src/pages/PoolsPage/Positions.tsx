// src/pages/PoolsPage/Positions.tsx
// Updated: 2025-07-19 05:28:35 UTC by jake1318

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useWallet } from "@suiet/wallet-kit";
import BN from "bn.js";
import {
  Percentage,
  TickMath,
  ClmmPoolUtil,
  adjustForCoinSlippage,
} from "@cetusprotocol/common-sdk";

import * as cetusService from "../../services/cetusService";
import * as birdeyeService from "../../services/birdeyeService";
import * as bluefinService from "../../services/bluefinService";
import { signAndExecuteBase64 } from "../../utils/sui";

// Import the TokenIcon component
import TokenIcon from "../../components/TokenIcon";
import ProtocolBadge from "../../pages/PoolsPage/ProtocolBadge";

// Fix the import to get the default export
import blockvisionService, {
  NormalizedPosition,
  PoolGroup,
  getScallopPortfolioData,
} from "../../services/blockvisionService";

import WithdrawModal from "../../components/WithdrawModal";
import TransactionNotification from "../../components/TransactionNotification";

import { formatLargeNumber, formatDollars } from "../../utils/formatters";

import "../../styles/pages/Positions.scss";
import "../../pages/PoolsPage/protocolBadges.scss";
import {
  FaChartLine,
  FaExchangeAlt,
  FaCoins,
  FaPercentage,
} from "react-icons/fa";

interface WithdrawModalState {
  isOpen: boolean;
  poolAddress: string;
  positionIds: string[];
  totalLiquidity: number;
  valueUsd: number;
}
interface RewardsModalState {
  isOpen: boolean;
  poolAddress: string;
  poolName: string;
  positions: NormalizedPosition[];
  totalRewards: NormalizedPosition["rewards"];
}

// Updated to include the new properties
interface TransactionNotificationState {
  visible: boolean;
  message: string;
  txDigest?: string;
  isSuccess: boolean;
  asModal?: boolean; // New prop to control display mode
  poolInfo?: string; // For showing additional context about the transaction
}

// Extended NormalizedPosition to include token decimals
interface ExtendedPosition extends NormalizedPosition {
  tokenADecimals?: number;
  tokenBDecimals?: number;
  formattedAmountA?: string;
  formattedAmountB?: string;
}

// Interface for portfolio dashboard metrics
interface PortfolioMetrics {
  totalValueUsd: number;
  totalRewardsUsd: number;
  totalPositionsCount: number;
  avgApr: number;
  loading: boolean;
  protocolBreakdown: Record<string, number>; // Protocol name -> USD value
}

// Default token icon for fallbacks
const DEFAULT_TOKEN_ICON = "/assets/token-placeholder.png";

// Map of token addresses for well-known tokens (Sui mainnet)
const TOKEN_ADDRESSES: Record<string, string> = {
  SUI: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI",
  // Add other tokens as needed
};

// Hardcoded token logos for fallbacks
const HARDCODED_LOGOS: Record<string, string> = {
  CETUS:
    "https://coin-images.coingecko.com/coins/images/30256/large/cetus.png?1696529165",
  USDC: "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png",
  USDT: "https://assets.coingecko.com/coins/images/325/thumb/Tether.png",

  // Updated to use local files
  SUI: "/sui.png",
  HASUI: "/haSui.webp",
  "HA-SUI": "/haSui.webp",

  SLOVE:
    "https://coin-images.coingecko.com/coins/images/54967/small/logo_square_color.png",
  BLUB: "https://coin-images.coingecko.com/coins/images/39356/small/Frame_38.png",
  CHIRP:
    "https://coin-images.coingecko.com/coins/images/52894/small/Chirp_Icon_Round.png",
  // Add Scallop token logos
  SSUI: "https://raw.githubusercontent.com/scallop-io/sui-scallop-branding-assets/main/token-icons/scallop-sui.svg",
  SSCA: "https://raw.githubusercontent.com/scallop-io/sui-scallop-branding-assets/main/token-icons/scallop-sca.svg",
  SCALLOP:
    "https://raw.githubusercontent.com/scallop-io/sui-scallop-branding-assets/main/logo/scallop_logo_light.svg",
  BLUE: "https://s3.coinmarketcap.com/static/img/portraits/62da2117926800bf9b93fa2d.png",
};

// Token metadata cache to prevent repeated API calls
const tokenMetadataCache: Record<string, any> = {};

// Helper function to determine if a position is a vault
function isVaultPosition(position: NormalizedPosition): boolean {
  return position.positionType === "cetus-vault";
}

// Helper function to determine if a pool group is a vault pool
function isVaultPool(poolGroup: PoolGroup): boolean {
  return (
    poolGroup.positions.length > 0 &&
    poolGroup.positions[0].positionType === "cetus-vault"
  );
}

// Helper function to determine if a position is a scallop position
function isScallopPosition(position: NormalizedPosition): boolean {
  return position.positionType?.startsWith("scallop-") || false;
}

// Helper function to determine if a pool group is a scallop pool
function isScallopPool(poolGroup: PoolGroup): boolean {
  return (
    poolGroup.protocol === "Scallop" ||
    poolGroup.poolAddress.startsWith("scallop-")
  );
}

// Helper function to determine if a pool is a Bluefin pool
function isBluefinPool(poolGroup: PoolGroup | string): boolean {
  if (typeof poolGroup === "string") {
    // If provided a pool address as string, check if it contains 'bluefin' identifier
    return poolGroup.toLowerCase().includes("bluefin");
  }
  // If provided a pool group object, check its protocol
  return (
    poolGroup.protocol === "Bluefin" ||
    normalizeProtocolName(poolGroup.protocol) === "bluefin"
  );
}

// Helper function to get the full protocol name for display
function getProtocolDisplayName(poolGroup: PoolGroup): string {
  return poolGroup.protocol || (isBluefinPool(poolGroup) ? "Bluefin" : "Cetus");
}

// Normalize protocol name for badge display
const normalizeProtocolName = (protocol: string): string => {
  // Convert protocol to appropriate className format
  // e.g. "flow-x" -> "flowx", "turbos-finance" -> "turbos"
  let normalized = protocol.toLowerCase();

  // Special case mappings
  const specialCases: Record<string, string> = {
    flowx: "flowx",
    "turbos finance": "turbos",
    "kriya-dex": "kriya",
    scallop: "scallop",
    bluefin: "bluefin", // Add Bluefin mapping
  };

  if (specialCases[normalized]) {
    return specialCases[normalized];
  }

  // Remove hyphens and special characters
  return normalized.replace(/[-_\s]/g, "");
};

// List of token aliases to normalize symbols
const TOKEN_ALIASES: Record<string, string> = {
  $SUI: "SUI",
  $USDC: "USDC",
  WUSDC: "USDC",
  "HA-SUI": "HASUI",
  sSUI: "SSUI",
  sSCA: "SSCA",
};

// Clean symbol name for consistent lookup
function normalizeSymbol(symbol: string): string {
  if (!symbol) return "";

  // Remove $ prefix if present
  const cleaned = symbol.trim().toUpperCase();

  // Check aliases first
  if (TOKEN_ALIASES[cleaned]) {
    return TOKEN_ALIASES[cleaned];
  }

  return cleaned;
}

// Utility to sanitize logo URLs
function sanitizeLogoUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("ipfs://")) {
    return url.replace(/^ipfs:\/\//, "https://cloudflare-ipfs.com/ipfs/");
  }
  if (url.includes("ipfs.io")) {
    url = url.replace("http://", "https://");
    return url.replace("https://ipfs.io", "https://cloudflare-ipfs.com");
  }
  if (url.startsWith("http://")) {
    return "https://" + url.slice(7);
  }
  return url;
}

// Enhanced token icon component that uses BirdEye API for SUI token
function EnhancedTokenIcon({
  symbol,
  logoUrl,
  address,
  size = "sm",
  metadata,
}: {
  symbol: string;
  logoUrl?: string;
  address?: string;
  size?: "sm" | "md" | "lg";
  metadata?: any;
}) {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState<boolean>(false);
  const safeSymbol = symbol || "?";
  const normalizedSymbol = normalizeSymbol(safeSymbol);

  // Full SUI token address
  const SUI_ADDRESS =
    "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";

  // Decide which logo URL to use with priority order
  useEffect(() => {
    const getLogoUrl = async () => {
      // SPECIAL CASE FOR SUI: Always fetch from BirdEye API
      if (normalizedSymbol === "SUI") {
        try {
          console.log("Fetching SUI token metadata from BirdEye API");
          // Check cache first
          if (tokenMetadataCache[SUI_ADDRESS]) {
            const cachedMetadata = tokenMetadataCache[SUI_ADDRESS];
            const cachedLogo =
              cachedMetadata.logo_uri ||
              cachedMetadata.logoUrl ||
              cachedMetadata.logoURI ||
              cachedMetadata.logo;
            if (cachedLogo) {
              setCurrentUrl(sanitizeLogoUrl(cachedLogo));
              return;
            }
          }

          // Fetch SUI token metadata from BirdEye API
          const tokenMetadata = await birdeyeService.getTokenMetadata(
            SUI_ADDRESS
          );
          if (tokenMetadata) {
            tokenMetadataCache[SUI_ADDRESS] = tokenMetadata;
            const apiLogo =
              tokenMetadata.logo_uri ||
              tokenMetadata.logoUrl ||
              tokenMetadata.logoURI ||
              tokenMetadata.logo;
            if (apiLogo) {
              setCurrentUrl(sanitizeLogoUrl(apiLogo));
              return;
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch SUI metadata:`, err);
          // Fallback to default SUI logo
          setCurrentUrl(HARDCODED_LOGOS.SUI);
          return;
        }
      }

      // For haSUI, prioritize the local file we know works
      if (normalizedSymbol === "HASUI" || normalizedSymbol === "HA-SUI") {
        console.log("Using local haSUI token image");
        setCurrentUrl("/haSui.webp");
        return;
      }

      // For all other tokens, use the standard resolution logic

      // 1. Try metadata from props if available
      if (
        metadata?.logo_uri ||
        metadata?.logoUrl ||
        metadata?.logoURI ||
        metadata?.logo
      ) {
        const metadataLogo =
          metadata.logo_uri ||
          metadata.logoUrl ||
          metadata.logoURI ||
          metadata.logo;
        setCurrentUrl(sanitizeLogoUrl(metadataLogo));
        return;
      }

      // 2. Try logoUrl passed directly as prop
      if (logoUrl) {
        setCurrentUrl(sanitizeLogoUrl(logoUrl));
        return;
      }

      // 3. Check hardcoded logos for known tokens
      if (HARDCODED_LOGOS[normalizedSymbol]) {
        setCurrentUrl(HARDCODED_LOGOS[normalizedSymbol]);
        return;
      }

      // 4. If we have an address, try to fetch from BirdEye API
      if (address) {
        try {
          // Check cache first
          if (tokenMetadataCache[address]) {
            const cachedMetadata = tokenMetadataCache[address];
            const cachedLogo =
              cachedMetadata.logo_uri ||
              cachedMetadata.logoUrl ||
              cachedMetadata.logoURI ||
              cachedMetadata.logo;
            if (cachedLogo) {
              setCurrentUrl(sanitizeLogoUrl(cachedLogo));
              return;
            }
          }

          // Fetch from API if not in cache
          const tokenMetadata = await birdeyeService.getTokenMetadata(address);
          if (tokenMetadata) {
            tokenMetadataCache[address] = tokenMetadata;
            const apiLogo =
              tokenMetadata.logo_uri ||
              tokenMetadata.logoUrl ||
              tokenMetadata.logoURI ||
              tokenMetadata.logo;
            if (apiLogo) {
              setCurrentUrl(sanitizeLogoUrl(apiLogo));
              return;
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch metadata for ${address}:`, err);
        }
      }

      // 5. Try to fetch by symbol if no address
      if (!address && symbol) {
        const mappedAddress = TOKEN_ADDRESSES[normalizedSymbol];
        if (mappedAddress) {
          try {
            // Check cache first for mapped address
            if (tokenMetadataCache[mappedAddress]) {
              const cachedMetadata = tokenMetadataCache[mappedAddress];
              const cachedLogo =
                cachedMetadata.logo_uri ||
                cachedMetadata.logoUrl ||
                cachedMetadata.logoURI ||
                cachedMetadata.logo;
              if (cachedLogo) {
                setCurrentUrl(sanitizeLogoUrl(cachedLogo));
                return;
              }
            }

            // Fetch from API if not in cache
            const tokenMetadata = await birdeyeService.getTokenMetadata(
              mappedAddress
            );
            if (tokenMetadata) {
              tokenMetadataCache[mappedAddress] = tokenMetadata;
              const apiLogo =
                tokenMetadata.logo_uri ||
                tokenMetadata.logoUrl ||
                tokenMetadata.logoURI ||
                tokenMetadata.logo;
              if (apiLogo) {
                setCurrentUrl(sanitizeLogoUrl(apiLogo));
                return;
              }
            }
          } catch (err) {
            console.warn(`Failed to fetch metadata for ${mappedAddress}:`, err);
          }
        }
      }

      // 6. If all else fails, use null to show fallback letter
      setCurrentUrl(null);
    };

    getLogoUrl();
  }, [symbol, logoUrl, address, metadata, normalizedSymbol]);

  // Handle image load error - make this more robust
  const handleError = () => {
    console.warn(
      `Failed to load logo for ${safeSymbol} from URL: ${currentUrl}`
    );

    // For SUI token, try a hardcoded URL as last resort
    if (normalizedSymbol === "SUI") {
      const fallbackUrl =
        "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/kinXdEcpDQeHPEuQnqmUgtYykqKGVFq6CeVX5iAHJq6/logo.png";
      console.log(`Trying fallback URL for SUI: ${fallbackUrl}`);
      setCurrentUrl(fallbackUrl);
      return;
    }

    // For all other tokens, show fallback letter
    setImgFailed(true);
  };

  // Style classes based on props
  const sizeClass = `token-icon-${size}`;

  // Special class for certain tokens to match image reference 3
  let tokenClass = "";
  if (normalizedSymbol === "SUI") {
    tokenClass = "sui-token";
  } else if (normalizedSymbol === "WAL") {
    tokenClass = "wal-token";
  } else if (normalizedSymbol === "HASUI") {
    tokenClass = "hasui-token";
  } else if (normalizedSymbol === "USDC" || normalizedSymbol === "WUSDC") {
    tokenClass = "usdc-token";
  } else if (normalizedSymbol === "SSUI" || normalizedSymbol === "SSCA") {
    tokenClass = "scallop-token";
  } else if (normalizedSymbol === "BLUE") {
    tokenClass = "blue-token";
  }

  return (
    <div
      className={`token-icon ${sizeClass} ${
        !currentUrl || imgFailed ? "token-fallback" : ""
      } ${tokenClass}`}
      data-symbol={normalizedSymbol} // Add data attribute for debugging
    >
      {currentUrl && !imgFailed ? (
        <img src={currentUrl} alt={safeSymbol} onError={handleError} />
      ) : (
        <div className="token-fallback-letter">
          {safeSymbol.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}

// Modified PoolPair component for the Positions page
function PoolPair({
  tokenALogo,
  tokenBLogo,
  tokenASymbol,
  tokenBSymbol,
  tokenAAddress,
  tokenBAddress,
  protocol,
  poolName,
  isVault,
  tokenAMetadata,
  tokenBMetadata,
}: {
  tokenALogo?: string;
  tokenBLogo?: string;
  tokenASymbol: string;
  tokenBSymbol: string;
  tokenAAddress?: string;
  tokenBAddress?: string;
  protocol?: string;
  poolName?: string;
  isVault?: boolean;
  tokenAMetadata?: any;
  tokenBMetadata?: any;
}) {
  // Ensure symbols always have a value
  const safeTokenASymbol = tokenASymbol || "?";
  const safeTokenBSymbol = tokenBSymbol || "?";

  // For SuiLend or other protocols with single token, display only token A
  const isSingleTokenProtocol =
    protocol === "SuiLend" || protocol === "Scallop" || !tokenBSymbol;

  return (
    <div className="pool-pair">
      <div className="token-icons">
        <EnhancedTokenIcon
          symbol={safeTokenASymbol}
          logoUrl={tokenALogo}
          address={tokenAAddress}
          size="sm"
          metadata={tokenAMetadata}
        />
        {!isSingleTokenProtocol && (
          <EnhancedTokenIcon
            symbol={safeTokenBSymbol}
            logoUrl={tokenBLogo}
            address={tokenBAddress}
            size="sm"
            metadata={tokenBMetadata}
          />
        )}
      </div>
      <div className="pair-name">
        {safeTokenASymbol}
        {!isSingleTokenProtocol && `/${safeTokenBSymbol}`}

        {/* Show position type badge for different position types */}
        {protocol === "SuiLend" && (
          <span className="position-type-badge">
            {poolName?.includes("Deposit") ? "Deposit" : "Borrow"}
          </span>
        )}

        {/* Add Scallop badge for Scallop positions */}
        {protocol === "Scallop" && (
          <span className="position-type-badge scallop-badge">
            {poolName?.includes("Supply")
              ? "Supply"
              : poolName?.includes("Collateral")
              ? "Collateral"
              : "Borrow"}
          </span>
        )}

        {/* Add vault badge if this is a vault */}
        {isVault && (
          <span className="position-type-badge vault-badge">Vault</span>
        )}

        {/* Add Bluefin badge for Bluefin positions */}
        {normalizeProtocolName(protocol || "") === "bluefin" && (
          <span className="position-type-badge bluefin-badge">Bluefin</span>
        )}
      </div>
    </div>
  );
}

// New Portfolio Dashboard Component
function PortfolioDashboard({ metrics }: { metrics: PortfolioMetrics }) {
  // Function to format dollar values without adding a dollar sign, since we'll add it manually
  const formatValueWithoutDollar = (value: number): string => {
    // Remove any dollar signs that might be in the formatted value
    return formatDollars(value).replace(/\$/g, "");
  };

  // Function to fix double dollar signs after component mounts
  useEffect(() => {
    // Add a timeout to ensure the DOM is ready
    const timeoutId = setTimeout(() => {
      try {
        // Find protocol values and clean up any double dollar signs
        const protocolValues = document.querySelectorAll(".protocol-value");
        protocolValues.forEach((el) => {
          if (el.textContent && el.textContent.includes("$$")) {
            el.textContent = el.textContent.replace(/\$\$/g, "$");
          }
        });
      } catch (err) {
        console.error("Error fixing dollar signs:", err);
      }
    }, 100);

    // Cleanup timeout on unmount
    return () => clearTimeout(timeoutId);
  }, [metrics]);

  return (
    <div className="portfolio-dashboard">
      <h2 className="dashboard-title">Portfolio Overview</h2>
      <div className="dashboard-stats-grid">
        <div className="dashboard-stat-card">
          <div className="stat-icon">
            <FaChartLine />
          </div>
          <div className="stat-content">
            <div className="stat-label">Total Value</div>
            <div
              className="stat-value"
              data-clean-value={
                metrics.loading
                  ? ""
                  : formatValueWithoutDollar(metrics.totalValueUsd)
              }
            >
              {metrics.loading ? (
                <div className="stat-loading"></div>
              ) : (
                `$${formatValueWithoutDollar(metrics.totalValueUsd)}`
              )}
            </div>
          </div>
        </div>

        <div className="dashboard-stat-card">
          <div className="stat-icon">
            <FaExchangeAlt />
          </div>
          <div className="stat-content">
            <div className="stat-label">Total Rewards</div>
            <div
              className="stat-value"
              data-clean-value={
                metrics.loading
                  ? ""
                  : formatValueWithoutDollar(metrics.totalRewardsUsd)
              }
            >
              {metrics.loading ? (
                <div className="stat-loading"></div>
              ) : (
                `$${formatValueWithoutDollar(metrics.totalRewardsUsd)}`
              )}
            </div>
          </div>
        </div>

        <div className="dashboard-stat-card">
          <div className="stat-icon">
            <FaCoins />
          </div>
          <div className="stat-content">
            <div className="stat-label">Active Positions</div>
            <div className="stat-value">
              {metrics.loading ? (
                <div className="stat-loading"></div>
              ) : (
                metrics.totalPositionsCount
              )}
            </div>
          </div>
        </div>

        <div className="dashboard-stat-card">
          <div className="stat-icon">
            <FaPercentage />
          </div>
          <div className="stat-content">
            <div className="stat-label">Average APR</div>
            <div className="stat-value">
              {metrics.loading ? (
                <div className="stat-loading"></div>
              ) : (
                `${metrics.avgApr.toFixed(2)}%`
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Protocol Distribution Section */}
      {Object.keys(metrics.protocolBreakdown).length > 0 &&
        !metrics.loading && (
          <div className="protocol-breakdown">
            <h3>Protocol Distribution</h3>
            <div className="protocol-distribution-chart">
              {Object.entries(metrics.protocolBreakdown)
                .sort(([, valueA], [, valueB]) => valueB - valueA)
                .map(([protocol, value]) => (
                  <div key={protocol} className="protocol-bar-container">
                    <div className="protocol-label">{protocol}</div>
                    <div className="protocol-bar-wrapper">
                      <div
                        className={`protocol-bar ${normalizeProtocolName(
                          protocol
                        )}`}
                        style={{
                          width: `${(value / metrics.totalValueUsd) * 100}%`,
                        }}
                      ></div>
                    </div>
                    <div className="protocol-value">
                      ${formatValueWithoutDollar(value)}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
    </div>
  );
}

// Scallop Summary Component
function ScallopSummary({ scallopData }: { scallopData: any }) {
  if (!scallopData) return null;

  const {
    totalSupplyValue = 0,
    totalDebtValue = 0,
    totalCollateralValue = 0,
    lendings = [],
    borrowings = [],
    pendingRewards = {},
  } = scallopData;

  // Format pending rewards if they exist
  const hasRewards =
    pendingRewards &&
    pendingRewards.borrowIncentives &&
    pendingRewards.borrowIncentives.length > 0;

  return (
    <div className="scallop-summary-container">
      <div className="scallop-header">
        <div className="protocol-icon">
          <EnhancedTokenIcon symbol="SCALLOP" size="md" />
        </div>
        <h3>Scallop Protocol Positions</h3>
      </div>

      <div className="scallop-stats">
        <div className="stat-item">
          <span className="stat-label">Total Supply:</span>
          <span className="stat-value">${formatDollars(totalSupplyValue)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Total Collateral:</span>
          <span className="stat-value">
            ${formatDollars(totalCollateralValue)}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Total Borrow:</span>
          <span className="stat-value">${formatDollars(totalDebtValue)}</span>
        </div>
      </div>

      {hasRewards && (
        <div className="scallop-rewards">
          <h4>Pending Rewards</h4>
          <div className="rewards-list">
            {pendingRewards.borrowIncentives.map(
              (reward: any, index: number) => (
                <div className="reward-item" key={`reward-${index}`}>
                  <EnhancedTokenIcon symbol={reward.symbol} size="sm" />
                  <span className="reward-amount">
                    {formatLargeNumber(reward.pendingRewardInCoin)}
                  </span>
                  <span className="reward-value">
                    ${formatDollars(reward.pendingRewardInUsd)}
                  </span>
                </div>
              )
            )}
          </div>
        </div>
      )}

      <div className="scallop-positions">
        {lendings.length > 0 && (
          <div className="position-section">
            <h4>Supply Positions</h4>
            <div className="positions-list">
              {lendings.map((lending: any, index: number) => (
                <div className="position-item" key={`lending-${index}`}>
                  <div className="position-token">
                    <EnhancedTokenIcon
                      symbol={lending.symbol}
                      address={lending.coinType}
                      size="sm"
                    />
                    <span>{lending.symbol}</span>
                  </div>
                  <div className="position-details">
                    <div className="position-amount">
                      {formatLargeNumber(lending.suppliedCoin)}
                    </div>
                    <div className="position-value">
                      ${formatDollars(lending.suppliedValue)}
                    </div>
                    <div className="position-apy">
                      {(lending.supplyApy * 100).toFixed(2)}% APY
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {borrowings.length > 0 && (
          <div className="position-section">
            <h4>Borrows & Collateral</h4>
            {borrowings.map((obligation: any, idx: number) => (
              <div className="obligation-item" key={`obligation-${idx}`}>
                <div className="obligation-header">
                  <span className="obligation-id">Obligation {idx + 1}</span>
                  <span
                    className="risk-level"
                    style={{
                      color:
                        obligation.riskLevel < 0.3
                          ? "#4CAF50"
                          : obligation.riskLevel < 0.6
                          ? "#FFC107"
                          : "#FF5722",
                    }}
                  >
                    Risk: {(obligation.riskLevel * 100).toFixed(0)}%
                  </span>
                </div>

                {obligation.collaterals &&
                  obligation.collaterals.length > 0 && (
                    <div className="collateral-list">
                      <h5>Collateral</h5>
                      {obligation.collaterals.map(
                        (collateral: any, cIdx: number) => (
                          <div
                            className="collateral-item"
                            key={`collateral-${cIdx}`}
                          >
                            <EnhancedTokenIcon
                              symbol={collateral.symbol}
                              address={collateral.coinType}
                              size="sm"
                            />
                            <span>
                              {formatLargeNumber(collateral.depositedCoin)}{" "}
                              {collateral.symbol}
                            </span>
                            <span className="item-value">
                              ${formatDollars(collateral.depositedValueInUsd)}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  )}

                {obligation.borrowedPools &&
                  obligation.borrowedPools.length > 0 && (
                    <div className="borrowed-list">
                      <h5>Borrows</h5>
                      {obligation.borrowedPools.map(
                        (borrow: any, bIdx: number) => (
                          <div className="borrow-item" key={`borrow-${bIdx}`}>
                            <EnhancedTokenIcon
                              symbol={borrow.symbol}
                              address={borrow.coinType}
                              size="sm"
                            />
                            <span>
                              {formatLargeNumber(borrow.borrowedCoin)}{" "}
                              {borrow.symbol}
                            </span>
                            <span className="item-value">
                              ${formatDollars(borrow.borrowedValueInUsd)}
                            </span>
                            <span className="borrow-rate">
                              {(borrow.borrowApy * 100).toFixed(2)}% APY
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Positions() {
  const wallet = useWallet();
  const { account, connected } = wallet;
  const navigate = useNavigate();

  const [poolPositions, setPoolPositions] = useState<PoolGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [positionType, setPositionType] = useState<
    "all" | "lp" | "vault" | "scallop"
  >("all");
  const [scallopData, setScallopData] = useState<any>(null);
  const [loadingScallop, setLoadingScallop] = useState(false);

  const [withdrawModal, setWithdrawModal] = useState<WithdrawModalState>({
    isOpen: false,
    poolAddress: "",
    positionIds: [],
    totalLiquidity: 0,
    valueUsd: 0,
  });
  const [rewardsModal, setRewardsModal] = useState<RewardsModalState>({
    isOpen: false,
    poolAddress: "",
    poolName: "",
    positions: [],
    totalRewards: [],
  });
  const [claimingPool, setClaimingPool] = useState<string | null>(null);
  const [withdrawingPool, setWithdrawingPool] = useState<string | null>(null);
  const [closingPool, setClosingPool] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<Record<string, boolean>>({});
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, any>>({});

  // Portfolio metrics for the dashboard
  const [portfolioMetrics, setPortfolioMetrics] = useState<PortfolioMetrics>({
    totalValueUsd: 0,
    totalRewardsUsd: 0,
    totalPositionsCount: 0,
    avgApr: 0,
    loading: true,
    protocolBreakdown: {},
  });

  // Transaction notification state
  const [notification, setNotification] =
    useState<TransactionNotificationState | null>(null);
  // Transaction digests for multiple transactions
  const [txDigests, setTxDigests] = useState<string[]>([]);

  // Function to fetch metadata for a list of token addresses individually
  const fetchTokenMetadata = useCallback(async (tokenAddresses: string[]) => {
    const result: Record<string, any> = {};
    const addressesToFetch = tokenAddresses.filter(
      (addr) => addr && !tokenMetadataCache[addr]
    );

    // If there's nothing to fetch, return the cached data
    if (addressesToFetch.length === 0) {
      tokenAddresses.forEach((addr) => {
        if (addr && tokenMetadataCache[addr]) {
          result[addr] = tokenMetadataCache[addr];
        }
      });
      return result;
    }

    console.log("Fetching metadata for tokens:", addressesToFetch);

    try {
      // Fetch metadata for all addresses at once
      const fetchedMetadata = await birdeyeService.getMultipleTokenMetadata(
        addressesToFetch
      );

      // Add to result and update cache
      Object.entries(fetchedMetadata).forEach(([addr, data]) => {
        tokenMetadataCache[addr] = data;
        result[addr] = data;
      });

      // Add any cached entries not in fetched results
      tokenAddresses.forEach((addr) => {
        if (addr && tokenMetadataCache[addr] && !result[addr]) {
          result[addr] = tokenMetadataCache[addr];
        }
      });

      console.log(
        "Metadata fetch complete, results:",
        Object.keys(result).length
      );
      return result;
    } catch (err) {
      console.error("Error fetching token metadata:", err);

      // Return cached data for any addresses we have
      tokenAddresses.forEach((addr) => {
        if (addr && tokenMetadataCache[addr]) {
          result[addr] = tokenMetadataCache[addr];
        }
      });

      return result;
    }
  }, []);

  // Map address symbols to actual addresses for common tokens
  const getAddressBySymbol = useCallback(
    (symbol: string): string | undefined => {
      if (!symbol) return undefined;
      const upperSymbol = normalizeSymbol(symbol);
      return TOKEN_ADDRESSES[upperSymbol];
    },
    []
  );

  // Calculate portfolio metrics
  const calculatePortfolioMetrics = useCallback(
    (pools: PoolGroup[], scallopData: any) => {
      let totalValue = 0;
      let totalRewards = 0;
      let totalPositions = 0;
      let aprSum = 0;
      let validAprCount = 0;
      const protocolBreakdown: Record<string, number> = {};

      // Calculate metrics from poolPositions
      pools.forEach((pool) => {
        // Add to total value
        totalValue += pool.totalValueUsd || 0;

        // Track protocol-specific values
        const protocol = pool.protocol;
        if (!protocolBreakdown[protocol]) {
          protocolBreakdown[protocol] = 0;
        }
        protocolBreakdown[protocol] += pool.totalValueUsd || 0;

        // Count positions
        totalPositions += pool.positions.length;

        // Add to APR for averaging
        if (pool.apr && !isNaN(pool.apr) && pool.apr > 0) {
          aprSum += pool.apr;
          validAprCount++;
        }

        // Sum up rewards
        pool.positions.forEach((position) => {
          if (position.rewards && position.rewards.length > 0) {
            position.rewards.forEach((reward) => {
              if (reward && reward.valueUsd) {
                totalRewards += reward.valueUsd;
              }
            });
          }
        });
      });

      // Add Scallop data if available
      if (scallopData) {
        // Add supply value
        if (scallopData.totalSupplyValue) {
          totalValue += scallopData.totalSupplyValue;

          // Add to protocol breakdown
          if (!protocolBreakdown["Scallop"]) {
            protocolBreakdown["Scallop"] = 0;
          }
          protocolBreakdown["Scallop"] += scallopData.totalSupplyValue;

          // Count each lending as a position
          if (scallopData.lendings && scallopData.lendings.length > 0) {
            totalPositions += scallopData.lendings.length;
          }
        }

        // Add collateral value if not already counted in supply
        if (scallopData.totalCollateralValue && !scallopData.totalSupplyValue) {
          totalValue += scallopData.totalCollateralValue;

          // Add to protocol breakdown
          if (!protocolBreakdown["Scallop"]) {
            protocolBreakdown["Scallop"] = 0;
          }
          protocolBreakdown["Scallop"] += scallopData.totalCollateralValue;
        }

        // Count borrowings as positions
        if (scallopData.borrowings && scallopData.borrowings.length > 0) {
          totalPositions += scallopData.borrowings.reduce(
            (count: number, obligation: any) =>
              count + (obligation.borrowedPools?.length || 0),
            0
          );
        }

        // Add Scallop pending rewards
        if (
          scallopData.pendingRewards &&
          scallopData.pendingRewards.borrowIncentives
        ) {
          scallopData.pendingRewards.borrowIncentives.forEach((reward: any) => {
            if (reward && reward.pendingRewardInUsd) {
              totalRewards += reward.pendingRewardInUsd;
            }
          });
        }

        // Add Scallop APRs to average
        if (scallopData.lendings && scallopData.lendings.length > 0) {
          scallopData.lendings.forEach((lending: any) => {
            if (lending.supplyApy) {
              aprSum += lending.supplyApy * 100;
              validAprCount++;
            }
          });
        }
      }

      // Calculate average APR
      const avgApr = validAprCount > 0 ? aprSum / validAprCount : 0;

      return {
        totalValueUsd: totalValue,
        totalRewardsUsd: totalRewards,
        totalPositionsCount: totalPositions,
        avgApr,
        loading: false,
        protocolBreakdown,
      };
    },
    []
  );

  // Fetch Scallop positions
  const fetchScallopData = useCallback(async () => {
    if (!connected || !account?.address) return;

    setLoadingScallop(true);
    try {
      console.log("Fetching Scallop data for:", account.address);
      const data = await getScallopPortfolioData(account.address);
      console.log("Scallop data received:", data);
      setScallopData(data);

      // Fetch token logos for Scallop positions
      if (data) {
        const tokens = [
          ...(data.lendings || []).map((l: any) => ({
            coinType: l.coinType,
            symbol: l.symbol,
          })),
          ...(data.borrowings || []).flatMap((b: any) =>
            [...(b.collaterals || []), ...(b.borrowedPools || [])].map(
              (item: any) => ({ coinType: item.coinType, symbol: item.symbol })
            )
          ),
          // Also add rewards tokens if they exist
          ...(data.pendingRewards?.borrowIncentives || []).map((r: any) => ({
            coinType: r.coinType,
            symbol: r.symbol,
          })),
        ];

        if (tokens.length > 0) {
          const addresses = tokens.map((t) => t.coinType).filter(Boolean);
          await fetchTokenMetadata(addresses);
        }
      }
    } catch (err) {
      console.error("Error fetching Scallop data:", err);
    } finally {
      setLoadingScallop(false);
    }
  }, [connected, account, fetchTokenMetadata]);

  // Updated loadPositions function to handle the new structure
  const loadPositions = useCallback(async () => {
    if (connected && account?.address) {
      setLoading(true);
      setError(null);
      try {
        console.log("Loading positions for address:", account.address);

        // Get positions from BlockVision API - this now returns PoolGroup[]
        const allPoolGroups = await blockvisionService.getDefiPortfolio(
          account.address,
          undefined, // No specific protocol
          false // Exclude wallet assets
        );

        // We can just display every PoolGroup we got back,
        // excluding wallet entries
        const transformedPositions = allPoolGroups.filter(
          (pg) => pg.protocol.toLowerCase() !== "wallet"
        );

        // Collect all unique token addresses from the positions
        const tokenAddresses = new Set<string>();

        transformedPositions.forEach((poolGroup) => {
          // Use exact token addresses if available
          if (poolGroup.tokenA) {
            tokenAddresses.add(poolGroup.tokenA);
          } else if (poolGroup.tokenASymbol) {
            // Try to use our mapping for common tokens
            const mappedAddress = getAddressBySymbol(poolGroup.tokenASymbol);
            if (mappedAddress) tokenAddresses.add(mappedAddress);
          }

          if (poolGroup.tokenB) {
            tokenAddresses.add(poolGroup.tokenB);
          } else if (poolGroup.tokenBSymbol) {
            // Try to use our mapping for common tokens
            const mappedAddress = getAddressBySymbol(poolGroup.tokenBSymbol);
            if (mappedAddress) tokenAddresses.add(mappedAddress);
          }
        });

        // Also add the SUI token address specifically
        tokenAddresses.add(
          "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI"
        );

        console.log(
          "Fetching metadata for tokens:",
          Array.from(tokenAddresses)
        );

        // Fetch metadata for all tokens at once
        const metadata = await fetchTokenMetadata(Array.from(tokenAddresses));
        setTokenMetadata(metadata);

        // Update the positions with the metadata
        setPoolPositions(transformedPositions);

        // Calculate portfolio metrics for the dashboard
        const metrics = calculatePortfolioMetrics(
          transformedPositions,
          scallopData
        );
        setPortfolioMetrics(metrics);
      } catch (err) {
        console.error("Failed to load positions:", err);
        setError("Failed to load your positions. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  }, [
    connected,
    account,
    fetchTokenMetadata,
    getAddressBySymbol,
    calculatePortfolioMetrics,
    scallopData,
  ]);

  // Update portfolio metrics when positions or scallop data changes
  useEffect(() => {
    if (poolPositions.length > 0 || scallopData) {
      const metrics = calculatePortfolioMetrics(poolPositions, scallopData);
      setPortfolioMetrics(metrics);
    }
  }, [poolPositions, scallopData, calculatePortfolioMetrics]);

  // Load user positions when wallet connects
  useEffect(() => {
    loadPositions();
  }, [loadPositions]);

  // Load Scallop data when wallet connects
  useEffect(() => {
    fetchScallopData();
  }, [fetchScallopData]);

  // Force fetch SUI token metadata on component mount
  useEffect(() => {
    const fetchSuiMetadata = async () => {
      const SUI_ADDRESS =
        "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";
      try {
        console.log("Pre-fetching SUI token metadata from BirdEye API");
        const tokenMetadata = await birdeyeService.getTokenMetadata(
          SUI_ADDRESS
        );
        if (tokenMetadata) {
          tokenMetadataCache[SUI_ADDRESS] = tokenMetadata;
          console.log("SUI metadata pre-fetched successfully:", tokenMetadata);
        }
      } catch (err) {
        console.warn("Failed to pre-fetch SUI token metadata:", err);
      }
    };

    fetchSuiMetadata();
  }, []);

  // Helper function to check if a position has zero liquidity
  const hasZeroLiquidity = (position: NormalizedPosition): boolean => {
    // Check if balance values are zero or very small
    const balanceA = parseInt(position.balanceA || "0");
    const balanceB = parseInt(position.balanceB || "0");
    return balanceA <= 1 && balanceB <= 1;
  };

  // Helper function to check if a pool has positions that have zero liquidity
  const hasPositionsWithZeroLiquidity = (poolGroup: PoolGroup): boolean => {
    return poolGroup.positions.some(hasZeroLiquidity);
  };

  // Filter pool positions based on the positionType state and hide empty positions
  const filteredPoolPositions = useMemo(() => {
    // First, filter out any pools that only have positions with zero liquidity
    const nonEmptyPools = poolPositions.filter((pool) => {
      // Check if this pool has at least one position with non-zero liquidity
      return pool.positions.some((position) => {
        const balanceA = parseInt(position.balanceA || "0");
        const balanceB = parseInt(position.balanceB || "0");
        return balanceA > 1 || balanceB > 1; // Consider position non-empty if either token has balance > 1
      });
    });

    // Then apply the regular filters
    if (positionType === "all") {
      return nonEmptyPools;
    } else if (positionType === "vault") {
      return nonEmptyPools.filter((pool) => isVaultPool(pool));
    } else if (positionType === "scallop") {
      // Just return empty array since we'll display Scallop data separately
      return [];
    } else {
      return nonEmptyPools.filter(
        (pool) => !isVaultPool(pool) && pool.protocol !== "Scallop"
      );
    }
  }, [poolPositions, positionType]);

  const toggleDetails = (poolAddress: string) => {
    setShowDetails((prev) => ({ ...prev, [poolAddress]: !prev[poolAddress] }));
  };

  const handleWithdraw = (
    poolAddress: string,
    positionIds: string[],
    totalLiquidity: number,
    valueUsd: number
  ) => {
    setWithdrawModal({
      isOpen: true,
      poolAddress,
      positionIds,
      totalLiquidity,
      valueUsd,
    });
    setWithdrawingPool(poolAddress);
  };

  const handleViewRewards = (pool: PoolGroup) => {
    setRewardsModal({
      isOpen: true,
      poolAddress: pool.poolAddress,
      poolName: pool.poolName,
      positions: pool.positions,
      totalRewards: pool.positions.flatMap((pos) => pos.rewards || []),
    });
    setClaimingPool(pool.poolAddress);
  };

  /**
   * Handle claiming rewards from Bluefin pools - Use the combined fees and rewards collector
   */
  const handleBluefinClaimRewards = async (
    poolAddress: string,
    positionIds: string[]
  ) => {
    const digests: string[] = [];
    const successfulClaims: string[] = [];
    const failedClaims: string[] = [];

    try {
      if (!account?.address) {
        throw new Error("Wallet address not available");
      }

      // Process each position individually
      for (const positionId of positionIds) {
        console.log(
          `Claiming rewards from Bluefin position ${positionId} in pool ${poolAddress}`
        );

        try {
          // Use the combined fees and rewards collection endpoint
          const combinedResponse = await fetch(
            "/api/bluefin/create-collect-fees-and-rewards-tx",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                poolId: poolAddress,
                positionId,
                walletAddress: account.address,
              }),
            }
          );

          // Enhanced error handling
          if (!combinedResponse.ok) {
            const errorText = await combinedResponse.text();
            console.error("API Error Response:", errorText);
            failedClaims.push(`${positionId.substring(0, 8)}: ${errorText}`);
            continue;
          }

          const responseData = await combinedResponse.json();

          // Make sure we got transaction bytes - CHECK FOR EITHER txb64 OR txBytes
          const txBase64 = responseData.txb64 || responseData.txBytes;
          if (!responseData || !txBase64) {
            console.error("API returned invalid response:", responseData);
            failedClaims.push(
              `${positionId.substring(0, 8)}: Invalid response data`
            );
            continue;
          }

          // Use our utility function to execute the transaction
          const result = await signAndExecuteBase64(wallet, txBase64, {
            showEffects: true,
            requestType: "WaitForLocalExecution",
          });

          if (result.digest && !result.effects?.status?.error) {
            digests.push(result.digest);
            successfulClaims.push(positionId.substring(0, 8));
            console.log(
              `Successfully claimed rewards for position ${positionId}`
            );
          } else {
            // Parse the error to give more specific feedback
            const errorDetails =
              result.effects?.status?.error || "Unknown error";
            console.error("Claim rewards error details:", errorDetails);
            failedClaims.push(`${positionId.substring(0, 8)}: ${errorDetails}`);
          }
        } catch (error) {
          console.error(
            `Error claiming rewards for position ${positionId}:`,
            error
          );
          failedClaims.push(
            `${positionId.substring(0, 8)}: ${error.message || "Unknown error"}`
          );
        }
      }

      return {
        success: successfulClaims.length > 0,
        digests,
        successCount: successfulClaims.length,
        failureCount: failedClaims.length,
        successPositions: successfulClaims,
        failureDetails: failedClaims,
      };
    } catch (error) {
      console.error("Bluefin claim rewards failed:", error);
      throw error;
    }
  };

  /**
   * Special function that uses the direct Bluefin SDK approach to force close positions
   * This is the last resort for positions that couldn't be closed through regular means
   */
  const handleCloseBluefinPosition = async (
    poolAddress: string,
    positionIds: string[]
  ) => {
    const digests: string[] = [];
    const successfulCloses: string[] = [];
    const failedCloses: string[] = [];

    if (!connected || !account?.address) {
      throw new Error("Wallet not connected");
    }

    try {
      setClosingPool(poolAddress);

      // Process each position
      for (const positionId of positionIds) {
        console.log(
          `Force closing Bluefin position ${positionId} in pool ${poolAddress}`
        );

        try {
          // Use our new specialized force-close endpoint
          const closeResponse = await fetch(
            "/api/bluefin/force-close-position-tx",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                poolId: poolAddress,
                positionId,
                walletAddress: account.address,
                // Add a force flag to indicate this is a forced close
                force: true,
              }),
            }
          );

          if (!closeResponse.ok) {
            const errorText = await closeResponse.text();
            console.warn(`Force close position API error: ${errorText}`);
            failedCloses.push(`${positionId.substring(0, 8)}: API error`);
            continue;
          }

          const responseData = await closeResponse.json();
          const txBase64 = responseData.txb64 || responseData.txBytes;

          if (!responseData || !txBase64) {
            failedCloses.push(
              `${positionId.substring(0, 8)}: Empty transaction data`
            );
            continue;
          }

          console.log("Received force close transaction data:", responseData);

          // Try to execute with a longer timeout
          const result = await signAndExecuteBase64(wallet, txBase64, {
            showEffects: true,
            requestType: "WaitForLocalExecution",
          });

          console.log("Force close position execution result:", result);

          // Check if the transaction was truly successful
          if (result.digest && !result.effects?.status?.error) {
            digests.push(result.digest);
            successfulCloses.push(positionId.substring(0, 8));
            console.log(`Successfully force closed position ${positionId}`);
          } else {
            // Parse the error to give more specific feedback
            const errorDetails =
              result.effects?.status?.error || "Unknown error";
            console.error("Force close error details:", errorDetails);
            failedCloses.push(`${positionId.substring(0, 8)}: ${errorDetails}`);
          }
        } catch (error) {
          console.error(`Error force closing position ${positionId}:`, error);
          failedCloses.push(
            `${positionId.substring(0, 8)}: ${error.message || "Unknown error"}`
          );
        }
      }

      // Display notification with results
      if (successfulCloses.length > 0) {
        // Find pool info for display
        const poolInfo = poolPositions.find(
          (p) => p.poolAddress === poolAddress
        );
        const pairName = poolInfo
          ? `${poolInfo.tokenASymbol}${
              poolInfo.tokenBSymbol ? "/" + poolInfo.tokenBSymbol : ""
            }`
          : "";

        let message = `Successfully closed ${successfulCloses.length} position(s)`;
        if (failedCloses.length > 0) {
          message += `, ${failedCloses.length} failed`;
        }

        setNotification({
          visible: true,
          message: message,
          txDigest: digests.length === 1 ? digests[0] : undefined,
          isSuccess: true,
          asModal: true,
          poolInfo: `${pairName} (Position IDs: ${successfulCloses.join(
            ", "
          )})`,
        });

        // Store digests
        setTxDigests(digests);

        // Refresh positions
        await loadPositions();
      } else if (failedCloses.length > 0) {
        // Only failures
        setNotification({
          visible: true,
          message: `Failed to close ${
            failedCloses.length
          } position(s). Details: ${failedCloses.join(", ")}`,
          isSuccess: false,
          asModal: true,
        });
      }

      return {
        success: successfulCloses.length > 0,
        successCount: successfulCloses.length,
        failureCount: failedCloses.length,
        digests,
      };
    } catch (error) {
      console.error("Error in handleCloseBluefinPosition:", error);
      setNotification({
        visible: true,
        message: `Failed to close positions: ${
          error.message || "Unknown error"
        }`,
        isSuccess: false,
        asModal: false,
      });
      return {
        success: false,
        successCount: 0,
        failureCount: positionIds.length,
        digests: [],
      };
    } finally {
      setClosingPool(null);
    }
  };

  /**
   * Handle Bluefin withdraw operation - Updated to focus on successful liquidity removal
   * and handle position closure errors gracefully
   */
  const handleBluefinWithdraw = async (options: {
    poolAddress: string;
    positionIds: string[];
    withdrawPercent: number;
    collectFees: boolean;
    closePosition: boolean;
    slippage: number;
  }) => {
    const {
      poolAddress,
      positionIds,
      withdrawPercent,
      collectFees,
      closePosition,
    } = options;
    const digests: string[] = [];
    const successfulOperations: string[] = [];
    const failedOperations: string[] = [];

    try {
      if (!account?.address) {
        throw new Error("Wallet address not available");
      }

      // Process each position individually
      for (const positionId of positionIds) {
        console.log(
          `Processing Bluefin position ${positionId} in pool ${poolAddress}`
        );

        let hasRemainingLiquidity = true; // Assume position has liquidity initially

        // STEP 1: For any withdrawal, first try to collect fees and rewards
        if (collectFees) {
          try {
            console.log(
              `Collecting fees and rewards from Bluefin position ${positionId}`
            );
            const combinedResponse = await fetch(
              "/api/bluefin/create-collect-fees-and-rewards-tx",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  poolId: poolAddress,
                  positionId,
                  walletAddress: account.address,
                }),
              }
            );

            if (combinedResponse.ok) {
              const responseData = await combinedResponse.json();
              const txBase64 = responseData.txb64 || responseData.txBytes;

              if (responseData && txBase64) {
                try {
                  const combinedResult = await signAndExecuteBase64(
                    wallet,
                    txBase64,
                    { showEffects: true }
                  );

                  // Check if transaction was actually successful by examining effects
                  if (
                    combinedResult.digest &&
                    !combinedResult.effects?.status?.error
                  ) {
                    digests.push(combinedResult.digest);
                    successfulOperations.push("Collected fees and rewards");
                  } else if (combinedResult.effects?.status?.error) {
                    // Log the specific error
                    const errorMsg = combinedResult.effects.status.error;
                    console.warn(`Collect fees failed: ${errorMsg}`);
                    failedOperations.push(
                      `Failed to collect fees: ${errorMsg}`
                    );
                  }
                } catch (txError) {
                  console.warn("Transaction execution failed:", txError);
                  failedOperations.push("Failed to collect fees and rewards");
                }
              }
            }
          } catch (error) {
            console.warn(
              "Failed to collect fees and rewards, continuing with withdrawal:",
              error
            );
            failedOperations.push("Failed to collect fees and rewards");
          }
        }

        // STEP 2: Remove liquidity if the position has any
        if (withdrawPercent > 0) {
          try {
            console.log(
              `Removing ${withdrawPercent}% liquidity from Bluefin position ${positionId}`
            );

            const removeResponse = await fetch(
              "/api/bluefin/create-remove-liquidity-tx",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  poolId: poolAddress,
                  positionId,
                  percent: withdrawPercent,
                  walletAddress: account.address,
                }),
              }
            );

            if (!removeResponse.ok) {
              const errorText = await removeResponse.text();
              console.warn(`Remove liquidity API error: ${errorText}`);
              failedOperations.push(
                `Failed to create remove liquidity transaction: ${errorText}`
              );
              // If we can't even create the transaction, the position may not have liquidity
              hasRemainingLiquidity = false;
            } else {
              const responseData = await removeResponse.json();
              const txBase64 = responseData.txb64 || responseData.txBytes;

              if (!responseData || !txBase64) {
                throw new Error(
                  "Server returned empty or invalid transaction data"
                );
              }

              // Execute the liquidity removal transaction
              try {
                const removeResult = await signAndExecuteBase64(
                  wallet,
                  txBase64,
                  {
                    showEffects: true,
                  }
                );

                console.log("Remove liquidity execution result:", removeResult);

                // Check if transaction actually succeeded
                if (
                  removeResult.digest &&
                  !removeResult.effects?.status?.error
                ) {
                  digests.push(removeResult.digest);
                  successfulOperations.push(
                    `Removed ${withdrawPercent}% liquidity`
                  );
                } else if (removeResult.effects?.status?.error) {
                  // Check for specific error codes
                  const errorDetails = removeResult.effects.status.error;
                  console.warn(`Remove liquidity failed: ${errorDetails}`);

                  // Check if this is a "no liquidity" error (code 1029)
                  if (errorDetails.includes("1029")) {
                    console.log("Position has no liquidity to remove");
                    hasRemainingLiquidity = false;
                    failedOperations.push(
                      "Position has no liquidity to remove"
                    );
                  } else {
                    failedOperations.push(
                      `Failed to remove liquidity: ${errorDetails}`
                    );
                  }
                }
              } catch (txError) {
                console.warn("Transaction execution failed:", txError);
                failedOperations.push("Failed to remove liquidity");
                // We don't know for sure if there's liquidity, so keep the flag true
              }
            }

            // STEP 3: If user wants to close and we successfully removed liquidity (or no liquidity to remove)
            if (
              (withdrawPercent === 100 && closePosition) ||
              !hasRemainingLiquidity
            ) {
              // Wait longer between removing liquidity and closing position
              await new Promise((resolve) => setTimeout(resolve, 10000)); // 10-second delay

              try {
                console.log(
                  `Attempting to close Bluefin position ${positionId}`
                );

                // Use the force-close endpoint for a more direct approach
                const closeResponse = await fetch(
                  "/api/bluefin/force-close-position-tx",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      poolId: poolAddress,
                      positionId,
                      walletAddress: account.address,
                      force: true, // Try to force close
                    }),
                  }
                );

                if (!closeResponse.ok) {
                  const errorText = await closeResponse.text();
                  console.warn(`Close position API error: ${errorText}`);
                  failedOperations.push(
                    `Failed to create close position transaction: ${errorText}`
                  );
                } else {
                  const responseData = await closeResponse.json();
                  const txBase64 = responseData.txb64 || responseData.txBytes;

                  if (responseData && txBase64) {
                    try {
                      const result = await signAndExecuteBase64(
                        wallet,
                        txBase64,
                        {
                          showEffects: true,
                          requestType: "WaitForLocalExecution",
                        }
                      );

                      // Check if transaction actually succeeded
                      if (result.digest && !result.effects?.status?.error) {
                        digests.push(result.digest);
                        successfulOperations.push("Closed position");
                      } else if (result.effects?.status?.error) {
                        // Check for specific error codes
                        const errorDetails = result.effects.status.error;
                        console.warn(`Close position failed: ${errorDetails}`);

                        // Check if this is the specific "can't close" error (code 1018)
                        if (errorDetails.includes("1018")) {
                          failedOperations.push(
                            "Position cannot be closed yet (protocol cooldown period)"
                          );

                          // Try to give user a helpful message
                          console.log(
                            "The position needs time before it can be closed. The funds have been withdrawn but the position will remain visible until it can be closed."
                          );
                        } else {
                          failedOperations.push(
                            `Failed to close position: ${errorDetails}`
                          );
                        }
                      }
                    } catch (closeError) {
                      console.warn(
                        "Position close transaction failed:",
                        closeError
                      );
                      failedOperations.push(
                        "Failed to execute close position transaction"
                      );
                    }
                  }
                }
              } catch (closeError) {
                console.warn("Failed to close position:", closeError);
                failedOperations.push("Failed to close position");
              }
            }
          } catch (error) {
            console.error("Error removing liquidity:", error);
            failedOperations.push(
              `Failed to remove liquidity: ${error.message}`
            );
            // Don't throw yet - consider this critical but proceed to next position
          }
        }
      }

      // Return success as long as we have at least one successful transaction
      // And include information about both successful and failed operations
      return {
        success: digests.length > 0,
        digests,
        operations: successfulOperations,
        failures: failedOperations,
      };
    } catch (error) {
      console.error("Bluefin withdrawal failed:", error);
      throw error;
    }
  };

  /**
   * Handle claiming rewards using appropriate service based on pool type
   */
  const handleClaim = async (poolAddress: string, positionIds: string[]) => {
    if (!wallet.connected || positionIds.length === 0) {
      console.error("Wallet not connected or no position IDs provided");
      return;
    }

    setClaimingPool(poolAddress);

    try {
      // Get pool info for display
      const poolInfo = poolPositions.find((p) => p.poolAddress === poolAddress);
      const pairName = poolInfo
        ? `${poolInfo.tokenASymbol}${
            poolInfo.tokenBSymbol ? "/" + poolInfo.tokenBSymbol : ""
          }`
        : "";

      // Check if this is a Bluefin pool
      const isBluefin = poolInfo ? isBluefinPool(poolInfo) : false;

      let result;

      if (isBluefin) {
        // Use Bluefin service for claiming from Bluefin pools
        console.log(`Claiming rewards from Bluefin pool: ${poolAddress}`);
        result = await handleBluefinClaimRewards(poolAddress, positionIds);

        if (result.success) {
          const protocolName = poolInfo
            ? getProtocolDisplayName(poolInfo)
            : "Bluefin";

          let message = "Rewards and Fees Claimed Successfully!";

          // Add details about partial success if applicable
          if (result.failureCount > 0) {
            message += ` (${result.successCount} successful, ${result.failureCount} failed)`;
          }

          setNotification({
            visible: true,
            message: message,
            txDigest:
              result.digests.length === 1 ? result.digests[0] : undefined,
            isSuccess: true,
            asModal: true,
            poolInfo: `${pairName} (${protocolName})`,
          });

          // If multiple digests, store them for reference
          if (result.digests.length > 1) {
            setTxDigests(result.digests);
          }
        } else {
          setNotification({
            visible: true,
            message: "Failed to claim rewards from Bluefin positions.",
            isSuccess: false,
            asModal: false,
          });
        }
      } else {
        // Use Cetus service for claiming from Cetus pools (existing behavior)
        console.log(`Claiming rewards from Cetus pool: ${poolAddress}`);

        // Use one position as representative for the claim
        const positionId = positionIds[0];
        result = await cetusService.collectRewards(
          wallet,
          poolAddress,
          positionId
        );

        // Only show success with transaction if we got a digest back
        if (result.digest) {
          setNotification({
            visible: true,
            message: "Rewards Claimed Successfully!",
            txDigest: result.digest,
            isSuccess: true,
            asModal: true,
            poolInfo: pairName,
          });
        } else {
          // No rewards to claim case
          setNotification({
            visible: true,
            message: "No rewards available to claim at this time.",
            isSuccess: true,
            asModal: true,
          });
        }
      }

      // Refresh position data
      await loadPositions();
    } catch (err) {
      console.error("Claim failed:", err);
      setNotification({
        visible: true,
        message: `Failed to claim rewards: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
        isSuccess: false,
        asModal: false, // Show errors as inline notifications
      });
    } finally {
      setClaimingPool(null);
    }
  };

  /**
   * Handle collecting fees using appropriate service based on pool type
   * Updated to use signAndExecuteBase64 for Bluefin
   */
  const handleCollectFees = async (poolAddress: string, positionId: string) => {
    if (!wallet.connected) {
      console.error("Wallet not connected");
      return;
    }

    try {
      // Get pool info for display
      const poolInfo = poolPositions.find((p) => p.poolAddress === poolAddress);
      const pairName = poolInfo
        ? `${poolInfo.tokenASymbol}${
            poolInfo.tokenBSymbol ? "/" + poolInfo.tokenBSymbol : ""
          }`
        : "";

      // Check if this is a Bluefin pool
      const isBluefin = poolInfo ? isBluefinPool(poolInfo) : false;

      let result;

      if (isBluefin) {
        // Use Bluefin service for collecting fees from Bluefin pools
        console.log(`Collecting fees from Bluefin position: ${positionId}`);

        if (!account?.address) {
          throw new Error("Wallet address not available");
        }

        // Create and submit transaction to collect fees
        const feesResponse = await fetch(
          "/api/bluefin/create-collect-fees-tx",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              poolId: poolAddress,
              positionId,
              walletAddress: account.address,
            }),
          }
        );

        // Enhanced error handling
        if (!feesResponse.ok) {
          const errorText = await feesResponse.text();
          console.error("API Error Response:", errorText);
          throw new Error(
            `Failed to create collect fees transaction: ${errorText}`
          );
        }

        const responseData = await feesResponse.json();
        console.log("API Response for collect fees:", responseData);

        // Make sure we got transaction bytes - CHECK FOR EITHER txb64 OR txBytes
        const txBase64 = responseData.txb64 || responseData.txBytes;
        if (!responseData || !txBase64) {
          console.error("API returned invalid response:", responseData);
          throw new Error("Server returned empty or invalid transaction data");
        }

        // Use our utility function
        result = await signAndExecuteBase64(wallet, txBase64, {
          showEffects: true,
        });

        const protocolName = poolInfo
          ? getProtocolDisplayName(poolInfo)
          : "Bluefin";
        setNotification({
          visible: true,
          message: "Fees Collected Successfully!",
          txDigest: result.digest,
          isSuccess: true,
          asModal: true,
          poolInfo: `${pairName} (${protocolName})`,
        });
      } else {
        // Use Cetus service for collecting fees from Cetus pools (existing behavior)
        console.log(`Collecting fees from Cetus position: ${positionId}`);
        result = await cetusService.collectFees(
          wallet,
          poolAddress,
          positionId
        );

        setNotification({
          visible: true,
          message: "Fees Collected Successfully!",
          txDigest: result.digest,
          isSuccess: true,
          asModal: true,
          poolInfo: pairName,
        });
      }

      // Refresh position data
      await loadPositions();
    } catch (err) {
      console.error("Fee collection failed:", err);
      setNotification({
        visible: true,
        message: `Failed to collect fees: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
        isSuccess: false,
        asModal: false, // Show errors as inline notifications
      });
    }
  };

  /**
   * Handle withdrawing liquidity using the appropriate service based on pool type
   */
  const handleWithdrawConfirm = async (options: {
    withdrawPercent: number;
    collectFees: boolean;
    closePosition: boolean;
    slippage: number;
  }) => {
    const { poolAddress, positionIds } = withdrawModal;
    const { withdrawPercent, collectFees, closePosition, slippage } = options;

    if (!positionIds.length) {
      console.error("No position IDs provided for withdrawal");
      return { success: false, digests: [] };
    }

    try {
      setWithdrawingPool(poolAddress);

      // Get pool info for display
      const poolInfo = poolPositions.find((p) => p.poolAddress === poolAddress);
      const pairName = poolInfo
        ? `${poolInfo.tokenASymbol}${
            poolInfo.tokenBSymbol ? "/" + poolInfo.tokenBSymbol : ""
          }`
        : "";

      // Check if this is a Bluefin pool
      const isBluefin = poolInfo ? isBluefinPool(poolInfo) : false;

      let result;

      if (isBluefin) {
        // Use Bluefin service for Bluefin pools
        result = await handleBluefinWithdraw({
          poolAddress,
          positionIds,
          withdrawPercent,
          collectFees,
          closePosition,
          slippage,
        });
      } else {
        // Use Cetus service for other pools (default behavior)
        result = await cetusService.withdraw(wallet, {
          poolId: poolAddress,
          positionIds: positionIds,
          withdrawPercent,
          collectFees,
          closePosition,
          slippage,
        });
      }

      console.log(
        `${isBluefin ? "Bluefin" : "Cetus"} withdrawal completed:`,
        result
      );

      if (result.success) {
        // Show notification with transaction digests
        const protocolName = poolInfo ? getProtocolDisplayName(poolInfo) : "";

        // Create a message that includes both successes and failures
        let message = closePosition
          ? "Close Successful!"
          : "Withdraw Successful!";

        // If we have Bluefin failures, add them to the message
        if (isBluefin && result.failures && result.failures.length > 0) {
          // Special handling for the "cooldown period" message
          if (result.failures.some((f) => f.includes("cooldown period"))) {
            message += " Position will remain visible until it can be closed.";
          }
        }

        setNotification({
          visible: true,
          message: message,
          txDigest: result.digests.length === 1 ? result.digests[0] : undefined,
          isSuccess: true,
          asModal: true, // Show as modal
          poolInfo: `${
            closePosition ? "Closed" : `Withdrew ${withdrawPercent}%`
          } ${protocolName ? `(${protocolName})` : ""} from ${pairName}`,
        });

        // Store all digests for multiple transactions
        setTxDigests(result.digests);

        // Close the modal
        setWithdrawModal((prev) => ({ ...prev, isOpen: false }));

        // Refresh positions
        await loadPositions();

        // Return success with digests for the WithdrawModal
        return { success: true, digests: result.digests };
      } else {
        throw new Error(`${isBluefin ? "Bluefin" : "Cetus"} withdrawal failed`);
      }
    } catch (err) {
      console.error("Withdraw failed:", err);
      setNotification({
        visible: true,
        message: `Failed to withdraw liquidity: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
        isSuccess: false,
        asModal: false, // Show errors as inline notifications
      });

      return { success: false, digests: [] };
    } finally {
      setWithdrawingPool(null);
    }
  };

  const handleModalClose = () => {
    setWithdrawModal((prev) => ({ ...prev, isOpen: false }));
    setWithdrawingPool(null);
  };

  const handleNotificationClose = () => {
    setNotification(null);
    setTxDigests([]);
  };

  // Helper function to get APR color class
  const getAprClass = (apr: number): string => {
    if (apr >= 100) return "high";
    if (apr >= 50) return "medium";
    return "low";
  };

  // Helper to determine if a protocol uses single tokens
  const isSingleTokenProtocol = (protocol: string): boolean => {
    return protocol === "SuiLend" || protocol === "Scallop";
  };

  // Calculate counts for tabs
  const vaultCount = poolPositions.filter((pool) => isVaultPool(pool)).length;
  const lpCount = poolPositions.filter(
    (pool) => !isVaultPool(pool) && pool.protocol !== "Scallop"
  ).length;
  const hasScallopPositions =
    scallopData &&
    ((scallopData.lendings && scallopData.lendings.length > 0) ||
      (scallopData.borrowings && scallopData.borrowings.length > 0));
  const scallopCount = hasScallopPositions ? 1 : 0;

  // Helper function to find token metadata for a given token
  const getTokenMetadataByAddress = (address?: string) => {
    if (!address) return null;
    return tokenMetadata[address] || null;
  };

  // Helper function to find token metadata for a given symbol
  const getTokenMetadataBySymbol = (symbol?: string) => {
    if (!symbol) return null;

    // Check if we have a known address for this symbol
    const address = getAddressBySymbol(symbol);
    if (address && tokenMetadata[address]) {
      return tokenMetadata[address];
    }

    // Otherwise search through metadata for matching symbol
    return (
      Object.values(tokenMetadata).find(
        (metadata) => metadata.symbol?.toUpperCase() === symbol.toUpperCase()
      ) || null
    );
  };

  // Helper function to calculate total rewards value for a pool
  const calculateTotalRewardsValue = (poolGroup: PoolGroup): number => {
    let totalValue = 0;
    poolGroup.positions.forEach((position) => {
      if (position.rewards && position.rewards.length > 0) {
        position.rewards.forEach((reward) => {
          if (reward && reward.valueUsd) {
            totalValue += reward.valueUsd;
          }
        });
      }
    });
    return totalValue;
  };

  return (
    <div className="positions-page">
      {/* Add glow elements for consistent styling with other pages */}

      <div className="content-container">
        {/* Updated navigation to match the Pools.tsx format */}
        <div className="main-navigation">
          <Link to="/pools" className="nav-link">
            Pools
          </Link>
          <Link to="/positions" className="nav-link active">
            My Positions
          </Link>
          <Link to="/pools?tab=vaults" className="nav-link">
            Vaults
          </Link>
        </div>

        {error ? (
          <div className="empty-state">
            <div className="empty-icon">⚠️</div>
            <h3>Error Loading Positions</h3>
            <p>{error}</p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        ) : !connected ? (
          <div className="empty-state">
            <div className="empty-icon">🔐</div>
            <h3>Wallet Not Connected</h3>
            <p>Please connect your wallet to view your positions.</p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => wallet.select()}
            >
              Connect Wallet
            </button>
          </div>
        ) : loading && !scallopData ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <div className="loading-text">Loading positions...</div>
          </div>
        ) : filteredPoolPositions.length === 0 && !hasScallopPositions ? (
          <div className="empty-state">
            <div className="empty-icon">💧</div>
            <h3>No Positions Found</h3>
            <p>You don't have any liquidity positions yet.</p>
            <Link to="/pools" className="btn btn--primary">
              Add Liquidity
            </Link>
            {/* Add debug information */}
            <div
              className="debug-info"
              style={{ marginTop: "20px", fontSize: "12px", color: "#666" }}
            >
              <p>Debug info (refreshed at {new Date().toISOString()}):</p>
              <button
                onClick={() => loadPositions()}
                className="btn btn--secondary btn--sm"
              >
                Retry Loading Positions
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Add Portfolio Dashboard at the top */}
            <PortfolioDashboard metrics={portfolioMetrics} />

            {/* Type filter tabs */}
            <div className="position-type-tabs">
              <button
                className={`position-type-tab ${
                  positionType === "all" ? "active" : ""
                }`}
                onClick={() => setPositionType("all")}
              >
                All Positions ({filteredPoolPositions.length + scallopCount})
              </button>
              <button
                className={`position-type-tab ${
                  positionType === "lp" ? "active" : ""
                }`}
                onClick={() => setPositionType("lp")}
              >
                LP Pools ({lpCount})
              </button>
              <button
                className={`position-type-tab ${
                  positionType === "vault" ? "active" : ""
                }`}
                onClick={() => setPositionType("vault")}
              >
                Vaults ({vaultCount})
              </button>
              {hasScallopPositions && (
                <button
                  className={`position-type-tab ${
                    positionType === "scallop" ? "active" : ""
                  }`}
                  onClick={() => setPositionType("scallop")}
                >
                  Scallop ({scallopCount})
                </button>
              )}
            </div>

            {/* Scallop summary if showing scallop tab */}
            {positionType === "scallop" && hasScallopPositions && (
              <ScallopSummary scallopData={scallopData} />
            )}

            {/* Show regular positions if NOT on scallop tab or if 'all' tab */}
            {(positionType !== "scallop" || positionType === "all") && (
              <div className="positions-table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Pool</th>
                      <th>DEX</th>
                      <th className="align-right">Value (USD)</th>
                      <th className="align-right">Rewards</th>
                      <th className="align-right">APR</th>
                      <th className="align-center">Status</th>
                      <th className="actions-column">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPoolPositions
                      // Add this filter to exclude any wallet positions
                      .filter(
                        (poolPosition) =>
                          poolPosition.protocol.toLowerCase() !== "wallet"
                      )
                      .map((poolPosition) => (
                        <React.Fragment key={poolPosition.poolAddress}>
                          <tr
                            className={`position-row ${
                              isVaultPool(poolPosition) ? "vault-row" : "lp-row"
                            } ${
                              isScallopPool(poolPosition) ? "scallop-row" : ""
                            } ${
                              isBluefinPool(poolPosition) ? "bluefin-row" : ""
                            }`}
                            onClick={() =>
                              toggleDetails(poolPosition.poolAddress)
                            }
                          >
                            <td className="pool-cell">
                              <PoolPair
                                tokenALogo={poolPosition.tokenALogo}
                                tokenBLogo={poolPosition.tokenBLogo}
                                tokenASymbol={poolPosition.tokenASymbol}
                                tokenBSymbol={poolPosition.tokenBSymbol}
                                tokenAAddress={poolPosition.tokenA}
                                tokenBAddress={poolPosition.tokenB}
                                protocol={poolPosition.protocol}
                                poolName={poolPosition.poolName}
                                isVault={isVaultPool(poolPosition)}
                                tokenAMetadata={
                                  getTokenMetadataByAddress(
                                    poolPosition.tokenA
                                  ) ||
                                  getTokenMetadataBySymbol(
                                    poolPosition.tokenASymbol
                                  )
                                }
                                tokenBMetadata={
                                  getTokenMetadataByAddress(
                                    poolPosition.tokenB
                                  ) ||
                                  getTokenMetadataBySymbol(
                                    poolPosition.tokenBSymbol
                                  )
                                }
                              />
                            </td>
                            <td>
                              {/* Replace the hardcoded dex-badge with the ProtocolBadge component */}
                              <ProtocolBadge
                                protocol={poolPosition.protocol}
                                protocolClass={normalizeProtocolName(
                                  poolPosition.protocol
                                )}
                                isVault={isVaultPool(poolPosition)}
                              />
                            </td>
                            <td className="align-right">
                              {formatDollars(poolPosition.totalValueUsd)}
                            </td>
                            <td className="align-right rewards-cell">
                              {poolPosition.positions.some(
                                (pos) =>
                                  pos.rewards &&
                                  pos.rewards.some((r) => (r.valueUsd || 0) > 0)
                              ) ? (
                                <span className="rewards-value">
                                  {formatDollars(
                                    calculateTotalRewardsValue(poolPosition)
                                  )}
                                </span>
                              ) : (
                                <span className="no-rewards">--</span>
                              )}
                            </td>
                            <td className="align-right">
                              <span
                                className={`apr-value ${getAprClass(
                                  poolPosition.apr
                                )}`}
                              >
                                {poolPosition.apr.toFixed(2)}%
                              </span>
                            </td>
                            <td className="align-center">
                              {isVaultPool(poolPosition) ? (
                                <span className="status-badge vault">
                                  Vault
                                </span>
                              ) : isScallopPool(poolPosition) ? (
                                <span className="status-badge scallop">
                                  {poolPosition.poolName.includes("Supply")
                                    ? "Supply"
                                    : poolPosition.poolName.includes(
                                        "Collateral"
                                      )
                                    ? "Collateral"
                                    : "Borrow"}
                                </span>
                              ) : isBluefinPool(poolPosition) ? (
                                <span className="status-badge bluefin">
                                  {poolPosition.positions.some(
                                    (pos) => pos.isOutOfRange
                                  )
                                    ? "Partially Out of Range"
                                    : "In Range"}
                                </span>
                              ) : poolPosition.positions.some(
                                  (pos) => pos.isOutOfRange
                                ) ? (
                                <span className="status-badge warning">
                                  Partially Out of Range
                                </span>
                              ) : (
                                <span className="status-badge success">
                                  {poolPosition.protocol === "SuiLend"
                                    ? poolPosition.poolName.includes("Deposit")
                                      ? "Deposit"
                                      : "Borrow"
                                    : "In Range"}
                                </span>
                              )}
                            </td>
                            <td className="actions-cell">
                              <div className="action-buttons">
                                <button
                                  className="btn btn--secondary btn--sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleDetails(poolPosition.poolAddress);
                                  }}
                                >
                                  {showDetails[poolPosition.poolAddress]
                                    ? "Hide"
                                    : "Details"}
                                </button>

                                {/* Standard Withdraw Button */}
                                <button
                                  className="btn btn--primary btn--sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleWithdraw(
                                      poolPosition.poolAddress,
                                      poolPosition.positions.map((p) => p.id),
                                      poolPosition.totalLiquidity,
                                      poolPosition.totalValueUsd
                                    );
                                  }}
                                  disabled={
                                    withdrawingPool === poolPosition.poolAddress
                                  }
                                >
                                  {withdrawingPool ===
                                  poolPosition.poolAddress ? (
                                    <span className="loading-text">
                                      <span className="dot-loader"></span>
                                      Withdrawing
                                    </span>
                                  ) : isVaultPool(poolPosition) ? (
                                    "Withdraw from Vault"
                                  ) : poolPosition.protocol === "SuiLend" &&
                                    poolPosition.poolName?.includes(
                                      "Deposit"
                                    ) ? (
                                    "Withdraw"
                                  ) : poolPosition.protocol === "SuiLend" ? (
                                    "Repay"
                                  ) : (
                                    "Withdraw"
                                  )}
                                </button>

                                {/* Claim Button */}
                                {poolPosition.positions.some(
                                  (pos) =>
                                    pos.rewards &&
                                    pos.rewards.some(
                                      (r) => parseFloat(r.formatted || "0") > 0
                                    )
                                ) && (
                                  <button
                                    className="btn btn--accent btn--sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleClaim(
                                        poolPosition.poolAddress,
                                        poolPosition.positions.map((p) => p.id)
                                      );
                                    }}
                                    disabled={
                                      claimingPool === poolPosition.poolAddress
                                    }
                                  >
                                    {claimingPool ===
                                    poolPosition.poolAddress ? (
                                      <span className="loading-text">
                                        <span className="dot-loader"></span>
                                        Claiming
                                      </span>
                                    ) : (
                                      "Claim"
                                    )}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {showDetails[poolPosition.poolAddress] && (
                            <tr className="details-row">
                              <td colSpan={7}>
                                <div className="position-details-container">
                                  <div className="details-header">
                                    <h4>
                                      {isVaultPool(poolPosition)
                                        ? "Vault Details"
                                        : "Position Details"}
                                    </h4>
                                  </div>
                                  <div className="positions-detail-table">
                                    <table>
                                      <thead>
                                        <tr>
                                          <th>Position ID</th>
                                          <th>
                                            {poolPosition.tokenASymbol ||
                                              "Token A"}{" "}
                                            Amount
                                          </th>
                                          {!isSingleTokenProtocol(
                                            poolPosition.protocol
                                          ) &&
                                            !isVaultPool(poolPosition) && (
                                              <th>
                                                {poolPosition.tokenBSymbol ||
                                                  "Token B"}{" "}
                                                Amount
                                              </th>
                                            )}
                                          <th>Value (USD)</th>
                                          <th>Status</th>
                                          <th>Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {poolPosition.positions.map(
                                          (position) => (
                                            <tr
                                              key={position.id}
                                              data-protocol={
                                                position.positionType ||
                                                poolPosition.protocol.toLowerCase()
                                              }
                                            >
                                              <td className="monospace">
                                                {position.id.substring(0, 8)}...
                                                {position.id.substring(
                                                  position.id.length - 4
                                                )}
                                              </td>
                                              <td>
                                                {/* Show formatted balance if available */}
                                                {(position as ExtendedPosition)
                                                  .formattedAmountA ||
                                                  position.formattedBalanceA ||
                                                  formatLargeNumber(
                                                    parseInt(
                                                      position.balanceA || "0"
                                                    )
                                                  )}
                                              </td>
                                              {!isSingleTokenProtocol(
                                                poolPosition.protocol
                                              ) &&
                                                !isVaultPosition(position) && (
                                                  <td>
                                                    {/* Show formatted balance if available */}
                                                    {(
                                                      position as ExtendedPosition
                                                    ).formattedAmountB ||
                                                      position.formattedBalanceB ||
                                                      formatLargeNumber(
                                                        parseInt(
                                                          position.balanceB ||
                                                            "0"
                                                        )
                                                      )}
                                                  </td>
                                                )}
                                              <td>
                                                {formatDollars(
                                                  position.valueUsd
                                                )}
                                              </td>
                                              <td>
                                                {isVaultPosition(position) ? (
                                                  <span className="status-badge vault">
                                                    Vault
                                                  </span>
                                                ) : isScallopPosition(
                                                    position
                                                  ) ? (
                                                  <span className="status-badge scallop">
                                                    {position.positionType?.includes(
                                                      "supply"
                                                    )
                                                      ? "Supply"
                                                      : position.positionType?.includes(
                                                          "collateral"
                                                        )
                                                      ? "Collateral"
                                                      : "Borrow"}
                                                  </span>
                                                ) : isBluefinPool(
                                                    poolPosition
                                                  ) ? (
                                                  <span
                                                    className={`status-badge ${
                                                      position.isOutOfRange
                                                        ? "warning"
                                                        : hasZeroLiquidity(
                                                            position
                                                          )
                                                        ? "pending"
                                                        : "bluefin"
                                                    }`}
                                                  >
                                                    {position.isOutOfRange
                                                      ? "Out of Range"
                                                      : hasZeroLiquidity(
                                                          position
                                                        )
                                                      ? "No Liquidity"
                                                      : "In Range"}
                                                  </span>
                                                ) : position.isOutOfRange ? (
                                                  <span className="status-badge warning">
                                                    Out of Range
                                                  </span>
                                                ) : (
                                                  <span className="status-badge success">
                                                    {poolPosition.protocol ===
                                                    "SuiLend"
                                                      ? position.positionType ===
                                                        "suilend-deposit"
                                                        ? "Deposit"
                                                        : "Borrow"
                                                      : "In Range"}
                                                  </span>
                                                )}
                                              </td>
                                              <td>
                                                <div className="action-buttons">
                                                  {!isVaultPosition(position) &&
                                                    !isScallopPosition(
                                                      position
                                                    ) &&
                                                    poolPosition.protocol !==
                                                      "SuiLend" && (
                                                      <button
                                                        className="btn btn--secondary btn--sm"
                                                        onClick={() =>
                                                          handleCollectFees(
                                                            poolPosition.poolAddress,
                                                            position.id
                                                          )
                                                        }
                                                      >
                                                        Collect Fees
                                                      </button>
                                                    )}

                                                  {/* Regular withdrawal button for positions */}
                                                  {!hasZeroLiquidity(
                                                    position
                                                  ) && (
                                                    <button
                                                      className="btn btn--primary btn--sm"
                                                      onClick={() =>
                                                        handleWithdraw(
                                                          poolPosition.poolAddress,
                                                          [position.id],
                                                          parseInt(
                                                            position.balanceA ||
                                                              "0"
                                                          ),
                                                          position.valueUsd
                                                        )
                                                      }
                                                      disabled={
                                                        withdrawingPool ===
                                                        poolPosition.poolAddress
                                                      }
                                                    >
                                                      {isVaultPosition(position)
                                                        ? "Withdraw from Vault"
                                                        : isScallopPosition(
                                                            position
                                                          )
                                                        ? position.positionType?.includes(
                                                            "supply"
                                                          ) ||
                                                          position.positionType?.includes(
                                                            "collateral"
                                                          )
                                                          ? "Withdraw"
                                                          : "Repay"
                                                        : poolPosition.protocol ===
                                                          "SuiLend"
                                                        ? position.positionType ===
                                                          "suilend-deposit"
                                                          ? "Withdraw"
                                                          : "Repay"
                                                        : "Close"}
                                                    </button>
                                                  )}

                                                  {/* Force Close button for positions with no liquidity */}
                                                  {isBluefinPool(
                                                    poolPosition
                                                  ) &&
                                                    hasZeroLiquidity(
                                                      position
                                                    ) && (
                                                      <button
                                                        className="btn btn--warning btn--sm"
                                                        onClick={() =>
                                                          handleCloseBluefinPosition(
                                                            poolPosition.poolAddress,
                                                            [position.id]
                                                          )
                                                        }
                                                        disabled={
                                                          closingPool ===
                                                          poolPosition.poolAddress
                                                        }
                                                      >
                                                        {closingPool ===
                                                        poolPosition.poolAddress ? (
                                                          <span className="loading-text">
                                                            <span className="dot-loader"></span>
                                                            Closing
                                                          </span>
                                                        ) : (
                                                          "Force Close"
                                                        )}
                                                      </button>
                                                    )}
                                                </div>
                                              </td>
                                            </tr>
                                          )
                                        )}
                                      </tbody>
                                    </table>
                                  </div>

                                  {/* Unclaimed rewards section */}
                                  {poolPosition.positions.some(
                                    (pos) =>
                                      pos.rewards &&
                                      pos.rewards.some(
                                        (r) =>
                                          parseFloat(r.formatted || "0") > 0
                                      )
                                  ) && (
                                    <div className="rewards-section">
                                      <h4>Unclaimed Rewards</h4>
                                      <div className="rewards-list">
                                        {Object.values(
                                          (poolPosition.positions ?? [])
                                            .flatMap((pos) => pos.rewards || [])
                                            .reduce((acc, reward) => {
                                              if (!reward) return acc;
                                              const key =
                                                reward.tokenSymbol || "Unknown";
                                              if (!acc[key]) {
                                                acc[key] = { ...reward };
                                              } else {
                                                // Sum up rewards of the same token
                                                const currentAmount = BigInt(
                                                  acc[key].amount || "0"
                                                );
                                                const newAmount = BigInt(
                                                  reward.amount || "0"
                                                );
                                                acc[key].amount = (
                                                  currentAmount + newAmount
                                                ).toString();
                                                acc[key].formatted = (
                                                  parseInt(
                                                    acc[key].amount || "0"
                                                  ) /
                                                  Math.pow(
                                                    10,
                                                    reward.decimals || 0
                                                  )
                                                ).toFixed(reward.decimals || 0);

                                                acc[key].valueUsd =
                                                  (acc[key].valueUsd || 0) +
                                                  (reward.valueUsd || 0);
                                              }
                                              return acc;
                                            }, {} as Record<string, NonNullable<NormalizedPosition["rewards"]>[number]>)
                                        )
                                          .filter(
                                            (reward) =>
                                              reward &&
                                              parseFloat(
                                                reward.formatted || "0"
                                              ) > 0
                                          )
                                          .map((reward) => (
                                            <div
                                              key={reward.tokenSymbol}
                                              className="reward-item"
                                            >
                                              <span className="reward-token">
                                                {reward.tokenSymbol ||
                                                  "Unknown"}
                                                :
                                              </span>
                                              <span className="reward-amount">
                                                {parseFloat(
                                                  reward.formatted || "0"
                                                ).toFixed(6)}
                                              </span>
                                              <span className="reward-value">
                                                ≈ $
                                                {(reward.valueUsd || 0).toFixed(
                                                  2
                                                )}
                                              </span>
                                            </div>
                                          ))}
                                      </div>
                                      <div className="rewards-actions">
                                        <button
                                          className="btn btn--accent btn--sm"
                                          onClick={() =>
                                            handleClaim(
                                              poolPosition.poolAddress,
                                              poolPosition.positions.map(
                                                (p) => p.id
                                              )
                                            )
                                          }
                                          disabled={
                                            claimingPool ===
                                            poolPosition.poolAddress
                                          }
                                        >
                                          {claimingPool ===
                                          poolPosition.poolAddress
                                            ? "Claiming..."
                                            : "Claim All Rewards"}
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Withdraw modal */}
        {withdrawModal.isOpen && (
          <WithdrawModal
            poolAddress={withdrawModal.poolAddress}
            positionIds={withdrawModal.positionIds}
            totalLiquidity={withdrawModal.totalLiquidity}
            valueUsd={withdrawModal.valueUsd}
            onConfirm={handleWithdrawConfirm}
            onClose={handleModalClose}
          />
        )}

        {/* Transaction notification */}
        {notification?.visible && (
          <TransactionNotification
            message={notification.message}
            txDigest={notification.txDigest}
            isSuccess={notification.isSuccess}
            onClose={handleNotificationClose}
            asModal={notification.asModal}
            poolName={notification.poolInfo}
          />
        )}
      </div>
    </div>
  );
}

export default Positions;

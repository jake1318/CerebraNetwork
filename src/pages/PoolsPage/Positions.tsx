// src/pages/Positions.tsx
// Last Updated: 2025-06-23 07:18:27 UTC by jake1318

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

// Default token icon for fallbacks
const DEFAULT_TOKEN_ICON = "/assets/token-placeholder.png";

// Map of token addresses for well-known tokens (Sui mainnet)
const TOKEN_ADDRESSES: Record<string, string> = {
  SUI: "0x2::sui::SUI",
  USDC: "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
  USDT: "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN",
  WAL: "0x1e8b532cca6569cab9f9b9ebc73f8c13885012ade714729aa3b450e0339ac766::coin::COIN",
  HASUI:
    "0x680eb4a8e1074d7e15186c40dcf8d3b749f1ddba4c60478c367fc9c24a5a5a29::hasui::HASUI",
  // Add Scallop tokens
  SSUI: "0xaafc4f740de0dd0dde642a31148fb94517087052f19afb0f7bed1dc41a50c77b::scallop_sui::SCALLOP_SUI",
  SSCA: "0x5ca17430c1d046fae9edeaa8fd76c7b4193a00d764a0ecfa9418d733ad27bc1e::scallop_sca::SCALLOP_SCA",
};

// Hardcoded token logos for fallbacks
const HARDCODED_LOGOS: Record<string, string> = {
  CETUS:
    "https://coin-images.coingecko.com/coins/images/30256/large/cetus.png?1696529165",
  USDC: "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png",
  USDT: "https://assets.coingecko.com/coins/images/325/thumb/Tether.png",

  HASUI: "https://archive.cetus.zone/assets/image/sui/hasui.png",
  "HA-SUI": "https://archive.cetus.zone/assets/image/sui/hasui.png",
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

// Helper function to determine if a pool group is a scallop position
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

// Enhanced token icon component with fallbacks
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

  // Decide which logo URL to use with priority order
  useEffect(() => {
    const getLogoUrl = async () => {
      // 1. First try metadata from props if available
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

  // Handle image load error
  const handleError = () => {
    console.warn(`Failed to load logo for ${symbol}: ${currentUrl}`);
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
  }

  return (
    <div
      className={`token-icon ${sizeClass} ${
        !currentUrl || imgFailed ? "token-fallback" : ""
      } ${tokenClass}`}
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
      </div>
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
  const [showDetails, setShowDetails] = useState<Record<string, boolean>>({});
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, any>>({});

  // Transaction notification state
  const [notification, setNotification] =
    useState<TransactionNotificationState | null>(null);

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

        console.log(
          "Fetching metadata for tokens:",
          Array.from(tokenAddresses)
        );

        // Fetch metadata for all tokens at once
        const metadata = await fetchTokenMetadata(Array.from(tokenAddresses));
        setTokenMetadata(metadata);

        // Update the positions with the metadata
        setPoolPositions(transformedPositions);
      } catch (err) {
        console.error("Failed to load positions:", err);
        setError("Failed to load your positions. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  }, [connected, account, fetchTokenMetadata, getAddressBySymbol]);

  // Load user positions when wallet connects
  useEffect(() => {
    loadPositions();
  }, [loadPositions]);

  // Load Scallop data when wallet connects
  useEffect(() => {
    fetchScallopData();
  }, [fetchScallopData]);

  // Filter pool positions based on the positionType state
  const filteredPoolPositions = useMemo(() => {
    if (positionType === "all") {
      return poolPositions;
    } else if (positionType === "vault") {
      return poolPositions.filter((pool) => isVaultPool(pool));
    } else if (positionType === "scallop") {
      // Just return empty array since we'll display Scallop data separately
      return [];
    } else {
      return poolPositions.filter(
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
   * Handle claiming rewards using Cetus service
   */
  const handleClaim = async (poolAddress: string, positionIds: string[]) => {
    if (!wallet.connected || positionIds.length === 0) {
      console.error("Wallet not connected or no position IDs provided");
      return;
    }

    setClaimingPool(poolAddress);

    try {
      // Use one position as representative for the claim
      const positionId = positionIds[0];

      console.log(
        `Claiming rewards for position: ${positionId} in pool: ${poolAddress}`
      );

      // Get pool info for display
      const poolInfo = poolPositions.find((p) => p.poolAddress === poolAddress);
      const pairName = poolInfo
        ? `${poolInfo.tokenASymbol}${
            poolInfo.tokenBSymbol ? "/" + poolInfo.tokenBSymbol : ""
          }`
        : "";

      // Call service function to collect rewards
      const result = await cetusService.collectRewards(
        wallet,
        poolAddress,
        positionId
      );

      console.log("Claim transaction completed:", result);

      // Only show success with transaction if we got a digest back
      if (result.digest) {
        setNotification({
          visible: true,
          message: "Rewards Claimed Successfully!",
          txDigest: result.digest,
          isSuccess: true,
          asModal: true, // Show as modal
          poolInfo: pairName,
        });
      } else {
        // No rewards to claim case
        setNotification({
          visible: true,
          message: "No rewards available to claim at this time.",
          isSuccess: true,
          asModal: true, // Also show as modal
        });
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
   * Handle collecting fees using Cetus service
   */
  const handleCollectFees = async (poolAddress: string, positionId: string) => {
    if (!wallet.connected) {
      console.error("Wallet not connected");
      return;
    }

    try {
      console.log(
        `Collecting fees for position: ${positionId} in pool: ${poolAddress}`
      );

      // Get pool info for display
      const poolInfo = poolPositions.find((p) => p.poolAddress === poolAddress);
      const pairName = poolInfo
        ? `${poolInfo.tokenASymbol}${
            poolInfo.tokenBSymbol ? "/" + poolInfo.tokenBSymbol : ""
          }`
        : "";

      // Call service function to collect fees
      const result = await cetusService.collectFees(
        wallet,
        poolAddress,
        positionId
      );

      console.log("Fee collection transaction completed:", result);

      setNotification({
        visible: true,
        message: "Fees Collected Successfully!",
        txDigest: result.digest,
        isSuccess: true,
        asModal: true, // Show as modal
        poolInfo: pairName,
      });

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
   * Handle removing liquidity using Cetus service
   */
  const handleRemoveLiquidity = async (
    poolAddress: string,
    positionId: string,
    percentage: number = 100
  ) => {
    if (!wallet.connected) {
      console.error("Wallet not connected");
      return;
    }

    try {
      console.log(
        `Removing ${percentage}% liquidity from position: ${positionId} in pool: ${poolAddress}`
      );

      // Get pool info for display
      const poolInfo = poolPositions.find((p) => p.poolAddress === poolAddress);
      const pairName = poolInfo
        ? `${poolInfo.tokenASymbol}${
            poolInfo.tokenBSymbol ? "/" + poolInfo.tokenBSymbol : ""
          }`
        : "";

      // Call service function to remove liquidity
      const result = await cetusService.removeLiquidity(
        wallet,
        poolAddress,
        positionId,
        percentage
      );

      console.log("Remove liquidity transaction completed:", result);

      setNotification({
        visible: true,
        message: `Successfully removed ${percentage}% of liquidity!`,
        txDigest: result.digest,
        isSuccess: true,
        asModal: true, // Show as modal
        poolInfo: pairName,
      });

      // Refresh position data
      await loadPositions();
    } catch (err) {
      console.error("Remove liquidity failed:", err);
      setNotification({
        visible: true,
        message: `Failed to remove liquidity: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
        isSuccess: false,
        asModal: false, // Show errors as inline notifications
      });
    }
  };

  /**
   * Handle closing position using Cetus service
   */
  const handleClosePosition = async (
    poolAddress: string,
    positionId: string
  ) => {
    if (!wallet.connected) {
      console.error("Wallet not connected");
      return;
    }

    setWithdrawingPool(poolAddress);

    try {
      console.log(`Closing position: ${positionId} in pool: ${poolAddress}`);

      // Get pool info for display
      const poolInfo = poolPositions.find((p) => p.poolAddress === poolAddress);
      const pairName = poolInfo
        ? `${poolInfo.tokenASymbol}${
            poolInfo.tokenBSymbol ? "/" + poolInfo.tokenBSymbol : ""
          }`
        : "";

      // Call service function to close position
      const result = await cetusService.closePosition(
        wallet,
        poolAddress,
        positionId
      );

      console.log("Close position transaction completed:", result);

      setNotification({
        visible: true,
        message: "Close Successful!",
        txDigest: result.digest,
        isSuccess: true,
        asModal: true, // Show as modal
        poolInfo: `Closed position for ${pairName}`,
      });

      // Refresh position data
      await loadPositions();
    } catch (err) {
      console.error("Close position failed:", err);
      setNotification({
        visible: true,
        message: `Failed to close position: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
        isSuccess: false,
        asModal: false, // Show errors as inline notifications
      });
    } finally {
      setWithdrawingPool(null);
      // Close modal if open
      setWithdrawModal((prev) => ({ ...prev, isOpen: false }));
    }
  };

  /**
   * Handle withdrawal with options from the modal
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
      return { success: false };
    }

    try {
      setWithdrawingPool(poolAddress);
      let txDigest: string | undefined;

      // For multiple positions, handle each position
      for (const positionId of positionIds) {
        let result;

        if (withdrawPercent === 100 && closePosition) {
          // Close position (includes withdrawing all liquidity and collecting fees)
          result = await cetusService.closePosition(
            wallet,
            poolAddress,
            positionId
          );
          console.log(`Position ${positionId} closed, result:`, result);
          txDigest = result.digest; // Capture the transaction digest
        } else {
          // Partial withdrawal
          if (collectFees) {
            // First collect fees if requested
            const feesResult = await cetusService.collectFees(
              wallet,
              poolAddress,
              positionId
            );
            console.log(
              `Fees collected for position ${positionId}, result:`,
              feesResult
            );
          }

          // Then remove liquidity
          result = await cetusService.removeLiquidity(
            wallet,
            poolAddress,
            positionId,
            withdrawPercent,
            slippage
          );
          console.log(
            `Removed ${withdrawPercent}% from position ${positionId}, result:`,
            result
          );
          txDigest = result.digest; // Capture the transaction digest
        }
      }

      // Log the transaction digest for debugging
      console.log("Transaction completed with digest:", txDigest);

      // Get pool info for display
      const poolInfo = poolPositions.find((p) => p.poolAddress === poolAddress);
      const pairName = poolInfo
        ? `${poolInfo.tokenASymbol}${
            poolInfo.tokenBSymbol ? "/" + poolInfo.tokenBSymbol : ""
          }`
        : "";

      // Show notification with transaction digest
      setNotification({
        visible: true,
        message: closePosition ? "Close Successful!" : "Withdraw Successful!",
        txDigest, // Include the transaction digest
        isSuccess: true,
        asModal: true, // Show as modal
        poolInfo: closePosition
          ? `Closed position for ${pairName}`
          : `Withdrew ${withdrawPercent}% from ${pairName}`,
      });

      // Close the modal
      setWithdrawModal((prev) => ({ ...prev, isOpen: false }));

      // Refresh positions
      await loadPositions();

      // Return success with digest for the WithdrawModal
      return { success: true, digest: txDigest };
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

      return { success: false };
    } finally {
      setWithdrawingPool(null);
    }
  };

  const handleModalClose = () => {
    setWithdrawModal((prev) => ({ ...prev, isOpen: false }));
    setWithdrawingPool(null);
  };

  const handleNotificationClose = () => setNotification(null);

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

  return (
    <div className="positions-page">
      <div className="content-container">
        {/* Updated navigation tabs styling to match the header look and include Vaults */}
        <div className="main-navigation">
          <Link to="/pools" className="nav-link">
            Pools
          </Link>
          <Link to="/positions" className="nav-link active">
            My Positions
          </Link>
          <Link to="/portfolio" className="nav-link">
            Portfolio
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
        ) : poolPositions.length === 0 && !hasScallopPositions ? (
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
            {/* Type filter tabs */}
            <div className="position-type-tabs">
              <button
                className={`position-type-tab ${
                  positionType === "all" ? "active" : ""
                }`}
                onClick={() => setPositionType("all")}
              >
                All Positions ({poolPositions.length + scallopCount})
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
                      <th className="align-right">Your Liquidity</th>
                      <th className="align-right">Value (USD)</th>
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
                            <td className="align-right liquidity-cell">
                              {formatLargeNumber(poolPosition.totalLiquidity)}
                            </td>
                            <td className="align-right">
                              {formatDollars(poolPosition.totalValueUsd)}
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
                                                  <button
                                                    className="btn btn--primary btn--sm"
                                                    onClick={() =>
                                                      handleClosePosition(
                                                        poolPosition.poolAddress,
                                                        position.id
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
                                          poolPosition.positions
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
            asModal={notification.asModal} // Pass the asModal prop
            poolName={notification.poolInfo} // Pass the pool info
          />
        )}
      </div>
      <style jsx>{`
        .position-type-badge {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.8em;
          margin-left: 5px;
          background-color: rgba(0, 170, 255, 0.1);
          color: #00aaff;
        }

        .position-type-badge.vault-badge {
          background-color: rgba(92, 67, 232, 0.1);
          color: #5c43e8;
        }

        .position-type-badge.scallop-badge {
          background-color: rgba(235, 102, 98, 0.1);
          color: #eb6662;
        }

        /* Position type tabs */
        .position-type-tabs {
          display: flex;
          margin-bottom: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .position-type-tab {
          padding: 10px 16px;
          background: none;
          border: none;
          color: #a1a1a1;
          cursor: pointer;
          font-size: 14px;
          position: relative;
          transition: color 0.2s;
        }

        .position-type-tab:hover {
          color: white;
        }

        .position-type-tab.active {
          color: white;
          font-weight: 500;
        }

        .position-type-tab.active:after {
          content: "";
          position: absolute;
          bottom: -1px;
          left: 0;
          right: 0;
          height: 2px;
          background-color: #5c43e8;
        }

        /* Vault styling */
        .vault-row {
          background-color: rgba(92, 67, 232, 0.05);
        }

        .status-badge.vault {
          background-color: rgba(92, 67, 232, 0.1);
          color: #5c43e8;
        }

        /* Scallop styling */
        .scallop-row {
          background-color: rgba(235, 102, 98, 0.05);
        }

        .status-badge.scallop {
          background-color: rgba(235, 102, 98, 0.1);
          color: #eb6662;
        }

        /* Token styling */
        .token-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          overflow: hidden;
          background-color: #1a1f2e; /* Darker background for the token icons */
          position: relative;
          box-shadow: 0 0 8px rgba(0, 225, 255, 0.2); /* Neon glow effect */
          transition: all 0.2s ease-in-out;
        }

        .token-icon-sm {
          width: 24px;
          height: 24px;
          min-width: 24px;
        }

        .token-icon-md {
          width: 32px;
          height: 32px;
          min-width: 32px;
        }

        .token-icon-lg {
          width: 48px;
          height: 48px;
          min-width: 48px;
        }

        .token-icon img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .token-fallback {
          background: linear-gradient(135deg, #2a3042, #1e2433);
          border: 1px solid #304050;
        }

        .token-fallback-letter {
          font-weight: bold;
          font-size: 12px;
          color: #fff;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
        }

        /* Token icons in pairs */
        .token-icons {
          display: flex;
          align-items: center;
          margin-right: 8px;
        }

        .token-icons .token-icon:nth-child(2) {
          margin-left: -8px;
          z-index: 1;
          border: 1px solid #1a1f2e;
        }

        .pool-pair {
          display: flex;
          align-items: center;
        }

        .pair-name {
          font-weight: 500;
          margin-left: 4px;
        }

        /* Custom token styling for special tokens */
        .sui-token {
          background: linear-gradient(135deg, #4bc1d2, #2b6eff);
          box-shadow: 0 0 10px rgba(0, 174, 240, 0.7);
        }

        .wal-token {
          background: linear-gradient(135deg, #94f9f0, #a770ef);
          box-shadow: 0 0 10px rgba(167, 112, 239, 0.7);
        }

        .hasui-token {
          background: linear-gradient(135deg, #ffd966, #ff6b6b);
          box-shadow: 0 0 10px rgba(255, 107, 107, 0.7);
        }

        .scallop-token {
          background: linear-gradient(135deg, #eb6662, #ff9c97);
          box-shadow: 0 0 10px rgba(235, 102, 98, 0.7);
        }

        /* Scallop Summary Styles */
        .scallop-summary-container {
          background: rgba(20, 30, 48, 0.6);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 20px;
          margin-bottom: 24px;
        }

        .scallop-header {
          display: flex;
          align-items: center;
          margin-bottom: 16px;
        }

        .protocol-icon {
          margin-right: 12px;
        }

        .scallop-stats {
          display: flex;
          gap: 20px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          min-width: 150px;
        }

        .stat-label {
          font-size: 14px;
          color: #a0a7b8;
          margin-bottom: 4px;
        }

        .stat-value {
          font-size: 18px;
          font-weight: 500;
        }

        .scallop-rewards {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 16px;
        }

        .scallop-rewards h4 {
          margin-bottom: 8px;
          color: #eb6662;
        }

        .rewards-list {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .reward-item {
          display: flex;
          align-items: center;
          background: rgba(0, 0, 0, 0.2);
          padding: 8px;
          border-radius: 6px;
        }

        .reward-item .token-icon {
          margin-right: 8px;
        }

        .reward-amount {
          font-weight: 500;
          margin-right: 8px;
        }

        .reward-value {
          color: #a0a7b8;
          font-size: 12px;
        }

        .scallop-positions {
          margin-top: 16px;
        }

        .position-section h4 {
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          margin-bottom: 12px;
        }

        .positions-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 12px;
        }

        .position-item {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          padding: 12px;
          display: flex;
          align-items: center;
        }

        .position-token {
          display: flex;
          align-items: center;
          margin-right: 12px;
          min-width: 80px;
        }

        .position-token .token-icon {
          margin-right: 8px;
        }

        .position-details {
          flex: 1;
        }

        .position-amount {
          font-weight: 500;
        }

        .position-value {
          color: #a0a7b8;
          font-size: 12px;
        }

        .position-apy {
          color: #00c48c;
          font-size: 12px;
          font-weight: 500;
        }

        .obligation-item {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 16px;
        }

        .obligation-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .obligation-id {
          font-weight: 500;
        }

        .risk-level {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          background: rgba(0, 0, 0, 0.2);
        }

        .collateral-list h5,
        .borrowed-list h5 {
          margin-bottom: 8px;
          font-size: 14px;
          color: #a0a7b8;
        }

        .collateral-item,
        .borrow-item {
          display: flex;
          align-items: center;
          margin-bottom: 8px;
          padding: 8px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 6px;
        }

        .collateral-item .token-icon,
        .borrow-item .token-icon {
          margin-right: 8px;
        }

        .item-value {
          margin-left: auto;
          font-weight: 500;
        }

        .borrow-rate {
          margin-left: 10px;
          color: #ff5252;
          font-size: 12px;
        }

        .borrowed-list {
          margin-top: 16px;
        }
      `}</style>
    </div>
  );
}

export default Positions;

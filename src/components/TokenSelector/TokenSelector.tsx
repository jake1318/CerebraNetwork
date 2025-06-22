// src/components/TokenSelector/TokenSelector.tsx
// Last Updated: 2025-05-16 21:40:19 UTC by jake1318

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { useWallet } from "@suiet/wallet-kit";
import { useWalletContext } from "../../contexts/WalletContext";
import {
  useBirdeye,
  TokenData as BirdToken,
} from "../../contexts/BirdeyeContext";
import { getTokenMetadata } from "../../services/birdeyeService";
import { getTokenDetailsFromCoingecko } from "../../services/coinGeckoService";
import { FixedSizeList as List } from "react-window";
import "./TokenSelector.scss";

// Using existing token metadata cache from birdeyeService.ts
// We don't need to redefine it here since it's maintained in the service
const tokenLogoCache: Record<string, string> = {};
const coingeckoLogoCache: Record<string, string> = {};

// Track failed logo URLs to avoid repeated failures
const failedLogoUrls = new Set<string>();

export interface TokenData {
  address: string;
  symbol: string;
  name: string;
  logo: string;
  decimals: number;
  price: number;
  balance: number;
  shortAddress: string;
  isTrending?: boolean;
}

const DEFAULT_ICON = "/assets/token-placeholder.png";

// Helper function to check if a URL is an IPFS URL (which tend to fail)
const isIPFSUrl = (url: string): boolean => {
  return (
    url.includes("ipfs") ||
    url.includes("cloudflare-ipfs") ||
    url.includes("pinata") ||
    url.startsWith("ipfs://")
  );
};

// Helper function to validate a URL
const validateLogoUrl = (url: string): string => {
  // If the URL is known to fail, return default icon
  if (failedLogoUrls.has(url)) {
    return DEFAULT_ICON;
  }

  // If URL is IPFS but doesn't use HTTPS, don't use it
  if (url.startsWith("ipfs://") || isIPFSUrl(url)) {
    console.warn(`Potentially problematic IPFS URL: ${url}`);
    // We'll still try to use it, but be ready for failure
  }

  return url;
};

export default function TokenSelector({
  isOpen,
  onClose,
  onSelect,
  excludeAddresses = [],
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (t: TokenData) => void;
  excludeAddresses?: string[];
}) {
  const { account } = useWallet();
  const { walletState, tokenMetadata, refreshBalances, formatUsd } =
    useWalletContext();
  const { trendingTokens, tokenList, refreshTrendingTokens, refreshTokenList } =
    useBirdeye();

  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [displayState, setDisplayState] = useState<
    "loading" | "wallet" | "trending" | "all"
  >("loading");

  // Add state for token metadata obtained from fallbacks
  const [fallbackLogos, setFallbackLogos] = useState<Record<string, string>>(
    {}
  );

  // Track which tokens are being processed to avoid duplicate requests
  const [pendingLogoFetches, setPendingLogoFetches] = useState<Set<string>>(
    new Set()
  );

  const searchRef = useRef<HTMLInputElement>(null);

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Format token address for display
  const formatTokenAddress = (address: string, symbol: string): string => {
    const parts = address.split("::");
    // If we have a complete address with ::, show first part + symbol
    if (parts.length >= 3) {
      return `0x${parts[0].slice(0, 4)}...${symbol}`;
    }

    // Otherwise just show start of address + symbol
    return `${address.slice(0, 6)}...${symbol}`;
  };

  // Format balance with 7 decimals
  const formatTokenBalance = (balance: number): string => {
    if (balance === 0) return "0";

    if (balance < 0.0000001) {
      return balance.toExponential(2);
    }

    // Format to 7 decimal places
    return balance.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 7,
    });
  };

  // Format price with 7 decimals
  const formatTokenPrice = (price: number): string => {
    if (!price) return "$0";

    if (price < 0.0000001) {
      return "$" + price.toExponential(2);
    }

    // Format with $ sign and proper decimal places
    return "$" + price.toFixed(7).replace(/0+$/, "").replace(/\.$/, "");
  };

  // Enhanced fetch token logo with multiple fallbacks - prioritizing BirdEye first
  const fetchTokenLogo = async (
    tokenAddress: string
  ): Promise<string | null> => {
    // Skip if we're already fetching this token or have it in cache
    if (
      pendingLogoFetches.has(tokenAddress) ||
      tokenLogoCache[tokenAddress] ||
      fallbackLogos[tokenAddress] ||
      coingeckoLogoCache[tokenAddress]
    ) {
      return (
        tokenLogoCache[tokenAddress] ||
        fallbackLogos[tokenAddress] ||
        coingeckoLogoCache[tokenAddress] ||
        null
      );
    }

    // Add to pending set
    setPendingLogoFetches((prev) => new Set([...prev, tokenAddress]));

    try {
      console.log(`Fetching logo for token: ${tokenAddress}`);

      // First try BirdEye API - Changed order to put BirdEye first
      console.log(`Trying BirdEye API for ${tokenAddress}`);
      const metadata = await getTokenMetadata(tokenAddress);
      if (metadata?.logo_uri) {
        const validatedUrl = validateLogoUrl(metadata.logo_uri);

        // Update the cache
        tokenLogoCache[tokenAddress] = validatedUrl;

        // Update state
        setFallbackLogos((prev) => ({
          ...prev,
          [tokenAddress]: validatedUrl,
        }));

        console.log(`Found logo from BirdEye API for ${tokenAddress}`);
        return validatedUrl;
      }

      // If BirdEye doesn't have it, try CoinGecko as a fallback
      console.log(`No logo from BirdEye, trying CoinGecko for ${tokenAddress}`);
      const cgDetails = await getTokenDetailsFromCoingecko(tokenAddress);
      if (cgDetails?.image_url) {
        const validatedUrl = validateLogoUrl(cgDetails.image_url);

        // Only use CoinGecko URL if it's not an IPFS URL (which tend to fail)
        if (!isIPFSUrl(validatedUrl)) {
          // Cache the CoinGecko image
          coingeckoLogoCache[tokenAddress] = validatedUrl;

          // Update state if we don't already have a logo
          if (!fallbackLogos[tokenAddress]) {
            setFallbackLogos((prev) => ({
              ...prev,
              [tokenAddress]: validatedUrl,
            }));
          }

          console.log(`Found logo from CoinGecko API for ${tokenAddress}`);
          return validatedUrl;
        } else {
          console.warn(
            `Skipping problematic IPFS URL from CoinGecko: ${validatedUrl}`
          );
        }
      }

      console.log(`No suitable logo found for ${tokenAddress} from any source`);
    } catch (error) {
      console.warn(`Failed to fetch logo for ${tokenAddress}:`, error);
    } finally {
      // Remove from pending set
      setPendingLogoFetches((prev) => {
        const newSet = new Set([...prev]);
        newSet.delete(tokenAddress);
        return newSet;
      });
    }

    return null;
  };

  // Get logo URL with fallbacks - prioritizing BirdEye
  const getTokenLogo = (token: { address: string; logo?: string }): string => {
    // Try primary sources first
    if (
      token.logo &&
      token.logo !== DEFAULT_ICON &&
      !failedLogoUrls.has(token.logo)
    ) {
      return token.logo;
    }

    // Then try BirdEye first (changed order)
    const birdeyeLogo = tokenLogoCache[token.address];
    if (birdeyeLogo && !failedLogoUrls.has(birdeyeLogo)) {
      return birdeyeLogo;
    }

    // Then our cached fallback logos
    const fbLogo = fallbackLogos[token.address];
    if (fbLogo && !failedLogoUrls.has(fbLogo)) {
      return fbLogo;
    }

    // Then CoinGecko (if not IPFS)
    const cgLogo = coingeckoLogoCache[token.address];
    if (cgLogo && !failedLogoUrls.has(cgLogo) && !isIPFSUrl(cgLogo)) {
      return cgLogo;
    }

    // If token has any logo that hasn't failed, use it before default
    return token.logo && !failedLogoUrls.has(token.logo)
      ? token.logo
      : DEFAULT_ICON;
  };

  // build on‑chain wallet tokens
  const walletTokens = useMemo<TokenData[]>(
    () =>
      walletState.balances.map((b) => {
        const logoFromMetadata = tokenMetadata[b.coinType]?.logo;
        // Changed order to prioritize BirdEye
        const logoFromFallback =
          tokenLogoCache[b.coinType] &&
          !failedLogoUrls.has(tokenLogoCache[b.coinType])
            ? tokenLogoCache[b.coinType]
            : fallbackLogos[b.coinType] &&
              !failedLogoUrls.has(fallbackLogos[b.coinType])
            ? fallbackLogos[b.coinType]
            : coingeckoLogoCache[b.coinType] &&
              !failedLogoUrls.has(coingeckoLogoCache[b.coinType]) &&
              !isIPFSUrl(coingeckoLogoCache[b.coinType])
            ? coingeckoLogoCache[b.coinType]
            : null;

        const logo =
          logoFromMetadata && !failedLogoUrls.has(logoFromMetadata)
            ? logoFromMetadata
            : logoFromFallback
            ? logoFromFallback
            : DEFAULT_ICON;

        return {
          address: b.coinType,
          symbol: b.symbol,
          name: b.name,
          logo,
          decimals: b.decimals,
          price: tokenMetadata[b.coinType]?.price || 0,
          balance: Number(b.balance) / 10 ** b.decimals,
          shortAddress: formatTokenAddress(b.coinType, b.symbol),
        };
      }),
    [
      walletState.balances,
      tokenMetadata,
      fallbackLogos,
      tokenLogoCache,
      coingeckoLogoCache,
    ]
  );

  // helper: turn a Birdeye TokenData into our TokenData
  const fromBirdeye = (t: BirdToken): TokenData => {
    const onChain = walletState.balances.find((b) => b.coinType === t.address);

    // Logo resolution with validation - prioritizing BirdEye
    let logoUrl = t.logo;

    if (!logoUrl || logoUrl === DEFAULT_ICON || failedLogoUrls.has(logoUrl)) {
      // Try BirdEye first
      const beLogo = tokenLogoCache[t.address];
      if (beLogo && !failedLogoUrls.has(beLogo)) {
        logoUrl = beLogo;
      } else {
        // Then fallbacks
        const fbLogo = fallbackLogos[t.address];
        if (fbLogo && !failedLogoUrls.has(fbLogo)) {
          logoUrl = fbLogo;
        } else {
          // Then CoinGecko (if not IPFS)
          const cgLogo = coingeckoLogoCache[t.address];
          if (cgLogo && !failedLogoUrls.has(cgLogo) && !isIPFSUrl(cgLogo)) {
            logoUrl = cgLogo;
          }
        }
      }
    }

    // Final validation and fallback
    if (!logoUrl || failedLogoUrls.has(logoUrl)) {
      logoUrl = DEFAULT_ICON;
    }

    return {
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      logo: logoUrl,
      decimals: t.decimals,
      price: t.price,
      balance: onChain ? Number(onChain.balance) / 10 ** onChain.decimals : 0,
      shortAddress: formatTokenAddress(t.address, t.symbol),
      isTrending: t.isTrending,
    };
  };

  // merge: trending → wallet → full list (tokenList)
  const merged = useMemo<TokenData[]>(() => {
    const map = new Map<string, TokenData>();
    // wallet first
    walletTokens.forEach((t) => map.set(t.address, t));
    // then full tokenList
    tokenList.forEach((t) => {
      if (!map.has(t.address)) map.set(t.address, fromBirdeye(t));
    });
    // finally flag trending
    trendingTokens.forEach((t) => {
      if (!map.has(t.address)) map.set(t.address, fromBirdeye(t));
      else map.get(t.address)!.isTrending = true;
    });
    return Array.from(map.values());
  }, [
    walletTokens,
    tokenList,
    trendingTokens,
    fallbackLogos,
    tokenLogoCache,
    coingeckoLogoCache,
  ]);

  // apply search & exclusion
  const filtered = useMemo(
    () =>
      merged.filter((t) => {
        if (excludeAddresses.includes(t.address)) return false;
        const q = searchQuery.toLowerCase().trim();
        if (!q) return true;
        return (
          t.symbol.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.address.toLowerCase().includes(q)
        );
      }),
    [merged, searchQuery, excludeAddresses]
  );

  // Smart sorting function
  const smartSortTokens = useCallback(
    (tokens: TokenData[]) => {
      return [...tokens].sort((a, b) => {
        // 1. Wallet tokens first (have balance)
        if (a.balance > 0 && b.balance === 0) return -1;
        if (a.balance === 0 && b.balance > 0) return 1;

        // If both have balance, higher balance first
        if (a.balance > 0 && b.balance > 0) {
          const aValue = a.balance * (a.price || 0);
          const bValue = b.balance * (b.price || 0);
          if (aValue !== bValue) return bValue - aValue;
        }

        // 2. Then trending tokens
        if (a.isTrending && !b.isTrending) return -1;
        if (!a.isTrending && b.isTrending) return 1;

        // 3. Then by user's search relevance if searching
        const q = searchQuery.toLowerCase().trim();
        if (q) {
          // Exact symbol match gets priority
          if (a.symbol.toLowerCase() === q && b.symbol.toLowerCase() !== q)
            return -1;
          if (a.symbol.toLowerCase() !== q && b.symbol.toLowerCase() === q)
            return 1;

          // Symbol starts with query gets next priority
          const aStartsWith = a.symbol.toLowerCase().startsWith(q);
          const bStartsWith = b.symbol.toLowerCase().startsWith(q);
          if (aStartsWith && !bStartsWith) return -1;
          if (!aStartsWith && bStartsWith) return 1;

          // Then partial symbol match
          const aSymbolMatch = a.symbol.toLowerCase().includes(q);
          const bSymbolMatch = b.symbol.toLowerCase().includes(q);
          if (aSymbolMatch && !bSymbolMatch) return -1;
          if (!aSymbolMatch && bSymbolMatch) return 1;
        }

        // 4. Then by trading volume/popularity (using price as proxy)
        return (b.price || 0) - (a.price || 0);
      });
    },
    [searchQuery]
  );

  // Apply smart sorting to filtered tokens
  const sortedTokens = useMemo(
    () => smartSortTokens(filtered),
    [filtered, smartSortTokens]
  );

  // Tokens to display based on loading state
  const tokensToDisplay = useMemo(() => {
    switch (displayState) {
      case "loading":
        return [];
      case "wallet":
        return smartSortTokens(
          walletTokens.filter((t) => !excludeAddresses.includes(t.address))
        );
      case "trending":
        // Show wallet tokens + trending (without duplicates)
        const walletsForDisplay = walletTokens.filter(
          (t) => !excludeAddresses.includes(t.address)
        );
        const trendingForDisplay = trendingTokens
          .filter(
            (t) =>
              !excludeAddresses.includes(t.address) &&
              !walletTokens.some((w) => w.address === t.address)
          )
          .map(fromBirdeye);
        return smartSortTokens([...walletsForDisplay, ...trendingForDisplay]);
      case "all":
      default:
        return sortedTokens; // All sorted and filtered tokens
    }
  }, [
    displayState,
    walletTokens,
    trendingTokens,
    excludeAddresses,
    sortedTokens,
    smartSortTokens,
    fallbackLogos,
    tokenLogoCache,
    coingeckoLogoCache,
  ]);

  // Batch fetch missing logos for tokens - with BirdEye prioritized
  const fetchMissingLogos = useCallback(
    async (tokens: TokenData[]) => {
      const tokensNeedingLogos = tokens.filter(
        (token) =>
          (!token.logo ||
            token.logo === DEFAULT_ICON ||
            failedLogoUrls.has(token.logo)) &&
          !(
            tokenLogoCache[token.address] &&
            !failedLogoUrls.has(tokenLogoCache[token.address])
          ) &&
          !(
            fallbackLogos[token.address] &&
            !failedLogoUrls.has(fallbackLogos[token.address])
          ) &&
          !(
            coingeckoLogoCache[token.address] &&
            !failedLogoUrls.has(coingeckoLogoCache[token.address])
          ) &&
          !pendingLogoFetches.has(token.address)
      );

      if (tokensNeedingLogos.length === 0) return;

      console.log(`Fetching logos for ${tokensNeedingLogos.length} tokens`);

      // Add all tokens to pending set
      setPendingLogoFetches((prev) => {
        const newSet = new Set([...prev]);
        tokensNeedingLogos.forEach((token) => newSet.add(token.address));
        return newSet;
      });

      // Process in smaller batches to avoid overwhelming API
      const batchSize = 10;
      const newLogos: Record<string, string> = {};

      for (let i = 0; i < tokensNeedingLogos.length; i += batchSize) {
        const batch = tokensNeedingLogos.slice(i, i + batchSize);

        // Process batch with Promise.all
        await Promise.all(
          batch.map(async (token) => {
            try {
              // Try BirdEye first (changed order)
              const metadata = await getTokenMetadata(token.address);
              if (metadata?.logo_uri) {
                const validatedUrl = validateLogoUrl(metadata.logo_uri);
                if (validatedUrl !== DEFAULT_ICON) {
                  newLogos[token.address] = validatedUrl;
                  tokenLogoCache[token.address] = validatedUrl;
                  return; // If successful, don't try CoinGecko
                }
              }

              // If BirdEye failed, try CoinGecko but avoid IPFS URLs
              const cgDetails = await getTokenDetailsFromCoingecko(
                token.address
              );
              if (cgDetails?.image_url && !isIPFSUrl(cgDetails.image_url)) {
                const validatedUrl = validateLogoUrl(cgDetails.image_url);
                if (validatedUrl !== DEFAULT_ICON) {
                  newLogos[token.address] = validatedUrl;
                  coingeckoLogoCache[token.address] = validatedUrl;
                }
              }
            } catch (err) {
              console.warn(`Error fetching logo for ${token.address}:`, err);
            }
          })
        );
      }

      // Update state with all fetched logos
      if (Object.keys(newLogos).length > 0) {
        setFallbackLogos((prev) => ({
          ...prev,
          ...newLogos,
        }));
      }

      // Remove all processed tokens from pending set
      setPendingLogoFetches((prev) => {
        const newSet = new Set([...prev]);
        tokensNeedingLogos.forEach((token) => newSet.delete(token.address));
        return newSet;
      });
    },
    [fallbackLogos, pendingLogoFetches, tokenLogoCache, coingeckoLogoCache]
  );

  // Token item renderer for virtualization
  const TokenItem = ({
    index,
    style,
  }: {
    index: number;
    style: React.CSSProperties;
  }) => {
    const token = tokensToDisplay[index];
    if (!token) return null;

    // Get logo with fallbacks
    const [logoUrl, setLogoUrl] = useState<string>(getTokenLogo(token));
    const [imgFailed, setImgFailed] = useState(false);

    // When image fails, track it and try to fetch from fallbacks if we haven't already
    useEffect(() => {
      if (imgFailed) {
        if (logoUrl !== DEFAULT_ICON) {
          // Add to failed URLs set
          failedLogoUrls.add(logoUrl);
        }

        if (
          token.address &&
          !(
            tokenLogoCache[token.address] &&
            !failedLogoUrls.has(tokenLogoCache[token.address])
          ) &&
          !(
            fallbackLogos[token.address] &&
            !failedLogoUrls.has(fallbackLogos[token.address])
          ) &&
          !(
            coingeckoLogoCache[token.address] &&
            !failedLogoUrls.has(coingeckoLogoCache[token.address])
          ) &&
          !pendingLogoFetches.has(token.address)
        ) {
          fetchTokenLogo(token.address).then((logo) => {
            if (logo) setLogoUrl(logo);
          });
        }
      }
    }, [imgFailed, token.address, logoUrl]);

    return (
      <div style={style}>
        <div
          className={`token-item${token.isTrending ? " trending" : ""}`}
          onClick={() => {
            // Include the better logo URL if we've found one
            const bestLogo = getTokenLogo(token);
            onSelect({
              ...token,
              logo: bestLogo,
            });
          }}
        >
          <div className="token-info">
            <img
              src={logoUrl}
              alt={token.symbol}
              className="token-logo"
              onError={(e) => {
                // If the logo fails, try default icon and trigger fetch
                setImgFailed(true);
                (e.target as HTMLImageElement).src = DEFAULT_ICON;
              }}
            />
            <div className="token-details">
              <div className="token-symbol">{token.symbol}</div>
              <div className="token-name">{token.name}</div>
              <div className="token-address">{token.shortAddress}</div>
            </div>
          </div>
          <div className="token-data">
            <div className="token-balance">
              {formatTokenBalance(token.balance)}
            </div>
            <div className="token-price">{formatTokenPrice(token.price)}</div>
          </div>
        </div>
      </div>
    );
  };

  // on modal open, load data progressively
  useEffect(() => {
    if (!isOpen) return;

    // Always start by showing "loading"
    setDisplayState("loading");
    setLoading(true);

    // Show wallet tokens immediately if we have them
    if (walletTokens.length > 0) {
      setDisplayState("wallet");
    }

    // Progressive loading sequence
    const loadData = async () => {
      try {
        // 1. Make sure wallet data is up to date
        if (walletTokens.length === 0) {
          await refreshBalances();
          setDisplayState("wallet");
        }

        // 2. Load trending tokens (usually faster than full list)
        const trendingPromise = refreshTrendingTokens().then(() => {
          // Only update state if we're not already showing 'all'
          if (displayState !== "all") {
            setDisplayState("trending");
          }
        });

        // 3. Load full token list (may take longer)
        const tokenListPromise = refreshTokenList().then(() => {
          setDisplayState("all");
          setLoading(false);
        });

        // Wait for all data to load (but UI updates progressively)
        await Promise.all([trendingPromise, tokenListPromise]);
      } catch (error) {
        console.error("Error loading token data:", error);
        // Ensure we're not stuck in loading state
        setLoading(false);
        if (displayState === "loading") {
          setDisplayState(walletTokens.length > 0 ? "wallet" : "all");
        }
      }
    };

    loadData();
  }, [isOpen, account?.address]);

  // Fetch missing logos when tokens are displayed
  useEffect(() => {
    if (tokensToDisplay.length > 0) {
      fetchMissingLogos(tokensToDisplay);
    }
  }, [tokensToDisplay, fetchMissingLogos]);

  if (!isOpen) return null;

  return (
    <div className="token-selector-modal">
      <div className="token-selector-content">
        <header className="token-selector-header">
          <h2>Select Token</h2>
          <button onClick={onClose} className="close-button">
            &times;
          </button>
        </header>

        <div className="token-search">
          <input
            ref={searchRef}
            type="text"
            placeholder="Search by name, symbol, or address"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="token-list">
          {displayState === "loading" ? (
            <div className="loading">Loading tokens…</div>
          ) : tokensToDisplay.length === 0 ? (
            <div className="no-tokens">No tokens found</div>
          ) : (
            <>
              {/* Use virtualization for better performance with long lists */}
              <List
                height={400}
                width="100%"
                itemCount={tokensToDisplay.length}
                itemSize={72} // Adjust based on your token item height
                overscanCount={5}
                className="virtual-token-list"
              >
                {TokenItem}
              </List>

              {/* Loading indicator for progressive loading */}
              {displayState !== "all" && (
                <div className="loading-more-tokens">
                  Loading more tokens
                  <span className="loading-dots">
                    <span className="dot">.</span>
                    <span className="dot">.</span>
                    <span className="dot">.</span>
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

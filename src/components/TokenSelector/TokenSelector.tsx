import React, { useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { useWalletContext } from "../../contexts/WalletContext";
import { useBirdeye } from "../../contexts/BirdeyeContext";
import tokenCacheService from "../../services/tokenCacheService";
import "./TokenSelector.scss";

export interface TokenData {
  address: string;
  symbol: string;
  name: string;
  logo: string;
  decimals: number;
  price: number;
  balance?: number;
  isTrending?: boolean;
  shortAddress?: string;
  isLoading?: boolean;
}

const DEFAULT_ICON = "/assets/token-placeholder.png";

// Unify names/logos from both sources
function unifyNameAndLogo(
  blockMeta: Partial<TokenData>,
  beMeta: Partial<TokenData>
): { name: string; logo: string } {
  const finalName =
    blockMeta.name && blockMeta.name !== "Unknown Coin"
      ? blockMeta.name
      : beMeta.name || "Unknown Coin";
  const finalLogo = blockMeta.logo || beMeta.logo || "";
  return { name: finalName, logo: finalLogo };
}

const TokenSelector = ({
  isOpen,
  onClose,
  onSelect,
  excludeAddresses = [],
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (token: TokenData) => void;
  excludeAddresses?: string[];
}) => {
  const { account } = useWallet();
  const { walletState, tokenMetadata, refreshBalances, formatUsd } =
    useWalletContext();
  const {
    trendingTokens,
    tokenList,
    refreshTrendingTokens,
    refreshTokenList,
    getCachedTokensVisualData,
  } = useBirdeye();

  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingTokens, setIsLoadingTokens] = useState(true);
  const [cachedVisualTokens, setCachedVisualTokens] = useState<TokenData[]>([]);

  // Build maps for quick lookup
  const birdeyeMap = new Map<string, TokenData>();
  tokenList.forEach((t) => birdeyeMap.set(t.address.toLowerCase(), t));
  trendingTokens.forEach((t) => birdeyeMap.set(t.address.toLowerCase(), t));

  // Build wallet tokens first
  function buildWalletTokens(): TokenData[] {
    return walletState.balances.map((bal) => {
      const meta = tokenMetadata[bal.coinType] || {};
      const be = birdeyeMap.get(bal.coinType.toLowerCase()) || {};
      const { name, logo } = unifyNameAndLogo(
        { name: bal.name, logo: meta.logo },
        { name: be.name, logo: be.logo }
      );
      return {
        address: bal.coinType,
        symbol: bal.symbol,
        name,
        logo,
        decimals: bal.decimals,
        price: meta.price || 0,
        balance: Number(bal.balance) / 10 ** bal.decimals,
        shortAddress: `${bal.coinType.slice(0, 6)}…${bal.coinType.slice(-4)}`,
        isLoading: false,
      };
    });
  }

  // Build the rest (Birdeye only) tokens
  function buildBirdeyeOnlyTokens(): TokenData[] {
    const walletAddrs = new Set(
      walletState.balances.map((b) => b.coinType.toLowerCase())
    );
    return Array.from(birdeyeMap.values())
      .filter((t) => !walletAddrs.has(t.address.toLowerCase()))
      .map((t) => {
        const meta = tokenMetadata[t.address.toLowerCase()] || {};
        const { name, logo } = unifyNameAndLogo(
          { name: meta.name, logo: meta.logo },
          { name: t.name, logo: t.logo }
        );
        return {
          address: t.address,
          symbol: t.symbol,
          name,
          logo,
          decimals: meta.decimals ?? t.decimals,
          price: meta.price ?? t.price,
          balance: 0,
          shortAddress: `${t.address.slice(0, 6)}…${t.address.slice(-4)}`,
          isLoading: false,
        };
      });
  }

  const getMergedTokens = (): TokenData[] => {
    const walletTokens = buildWalletTokens();
    const other = buildBirdeyeOnlyTokens();
    walletTokens.sort((a, b) => b.balance! * b.price - a.balance! * a.price);
    return [...walletTokens, ...other];
  };

  const filteredTokens = (): TokenData[] => {
    const q = searchQuery.toLowerCase().trim();
    return getMergedTokens().filter((t) => {
      if (excludeAddresses.includes(t.address)) return false;
      if (!q) return true;
      return (
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q)
      );
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    setIsLoadingTokens(true);

    // show cached visual tokens immediately
    const cached = tokenCacheService.getAllCachedTokens();
    setCachedVisualTokens(
      cached.map((c) => ({
        address: c.address,
        symbol: c.symbol,
        name: c.name,
        logo: c.logo,
        decimals: c.decimals,
        price: 0,
        shortAddress: `${c.address.slice(0, 6)}…${c.address.slice(-4)}`,
        isLoading: true,
      }))
    );

    // 1️⃣ fetch wallet balances first
    refreshBalances()
      // 2️⃣ then refresh trending & token list
      .then(() => Promise.all([refreshTrendingTokens(), refreshTokenList()]))
      .catch(console.error)
      .finally(() => setIsLoadingTokens(false));
  }, [isOpen, account?.address]);

  if (!isOpen) return null;

  return (
    <div className="token-selector-modal">
      <div className="token-selector-content">
        <div className="token-selector-header">
          <h2>Select Token</h2>
          <button className="close-button" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="token-search">
          <input
            type="text"
            placeholder="Search by name or address"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="token-list">
          {filteredTokens().length === 0 ? (
            <div className="no-tokens">
              {isLoadingTokens ? "Loading tokens..." : "No tokens found"}
            </div>
          ) : (
            filteredTokens().map((token) => (
              <div
                key={token.address}
                className="token-item"
                onClick={() => onSelect(token)}
              >
                <div className="token-info">
                  <img
                    src={token.logo || DEFAULT_ICON}
                    alt={token.symbol}
                    className="token-logo"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = DEFAULT_ICON;
                    }}
                  />
                  <div className="token-details">
                    <div className="token-symbol">{token.symbol}</div>
                    <div className="token-name">{token.name}</div>
                  </div>
                </div>
                <div className="token-data">
                  {token.balance !== undefined && (
                    <div className="token-balance">
                      {token.balance.toLocaleString(undefined, {
                        maximumFractionDigits: 6,
                      })}
                    </div>
                  )}
                  <div className="token-price">{formatUsd(token.price)}</div>
                  <div className="token-address">{token.shortAddress}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default TokenSelector;

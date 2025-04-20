// src/components/TokenSelector/TokenSelector.tsx
import React, { useState, useEffect, useMemo } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { useWalletContext } from "../../contexts/WalletContext";
import {
  useBirdeye,
  TokenData as BirdToken,
} from "../../contexts/BirdeyeContext";
import "./TokenSelector.scss";

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

  // on modal open, reload balances & Birdeye lists
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    refreshBalances()
      .then(() => Promise.all([refreshTrendingTokens(), refreshTokenList()]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOpen, account?.address]);

  // build on‑chain wallet tokens
  const walletTokens = useMemo<TokenData[]>(
    () =>
      walletState.balances.map((b) => ({
        address: b.coinType,
        symbol: b.symbol,
        name: b.name,
        logo: tokenMetadata[b.coinType]?.logo || DEFAULT_ICON,
        decimals: b.decimals,
        price: tokenMetadata[b.coinType]?.price || 0,
        balance: Number(b.balance) / 10 ** b.decimals,
        shortAddress: `${b.coinType.slice(0, 6)}…${b.symbol}`,
      })),
    [walletState.balances, tokenMetadata]
  );

  // helper: turn a Birdeye TokenData into our TokenData
  const fromBirdeye = (t: BirdToken): TokenData => {
    const onChain = walletState.balances.find((b) => b.coinType === t.address);
    return {
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      logo: t.logo || DEFAULT_ICON,
      decimals: t.decimals,
      price: t.price,
      balance: onChain ? Number(onChain.balance) / 10 ** onChain.decimals : 0,
      shortAddress: `${t.address.slice(0, 6)}…${t.symbol}`,
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
  }, [walletTokens, tokenList, trendingTokens]);

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
            type="text"
            placeholder="Search by name, symbol, or address"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="token-list">
          {loading ? (
            <div className="no-tokens">Loading tokens…</div>
          ) : filtered.length === 0 ? (
            <div className="no-tokens">No tokens found</div>
          ) : (
            filtered.map((token) => (
              <div
                key={token.address}
                className={`token-item${token.isTrending ? " trending" : ""}`}
                onClick={() => onSelect(token)}
              >
                <div className="token-info">
                  <img
                    src={token.logo}
                    alt={token.symbol}
                    className="token-logo"
                    onError={(e) => {
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
                    {token.balance.toLocaleString(undefined, {
                      maximumFractionDigits: 6,
                    })}
                  </div>
                  <div className="token-price">{formatUsd(token.price)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

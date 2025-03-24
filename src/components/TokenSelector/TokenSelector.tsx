import { useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { useWalletContext } from "../../contexts/WalletContext";
import { useBirdeye } from "../../contexts/BirdeyeContext";
import "./TokenSelector.scss";

export interface TokenData {
  address: string;
  symbol: string;
  name: string;
  logo: string;
  decimals: number;
  price: number;
  balance?: number; // user’s balance (if any)
  isTrending?: boolean; // marks a trending token
  // You can also add a computed field for shortAddress if needed:
  shortAddress?: string;
}

/**
 * Unifies two token objects’ name and logo.
 * If Blockvision returns "Unknown Coin" for the name, we use the Birdeye name.
 * For the logo, we prefer a non-empty value.
 */
function unifyNameAndLogo(
  blockvisionToken: Partial<TokenData>,
  birdeyeToken: Partial<TokenData>
): { name: string; logo: string } {
  const bvName = blockvisionToken.name || "";
  const bvLogo = blockvisionToken.logo || "";
  const beName = birdeyeToken.name || "";
  const beLogo = birdeyeToken.logo || "";
  const finalName =
    bvName && bvName !== "Unknown Coin" ? bvName : beName || "Unknown Coin";
  const finalLogo = bvLogo || beLogo || "";
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
  const { trendingTokens, tokenList, refreshTrendingTokens, refreshTokenList } =
    useBirdeye();
  const {
    walletState,
    tokenMetadata,
    refreshBalances,
    formatUsd,
    fetchTokenMetadata,
  } = useWalletContext();
  const [searchQuery, setSearchQuery] = useState("");

  // Build a map from Birdeye tokens (from both tokenList and trendingTokens)
  const buildBirdeyeMap = (): Map<string, TokenData> => {
    const map = new Map<string, TokenData>();
    [...tokenList, ...trendingTokens].forEach((t) => {
      map.set(t.address.toLowerCase(), t);
    });
    return map;
  };

  // Build tokens that the user holds (from Blockvision via WalletContext)
  function buildWalletTokens(): TokenData[] {
    if (!walletState.balances || walletState.balances.length === 0) return [];
    const beMap = buildBirdeyeMap();
    return walletState.balances.map((bal) => {
      const blockMeta = tokenMetadata[bal.coinType] || {};
      const price = Number(blockMeta.price) || 0;
      const balanceValue = Number(bal.balance) / Math.pow(10, bal.decimals);
      const beToken = beMap.get(bal.coinType.toLowerCase()) || {};
      const { name, logo } = unifyNameAndLogo(
        { name: bal.name, logo: blockMeta.logo },
        { name: beToken.name, logo: beToken.logo }
      );
      return {
        address: bal.coinType,
        symbol: bal.symbol || blockMeta.symbol || beToken.symbol || "UNKNOWN",
        name,
        logo,
        decimals: bal.decimals,
        price,
        balance: balanceValue,
        shortAddress: bal.coinType.slice(0, 6) + "…" + bal.coinType.slice(-4),
      };
    });
  }

  // Build tokens from Birdeye that the user does not hold (i.e. zero-balance tokens)
  function buildBirdeyeOnlyTokens(): TokenData[] {
    const beMap = buildBirdeyeMap();
    const walletAddrs = new Set(
      walletState.balances.map((b) => b.coinType.toLowerCase())
    );
    return [...beMap.values()]
      .filter((t) => !walletAddrs.has(t.address.toLowerCase()))
      .map((t) => {
        const blockMeta = tokenMetadata[t.address.toLowerCase()] || {};
        const { name, logo } = unifyNameAndLogo(
          { name: blockMeta.name, logo: blockMeta.logo },
          { name: t.name, logo: t.logo }
        );
        const price = Number(blockMeta.price || t.price) || 0;
        return {
          address: t.address,
          symbol:
            blockMeta.symbol ||
            t.symbol ||
            t.address.split("::").pop() ||
            "UNKNOWN",
          name,
          logo,
          decimals: blockMeta.decimals || t.decimals || 9,
          price,
          balance: 0,
          shortAddress: t.address.slice(0, 6) + "…" + t.address.slice(-4),
        };
      });
  }

  // Final merged list: wallet tokens first, then the remaining tokens.
  const getMergedTokens = (): TokenData[] => {
    const walletTokens = buildWalletTokens();
    const birdeyeOnly = buildBirdeyeOnlyTokens();
    // Sort wallet tokens by descending (balance * price)
    walletTokens.sort(
      (a, b) => (a.balance || 0) * a.price - (b.balance || 0) * b.price
    );
    return [...walletTokens, ...birdeyeOnly];
  };

  const filteredTokens = () => {
    const query = searchQuery.toLowerCase().trim();
    const list = getMergedTokens().filter(
      (t) => !excludeAddresses.includes(t.address)
    );
    if (query) {
      return list.filter(
        (token) =>
          token.symbol.toLowerCase().includes(query) ||
          token.name.toLowerCase().includes(query) ||
          token.address.toLowerCase().includes(query)
      );
    }
    return list;
  };

  useEffect(() => {
    if (isOpen) {
      refreshTrendingTokens();
      refreshTokenList();
      refreshBalances();
      // Fetch metadata for all tokens in Birdeye so even zero-balance tokens are enriched.
      const allAddrs = [
        ...new Set([...tokenList, ...trendingTokens].map((t) => t.address)),
      ];
      fetchTokenMetadata(allAddrs);
    }
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
            <div className="no-tokens">No tokens found</div>
          ) : (
            filteredTokens().map((token) => (
              <div
                key={token.address}
                className="token-item"
                onClick={() => onSelect(token)}
              >
                <div className="token-info">
                  {token.logo && (
                    <img
                      src={token.logo}
                      alt={token.symbol}
                      className="token-logo"
                    />
                  )}
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
                  <div className="token-address">
                    {token.shortAddress
                      ? token.shortAddress
                      : token.address.slice(0, 9) + "…"}
                  </div>
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

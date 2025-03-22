import { useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import {
  birdeyeService,
  blockvisionService,
} from "../../services/birdeyeService";
import "./TokenSelector.scss";

interface TokenData {
  address: string;
  symbol: string;
  name: string;
  logo: string;
  decimals: number;
  price: number;
  balance?: number;
  change24h?: number;
  isTrending?: boolean;
}

// Pinned tokens list (with coinType addresses, symbols, names, decimals, and logos if available)
const PINNED_TOKENS: TokenData[] = [
  {
    address: "0x2::sui::SUI",
    symbol: "SUI",
    name: "Sui",
    logo: "https://raw.githubusercontent.com/suiet/sui-wallet/main/packages/chrome/src/assets/sui.png",
    decimals: 9,
    price: 0,
  },
  {
    address:
      "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    symbol: "USDC",
    name: "USD Coin",
    logo: "https://cryptologos.cc/logos/usd-coin-usdc-logo.svg",
    decimals: 6,
    price: 0,
  },
  {
    address:
      "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS",
    symbol: "CETUS",
    name: "Cetus Token",
    logo: "https://raw.githubusercontent.com/cetus-app/brand-kit/main/Cetus%20brand%20kit/logo/cetus.png",
    decimals: 9,
    price: 0,
  },
  {
    address:
      "0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX",
    symbol: "NAVX",
    name: "NAVX",
    logo: "",
    decimals: 9,
    price: 0,
  },
  {
    address:
      "0x7016aae72cfc67f2fadf55769c0a7dd54291a583b63051a5ed71081cce836ac6::sca::SCA",
    symbol: "SCA",
    name: "SCA",
    logo: "",
    decimals: 9,
    price: 0,
  },
  {
    address:
      "0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881::coin::COIN",
    symbol: "WBTC",
    name: "Wrapped Bitcoin",
    logo: "https://cryptologos.cc/logos/bitcoin-btc-logo.svg",
    decimals: 8,
    price: 0,
  },
  {
    address:
      "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
    symbol: "DEEP",
    name: "DEEP",
    logo: "",
    decimals: 9,
    price: 0,
  },
  {
    address:
      "0x9c6d76eb273e6b5ba2ec8d708b7fa336a5531f6be59f326b5be8d4d8b12348a4::coin::COIN",
    symbol: "PYTH",
    name: "PYTH",
    logo: "",
    decimals: 9,
    price: 0,
  },
  {
    address:
      "0xb7844e289a8410e50fb3ca48d69eb9cf29e27d223ef90353fe1bd8e27ff8f3f8::coin::COIN",
    symbol: "WSOL",
    name: "WSOL",
    logo: "",
    decimals: 9,
    price: 0,
  },
  {
    address:
      "0xdbe380b13a6d0f5cdedd58de8f04625263f113b3f9db32b3e1983f49e2841676::coin::COIN",
    symbol: "WMATIC",
    name: "WMATIC",
    logo: "",
    decimals: 9,
    price: 0,
  },
  {
    address:
      "0xb848cce11ef3a8f62eccea6eb5b35a12c4c2b1ee1af7755d02d7bd6218e8226f::coin::COIN",
    symbol: "WBNB",
    name: "WBNB",
    logo: "",
    decimals: 9,
    price: 0,
  },
  {
    address:
      "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
    symbol: "wUSDC",
    name: "wUSDC",
    logo: "",
    decimals: 6,
    price: 0,
  },
];

interface TokenSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (token: TokenData) => void;
  excludeAddresses?: string[];
}

const TokenSelector = ({
  isOpen,
  onClose,
  onSelect,
  excludeAddresses = [],
}: TokenSelectorProps) => {
  const { account } = useWallet();
  const [walletTokens, setWalletTokens] = useState<TokenData[]>([]);
  const [publicTokens, setPublicTokens] = useState<TokenData[]>([]);
  const [trendingTokens, setTrendingTokens] = useState<TokenData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // activeTab: "portfolio" shows wallet tokens,
  // "trending" shows trending tokens,
  // "all" shows pinned tokens + public token list.
  const [activeTab, setActiveTab] = useState<"all" | "portfolio" | "trending">(
    "all"
  );

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, account?.address]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Helper to extract an array from various response shapes.
      const extractArray = (data: any): any[] => {
        if (!data) return [];
        if (data.data && Array.isArray(data.data)) return data.data;
        if (Array.isArray(data)) return data;
        if (data.tokens && Array.isArray(data.tokens)) return data.tokens;
        return [];
      };

      // Fetch trending tokens via Birdeye.
      const trendingData = await birdeyeService.getTrendingTokens();
      const trendingArr = extractArray(trendingData);
      const trending = trendingArr.map((token: any) => ({
        address: token.address,
        symbol: token.symbol || "Unknown",
        name: token.name || "Unknown Token",
        logo: token.logo || "",
        decimals: token.decimals || 9,
        price: token.price || 0,
        change24h: token.priceChange24h || 0,
        isTrending: true,
      }));
      setTrendingTokens(trending);

      // Fetch public token list via Birdeye.
      const tokenListData = await birdeyeService.getTokenList();
      const tokenListArr = extractArray(tokenListData);
      const publicList = tokenListArr
        .filter((token: any) => !excludeAddresses.includes(token.address))
        .map((token: any) => ({
          address: token.address,
          symbol: token.symbol || "Unknown",
          name: token.name || "Unknown Token",
          logo: token.logo || "",
          decimals: token.decimals || 9,
          price: token.price || 0,
          change24h: token.priceChange24h || 0,
        }));
      setPublicTokens(publicList);

      // Fetch wallet tokens via Blockvision if connected.
      if (account?.address) {
        const walletData = await blockvisionService.getAccountCoins(
          account.address
        );
        const walletArr = extractArray(walletData);
        const walletList = walletArr
          .filter((token: any) => !excludeAddresses.includes(token.coinType))
          .map((token: any) => ({
            address: token.coinType, // using coinType as token identifier
            symbol:
              token.symbol || token.coinType.split("::").pop() || "Unknown",
            name: token.name || "Unknown Token",
            logo: token.logo || "",
            decimals: token.decimals || 9,
            price: token.price || 0,
            balance:
              parseFloat(token.balance) / Math.pow(10, token.decimals || 9),
            change24h: token.priceChange24h || 0,
          }));
        setWalletTokens(walletList);
      }
    } catch (error) {
      console.error("Error fetching token data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // For "all" tab, combine the pinned tokens with the public token list,
  // excluding duplicates (by comparing token address).
  const getAllTokens = () => {
    // Create a lookup of wallet and public token addresses
    const existing = new Set(
      [...publicTokens].map((t: TokenData) => t.address.toLowerCase())
    );
    // Filter pinned tokens to only those not in the public list.
    const filteredPinned = PINNED_TOKENS.filter(
      (t) => !existing.has(t.address.toLowerCase())
    );
    // Return the combined list (pinned tokens come first).
    return [...filteredPinned, ...publicTokens];
  };

  const filteredTokens = () => {
    const query = searchQuery.toLowerCase().trim();
    let list: TokenData[] = [];
    if (activeTab === "portfolio") {
      list = walletTokens;
    } else if (activeTab === "trending") {
      list = trendingTokens;
    } else if (activeTab === "all") {
      list = getAllTokens();
    }
    return query
      ? list.filter(
          (token) =>
            token.symbol.toLowerCase().includes(query) ||
            token.name.toLowerCase().includes(query) ||
            token.address.toLowerCase().includes(query)
        )
      : list;
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

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

        <div className="token-tabs">
          <button
            className={activeTab === "all" ? "active" : ""}
            onClick={() => setActiveTab("all")}
          >
            All Tokens
          </button>
          {account && (
            <button
              className={activeTab === "portfolio" ? "active" : ""}
              onClick={() => setActiveTab("portfolio")}
            >
              Your Tokens
            </button>
          )}
          <button
            className={activeTab === "trending" ? "active" : ""}
            onClick={() => setActiveTab("trending")}
          >
            Trending
          </button>
        </div>

        <div className="token-list">
          {isLoading ? (
            <div className="loading">Loading tokens...</div>
          ) : filteredTokens().length === 0 ? (
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
                    <div className="token-symbol">
                      {token.symbol}
                      {token.isTrending && (
                        <span className="trending-badge">🔥</span>
                      )}
                    </div>
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
                  <div className="token-price">
                    {formatCurrency(token.price)}
                    {token.change24h !== undefined && (
                      <span
                        className={`price-change ${
                          token.change24h >= 0 ? "positive" : "negative"
                        }`}
                      >
                        {token.change24h >= 0 ? "▲" : "▼"}{" "}
                        {Math.abs(token.change24h).toFixed(2)}%
                      </span>
                    )}
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

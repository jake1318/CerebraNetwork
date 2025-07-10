// src/contexts/BirdeyeContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import {
  birdeyeService,
  BirdeyeTrendingToken,
  BirdeyeListToken,
} from "../services/birdeyeService";
import tokenCacheService, {
  CachedTokenData,
} from "../services/tokenCacheService";

export interface TokenData {
  address: string; // KEEP original
  symbol: string;
  name: string;
  logo: string;
  decimals: number;
  price: number;
  change24h?: number;
  isTrending?: boolean;
  isLoading?: boolean;
}

interface BirdeyeContextType {
  trendingTokens: TokenData[];
  tokenList: TokenData[];
  isLoadingTrending: boolean;
  isLoadingTokenList: boolean;
  refreshTrendingTokens: () => Promise<void>;
  refreshTokenList: () => Promise<void>;
  getCachedTokensVisualData: () => TokenData[];
}

const BirdeyeContext = createContext<BirdeyeContextType | undefined>(undefined);

const sanitizeLogo = (url: string = ""): string => {
  if (url.startsWith("ipfs://")) {
    return url.replace(/^ipfs:\/\//, "https://cloudflare-ipfs.com/ipfs/");
  }
  if (url.includes("ipfs.io")) {
    return url
      .replace("http://", "https://")
      .replace("https://ipfs.io", "https://cloudflare-ipfs.com");
  }
  if (url.startsWith("http://")) {
    return "https://" + url.slice(7);
  }
  return url;
};

export const BirdeyeProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [trendingTokens, setTrendingTokens] = useState<TokenData[]>([]);
  const [tokenList, setTokenList] = useState<TokenData[]>([]);
  const [isLoadingTrending, setIsLoadingTrending] = useState(false);
  const [isLoadingTokenList, setIsLoadingTokenList] = useState(false);

  const cacheVisual = (arr: TokenData[]) => {
    const toCache: CachedTokenData[] = arr.map((t) => ({
      address: t.address.toLowerCase(), // cache‐key only
      symbol: t.symbol,
      name: t.name,
      logo: t.logo,
      decimals: t.decimals,
    }));
    tokenCacheService.cacheTokens(toCache);
  };

  const refreshTrendingTokens = async () => {
    setIsLoadingTrending(true);
    try {
      const raw: BirdeyeTrendingToken[] =
        await birdeyeService.getTrendingTokens();
      const formatted: TokenData[] = raw.map((t) => ({
        address: t.address,
        symbol: t.symbol,
        name: t.name,
        logo: sanitizeLogo(t.logoURI),
        decimals: t.decimals,
        price: t.price,
        change24h: t.price24hChangePercent,
        isTrending: true,
      }));
      setTrendingTokens(formatted);
      cacheVisual(formatted);
    } catch (err) {
      console.error("Error fetching trending tokens:", err);
    } finally {
      setIsLoadingTrending(false);
    }
  };

  const refreshTokenList = async () => {
    setIsLoadingTokenList(true);
    try {
      // 1) fetch basic metadata
      const raw: BirdeyeListToken[] = await birdeyeService.getTokenList();
      const formatted: TokenData[] = raw.map((t) => ({
        address: t.address,
        symbol: t.symbol,
        name: t.name,
        logo: sanitizeLogo(t.logoURI),
        decimals: t.decimals,
        price: 0, // fill shortly
        change24h: t.v24hChangePercent,
      }));

      // 2) sequentially fetch spot‐prices
      for (let i = 0; i < formatted.length; i++) {
        const tok = formatted[i];
        try {
          const pv = await birdeyeService.getPriceVolumeSingle(tok.address);
          tok.price = pv ? Number(pv.price) : 0;
        } catch {
          tok.price = 0;
        }
      }

      setTokenList(formatted);
      cacheVisual(formatted);
    } catch (err) {
      console.error("Error fetching token list:", err);
    } finally {
      setIsLoadingTokenList(false);
    }
  };

  const getCachedTokensVisualData = (): TokenData[] =>
    tokenCacheService.getAllCachedTokens().map((t) => ({
      address: t.address, // lowercase key, only for visuals
      symbol: t.symbol,
      name: t.name,
      logo: sanitizeLogo(t.logo),
      decimals: t.decimals,
      price: 0,
      isLoading: true,
    }));

  useEffect(() => {
    refreshTrendingTokens();
    refreshTokenList();
  }, []);

  return (
    <BirdeyeContext.Provider
      value={{
        trendingTokens,
        tokenList,
        isLoadingTrending,
        isLoadingTokenList,
        refreshTrendingTokens,
        refreshTokenList,
        getCachedTokensVisualData,
      }}
    >
      {children}
    </BirdeyeContext.Provider>
  );
};

export const useBirdeye = () => {
  const ctx = useContext(BirdeyeContext);
  if (!ctx) throw new Error("useBirdeye must be used within a BirdeyeProvider");
  return ctx;
};

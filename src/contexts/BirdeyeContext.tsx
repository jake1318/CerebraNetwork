import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { birdeyeService } from "../services/birdeyeService";
import tokenCacheService, {
  CachedTokenData,
} from "../services/tokenCacheService";

export interface TokenData {
  address: string;
  symbol: string;
  name: string;
  logo: string;
  decimals: number;
  price: number;
  balance?: number;
  change24h?: number;
  isTrending?: boolean;
  isLoading?: boolean; // Flag to indicate when price is loading
}

interface BirdeyeContextType {
  trendingTokens: TokenData[];
  tokenList: TokenData[];
  isLoadingTrending: boolean;
  isLoadingTokenList: boolean;
  refreshTrendingTokens: () => Promise<void>;
  refreshTokenList: () => Promise<void>;
  getTokenMetadata: (tokenAddress: string) => Promise<any>;
  getWalletTokens: (address: string) => Promise<TokenData[]>;
  getTokenChart: (
    tokenAddress: string,
    resolution?: string,
    count?: number
  ) => Promise<any>;
  getCachedTokensVisualData: () => TokenData[]; // New method to get visual data only
}

const BirdeyeContext = createContext<BirdeyeContextType | undefined>(undefined);

export const BirdeyeProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [trendingTokens, setTrendingTokens] = useState<TokenData[]>([]);
  const [tokenList, setTokenList] = useState<TokenData[]>([]);
  const [isLoadingTrending, setIsLoadingTrending] = useState<boolean>(false);
  const [isLoadingTokenList, setIsLoadingTokenList] = useState<boolean>(false);

  const extractArray = (data: any): any[] => {
    if (!data) return [];
    if (data.data && Array.isArray(data.data)) return data.data;
    if (Array.isArray(data)) return data;
    if (data.tokens && Array.isArray(data.tokens)) return data.tokens;
    return [];
  };

  // Get cached tokens visual data (without prices)
  const getCachedTokensVisualData = (): TokenData[] => {
    const cached = tokenCacheService.getAllCachedTokens();
    return cached.map((token) => ({
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      logo: token.logo,
      decimals: token.decimals,
      price: 0, // We don't use cached prices
      isLoading: true, // Indicate price is loading
    }));
  };

  // Cache only visual elements, not price data
  const cacheTokenVisualData = (tokens: TokenData[]) => {
    const tokensToCache = tokens.map((token) => ({
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      logo: token.logo,
      decimals: token.decimals,
    }));
    tokenCacheService.cacheTokens(tokensToCache);
  };

  const refreshTrendingTokens = async () => {
    setIsLoadingTrending(true);
    try {
      const response = await birdeyeService.getTrendingTokens();
      if (response && response.data) {
        const trendingArr = extractArray(response.data);
        const formattedTokens = trendingArr.map((token: any) => ({
          address: token.address,
          symbol: token.symbol || "Unknown",
          name: token.name || "Unknown Token",
          logo: token.logo || "",
          decimals: token.decimals || 9,
          price: token.price || 0,
          change24h: token.priceChange24h || 0,
          isTrending: true,
        }));
        setTrendingTokens(formattedTokens);

        // Cache trending tokens visual data
        cacheTokenVisualData(formattedTokens);
      }
    } catch (error) {
      console.error("Error fetching trending tokens:", error);
    } finally {
      setIsLoadingTrending(false);
    }
  };

  const refreshTokenList = async () => {
    setIsLoadingTokenList(true);
    try {
      const response = await birdeyeService.getTokenList();
      if (response && response.data) {
        const tokenListArr = extractArray(response.data);
        const formattedTokens = tokenListArr.map((token: any) => ({
          address: token.address,
          symbol: token.symbol || "Unknown",
          name: token.name || "Unknown Token",
          logo: token.logo || "",
          decimals: token.decimals || 9,
          price: token.price || 0,
          change24h: token.priceChange24h || 0,
        }));
        setTokenList(formattedTokens);

        // Cache token list visual data
        cacheTokenVisualData(formattedTokens);
      }
    } catch (error) {
      console.error("Error fetching token list:", error);
    } finally {
      setIsLoadingTokenList(false);
    }
  };

  const getTokenMetadata = async (tokenAddress: string) => {
    try {
      // Check cache first for visual data
      const cachedToken = tokenCacheService.getTokenFromCache(tokenAddress);
      let visualDataFromCache = null;

      if (cachedToken) {
        visualDataFromCache = {
          address: cachedToken.address,
          symbol: cachedToken.symbol,
          name: cachedToken.name,
          logo: cachedToken.logo,
          decimals: cachedToken.decimals,
          isLoading: true, // Price is loading
        };
      }

      // Fetch from API for complete data
      const response = await birdeyeService.getSingleTokenMetadata(
        tokenAddress
      );

      if (response && response.data) {
        // Cache the visual data
        tokenCacheService.cacheToken({
          address: tokenAddress,
          symbol: response.data.symbol || "Unknown",
          name: response.data.name || "Unknown Token",
          logo: response.data.logo || "",
          decimals: response.data.decimals || 9,
        });

        return response.data;
      }

      // Return cached visual data as fallback if API fails
      return visualDataFromCache;
    } catch (error) {
      console.error("Error fetching token metadata:", error);

      // Get cached visual data
      const cachedToken = tokenCacheService.getTokenFromCache(tokenAddress);
      if (cachedToken) {
        return {
          address: cachedToken.address,
          symbol: cachedToken.symbol,
          name: cachedToken.name,
          logo: cachedToken.logo,
          decimals: cachedToken.decimals,
          isLoading: true, // Price is loading
        };
      }

      return null;
    }
  };

  const getWalletTokens = async (address: string): Promise<TokenData[]> => {
    try {
      // Before API call, we can use cached visual data
      const cachedTokensMap = new Map<string, CachedTokenData>();
      tokenCacheService.getAllCachedTokens().forEach((token) => {
        cachedTokensMap.set(token.address.toLowerCase(), token);
      });

      const response = await birdeyeService.getWalletTokenList(address);
      const walletArr = extractArray(response.data || []);
      const tokens = walletArr.map((token: any) => {
        const tokenData = {
          address: token.coinType || token.address,
          symbol:
            token.symbol ||
            (token.coinType ? token.coinType.split("::").pop() : "Unknown"),
          name: token.name || "Unknown Token",
          logo: token.logo || "",
          decimals: token.decimals || 9,
          price: token.price || 0,
          balance:
            parseFloat(token.balance) / Math.pow(10, token.decimals || 9),
          change24h: token.priceChange24h || 0,
        };

        // Cache the visual data
        tokenCacheService.cacheToken({
          address: tokenData.address,
          symbol: tokenData.symbol,
          name: tokenData.name,
          logo: tokenData.logo,
          decimals: tokenData.decimals,
        });

        return tokenData;
      });

      return tokens;
    } catch (error) {
      console.error("Error fetching wallet tokens:", error);

      // Fall back to cached visual data only if API fails
      const cached = tokenCacheService.getAllCachedTokens();
      return cached.map((token) => ({
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        logo: token.logo,
        decimals: token.decimals,
        price: 0, // No cached price, will need to be fetched
        balance: 0, // Unknown until fetched
        change24h: 0, // Unknown until fetched
        isLoading: true, // Indicate price is loading
      }));
    }
  };

  const getTokenChart = async (
    tokenAddress: string,
    resolution = "1d",
    count = 100
  ) => {
    try {
      const response = await birdeyeService.getChartData(
        tokenAddress,
        resolution,
        count
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching chart data:", error);
      return [];
    }
  };

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
        getTokenMetadata,
        getWalletTokens,
        getTokenChart,
        getCachedTokensVisualData,
      }}
    >
      {children}
    </BirdeyeContext.Provider>
  );
};

export const useBirdeye = () => {
  const context = useContext(BirdeyeContext);
  if (context === undefined) {
    throw new Error("useBirdeye must be used within a BirdeyeProvider");
  }
  return context;
};

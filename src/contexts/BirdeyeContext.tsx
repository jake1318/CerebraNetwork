import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { birdeyeService } from "../services/birdeyeService";

interface BirdeyeContextType {
  trendingTokens: any[];
  tokenList: any[];
  isLoadingTrending: boolean;
  isLoadingTokenList: boolean;
  refreshTrendingTokens: () => Promise<void>;
  refreshTokenList: () => Promise<void>;
  getTokenMetadata: (tokenAddress: string) => Promise<any>;
  getWalletTokens: (address: string) => Promise<any[]>;
  getTokenChart: (
    tokenAddress: string,
    resolution?: string,
    count?: number
  ) => Promise<any>;
}

const BirdeyeContext = createContext<BirdeyeContextType | undefined>(undefined);

export const BirdeyeProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [trendingTokens, setTrendingTokens] = useState<any[]>([]);
  const [tokenList, setTokenList] = useState<any[]>([]);
  const [isLoadingTrending, setIsLoadingTrending] = useState<boolean>(false);
  const [isLoadingTokenList, setIsLoadingTokenList] = useState<boolean>(false);

  // Fetch trending tokens
  const refreshTrendingTokens = async () => {
    setIsLoadingTrending(true);
    try {
      const response = await birdeyeService.getTrendingTokens();
      if (response && response.data) {
        setTrendingTokens(response.data);
      }
    } catch (error) {
      console.error("Error fetching trending tokens:", error);
    } finally {
      setIsLoadingTrending(false);
    }
  };

  // Fetch token list
  const refreshTokenList = async () => {
    setIsLoadingTokenList(true);
    try {
      const response = await birdeyeService.getTokenList();
      if (response && response.data) {
        setTokenList(response.data);
      }
    } catch (error) {
      console.error("Error fetching token list:", error);
    } finally {
      setIsLoadingTokenList(false);
    }
  };

  // Get token metadata
  const getTokenMetadata = async (tokenAddress: string) => {
    try {
      const response = await birdeyeService.getSingleTokenMetadata(
        tokenAddress
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching token metadata:", error);
      return null;
    }
  };

  // Get wallet tokens
  const getWalletTokens = async (address: string) => {
    try {
      const response = await birdeyeService.getWalletTokenList(address);
      return response.data || [];
    } catch (error) {
      console.error("Error fetching wallet tokens:", error);
      return [];
    }
  };

  // Get token chart data
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

  // Load initial data
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

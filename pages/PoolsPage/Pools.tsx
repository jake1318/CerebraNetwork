// src/pages/PoolsPage/Pools.tsx
// Last Updated: 2025-07-15 02:13:01 UTC by jake1318

import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useWallet } from "@suiet/wallet-kit";
import DepositModal from "../../components/DepositModal";
import TurbosDepositModal from "../../components/TurbosDepositModal";
import KriyaDepositModal from "../../components/KriyaDepositModal";
import EnhancedTokenIcon from "../../components/EnhancedTokenIcon";
import ProtocolBadge from "./ProtocolBadge";
import { VaultSection } from "../../components/VaultSection";
import { PoolInfo } from "../../services/coinGeckoService";
import * as coinGeckoService from "../../services/coinGeckoService";
import * as cetusService from "../../services/cetusService";
import * as bluefinService from "../../services/bluefinService";
import * as turbosService from "../../services/turbosService";
import * as kriyadexService from "../../services/kriyadexService";
import * as birdeyeService from "../../services/birdeyeService";
// Fix 1: Use default import for blockvisionService instead of namespace import
import blockvisionService from "../../services/blockvisionService";
import { processPoolsWithVaults } from "../../services/cetusVaultsProcessor";
import {
  getAllVaults,
  setVaultsSender,
} from "../../services/cetusVaultService";
import "../../styles/pages/Pools.scss";
import "./protocolBadges.scss";
// Import the copy icon
import {
  FaCopy,
  FaChartLine,
  FaExchangeAlt,
  FaCoins,
  FaPercentage,
} from "react-icons/fa";

// Define all supported DEXes from CoinGecko
interface DexInfo {
  id: string;
  name: string;
}

// Pre-defined list of DEXes that CoinGecko supports
// Keep Bluefin in the list since we want to display their pools
const SUPPORTED_DEXES: DexInfo[] = [
  // Full functionality
  { id: "cetus", name: "Cetus" },
  { id: "bluefin", name: "Bluefin" },

  // Coming soon
  { id: "turbos-finance", name: "Turbos" },
  { id: "flow-x", name: "FlowX" },
  { id: "aftermath", name: "Aftermath" },

  // Removed protocols - commented out as per requirements
  // { id: "kriya-dex", name: "KriyaDEX" },
  // { id: "alphafi", name: "AlphaFi" },
  // { id: "alphalend", name: "AlphaLend" },
  // { id: "bucket", name: "Bucket" },
  // { id: "haedal", name: "Haedal" },
  // { id: "kai", name: "Kai" },
  // { id: "navi", name: "Navi" },
  // { id: "scallop", name: "Scallop" },
  // { id: "suilend", name: "SuiLend" },
  // { id: "suistake", name: "Suistake" },
  // { id: "typus", name: "Typus" },
  // { id: "walrus", name: "Walrus" },
];

const DEFAULT_TOKEN_ICON = "/assets/token-placeholder.png";

// Define the tab types
enum TabType {
  POOLS = "pools",
  MY_POSITIONS = "positions",
  PORTFOLIO = "portfolio",
  VAULTS = "vaults",
}

// Interface for market dashboard metrics
interface MarketMetrics {
  totalTVL: number;
  total24hVolume: number;
  totalPools: number;
  averageAPR: number;
  topAPR: number;
  loading: boolean;
}

const Pools: React.FC = () => {
  const wallet = useWallet();
  const { connected, account } = wallet;
  const navigate = useNavigate();

  // State to track active tab
  const [activeTab, setActiveTab] = useState<TabType>(TabType.POOLS);

  const [originalPools, setOriginalPools] = useState<PoolInfo[]>([]);
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [filteredPools, setFilteredPools] = useState<PoolInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");
  const [sortColumn, setSortColumn] = useState<
    "liquidityUSD" | "volumeUSD" | "feesUSD" | "apr" | "dex"
  >("apr");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // State for market dashboard
  const [marketMetrics, setMarketMetrics] = useState<MarketMetrics>({
    totalTVL: 0,
    total24hVolume: 0,
    totalPools: 0,
    averageAPR: 0,
    topAPR: 0,
    loading: true,
  });

  // State to store the global market metrics (across all DEXes)
  const [globalMarketMetrics, setGlobalMarketMetrics] = useState<MarketMetrics>(
    {
      totalTVL: 0,
      total24hVolume: 0,
      totalPools: 0,
      averageAPR: 0,
      topAPR: 0,
      loading: true,
    }
  );

  // State for deposit modals - separate state for each modal type
  const [isDepositModalOpen, setIsDepositModalOpen] = useState<boolean>(false);
  const [isTurbosModalOpen, setIsTurbosModalOpen] = useState<boolean>(false);
  const [isKriyaModalOpen, setIsKriyaModalOpen] = useState<boolean>(false);
  const [selectedPool, setSelectedPool] = useState<PoolInfo | null>(null);

  // State for token balances to pass to deposit modals
  const [tokenABalance, setTokenABalance] = useState<string>("0");
  const [tokenBBalance, setTokenBBalance] = useState<string>("0");

  // Track selected DEX filter
  const [selectedDex, setSelectedDex] = useState<string | null>(null);

  // Add search debounce timer
  const [searchTimer, setSearchTimer] = useState<NodeJS.Timeout | null>(null);

  // Cache BirdEye metadata for all token addresses
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, any>>({});

  // Track which pool ID was copied (for showing the "Copied!" message)
  const [copiedPoolId, setCopiedPoolId] = useState<string | null>(null);

  // Currently supported DEXes for deposit
  const supportedDexes = ["cetus", "bluefin"];

  // Set maximum number of pools to show in results
  const MAX_POOLS_TO_DISPLAY = 20;

  // Function to handle copying pool ID to clipboard
  const handleCopyPoolId = (poolId: string) => {
    navigator.clipboard.writeText(poolId).then(() => {
      setCopiedPoolId(poolId);

      // Reset the copied state after 2 seconds
      setTimeout(() => {
        setCopiedPoolId(null);
      }, 2000);
    });
  };

  // Setup SDK sender address when wallet connects
  useEffect(() => {
    if (connected && account?.address) {
      // Set the wallet's address in the Cetus SDK
      cetusService.setCetusSender(account.address);

      // Set the wallet's address in the Vaults SDK
      setVaultsSender(account.address);

      console.log(`Set SDK sender address to ${account.address}`);
    }
  }, [connected, account]);

  // Handle navigation to other pages
  const navigateToPage = (tab: TabType) => {
    if (tab === TabType.MY_POSITIONS) {
      navigate("/positions");
    } else if (tab === TabType.PORTFOLIO) {
      navigate("/portfolio");
    } else if (tab === TabType.VAULTS) {
      // Don't navigate - vaults tab is unclickable
      return;
    } else {
      setActiveTab(TabType.POOLS);
    }
  };

  // Calculate market metrics from pool data
  const calculateMarketMetrics = useCallback((pools: PoolInfo[]) => {
    if (!pools || pools.length === 0) {
      return {
        totalTVL: 0,
        total24hVolume: 0,
        totalPools: 0,
        averageAPR: 0,
        topAPR: 0,
        loading: false,
      };
    }

    let totalTVL = 0;
    let total24hVolume = 0;
    let totalAPR = 0;
    let validAPRCount = 0;
    let topAPR = 0;

    pools.forEach((pool) => {
      // Sum TVL
      if (pool.liquidityUSD && !isNaN(pool.liquidityUSD)) {
        totalTVL += pool.liquidityUSD;
      }

      // Sum 24h Volume
      if (pool.volumeUSD && !isNaN(pool.volumeUSD)) {
        total24hVolume += pool.volumeUSD;
      }

      // Calculate average and top APR
      if (pool.apr && !isNaN(pool.apr) && pool.apr > 0) {
        totalAPR += pool.apr;
        validAPRCount++;

        // Update top APR if this is higher
        if (pool.apr > topAPR) {
          topAPR = pool.apr;
        }
      }
    });

    // Calculate average APR (if there are valid APRs)
    const averageAPR = validAPRCount > 0 ? totalAPR / validAPRCount : 0;

    return {
      totalTVL,
      total24hVolume,
      totalPools: pools.length,
      averageAPR,
      topAPR,
      loading: false,
    };
  }, []);

  /** ------------------------------------------------------------
   * Fetch pools from CoinGecko + enrich with BirdEye logos + merge with Kriya pools
   * ----------------------------------------------------------- */
  const fetchPools = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Get CoinGecko pools - this will get the top pools across all DEXes
      const poolsFromCoingecko = await coinGeckoService.getDefaultPools();
      console.log(`Fetched ${poolsFromCoingecko.length} pools from CoinGecko`);

      // 2. Merge in ALL Kriya pools using our new service function
      const mergedPools = await kriyadexService.getMergedPoolsWithKriya(
        poolsFromCoingecko
      );
      console.log(
        `Total pools after merging with Kriya: ${mergedPools.length}`
      );

      // 3. Collect all token addresses for logo fetching
      const addrs = new Set<string>();
      mergedPools.forEach((p) => {
        if (p.tokenAAddress) addrs.add(p.tokenAAddress);
        if (p.tokenBAddress) addrs.add(p.tokenBAddress);
      });

      // 4. Fetch BirdEye metadata in one batch
      if (addrs.size) {
        console.log(
          `Fetching BirdEye metadata for ${addrs.size} token addresses`
        );
        const meta = await birdeyeService.getMultipleTokenMetadata(
          Array.from(addrs)
        );
        console.log(
          `Retrieved metadata for ${Object.keys(meta).length} tokens`
        );

        // Log a sample of the metadata to check format
        if (Object.keys(meta).length > 0) {
          const sampleKey = Object.keys(meta)[0];
          console.log(`Sample metadata for ${sampleKey}:`, meta[sampleKey]);
        }

        setTokenMetadata(meta);
      }

      // 5. Get all vaults to merge with pools
      let allVaults = [];
      try {
        allVaults = await getAllVaults();
        console.log(`Retrieved ${allVaults.length} vaults from Cetus`);
      } catch (vaultsError) {
        console.error("Failed to fetch vaults:", vaultsError);
      }

      // 6. Process pools with vaults data
      const poolsWithVaults = processPoolsWithVaults(mergedPools, allVaults);
      console.log(`Processed ${poolsWithVaults.length} pools with vault data`);

      // 7. Calculate market metrics for all DEXes combined
      const metrics = calculateMarketMetrics(poolsWithVaults);
      setMarketMetrics(metrics);
      setGlobalMarketMetrics(metrics); // Store the global metrics for future reference

      console.log("Market overview metrics calculated:", metrics);

      // 8. Save to state and sort by APR by default
      setOriginalPools(poolsWithVaults);
      setPools(poolsWithVaults);

      const sortedPools = [...poolsWithVaults].sort((a, b) => b.apr - a.apr);
      setFilteredPools(sortedPools.slice(0, MAX_POOLS_TO_DISPLAY));
    } catch (error) {
      console.error("Failed to fetch pools:", error);
    } finally {
      setLoading(false);
    }
  }, [calculateMarketMetrics]);

  // Initial data fetch
  useEffect(() => {
    fetchPools();
  }, [fetchPools]);

  /**
   * Fetch pools by DEX + enrich with BirdEye logos
   */
  const fetchPoolsByDex = useCallback(
    async (dex: string) => {
      setLoading(true);
      try {
        console.log(`Fetching top pools for DEX: ${dex}`);

        // Special case for Kriya - use our bulletproof implementation with CoinGecko data + fallbacks
        if (
          dex.toLowerCase() === "kriya-dex" ||
          dex.toLowerCase() === "kriya"
        ) {
          console.log("Using optimized Kriya pool fetching with fallbacks");
          const kriyaPools = await kriyadexService.getKriyaPoolsWithFallback();
          console.log(
            `Retrieved ${kriyaPools.length} Kriya pools with fallbacks`
          );

          // Sort by APR by default
          const sortedPools = [...kriyaPools].sort((a, b) => b.apr - a.apr);

          // Update state
          setPools(sortedPools);
          setFilteredPools(sortedPools.slice(0, MAX_POOLS_TO_DISPLAY));

          // Calculate metrics for this specific DEX but keep showing global metrics in the dashboard
          const dexMetrics = calculateMarketMetrics(sortedPools);
          setMarketMetrics(dexMetrics);

          setLoading(false);
          return;
        }

        // For other DEXes, continue with existing logic...
        let dexPools: PoolInfo[] = [];

        // Try to use cached data first
        dexPools = originalPools.filter(
          (p) => p.dex.toLowerCase() === dex.toLowerCase()
        );

        // If not enough pools in cache, fetch from CoinGecko
        if (dexPools.length < MAX_POOLS_TO_DISPLAY) {
          const poolsByDex = await coinGeckoService.getPoolsByDex(
            dex,
            MAX_POOLS_TO_DISPLAY
          );
          dexPools = poolsByDex;
        }

        console.log(`Found ${dexPools.length} pools for ${dex}`);

        // Collect addresses & fetch metadata
        const addrs = new Set<string>();
        dexPools.forEach((p) => {
          if (p.tokenAAddress) addrs.add(p.tokenAAddress);
          if (p.tokenBAddress) addrs.add(p.tokenBAddress);
        });

        if (addrs.size) {
          const meta = await birdeyeService.getMultipleTokenMetadata(
            Array.from(addrs)
          );
          setTokenMetadata((prev) => ({ ...prev, ...meta }));
        }

        // Get all vaults to merge with pools
        let allVaults = [];
        try {
          allVaults = await getAllVaults();
          console.log(`Retrieved ${allVaults.length} vaults for DEX filter`);
        } catch (vaultsError) {
          console.error("Failed to fetch vaults for DEX filter:", vaultsError);
        }

        // Process pools with vaults data
        const poolsWithVaults = processPoolsWithVaults(dexPools, allVaults);
        console.log(
          `Processed ${poolsWithVaults.length} pools with vault data for DEX filter`
        );

        // Calculate market metrics for the filtered pools but continue to show global metrics
        const dexMetrics = calculateMarketMetrics(poolsWithVaults);
        setMarketMetrics(dexMetrics);

        setPools(poolsWithVaults);
        setFilteredPools(poolsWithVaults.slice(0, MAX_POOLS_TO_DISPLAY));
      } catch (error) {
        console.error(`Failed to fetch pools for DEX ${dex}:`, error);
        // Fallback to cached
        const dexPools = originalPools.filter(
          (p) => p.dex.toLowerCase() === dex.toLowerCase()
        );
        setPools(dexPools);
        setFilteredPools(dexPools.slice(0, MAX_POOLS_TO_DISPLAY));

        // Calculate market metrics for the fallback pools but continue to show global metrics
        const dexMetrics = calculateMarketMetrics(dexPools);
        setMarketMetrics(dexMetrics);
      } finally {
        setLoading(false);
      }
    },
    [originalPools, calculateMarketMetrics]
  );

  /**
   * Search pools + enrich with BirdEye logos
   */
  const performSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        if (selectedDex) {
          setFilteredPools(
            pools
              .filter((p) => p.dex.toLowerCase() === selectedDex.toLowerCase())
              .slice(0, MAX_POOLS_TO_DISPLAY)
          );
        } else {
          setFilteredPools(pools.slice(0, MAX_POOLS_TO_DISPLAY));
        }
        return;
      }

      setLoading(true);
      try {
        let searchResults: PoolInfo[] = [];

        // If we're filtering by Kriya DEX, search in our direct API data
        if (
          selectedDex &&
          (selectedDex.toLowerCase() === "kriya-dex" ||
            selectedDex.toLowerCase() === "kriya")
        ) {
          const kriyaPools = await kriyadexService.getKriyaPoolsWithFallback();
          const lowerQuery = query.toLowerCase();

          searchResults = kriyaPools.filter(
            (p) =>
              p.tokenA?.toLowerCase().includes(lowerQuery) ||
              p.tokenB?.toLowerCase().includes(lowerQuery) ||
              p.name?.toLowerCase().includes(lowerQuery) ||
              (p.rewardSymbols &&
                p.rewardSymbols.some((s) =>
                  s.toLowerCase().includes(lowerQuery)
                ))
          );

          console.log(
            `Found ${searchResults.length} matching Kriya pools for "${query}"`
          );
        } else {
          // Otherwise use CoinGecko search
          searchResults = await coinGeckoService.searchPools(
            query,
            MAX_POOLS_TO_DISPLAY
          );
          console.log(
            `Search returned ${searchResults.length} results from CoinGecko`
          );

          // If we have Kriya pools loaded, also search those
          if (!selectedDex) {
            try {
              const kriyaPools =
                await kriyadexService.getKriyaPoolsWithFallback();
              const lowerQuery = query.toLowerCase();

              const matchingKriyaPools = kriyaPools.filter(
                (p) =>
                  p.tokenA?.toLowerCase().includes(lowerQuery) ||
                  p.tokenB?.toLowerCase().includes(lowerQuery) ||
                  p.name?.toLowerCase().includes(lowerQuery) ||
                  (p.rewardSymbols &&
                    p.rewardSymbols.some((s) =>
                      s?.toLowerCase().includes(lowerQuery)
                    ))
              );

              // Add Kriya pools to results if not already there (case-insensitive check)
              const existingAddresses = new Set(
                searchResults.map((p) => p.address.toLowerCase())
              );
              const addedKriyaPools = matchingKriyaPools.filter(
                (pool) => !existingAddresses.has(pool.address.toLowerCase())
              );

              if (addedKriyaPools.length > 0) {
                searchResults.push(...addedKriyaPools);
                console.log(
                  `Added ${addedKriyaPools.length} matching Kriya pools to search results`
                );
              }
            } catch (error) {
              console.error("Error searching Kriya pools:", error);
            }
          }
        }

        // Get all vaults to merge with search results
        let allVaults = [];
        try {
          allVaults = await getAllVaults();
          console.log(
            `Retrieved ${allVaults.length} vaults for search results`
          );
        } catch (vaultsError) {
          console.error("Failed to fetch vaults for search:", vaultsError);
        }

        // Process pools with vaults data
        const poolsWithVaults = processPoolsWithVaults(
          searchResults,
          allVaults
        );
        console.log(
          `Processed ${poolsWithVaults.length} search results with vault data`
        );

        // Enrich logos
        const addrs = new Set<string>();
        poolsWithVaults.forEach((p) => {
          if (p.tokenAAddress) addrs.add(p.tokenAAddress);
          if (p.tokenBAddress) addrs.add(p.tokenBAddress);
        });
        if (addrs.size) {
          const meta = await birdeyeService.getMultipleTokenMetadata(
            Array.from(addrs)
          );
          setTokenMetadata((prev) => ({ ...prev, ...meta }));
        }

        let result = poolsWithVaults;
        if (selectedDex) {
          result = result.filter(
            (p) => p.dex.toLowerCase() === selectedDex.toLowerCase()
          );
        }

        result.sort((a, b) => {
          const va = a[sortColumn];
          const vb = b[sortColumn];
          if (sortOrder === "asc") return va > vb ? 1 : -1;
          return va < vb ? 1 : -1;
        });

        // Calculate market metrics for search results but continue to show global metrics
        const searchMetrics = calculateMarketMetrics(result);
        setMarketMetrics(searchMetrics);

        setFilteredPools(result.slice(0, MAX_POOLS_TO_DISPLAY));
      } catch (error) {
        console.error("Error during search:", error);
        // fallback filter
        const lower = query.toLowerCase();
        let result = pools.filter(
          (p) =>
            (p.tokenA && p.tokenA.toLowerCase().includes(lower)) ||
            (p.tokenB && p.tokenB.toLowerCase().includes(lower)) ||
            (p.name && p.name.toLowerCase().includes(lower)) ||
            (p.dex && p.dex.toLowerCase().includes(lower)) ||
            (p.rewardSymbols &&
              p.rewardSymbols.some((s) => s && s.toLowerCase().includes(lower)))
        );
        if (selectedDex) {
          result = result.filter(
            (p) => p.dex.toLowerCase() === selectedDex.toLowerCase()
          );
        }

        // Calculate market metrics for fallback search results but continue to show global metrics
        const searchMetrics = calculateMarketMetrics(result);
        setMarketMetrics(searchMetrics);

        setFilteredPools(result.slice(0, MAX_POOLS_TO_DISPLAY));
      } finally {
        setLoading(false);
      }
    },
    [pools, selectedDex, sortColumn, sortOrder, calculateMarketMetrics]
  );

  // Debounced search handler
  const handleSearch = useCallback(
    (query: string) => {
      setSearch(query);
      if (searchTimer) clearTimeout(searchTimer);
      const t = setTimeout(() => performSearch(query), 300);
      setSearchTimer(t);
    },
    [searchTimer, performSearch]
  );

  // Cleanup debounce on unmount
  useEffect(
    () => () => {
      if (searchTimer) clearTimeout(searchTimer);
    },
    [searchTimer]
  );

  // Reset filters and show global market metrics
  const handleReset = useCallback(() => {
    setSearch("");
    setSelectedDex(null);
    setSortColumn("apr");
    setSortOrder("desc");
    setPools(originalPools);

    // Reset to global market metrics (all DEXes)
    setMarketMetrics(globalMarketMetrics);

    setFilteredPools(
      [...originalPools]
        .sort((a, b) => b.apr - a.apr)
        .slice(0, MAX_POOLS_TO_DISPLAY)
    );
  }, [originalPools, globalMarketMetrics]);

  // Sorting
  const handleSort = (col: typeof sortColumn) => {
    if (sortColumn === col) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(col);
      setSortOrder("desc");
    }
  };

  useEffect(() => {
    setFilteredPools((prev) =>
      [...prev].sort((a, b) => {
        const va = a[sortColumn],
          vb = b[sortColumn];
        if (sortOrder === "asc") return va > vb ? 1 : -1;
        return va < vb ? 1 : -1;
      })
    );
  }, [sortColumn, sortOrder]);

  // DEX filter
  const handleDexChange = useCallback(
    (dex: string | null) => {
      setSelectedDex(dex);
      if (dex) {
        fetchPoolsByDex(dex);
      } else {
        setPools(originalPools);

        // Reset to global market metrics (all DEXes)
        setMarketMetrics(globalMarketMetrics);

        if (search.trim()) performSearch(search);
        else setFilteredPools(originalPools.slice(0, MAX_POOLS_TO_DISPLAY));
      }
    },
    [originalPools, fetchPoolsByDex, search, performSearch, globalMarketMetrics]
  );

  /**
   * Check if a pool is a Turbos pool
   */
  const isTurbosPool = (pool: PoolInfo): boolean => {
    // Check if the pool belongs to Turbos Finance
    return (
      turbosService.isTurbosPool(pool.address, pool.dex) ||
      pool.dex.toLowerCase() === "turbos" ||
      pool.dex.toLowerCase() === "turbos-finance"
    );
  };

  /**
   * Check if a pool is a Kriya pool
   */
  const isKriyaPool = (pool: PoolInfo): boolean => {
    // Check if the pool belongs to Kriya DEX
    return (
      kriyadexService.isKriyaPool(pool.address) ||
      pool.dex.toLowerCase() === "kriya" ||
      pool.dex.toLowerCase() === "kriya-dex"
    );
  };

  /**
   * Check if a pool has a real vault (not just hasVault flag)
   */
  const hasActiveVault = (pool: PoolInfo): boolean => {
    // Check if the pool has both hasVault flag AND a valid vaultApy value
    return !!(pool.hasVault && pool.vaultApy && pool.vaultApy > 0);
  };

  /**
   * Fetch token balances for the deposit modals (using BlockVision API only)
   */
  const fetchTokenBalances = async (pool: PoolInfo) => {
    if (!account?.address) {
      setTokenABalance("0");
      setTokenBBalance("0");
      return;
    }

    try {
      console.log("Fetching token balances from BlockVision API");
      // Fix 1: Now using the correctly imported blockvisionService
      const { data: coins } = await blockvisionService.getAccountCoins(
        account.address
      );

      // Find balances for token A and token B
      // Fix 2: Added null check for coinType to prevent "toLowerCase is not a function" error
      const coinA = coins.find(
        (c) =>
          c.coinType &&
          pool.tokenAAddress &&
          c.coinType.toLowerCase() === pool.tokenAAddress.toLowerCase()
      );
      const coinB = coins.find(
        (c) =>
          c.coinType &&
          pool.tokenBAddress &&
          c.coinType.toLowerCase() === pool.tokenBAddress.toLowerCase()
      );

      if (coinA) {
        const balA = Number(coinA.balance) / Math.pow(10, coinA.decimals);
        setTokenABalance(balA.toString());
        console.log(`Balance for ${pool.tokenA}:`, balA);
      } else {
        setTokenABalance("0");
      }

      if (coinB) {
        const balB = Number(coinB.balance) / Math.pow(10, coinB.decimals);
        setTokenBBalance(balB.toString());
        console.log(`Balance for ${pool.tokenB}:`, balB);
      } else {
        setTokenBBalance("0");
      }
    } catch (err) {
      console.error("Error fetching token balances from BlockVision:", err);
      setTokenABalance("0");
      setTokenBBalance("0");
    }
  };

  // Deposit modal
  const handleOpenDepositModal = async (pool: PoolInfo) => {
    setSelectedPool(pool);

    // Fetch token balances
    await fetchTokenBalances(pool);

    // Check which modal to open based on the pool type
    if (isKriyaPool(pool)) {
      console.log("Opening Kriya deposit modal for pool:", pool.address);
      setIsKriyaModalOpen(true);
    } else if (isTurbosPool(pool)) {
      console.log("Opening Turbos deposit modal for pool:", pool.address);
      setIsTurbosModalOpen(true);
    } else {
      console.log("Opening standard deposit modal for pool:", pool.address);
      setIsDepositModalOpen(true);
    }
  };

  const handleCloseDepositModal = () => {
    setIsDepositModalOpen(false);
    setIsTurbosModalOpen(false);
    setIsKriyaModalOpen(false); // Close Kriya modal too
    setSelectedPool(null);
  };

  /**
   * Determine which service to use based on the pool
   */
  const getServiceForPool = (pool: PoolInfo) => {
    if (isKriyaPool(pool)) {
      return kriyadexService;
    } else if (bluefinService.isBluefinPool(pool.address, pool.dex)) {
      return bluefinService;
    } else if (turbosService.isTurbosPool(pool.address, pool.dex)) {
      return turbosService;
    } else {
      return cetusService; // Default to Cetus
    }
  };

  /**
   * Handle deposit submission from standard deposit modal
   */
  const handleDeposit = async (
    amountA: string,
    amountB: string,
    slippage: string,
    tickLower?: number,
    tickUpper?: number,
    deltaLiquidity?: string
  ) => {
    if (!selectedPool || !connected || !account) {
      console.error("Cannot deposit: missing context");
      return { success: false, digest: "" };
    }
    try {
      console.log("Initiating deposit to", selectedPool.address);
      console.log("Amount A:", amountA, selectedPool.tokenA);
      console.log("Amount B:", amountB, selectedPool.tokenB);
      console.log("Slippage:", slippage + "%");

      if (tickLower !== undefined && tickUpper !== undefined) {
        console.log("Tick Range:", tickLower, "to", tickUpper);
      }

      const aNum = parseFloat(amountA);
      const bNum = parseFloat(amountB);
      if (isNaN(aNum) || isNaN(bNum)) {
        throw new Error("Invalid amount");
      }

      // Determine which service to use
      const service = getServiceForPool(selectedPool);
      const serviceName =
        service === kriyadexService
          ? "Kriya"
          : service === bluefinService
          ? "Bluefin"
          : service === turbosService
          ? "Turbos"
          : "Cetus";

      console.log(
        `Using ${serviceName} service for deposit to ${selectedPool.address}`
      );

      let txResult;

      // Handle deposit based on the service
      if (service === kriyadexService) {
        // Kriya DEX deposit
        txResult = await service.deposit(
          wallet,
          selectedPool.address,
          aNum,
          bNum,
          selectedPool,
          tickLower,
          tickUpper,
          parseFloat(slippage) // Pass slippage percentage
        );
      } else if (service === turbosService) {
        // Turbos finance deposit
        txResult = await service.deposit(
          wallet,
          selectedPool.address,
          aNum,
          bNum,
          selectedPool,
          tickLower,
          tickUpper,
          parseFloat(slippage) // Pass slippage percentage
        );
      } else if (service === bluefinService) {
        // Bluefin deposit (doesn't use tick ranges)
        txResult = await service.deposit(
          wallet,
          selectedPool.address,
          aNum,
          bNum,
          selectedPool
        );
      } else {
        // Cetus deposit
        txResult = await service.deposit(
          wallet,
          selectedPool.address,
          aNum,
          bNum,
          selectedPool,
          tickLower,
          tickUpper
        );
      }

      console.log("Deposit transaction completed:", txResult);

      // Removed transaction notification since we're handling it in the deposit modal now

      // Refresh positions after a delay
      setTimeout(() => {
        if (account?.address) {
          // Refresh positions logic would go here
        }
      }, 3000);

      return txResult;
    } catch (err: any) {
      console.error("Deposit failed:", err);
      throw err;
    }
  };

  /**
   * Handle deposit submission from Turbos deposit modal
   */
  const handleTurbosDeposit = async (
    poolId: string,
    amountA: number,
    amountB: number,
    tickLower: number,
    tickUpper: number,
    slippage: number
  ) => {
    if (!selectedPool || !connected || !account) {
      console.error("Cannot deposit: missing context");
      return { success: false, digest: "" };
    }

    try {
      console.log("Initiating Turbos deposit to", poolId);
      console.log("Amount A:", amountA, selectedPool.tokenA);
      console.log("Amount B:", amountB, selectedPool.tokenB);
      console.log("Slippage:", slippage + "%");
      console.log("Tick Range:", tickLower, "to", tickUpper);

      // Use the Turbos service for the deposit
      console.log("Using Turbos service for deposit to", poolId);

      const result = await turbosService.deposit(
        wallet,
        poolId,
        amountA,
        amountB,
        selectedPool, // Pass pool info
        tickLower,
        tickUpper,
        slippage
      );

      // Removed transaction notification since we're handling it in the deposit modal now

      // Refresh positions after a delay
      if (result.success) {
        setTimeout(() => {
          if (account?.address) {
            // Refresh positions logic would go here
          }
        }, 3000);
      }

      return result;
    } catch (err: any) {
      console.error("Turbos deposit failed:", err);
      throw err;
    }
  };

  /**
   * Handle deposit submission from Kriya deposit modal
   */
  const handleKriyaDeposit = async (
    poolId: string,
    amountA: number,
    amountB: number,
    tickLower: number,
    tickUpper: number,
    slippage: number
  ) => {
    if (!selectedPool || !connected || !account) {
      console.error("Cannot deposit: missing context");
      return { success: false, digest: "" };
    }

    try {
      console.log("Initiating Kriya deposit to", poolId);
      console.log("Amount A:", amountA, selectedPool.tokenA);
      console.log("Amount B:", amountB, selectedPool.tokenB);
      console.log("Slippage:", slippage + "%");
      console.log("Tick Range:", tickLower, "to", tickUpper);

      // Use the Kriya service for the deposit
      console.log("Using Kriya service for deposit to", poolId);

      const result = await kriyadexService.deposit(
        wallet,
        poolId,
        amountA,
        amountB,
        selectedPool, // Pass pool info
        tickLower,
        tickUpper,
        slippage
      );

      // Removed transaction notification since we're handling it in the deposit modal now

      // Refresh positions after a delay
      if (result.success) {
        setTimeout(() => {
          if (account?.address) {
            // Refresh positions logic would go here
          }
        }, 3000);
      }

      return result;
    } catch (err: any) {
      console.error("Kriya deposit failed:", err);
      throw err;
    }
  };

  const getAprClass = (apr: number) => {
    if (apr >= 100) return "high";
    if (apr >= 50) return "medium";
    return "low";
  };

  const isDexSupported = (dex: string) => {
    const normalizedDex = dex.toLowerCase();
    return supportedDexes.some(
      (supported) =>
        normalizedDex === supported.toLowerCase() ||
        normalizedDex.includes(supported.toLowerCase())
    );
  };

  const getDexDisplayName = (id: string) => {
    const d = SUPPORTED_DEXES.find(
      (x) => x.id.toLowerCase() === id.toLowerCase()
    );
    return d ? d.name : id.charAt(0).toUpperCase() + id.slice(1);
  };

  const normalizeProtocolName = (dexId: string) => {
    const special: Record<string, string> = {
      "flow-x": "flowx",
      "turbos-finance": "turbos",
      "kriya-dex": "kriya",
    };
    const norm = dexId.toLowerCase();
    return special[norm] ?? norm.replace(/[-_]/g, "");
  };

  // Helper to get the best logo URL for a token
  const getTokenLogoUrl = (pool: PoolInfo, isTokenA: boolean) => {
    // First try logos directly provided in pool info
    if (isTokenA && pool.tokenALogo) return pool.tokenALogo;
    if (!isTokenA && pool.tokenBLogo) return pool.tokenBLogo;

    // Then try to get token address
    const address = isTokenA ? pool.tokenAAddress : pool.tokenBAddress;
    const symbol = isTokenA ? pool.tokenA : pool.tokenB;

    // First try BirdEye metadata
    if (address && tokenMetadata[address]) {
      const metadata = tokenMetadata[address];

      // Check all possible logo fields
      if (metadata.logo_uri) return metadata.logo_uri;
      if (metadata.logoUrl) return metadata.logoUrl;
      if (metadata.logoURI) return metadata.logoURI;
      if (metadata.logo) return metadata.logo;
    }

    // Then try pool metadata
    const poolMetadata = isTokenA ? pool.tokenAMetadata : pool.tokenBMetadata;
    if (poolMetadata) {
      // Check all possible logo fields
      const logo =
        poolMetadata.logo_uri ||
        poolMetadata.logoUrl ||
        poolMetadata.logoURI ||
        poolMetadata.logo;

      if (logo) return logo;
    }

    return undefined;
  };

  // Add a helper function to check if a pool has complete data
  // This can be used to visually distinguish fallback/stub pools from complete ones
  const hasCompleteData = (pool: PoolInfo): boolean => {
    // Check if this is a known fallback pool with minimal data
    if (
      pool.tokenA === "Unknown" &&
      pool.tokenB === "Unknown" &&
      pool._rawData?.infoSource?.includes("fallback")
    ) {
      return false;
    }

    // Check if essential data is available
    return !!(
      pool.tokenA &&
      pool.tokenB &&
      (pool.liquidityUSD > 0 || pool.volumeUSD > 0 || pool.apr > 0)
    );
  };

  // Render the market dashboard - using global metrics for the overview
  const renderMarketDashboard = () => {
    return (
      <div className="market-dashboard">
        <h2 className="dashboard-title">Market Overview</h2>
        <div className="dashboard-stats-grid">
          <div className="dashboard-stat-card">
            <div className="stat-icon">
              <FaChartLine />
            </div>
            <div className="stat-content">
              <div className="stat-label">Total Value Locked</div>
              <div className="stat-value">
                {globalMarketMetrics.loading ? (
                  <div className="stat-loading"></div>
                ) : (
                  `$${formatNumber(globalMarketMetrics.totalTVL)}`
                )}
              </div>
            </div>
          </div>

          <div className="dashboard-stat-card">
            <div className="stat-icon">
              <FaExchangeAlt />
            </div>
            <div className="stat-content">
              <div className="stat-label">24h Volume</div>
              <div className="stat-value">
                {globalMarketMetrics.loading ? (
                  <div className="stat-loading"></div>
                ) : (
                  `$${formatNumber(globalMarketMetrics.total24hVolume)}`
                )}
              </div>
            </div>
          </div>

          <div className="dashboard-stat-card">
            <div className="stat-icon">
              <FaCoins />
            </div>
            <div className="stat-content">
              <div className="stat-label">Total Pools</div>
              <div className="stat-value">
                {globalMarketMetrics.loading ? (
                  <div className="stat-loading"></div>
                ) : (
                  globalMarketMetrics.totalPools
                )}
              </div>
            </div>
          </div>

          <div className="dashboard-stat-card">
            <div className="stat-icon">
              <FaPercentage />
            </div>
            <div className="stat-content">
              <div className="stat-label">Top APR</div>
              <div className="stat-value">
                {globalMarketMetrics.loading ? (
                  <div className="stat-loading"></div>
                ) : (
                  `${formatNumber(globalMarketMetrics.topAPR)}%`
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render the pool content
  const renderPoolContent = () => {
    return (
      <>
        {/* Market Dashboard Section */}
        {renderMarketDashboard()}

        <div className="controls-section">
          <div className="search-container">
            <div className="search-icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search pools or tokens..."
            />
          </div>

          <div className="filter-section">
            <div className="filter-label">DEX:</div>
            <div className="filter-control">
              <select
                value={selectedDex || "all"}
                onChange={(e) =>
                  handleDexChange(
                    e.target.value === "all" ? null : e.target.value
                  )
                }
              >
                <option value="all">All DEXes</option>
                {SUPPORTED_DEXES.map((dex) => (
                  <option key={dex.id} value={dex.id}>
                    {dex.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="action-button" onClick={handleReset}>
              Reset
            </button>
          </div>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <div className="loading-text">Loading pools...</div>
          </div>
        ) : (
          <div className="pools-table-container">
            <table>
              <thead>
                <tr>
                  <th>Pool</th>
                  <th className="dex-column" onClick={() => handleSort("dex")}>
                    DEX
                    {sortColumn === "dex" && (
                      <span className="sort-indicator">
                        {sortOrder === "asc" ? " ↑" : " ↓"}
                      </span>
                    )}
                  </th>
                  <th
                    className="align-right"
                    onClick={() => handleSort("liquidityUSD")}
                  >
                    Liquidity (USD)
                    {sortColumn === "liquidityUSD" && (
                      <span className="sort-indicator">
                        {sortOrder === "asc" ? " ↑" : " ↓"}
                      </span>
                    )}
                  </th>
                  <th
                    className="align-right"
                    onClick={() => handleSort("volumeUSD")}
                  >
                    Volume (24h)
                    {sortColumn === "volumeUSD" && (
                      <span className="sort-indicator">
                        {sortOrder === "asc" ? " ↑" : " ↓"}
                      </span>
                    )}
                  </th>
                  <th
                    className="align-right"
                    onClick={() => handleSort("feesUSD")}
                  >
                    Fees (24h)
                    {sortColumn === "feesUSD" && (
                      <span className="sort-indicator">
                        {sortOrder === "asc" ? " ↑" : " ↓"}
                      </span>
                    )}
                  </th>
                  <th className="align-right" onClick={() => handleSort("apr")}>
                    APR
                    {sortColumn === "apr" && (
                      <span className="sort-indicator">
                        {sortOrder === "asc" ? " ↑" : " ↓"}
                      </span>
                    )}
                  </th>
                  <th className="actions-column">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPools.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty-state">
                      <div className="empty-icon">🔍</div>
                      <div>No pools found matching your criteria</div>
                    </td>
                  </tr>
                ) : (
                  filteredPools.map((item) => {
                    const isStubPool = !hasCompleteData(item);
                    const poolId = item.poolAddress || item.address;
                    return (
                      <tr
                        key={poolId}
                        className={isStubPool ? "stub-pool" : ""}
                      >
                        <td className="pool-cell">
                          <div className="pool-item">
                            <div className="token-icons">
                              <EnhancedTokenIcon
                                symbol={item.tokenA}
                                logoUrl={getTokenLogoUrl(item, true)}
                                address={item.tokenAAddress}
                                size="md"
                                className="token-a"
                              />
                              <EnhancedTokenIcon
                                symbol={item.tokenB}
                                logoUrl={getTokenLogoUrl(item, false)}
                                address={item.tokenBAddress}
                                size="md"
                                className="token-b"
                              />
                            </div>
                            <div className="pool-info">
                              <div className="pair-name">
                                {isStubPool && (
                                  <span className="stub-indicator">
                                    Coming Soon
                                  </span>
                                )}
                                {item.tokenA} / {item.tokenB}
                              </div>
                              {item.name?.match(/(\d+(\.\d+)?)%/) && (
                                <div className="fee-tier">
                                  {item.name.match(/(\d+(\.\d+)?)%/)![0]}
                                </div>
                              )}
                              {item.fee &&
                                !item.name?.match(/(\d+(\.\d+)?)%/) && (
                                  <div className="fee-tier">
                                    {(item.fee * 100).toFixed(2)}%
                                  </div>
                                )}
                              {/* FIX: Only show Auto-Vault badge if there's an actual vault with APY */}
                              {hasActiveVault(item) && (
                                <div className="vault-badge">Auto-Vault</div>
                              )}

                              {/* Added pool ID with copy button */}
                              <div className="pool-id">
                                <span className="pool-id-label">Pool ID:</span>
                                <span className="pool-id-value">
                                  {shortenAddress(poolId)}
                                </span>
                                <button
                                  className="copy-button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyPoolId(poolId);
                                  }}
                                  title="Copy pool ID"
                                >
                                  {copiedPoolId === poolId ? (
                                    "Copied!"
                                  ) : (
                                    <FaCopy />
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td>
                          <ProtocolBadge
                            protocol={getDexDisplayName(item.dex)}
                            protocolClass={normalizeProtocolName(item.dex)}
                          />
                        </td>

                        <td className="align-right">
                          ${formatNumber(item.liquidityUSD)}
                        </td>
                        <td className="align-right">
                          ${formatNumber(item.volumeUSD)}
                        </td>
                        <td className="align-right">
                          ${formatNumber(item.feesUSD)}
                        </td>

                        <td className="align-right">
                          <span
                            className={`apr-value ${getAprClass(item.apr)}`}
                          >
                            {formatNumber(item.apr)}%
                          </span>
                          {/* FIX: Only show vault APY if there's an actual vault with APY */}
                          {hasActiveVault(item) && (
                            <div className="vault-apy">
                              Vault: {formatNumber(item.vaultApy)}%
                            </div>
                          )}
                        </td>

                        <td className="actions-cell">
                          <button
                            className={`btn ${
                              isDexSupported(item.dex) && !isStubPool
                                ? "btn--primary"
                                : "btn--secondary"
                            }`}
                            onClick={() =>
                              isDexSupported(item.dex) && !isStubPool
                                ? handleOpenDepositModal(item)
                                : undefined
                            }
                            disabled={
                              !isDexSupported(item.dex) ||
                              !connected ||
                              isStubPool
                            }
                          >
                            {/* FIX: Only show "Deposit to Vault" for pools with actual vaults */}
                            {isStubPool
                              ? "Coming Soon"
                              : hasActiveVault(item)
                              ? "Deposit to Vault"
                              : isDexSupported(item.dex)
                              ? "Deposit"
                              : "Coming Soon"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="pools-page">
      {/* Add glow elements similar to Home page */}
      <div className="glow-1"></div>
      <div className="glow-2"></div>
      <div className="glow-3"></div>

      <div className="content-container">
        <div className="main-navigation">
          <div
            className={`nav-link ${
              activeTab === TabType.POOLS ? "active" : ""
            }`}
            onClick={() => navigateToPage(TabType.POOLS)}
          >
            Pools
          </div>
          <Link to="/positions" className="nav-link">
            My Positions
          </Link>
          <div className={`nav-link coming-soon`} title="Coming Soon">
            Vaults <span className="coming-soon-tooltip">Coming Soon</span>
          </div>
        </div>

        {activeTab === TabType.POOLS && renderPoolContent()}
        {activeTab === TabType.VAULTS && <VaultSection />}

        {/* Standard Deposit Modal for non-Turbos, non-Kriya pools */}
        {selectedPool &&
          !isTurbosPool(selectedPool) &&
          !isKriyaPool(selectedPool) && (
            <DepositModal
              isOpen={isDepositModalOpen}
              onClose={handleCloseDepositModal}
              onDeposit={handleDeposit}
              pool={selectedPool}
              walletConnected={connected}
              wallet={wallet}
            />
          )}

        {/* Turbos-specific Deposit Modal */}
        {selectedPool && isTurbosPool(selectedPool) && (
          <TurbosDepositModal
            visible={isTurbosModalOpen}
            onCancel={handleCloseDepositModal}
            onDeposit={handleTurbosDeposit}
            poolInfo={selectedPool}
            tokenABalance={tokenABalance}
            tokenBBalance={tokenBBalance}
          />
        )}

        {/* Kriya-specific Deposit Modal */}
        {selectedPool && isKriyaPool(selectedPool) && (
          <KriyaDepositModal
            visible={isKriyaModalOpen}
            onCancel={handleCloseDepositModal}
            onDeposit={handleKriyaDeposit}
            poolInfo={selectedPool}
            tokenABalance={tokenABalance}
            tokenBBalance={tokenBBalance}
          />
        )}
      </div>
    </div>
  );
};

// Helper function to format numbers with commas and limited decimal places
function formatNumber(value: number, decimals: number = 2): string {
  if (!value && value !== 0) return "0";
  if (value > 0 && value < 0.01) return "<0.01";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
  }).format(value);
}

// Helper function to shorten addresses
function shortenAddress(address: string): string {
  if (!address) return "";
  if (address.length <= 13) return address;
  return `${address.substring(0, 6)}...${address.substring(
    address.length - 4
  )}`;
}

export default Pools;

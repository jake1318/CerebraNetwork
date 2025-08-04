// src/pages/Home.tsx
// Last Updated: 2025-07-14 23:27:25 UTC by jake1318

import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { formatUsd, formatPercentage } from "../../utils/format";
import {
  getAggregatePoolStats,
  searchPools,
  PoolInfo,
} from "../../services/coinGeckoService";
import * as birdeyeService from "../../services/birdeyeService";
import {
  canonicaliseSuiAddress,
  TokenMetadata,
} from "../../services/birdeyeService";
import "./Home.scss";

// Import icons
import {
  FaExchangeAlt,
  FaHandHoldingUsd,
  FaPiggyBank,
  FaLink,
  FaChartPie,
  FaRobot,
} from "react-icons/fa";

interface PoolStats {
  totalTvlUsd: number;
  totalPools: number;
  highestApr: number;
  isLoading: boolean;
  error?: string;
}

// List of specific pool IDs we want to fetch and display
const FEATURED_POOL_IDS = [
  "0xb8d7d9e66a60c239e7a60110efcf8de6c705580ed924d0dde141f4a0e2c90105", // USDC / SUI - Cetus
  "0x2e041f3fd93646dcc877f783c1f2b7fa62d30271bdef1f21ef002cebf857bded", // CETUS / SUI – Cetus
  "0xbcc6909d2e85c06cf9cbfe5b292da36f5bfa0f314806474bbf6a0bf9744d37ce", // WAL / USDC – Bluefin
  "0xd5e3a3c7396702d8f358a63ef921cc7c1951f52c6dfc2051cc8772cf7cb9900c", // DEEP / USDC – Bluefin
];

// Default token icon URL to use as fallback
const DEFAULT_TOKEN_ICON = "/assets/token-placeholder.png";

// Protocol badge mapping
const PROTOCOL_CLASSES: Record<string, string> = {
  cetus: "cetus",
  bluefin: "bluefin",
  "turbos-finance": "turbos",
  turbos: "turbos",
  "kriya-dex": "kriya",
  kriya: "kriya",
  "flow-x": "flowx",
  flowx: "flowx",
  aftermath: "aftermath",
  deepbook: "deepbook",
  suiswap: "suiswap",
};

const Home: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // State for pool statistics
  const [poolStats, setPoolStats] = useState<PoolStats>({
    totalTvlUsd: 0,
    totalPools: 0,
    highestApr: 0,
    isLoading: true,
  });

  // State for top performing pools
  const [topPools, setTopPools] = useState<PoolInfo[]>([]);
  const [isLoadingPools, setIsLoadingPools] = useState<boolean>(true);

  /**
   * address (64‑byte canonical)  →  metadata
   */
  const [tokenMetadata, setTokenMetadata] = useState<
    Record<string, TokenMetadata>
  >({});

  // Format currency with commas and appropriate decimals
  const formatCurrency = (value: number): string => {
    if (value >= 1000000000) {
      return `$${(value / 1000000000).toFixed(2)}B`;
    } else if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(2)}K`;
    } else {
      return `$${value.toFixed(2)}`;
    }
  };

  // Helper function to get protocol class for styling
  const getProtocolClass = (dex: string): string => {
    const normalizedDex = dex.toLowerCase();
    return (
      PROTOCOL_CLASSES[normalizedDex] || normalizedDex.replace(/[-_\s]/g, "")
    );
  };

  // Helper function to format protocol name for display
  const formatProtocolName = (dex: string): string => {
    // Special case for uppercase names
    if (dex.toUpperCase() === dex) {
      return dex;
    }

    // Handle specific cases
    const specialCases: Record<string, string> = {
      "turbos-finance": "Turbos",
      "flow-x": "FlowX",
      "kriya-dex": "Kriya",
    };

    if (specialCases[dex.toLowerCase()]) {
      return specialCases[dex.toLowerCase()];
    }

    // Default: Capitalize first letter
    return dex.charAt(0).toUpperCase() + dex.slice(1);
  };

  // Change navigation appearance on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 50) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Fetch aggregated pool data on component mount
  useEffect(() => {
    async function fetchPoolStats() {
      try {
        setPoolStats((prev) => ({ ...prev, isLoading: true }));

        // Call the actual API function from coinGeckoService
        const stats = await getAggregatePoolStats();

        if (stats && !stats.error) {
          setPoolStats({
            totalTvlUsd: stats.totalTvlUsd || 0,
            totalPools: stats.totalPools || 0,
            highestApr: stats.highestApr || 0,
            isLoading: false,
          });
          console.log("Successfully loaded pool stats:", stats);
        } else {
          // Handle API error with empty state
          console.error("Error fetching pool stats:", stats.error);
          setPoolStats({
            totalTvlUsd: 0,
            totalPools: 0,
            highestApr: 0,
            isLoading: false,
            error: stats.error || "Failed to load data",
          });
        }
      } catch (error) {
        console.error("Failed to fetch pool statistics:", error);
        setPoolStats({
          totalTvlUsd: 0,
          totalPools: 0,
          highestApr: 0,
          isLoading: false,
          error: error instanceof Error ? error.message : "Failed to load data",
        });
      }
    }

    fetchPoolStats();
  }, []);

  // Helper to get the best logo URL for a token
  const getTokenLogoUrl = (pool: PoolInfo, isTokenA: boolean) => {
    // First try logos directly provided in pool info
    if (isTokenA && pool.tokenALogo) return pool.tokenALogo;
    if (!isTokenA && pool.tokenBLogo) return pool.tokenBLogo;

    // Then try to get token address
    const address = isTokenA ? pool.tokenAAddress : pool.tokenBAddress;

    if (address) {
      const canon = canonicaliseSuiAddress(address);
      const meta = tokenMetadata[canon];
      if (meta) {
        return (
          meta.logo_uri ||
          meta.logoURI ||
          meta.logoUrl ||
          meta.logo ||
          DEFAULT_TOKEN_ICON
        );
      }
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

    // Default to placeholder
    return DEFAULT_TOKEN_ICON;
  };

  // 1️⃣  Fetch featured pools (once at mount)
  useEffect(() => {
    async function fetchFeaturedPools() {
      setIsLoadingPools(true);
      try {
        console.log("Fetching featured pools by IDs");
        const featuredPools: PoolInfo[] = [];
        const tokenAddresses = new Set<string>();

        // Search for each pool individually by ID
        for (const poolId of FEATURED_POOL_IDS) {
          try {
            // Use searchPools to find pools by ID (will search in address field)
            const searchResult = await searchPools(poolId);

            // Find the exact match
            const exactMatch = searchResult.find(
              (pool) => pool.address.toLowerCase() === poolId.toLowerCase()
            );

            if (exactMatch) {
              console.log(`Found pool data for ID ${poolId}:`, exactMatch);
              featuredPools.push(exactMatch);

              // Collect token addresses for logo fetching
              if (exactMatch.tokenAAddress) {
                const canonicalAddressA = canonicaliseSuiAddress(
                  exactMatch.tokenAAddress
                );
                tokenAddresses.add(canonicalAddressA);
                console.log(
                  `Added tokenA address: ${exactMatch.tokenAAddress} → ${canonicalAddressA}`
                );
              }
              if (exactMatch.tokenBAddress) {
                const canonicalAddressB = canonicaliseSuiAddress(
                  exactMatch.tokenBAddress
                );
                tokenAddresses.add(canonicalAddressB);
                console.log(
                  `Added tokenB address: ${exactMatch.tokenBAddress} → ${canonicalAddressB}`
                );
              }
            } else if (searchResult.length > 0) {
              // If no exact match but we have results, take the first one
              console.log(
                `No exact match for ${poolId}, using first result:`,
                searchResult[0]
              );
              featuredPools.push(searchResult[0]);

              // Collect token addresses for logo fetching using canonical form
              if (searchResult[0].tokenAAddress) {
                const canonicalAddressA = canonicaliseSuiAddress(
                  searchResult[0].tokenAAddress
                );
                tokenAddresses.add(canonicalAddressA);
                console.log(
                  `Added tokenA address: ${searchResult[0].tokenAAddress} → ${canonicalAddressA}`
                );
              }
              if (searchResult[0].tokenBAddress) {
                const canonicalAddressB = canonicaliseSuiAddress(
                  searchResult[0].tokenBAddress
                );
                tokenAddresses.add(canonicalAddressB);
                console.log(
                  `Added tokenB address: ${searchResult[0].tokenBAddress} → ${canonicalAddressB}`
                );
              }
            }
          } catch (error) {
            console.error(`Failed to fetch pool with ID ${poolId}:`, error);
          }
        }

        // Update state with the pools we found
        if (featuredPools.length > 0) {
          console.log(
            `Successfully loaded ${featuredPools.length} featured pools:`,
            featuredPools
          );
          setTopPools(featuredPools);
        } else {
          console.log("No pools could be loaded");
          setTopPools([]);
        }
      } catch (error) {
        console.error("Failed to fetch featured pools:", error);
        setTopPools([]);
      } finally {
        setIsLoadingPools(false);
      }
    }

    fetchFeaturedPools();
  }, []); //  ← only runs once

  // 2️⃣  Fetch (or refresh) token‑metadata whenever we have pools
  useEffect(() => {
    if (topPools.length === 0) return;

    const addresses = new Set<string>();

    topPools.forEach((p) => {
      if (p.tokenAAddress)
        addresses.add(canonicaliseSuiAddress(p.tokenAAddress));
      if (p.tokenBAddress)
        addresses.add(canonicaliseSuiAddress(p.tokenBAddress));
    });

    if (addresses.size === 0) return;

    (async () => {
      try {
        const meta = await birdeyeService.getMultipleTokenMetadata(
          Array.from(addresses)
        );
        setTokenMetadata((prev) => ({ ...prev, ...meta }));

        // Individually back‑fill any misses (rare)
        const missing = Array.from(addresses).filter((a) => !meta[a]);
        await Promise.all(
          missing.map(async (a) => {
            const single = await birdeyeService.getTokenMetadata(a);
            if (single) {
              setTokenMetadata((prev) => ({ ...prev, [a]: single }));
            }
          })
        );
      } catch (err) {
        console.error("Token‑metadata fetch failed:", err);
      }
    })();
  }, [topPools]); //  ← re‑runs if the pool list itself changes

  const handleSearchFocus = () => {
    if (searchInputRef.current) {
      searchInputRef.current.classList.add("focused");
    }
  };

  const handleSearchBlur = () => {
    if (searchInputRef.current && !searchQuery) {
      searchInputRef.current.classList.remove("focused");
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Redirect to search page with the query
      window.location.href = `/search?q=${encodeURIComponent(searchQuery)}`;
    }
  };

  return (
    <div className="home">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero__grid-background"></div>
        <div className="hero__glow hero__glow--blue"></div>
        <div className="hero__glow hero__glow--green"></div>
        <div className="hero__glow hero__glow--magenta"></div>

        {/* Added container div to wrap the hero content and image */}
        <div className="container">
          <motion.div
            className="hero__content"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1>
              <span className="accent-blue">All‑in‑One DeFi</span>
              <br />
              Powered by <span className="accent-green">Sui</span>
            </h1>
            <p>
              Trade, lend, invest, and bridge in one place. Manage your entire
              DeFi portfolio with AI-powered{" "}
              <span className="accent-magenta">search</span> and insights.
            </p>

            <div className="hero__buttons">
              {/* Updated link to go to swap page */}
              <Link to="/swap" className="btn btn--primary">
                Launch App
              </Link>
            </div>

            <div className="hero__integrations">
              <div className="integration-light"></div>{" "}
              {/* Added light effect for better visibility */}
              <span>Aggregating liquidity from:</span>
              <div className="integration-logos">
                <img src="/public/cetus.png" alt="Cetus" />
                <img src="/public/aftermath.svg" alt="Aftermath" />
                <img src="/public/turbos.jpg" alt="Turbos" />
                <img src="/public/bluefin.jpg" alt="Bluefin" />
                <img src="/public/Kriya.webp" alt="Kriya" />
                <img src="/public/FlowX.png" alt="FlowX" />
                <img src="/public/Deepbook.png" alt="Deepbook" />
                <img src="/public/7K.svg" alt="7K" />
              </div>
            </div>
          </motion.div>

          <motion.div
            className="hero__image"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            {/* Updated to use the new SuiFolio.jpg image */}
            <img
              src="/SuiFolio.jpg"
              alt="Cerebra Dashboard"
              className="dashboard-preview"
            />
            <div className="glow-effect"></div>
          </motion.div>
        </div>
      </section>

      {/* Stats Section - Updated with loading state and animation effects */}
      <section className="stats">
        <div className="container">
          <div className="stats__grid">
            <motion.div
              className="stat-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h3>Total Value Locked</h3>
              {poolStats.isLoading ? (
                <div className="stat-value-loading">
                  <div className="loading-pulse"></div>
                </div>
              ) : (
                <p className="stat-value">
                  {formatCurrency(poolStats.totalTvlUsd)}
                </p>
              )}
            </motion.div>

            <motion.div
              className="stat-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <h3>Active Pools</h3>
              {poolStats.isLoading ? (
                <div className="stat-value-loading">
                  <div className="loading-pulse"></div>
                </div>
              ) : (
                <p className="stat-value accent-green">
                  {poolStats.totalPools}
                </p>
              )}
            </motion.div>

            <motion.div
              className="stat-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <h3>Highest APY</h3>
              {poolStats.isLoading ? (
                <div className="stat-value-loading">
                  <div className="loading-pulse"></div>
                </div>
              ) : (
                <p className="stat-value accent-magenta">
                  {poolStats.highestApr.toFixed(1)}%
                </p>
              )}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Overview Section */}
      <section className="features">
        <div className="container">
          <motion.h2
            className="section-title"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            Powerful Features
          </motion.h2>

          <div className="features__grid">
            <motion.div
              className="feature-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <div className="feature-icon">
                <FaExchangeAlt />
              </div>
              <h3>DEX Aggregator</h3>
              <p>
                Trade across Cetus, Aftermath, Turbos, and Bluefin with one
                interface.
              </p>
            </motion.div>

            <motion.div
              className="feature-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div className="feature-icon">
                <FaHandHoldingUsd />
              </div>
              <h3>Lending</h3>
              <p>Earn interest or borrow assets seamlessly within Cerebra.</p>
            </motion.div>

            <motion.div
              className="feature-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <div className="feature-icon feature-icon--green">
                <FaPiggyBank />
              </div>
              <h3 className="green">Auto-Compounding</h3>
              <p>
                Maximize yields with automated compounding vault strategies.
              </p>
            </motion.div>

            <motion.div
              className="feature-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <div className="feature-icon">
                <FaLink />
              </div>
              <h3>Bridge to Sui</h3>
              <p>Bring assets from other chains into Sui in one click.</p>
            </motion.div>

            <motion.div
              className="feature-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              <div className="feature-icon feature-icon--green">
                <FaChartPie />
              </div>
              <h3 className="green">Portfolio Dashboard</h3>
              <p>
                Track your full DeFi portfolio across platforms in real-time.
              </p>
            </motion.div>

            <motion.div
              className="feature-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              <div className="feature-icon feature-icon--magenta">
                <FaRobot />
              </div>
              <h3 className="magenta">AI Search</h3>
              <p>Find insights fast with integrated Web & YouTube AI search.</p>
            </motion.div>

            {/* Added 3 more feature cards to complete the 3x3 grid */}
            <motion.div
              className="feature-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.7 }}
            >
              <div className="feature-icon feature-icon--magenta">
                <FaChartPie />
              </div>
              <h3 className="magenta">Analytics</h3>
              <p>
                Detailed analytics and insights for all your DeFi activities.
              </p>
            </motion.div>

            <motion.div
              className="feature-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.8 }}
            >
              <div className="feature-icon">
                <FaHandHoldingUsd />
              </div>
              <h3>Multi-Wallet</h3>
              <p>Connect and manage multiple wallets in one interface.</p>
            </motion.div>

            <motion.div
              className="feature-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.9 }}
            >
              <div className="feature-icon feature-icon--green">
                <FaPiggyBank />
              </div>
              <h3 className="green">Rewards</h3>
              <p>
                Earn rewards for using the Cerebra platform and providing
                liquidity.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Portfolio Dashboard Preview Section */}
      <section className="dashboard-preview">
        <div className="container">
          <div className="dashboard-preview__content">
            <motion.div
              className="dashboard-preview__text"
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2>Your DeFi at a Glance</h2>
              <p>
                Monitor all your assets on Sui in one place. The Cerebra
                dashboard provides real-time portfolio tracking with interactive
                charts and personalized insights. View liquidity pools, loans,
                and vault positions side-by-side.
              </p>

              <div className="dashboard-stats">
                <div className="dashboard-stat">
                  <span className="label">Portfolio Value</span>
                  <span className="value">$152.34</span>
                </div>
                <div className="dashboard-stat">
                  <span className="label">Yield Earned</span>
                  {/* Changed to accent-green class to make the positive value green */}
                  <span className="value accent-green">+$13.64</span>
                </div>
                <div className="dashboard-stat">
                  <span className="label">Connected DEXs</span>
                  <span className="value accent-magenta">5</span>
                </div>
              </div>

              {/* Updated link to go to portfolio page */}
              <Link to="/portfolio" className="btn btn--primary">
                Explore Dashboard
              </Link>
            </motion.div>

            <motion.div
              className="dashboard-preview__image"
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              {/* Also updated the portfolio dashboard image for consistency */}
              <img src="/SuiFolio.jpg" alt="Cerebra Dashboard Interface" />
              <div className="glow-effect"></div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* AI-Powered Search Section */}
      <section className="ai-search">
        <div className="container">
          <div className="ai-search__content">
            <motion.div
              className="ai-search__text"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2>Intelligent DeFi Search</h2>
              <p>
                Cerebra's integrated search engine uses AI to bring you answers
                from across the web and Sui's on-chain data. Get real-time
                insights from forums, documentation, and even YouTube tutorials,
                all within the dashboard.
              </p>
            </motion.div>

            <motion.div
              className="ai-search__demo"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <form className="search-bar-container" onSubmit={handleSearch}>
                <div className="search-bar">
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Ask Cerebra: e.g. 'Best Sui yield farms this week'"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={handleSearchFocus}
                    onBlur={handleSearchBlur}
                  />
                  <FaRobot className="search-icon robot-icon" />
                </div>

                {/* Updated button to redirect to search page */}
                <button type="submit" className="btn btn--search">
                  Search
                </button>
              </form>

              <div className="search-example">
                <div className="search-question">
                  <span>Q: What's the APY on Cetus USDC pool?</span>
                </div>
                <div className="search-answer">
                  <span className="ai-badge">AI</span>
                  <p>
                    Cetus's USDC/SUI pool is currently offering ~12.4% APY,
                    compounding daily. This rate is based on the last 24h
                    trading volume and may fluctuate. The pool has $45.7M TVL
                    with a 0.3% fee structure.
                  </p>
                </div>
              </div>
            </motion.div>

            <div className="sources-list">
              <span className="sources-title">Powered by:</span>
              <div className="source-items">
                <div className="source-item">
                  <span className="source-icon web"></span>
                  <span>Web</span>
                </div>
                <div className="source-item">
                  <span className="source-icon youtube"></span>
                  <span>YouTube</span>
                </div>
                <div className="source-item">
                  <span className="source-icon blockchain"></span>
                  <span>On-Chain</span>
                </div>
                <div className="source-item">
                  <span className="source-icon ai"></span>
                  <span>AI</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="ai-search__background"></div>
        <div className="ai-search__glow ai-search__glow--1"></div>
        <div className="ai-search__glow ai-search__glow--2"></div>
      </section>

      {/* Top Pools Section - Updated to use real data with BirdEye logos */}
      <section className="top-pools">
        <div className="container">
          <motion.h2
            className="section-title"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            Top Performing Pools
          </motion.h2>

          {isLoadingPools ? (
            <div className="pools-loading">
              <div className="spinner"></div>
              <p>Loading pools...</p>
            </div>
          ) : topPools.length === 0 ? (
            <div className="pools-empty">
              <p>No pools found</p>
            </div>
          ) : (
            <div className="pools-grid">
              {topPools.map((pool, index) => (
                <motion.div
                  key={pool.address || `pool-${index}`}
                  className="pool-card"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.1 * (index + 1) }}
                >
                  <div className="pool-header">
                    <div className="token-icons">
                      <img
                        className="token-icon token-a"
                        src={getTokenLogoUrl(pool, true)}
                        alt={pool.tokenA}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            DEFAULT_TOKEN_ICON;
                        }}
                      />
                      <img
                        className="token-icon token-b"
                        src={getTokenLogoUrl(pool, false)}
                        alt={pool.tokenB}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            DEFAULT_TOKEN_ICON;
                        }}
                      />
                    </div>
                    <h3>{`${pool.tokenA}-${pool.tokenB}`}</h3>

                    {/* Protocol Badge */}
                    <div
                      className={`protocol-badge ${getProtocolClass(pool.dex)}`}
                    >
                      {formatProtocolName(pool.dex)}
                    </div>
                  </div>

                  <div className="pool-stats">
                    <div className="pool-stat">
                      <span className="label">TVL</span>
                      <span className="value">
                        {formatCurrency(pool.liquidityUSD)}
                      </span>
                    </div>
                    <div className="pool-stat">
                      <span className="label">APR</span>
                      <span className="value accent-green">
                        {pool.apr.toFixed(1)}%
                      </span>
                    </div>
                    <div className="pool-stat">
                      <span className="label">24h Volume</span>
                      <span className="value accent-blue">
                        {formatCurrency(pool.volumeUSD)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          <div className="view-all">
            {/* Updated link to go to pools page instead of yield */}
            <Link to="/pools" className="btn btn--secondary">
              View All Pools
            </Link>
          </div>
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="cta">
        <div className="container">
          <motion.div
            className="cta__content"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2>Ready to experience the future of DeFi on Sui?</h2>
            <p>
              Start trading, providing liquidity, and exploring the Sui
              ecosystem today with Cerebra Network.
            </p>
            <div className="cta__buttons">
              {/* Updated link to go to swap page */}
              <Link to="/swap" className="btn btn--primary">
                Launch App
              </Link>
              {/* Updated link to go to GitBook home page */}
              <a
                href="https://www.gitbook.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--secondary"
              >
                Read Docs
              </a>
            </div>
          </motion.div>
        </div>
        <div className="cta__glow cta__glow--1"></div>
        <div className="cta__glow cta__glow--2"></div>
        <div className="cta__glow cta__glow--3"></div>
      </section>
    </div>
  );
};

export default Home;

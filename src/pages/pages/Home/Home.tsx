// src/pages/Home.tsx
// Last Updated: 2025-04-27 22:43:53 UTC by jake1318

import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { formatUsd, formatPercentage } from "../../utils/format";
import { getAggregatePoolStats } from "../../services/coinGeckoService";
import "./Home.scss";

interface PoolStats {
  totalTvlUsd: number;
  totalPools: number;
  highestApr: number;
  isLoading: boolean;
  error?: string;
}

const Home: React.FC = () => {
  // State for pool statistics
  const [poolStats, setPoolStats] = useState<PoolStats>({
    totalTvlUsd: 0,
    totalPools: 0,
    highestApr: 0,
    isLoading: true,
  });

  // Fetch aggregated pool data on component mount
  useEffect(() => {
    async function fetchPoolStats() {
      try {
        const stats = await getAggregatePoolStats();
        setPoolStats(stats);
      } catch (error) {
        console.error("Failed to fetch pool statistics:", error);
        setPoolStats((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : "Failed to load data",
        }));
      }
    }

    fetchPoolStats();
  }, []);

  // Format currency with commas and appropriate decimals
  const formatCurrency = (value: number): string => {
    if (value > 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    } else if (value > 1000) {
      return `$${(value / 1000).toFixed(2)}K`;
    } else {
      return `$${value.toFixed(2)}`;
    }
  };

  return (
    <div className="home">
      <section className="hero">
        {/* Add the missing vertical scan line here */}
        <div className="vertical-scan"></div>

        {/* Add glow effects */}
        <div className="glow-1"></div>
        <div className="glow-2"></div>

        <motion.div
          className="hero__content"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1>Welcome to Cerebra Network</h1>
          <p>The future of decentralized finance on the Sui blockchain</p>
          <div className="hero__buttons">
            <Link to="/swap" className="btn btn--primary">
              Start Trading
            </Link>
            <Link to="/pools" className="btn btn--secondary">
              Explore Pools
            </Link>
          </div>
        </motion.div>
        <div className="hero__overlay"></div>
      </section>

      <section className="stats">
        <div className="stats__container">
          <motion.div
            className="stat-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <h3>Total Value Locked</h3>
            {poolStats.isLoading ? (
              <p className="stat-value">Loading...</p>
            ) : poolStats.error ? (
              <p className="stat-value">Error loading data</p>
            ) : (
              <p className="stat-value">
                {formatCurrency(poolStats.totalTvlUsd)}
              </p>
            )}
          </motion.div>

          <motion.div
            className="stat-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <h3>Total Pools</h3>
            {poolStats.isLoading ? (
              <p className="stat-value">Loading...</p>
            ) : poolStats.error ? (
              <p className="stat-value">Error loading data</p>
            ) : (
              <p className="stat-value">{poolStats.totalPools}</p>
            )}
          </motion.div>

          <motion.div
            className="stat-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <h3>Highest APR</h3>
            {poolStats.isLoading ? (
              <p className="stat-value">Loading...</p>
            ) : poolStats.error ? (
              <p className="stat-value">Error loading data</p>
            ) : (
              <p className="stat-value">
                {poolStats.highestApr > 0
                  ? `${poolStats.highestApr.toFixed(2)}%`
                  : "N/A"}
              </p>
            )}
          </motion.div>
        </div>
      </section>

      <section className="features">
        <h2>Why Choose Cerebra Network</h2>
        <div className="features__grid">
          <motion.div
            className="feature-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="feature-icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="feature-icon-svg"
              >
                <path d="M7.5 21L3 16.5L7.5 12L9 13.5L6 16.5L9 19.5L7.5 21ZM16.5 21L15 19.5L18 16.5L15 13.5L16.5 12L21 16.5L16.5 21ZM3 7.5L7.5 3L9 4.5L6 7.5L9 10.5L7.5 12L3 7.5ZM21 7.5L16.5 12L15 10.5L18 7.5L15 4.5L16.5 3L21 7.5Z" />
              </svg>
            </div>
            <h3>Instant Swaps</h3>
            <p>
              Trade tokens quickly with minimal slippage using optimized
              routing.
            </p>
          </motion.div>

          <motion.div
            className="feature-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <div className="feature-icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="feature-icon-svg"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1.93.82 1.62 2.65 1.62 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16z" />
              </svg>
            </div>
            <h3>Earn Yield</h3>
            <p>
              Provide liquidity to pools and earn competitive yields on your
              assets.
            </p>
          </motion.div>

          {/* New Feature Card for AI Search */}
          <motion.div
            className="feature-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <div className="feature-icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="feature-icon-svg"
              >
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
            </div>
            <h3>AI-Powered Search</h3>
            <p>
              Access tailored information with our advanced search tool that
              combines AI, video, and web sources.
            </p>
          </motion.div>

          {/* New Feature Card for Multi-Source Results */}
          <motion.div
            className="feature-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.7 }}
          >
            <div className="feature-icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="feature-icon-svg"
              >
                <path d="M21 12.22C21 6.73 16.74 3 12 3c-4.69 0-9 3.65-9 9.28-.6.97.25 2.26 1.22 2.26h2.33c1.13 0 1.81-.97 1.81-2.26v-4.2c0-1.62 1.77-2.51 3.24-1.93l5.87 2.2c1.05.43 1.53 1.65 1.53 2.79V19c0 1.1.9 2 2 2h0c1.1 0 2-.9 2-2v-6.78z" />
              </svg>
            </div>
            <h3>Multi-Source Results</h3>
            <p>
              Get comprehensive answers from various sources, all curated by our
              advanced AI technology.
            </p>
          </motion.div>

          <motion.div
            className="feature-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
          >
            <div className="feature-icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="feature-icon-svg"
              >
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
              </svg>
            </div>
            <h3>Secure Platform</h3>
            <p>Built on Sui blockchain with secure, audited smart contracts.</p>
          </motion.div>

          <motion.div
            className="feature-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 1.0 }}
          >
            <div className="feature-icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="feature-icon-svg"
              >
                <path d="M13 2.05v3.03c3.39.49 6 3.39 6 6.92 0 .9-.18 1.75-.48 2.54l2.6 1.53c.56-1.24.88-2.62.88-4.07 0-5.18-3.95-9.45-9-9.95zM12 19c-3.87 0-7-3.13-7-7 0-3.53 2.61-6.43 6-6.92V2.05c-5.06.5-9 4.76-9 9.95 0 5.52 4.47 10 9.99 10 3.31 0 6.24-1.61 8.06-4.09l-2.6-1.53C16.17 17.98 14.21 19 12 19z" />
              </svg>
            </div>
            <h3>Low Fees</h3>
            <p>
              Benefit from Sui's low transaction fees and fast confirmation
              times.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="cta">
        <motion.div
          className="cta__content"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h2>Ready to dive into DeFi on Sui?</h2>
          <p>
            Start trading, earning yield, and exploring the future of finance
            today.
          </p>
          <div className="cta__buttons">
            <Link to="/swap" className="btn btn--primary">
              Launch App
            </Link>
            <Link to="/search" className="btn btn--secondary">
              Try AI Search
            </Link>
          </div>
        </motion.div>
      </section>
    </div>
  );
};

export default Home;

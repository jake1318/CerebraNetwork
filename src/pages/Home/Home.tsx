// Home.tsx

import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { formatUsd, formatPercentage } from "../../utils/format";
import "./Home.scss";

// Define the Pool interface based on your backend response
interface Pool {
  id: string;
  name: string;
  tvl: number;
  volume24h: number;
  apr: number;
}

// Set up the API URL using Vite environment variables.
// Ensure you have a .env file with VITE_API_URL defined.
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

const Home: React.FC = () => {
  // Local state for pools data and initialization flag.
  const [pools, setPools] = useState<Pool[]>([]);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // Fetch pool data from your backend on component mount.
  useEffect(() => {
    async function fetchPools() {
      try {
        const response = await fetch(`${API_URL}/pools`);
        if (!response.ok) {
          throw new Error("Failed to fetch pools");
        }
        const data: Pool[] = await response.json();
        setPools(data);
        setIsInitialized(true);
      } catch (error) {
        console.error("Error fetching pools:", error);
      }
    }
    fetchPools();
  }, []);

  // Calculate total TVL across all pools
  const totalTVL = pools.reduce((sum, pool) => sum + pool.tvl, 0);

  // Get top performing pools by APR (top 3)
  const topPools = [...pools].sort((a, b) => b.apr - a.apr).slice(0, 3);

  return (
    <div className="home">
      <section className="hero">
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
            <p className="stat-value">{formatUsd(totalTVL)}</p>
          </motion.div>

          <motion.div
            className="stat-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <h3>Total Pools</h3>
            <p className="stat-value">{pools.length}</p>
          </motion.div>

          <motion.div
            className="stat-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <h3>Highest APR</h3>
            <p className="stat-value">
              {pools.length > 0
                ? formatPercentage(Math.max(...pools.map((p) => p.apr)))
                : "N/A"}
            </p>
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
            <div className="feature-icon">🔄</div>
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
            <div className="feature-icon">💰</div>
            <h3>Earn Yield</h3>
            <p>
              Provide liquidity to pools and earn competitive yields on your
              assets.
            </p>
          </motion.div>

          <motion.div
            className="feature-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <div className="feature-icon">🛡️</div>
            <h3>Secure Platform</h3>
            <p>Built on Sui blockchain with secure, audited smart contracts.</p>
          </motion.div>

          <motion.div
            className="feature-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
          >
            <div className="feature-icon">🚀</div>
            <h3>Low Fees</h3>
            <p>
              Benefit from Sui's low transaction fees and fast confirmation
              times.
            </p>
          </motion.div>
        </div>
      </section>

      {topPools.length > 0 && (
        <section className="top-pools">
          <h2>Top Performing Pools</h2>
          <div className="pools-grid">
            {topPools.map((pool) => (
              <Link
                to={`/pools/${pool.id}`}
                key={pool.id}
                className="pool-card"
              >
                <h3>{pool.name}</h3>
                <div className="pool-stats">
                  <div className="pool-stat">
                    <span className="label">APR</span>
                    <span className="value">{formatPercentage(pool.apr)}</span>
                  </div>
                  <div className="pool-stat">
                    <span className="label">TVL</span>
                    <span className="value">{formatUsd(pool.tvl)}</span>
                  </div>
                  <div className="pool-stat">
                    <span className="label">Volume (24h)</span>
                    <span className="value">{formatUsd(pool.volume24h)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div className="view-all">
            <Link to="/pools" className="btn btn--outline">
              View All Pools
            </Link>
          </div>
        </section>
      )}

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
          <Link to="/swap" className="btn btn--primary">
            Launch App
          </Link>
        </motion.div>
      </section>
    </div>
  );
};

export default Home;

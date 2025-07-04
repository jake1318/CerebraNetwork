import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useWallet, ConnectButton } from "@suiet/wallet-kit";
import { motion } from "framer-motion";
import "./Navbar.scss";

const Navbar: React.FC = () => {
  const location = useLocation();
  const { connected, account, disconnect } = useWallet();

  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [yieldDropdown, setYieldDropdown] = useState(false);
  const [bridgeDropdown, setBridgeDropdown] = useState(false);
  const yieldRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<HTMLDivElement>(null);

  // scroll effect
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // close any dropdown when clicking outside
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (yieldRef.current && !yieldRef.current.contains(e.target as Node)) {
        setYieldDropdown(false);
      }
      if (bridgeRef.current && !bridgeRef.current.contains(e.target as Node)) {
        setBridgeDropdown(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const fmtAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

  return (
    <nav className={`navbar ${isScrolled ? "scrolled" : ""}`}>
      <div className="navbar__container">
        <Link to="/" className="navbar__logo">
          Cerebra Network
        </Link>

        {/* desktop links */}
        <div className="navbar__links">
          <Link to="/" className={location.pathname === "/" ? "active" : ""}>
            Home
          </Link>
          <Link
            to="/search"
            className={location.pathname === "/search" ? "active" : ""}
          >
            Search
          </Link>
          <Link
            to="/swap"
            className={location.pathname === "/swap" ? "active" : ""}
          >
            Swap
          </Link>

          {/* Yield dropdown */}
          <div
            className="dropdown"
            ref={yieldRef}
            onMouseEnter={() => setYieldDropdown(true)}
            onMouseLeave={() => setYieldDropdown(false)}
          >
            <button
              className={`dropdown-toggle ${yieldDropdown ? "open" : ""}`}
            >
              Yield
            </button>
            {yieldDropdown && (
              <div className="dropdown-menu">
                <Link to="/pools" className="dropdown-item">
                  Pools
                </Link>
                <Link to="/positions" className="dropdown-item">
                  Positions
                </Link>
                <Link to="/portfolio" className="dropdown-item">
                  Portfolio
                </Link>
              </div>
            )}
          </div>

          <Link
            to="/dex"
            className={location.pathname === "/dex" ? "active" : ""}
          >
            DEX
          </Link>
          <Link
            to="/lending"
            className={location.pathname === "/lending" ? "active" : ""}
          >
            Lending
          </Link>
          <Link
            to="/perpetual"
            className={location.pathname === "/perpetual" ? "active" : ""}
          >
            Perps
          </Link>

          {/* Bridge dropdown */}
          <div
            className="dropdown"
            ref={bridgeRef}
            onMouseEnter={() => setBridgeDropdown(true)}
            onMouseLeave={() => setBridgeDropdown(false)}
          >
            <button
              className={`dropdown-toggle ${bridgeDropdown ? "open" : ""}`}
            >
              Bridge
            </button>
            {bridgeDropdown && (
              <div className="dropdown-menu">
                <a
                  href="https://bridge.sui.io/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dropdown-item"
                >
                  Sui Bridge
                </a>
                <a
                  href="https://portalbridge.com/#/transfer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dropdown-item"
                >
                  Wormhole
                </a>
              </div>
            )}
          </div>
        </div>

        {/* wallet/connect */}
        <div className="navbar__actions">
          {connected && account ? (
            <div className="wallet-info">
              <span>{fmtAddr(account.address)}</span>
              <button onClick={() => disconnect()}>Disconnect</button>
            </div>
          ) : (
            <ConnectButton className="connect-button">
              Connect Wallet
            </ConnectButton>
          )}
        </div>

        {/* mobile toggle */}
        <button
          className="navbar__mobile-toggle"
          onClick={() => setMobileOpen((o) => !o)}
        >
          <div className={`hamburger ${mobileOpen ? "active" : ""}`}>
            <span />
            <span />
            <span />
          </div>
        </button>
      </div>

      {/* mobile menu */}
      {mobileOpen && (
        <motion.div
          className="navbar__mobile-menu"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* primary links */}
          {[
            { to: "/", label: "Home" },
            { to: "/search", label: "Search" },
            { to: "/swap", label: "Swap" },
          ].map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={location.pathname === to ? "active" : ""}
              onClick={() => setMobileOpen(false)}
            >
              {label}
            </Link>
          ))}

          {/* mobile Yield */}
          <div className="mobile-dropdown">
            <div className="mobile-dropdown-header">Yield</div>
            <div className="mobile-dropdown-items">
              {[
                { to: "/pools", label: "Pools" },
                { to: "/positions", label: "Positions" },
                { to: "/portfolio", label: "Portfolio" },
              ].map(({ to, label }) => (
                <Link key={to} to={to} onClick={() => setMobileOpen(false)}>
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {/* rest of links */}
          {[
            { to: "/dex", label: "DEX" },
            { to: "/lending", label: "Lending" },
            { to: "/perpetual", label: "Perps" },
          ].map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={location.pathname === to ? "active" : ""}
              onClick={() => setMobileOpen(false)}
            >
              {label}
            </Link>
          ))}

          {/* mobile Bridge */}
          <div className="mobile-dropdown">
            <div className="mobile-dropdown-header">Bridge</div>
            <div className="mobile-dropdown-items">
              <a
                href="https://bridge.sui.io/"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileOpen(false)}
              >
                Sui Bridge
              </a>
              <a
                href="https://portalbridge.com/#/transfer"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileOpen(false)}
              >
                Wormhole
              </a>
            </div>
          </div>

          {/* wallet mobile */}
          {connected && account ? (
            <>
              <div className="wallet-info-mobile">
                {fmtAddr(account.address)}
              </div>
              <button
                className="disconnect-button mobile"
                onClick={() => {
                  disconnect();
                  setMobileOpen(false);
                }}
              >
                Disconnect
              </button>
            </>
          ) : (
            <ConnectButton
              className="connect-button mobile"
              onClick={() => setMobileOpen(false)}
            >
              Connect Wallet
            </ConnectButton>
          )}
        </motion.div>
      )}
    </nav>
  );
};

export default Navbar;

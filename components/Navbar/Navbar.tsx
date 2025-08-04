// src/components/Navbar/Navbar.tsx
// Last Updated: 2025-07-25  (with logo update)

import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useWallet, ConnectButton } from "@suiet/wallet-kit";
import { motion } from "framer-motion";
import "./Navbar.scss";

const Navbar: React.FC = () => {
  const location = useLocation();
  const { connected, account, disconnect, select, availableWallets } =
    useWallet();

  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [bridgeDropdown, setBridgeDropdown] = useState(false);
  const bridgeRef = useRef<HTMLDivElement>(null);

  // scroll effect
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // close dropdown when clicking outside
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (bridgeRef.current && !bridgeRef.current.contains(e.target as Node)) {
        setBridgeDropdown(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleConnectWallet = async () => {
    try {
      if (availableWallets && availableWallets.length > 0) {
        await select(availableWallets[0].name);
      }
    } catch (error) {
      console.error("Error connecting wallet:", error);
    }
  };

  const fmtAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;
  const navbarClass = `navbar ${isScrolled ? "scrolled" : ""}`;

  return (
    <nav className={navbarClass}>
      <div className="navbar__container">
        <div className="navbar__logo">
          <Link to="/">
            {/* NEW logo image */}
            <img
              src="/Cerebra.jpg"
              alt="Cerebra Network logo"
              className="logo-img"
            />
            <span className="logo-text">Cerebra</span>
            <span className="logo-network">Network</span>
          </Link>
        </div>

        {/* desktop links */}
        <div className="navbar__links desktop-only">
          <Link
            to="/search"
            className={`${
              location.pathname === "/search" ? "active" : ""
            } search-link`}
          >
            Search
          </Link>
          <Link
            to="/swap"
            className={location.pathname === "/swap" ? "active" : ""}
          >
            Swap
          </Link>
          <Link
            to="/dex"
            className={location.pathname === "/dex" ? "active" : ""}
          >
            DEX
          </Link>
          <Link
            to="/pools"
            className={location.pathname.startsWith("/pools") ? "active" : ""}
          >
            Yield
          </Link>
          <Link
            to="/portfolio"
            className={`${
              location.pathname === "/portfolio" ? "active" : ""
            } suifolio-link`}
          >
            SuiFolio
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
              <span className="wallet-address">{fmtAddr(account.address)}</span>
              <button
                onClick={() => disconnect()}
                className="disconnect-button"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <ConnectButton className="btn btn--connect">
              Connect Wallet
            </ConnectButton>
          )}

          <button
            className="mobile-menu-toggle mobile-only"
            onClick={() => setMobileOpen((o) => !o)}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </div>

      {/* mobile menu */}
      {mobileOpen && (
        <motion.div
          className="navbar__mobile-menu"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {[
            { to: "/search", label: "Search", className: "search-link" },
            { to: "/swap", label: "Swap" },
            { to: "/dex", label: "DEX" },
            { to: "/pools", label: "Yield" },
          ].map(({ to, label, className }) => (
            <Link
              key={to}
              to={to}
              className={`${location.pathname === to ? "active" : ""} ${
                className || ""
              }`}
              onClick={() => setMobileOpen(false)}
            >
              {label}
            </Link>
          ))}

          <Link
            to="/portfolio"
            className={`${
              location.pathname === "/portfolio" ? "active" : ""
            } suifolio-link`}
            onClick={() => setMobileOpen(false)}
          >
            SuiFolio
          </Link>

          {[
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

          {connected && account ? (
            <>
              <div className="wallet-info-mobile">
                <span className="wallet-address">
                  {fmtAddr(account.address)}
                </span>
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
              className="btn btn--connect mobile"
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

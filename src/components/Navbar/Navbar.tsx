import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useWallet, ConnectButton } from "@suiet/wallet-kit";
import { motion } from "framer-motion";
import "./Navbar.scss";

const Navbar: React.FC = () => {
  const location = useLocation();
  const { connected, account, disconnect } = useWallet();
  const [isScrolled, setIsScrolled] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Check if page is scrolled
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Format address for display
  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Custom styled wallet connect button
  const CustomConnectButton = () => {
    return (
      <div className="custom-connect-wrapper">
        <ConnectButton className="custom-connect-button">
          Connect Wallet
        </ConnectButton>
      </div>
    );
  };

  return (
    <nav className={`navbar ${isScrolled ? "scrolled" : ""}`}>
      <div className="navbar__container">
        <Link to="/" className="navbar__logo">
          Cerebra Network
        </Link>

        <div className="navbar__links">
          <Link to="/" className={location.pathname === "/" ? "active" : ""}>
            Home
          </Link>
          <Link
            to="/swap"
            className={location.pathname === "/swap" ? "active" : ""}
          >
            Swap
          </Link>
          <Link
            to="/pools-and-vaults"
            className={
              location.pathname === "/pools-and-vaults" ? "active" : ""
            }
          >
            Pools & Vaults
          </Link>
          <Link
            to="/dex"
            className={location.pathname === "/dex" ? "active" : ""}
          >
            DEX
          </Link>
          <Link
            to="/search"
            className={location.pathname === "/search" ? "active" : ""}
          >
            Search
          </Link>
        </div>

        <div className="navbar__actions">
          {connected && account ? (
            <div className="wallet-info">
              <div className="wallet-address">
                {formatAddress(account.address)}
              </div>
              <button
                className="disconnect-button"
                onClick={() => disconnect()}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="connect-wrapper">
              <CustomConnectButton />
            </div>
          )}
        </div>

        <button
          className="navbar__mobile-toggle"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          <div className={`hamburger ${isMobileMenuOpen ? "active" : ""}`}>
            <span></span>
            <span></span>
            <span></span>
          </div>
        </button>
      </div>

      {isMobileMenuOpen && (
        <motion.div
          className="navbar__mobile-menu"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Link
            to="/"
            className={location.pathname === "/" ? "active" : ""}
            onClick={() => setIsMobileMenuOpen(false)}
          >
            Home
          </Link>
          <Link
            to="/swap"
            className={location.pathname === "/swap" ? "active" : ""}
            onClick={() => setIsMobileMenuOpen(false)}
          >
            Swap
          </Link>
          <Link
            to="/pools-and-vaults"
            className={
              location.pathname === "/pools-and-vaults" ? "active" : ""
            }
            onClick={() => setIsMobileMenuOpen(false)}
          >
            Pools & Vaults
          </Link>
          <Link
            to="/dex"
            className={location.pathname === "/dex" ? "active" : ""}
            onClick={() => setIsMobileMenuOpen(false)}
          >
            DEX
          </Link>
          <Link
            to="/search"
            className={location.pathname === "/search" ? "active" : ""}
            onClick={() => setIsMobileMenuOpen(false)}
          >
            Search
          </Link>

          {connected && account ? (
            <>
              <div className="wallet-info-mobile">
                <div className="wallet-address">
                  {formatAddress(account.address)}
                </div>
              </div>
              <button
                className="disconnect-button mobile"
                onClick={() => {
                  disconnect();
                  setIsMobileMenuOpen(false);
                }}
              >
                Disconnect
              </button>
            </>
          ) : (
            <div className="connect-wrapper-mobile">
              <CustomConnectButton />
            </div>
          )}
        </motion.div>
      )}
    </nav>
  );
};

export default Navbar;

import React from "react";
import { Link } from "react-router-dom";
import "./Footer.scss";

const Footer: React.FC = () => {
  return (
    <footer className="footer">
      <div className="footer__content">
        <div className="footer__section">
          <h3 className="footer__title">Cerebra Network</h3>
          <p className="footer__description">
            The future of decentralized finance on the Sui blockchain. Trade
            tokens, provide liquidity, and earn rewards with our cutting-edge
            DeFi platform powered by advanced blockchain technology.
          </p>
        </div>

        <div className="footer__section">
          <h3 className="footer__title">Quick Links</h3>
          <ul className="footer__links">
            <li>
              <Link to="/">Home</Link>
            </li>
            <li>
              <Link to="/swap">Swap</Link>
            </li>
            <li>
              <Link to="/pools">Yield</Link>
            </li>
            <li>
              <Link to="/dex">DEX</Link>
            </li>
            <li>
              <Link to="/search">Search</Link>
            </li>
          </ul>
        </div>

        <div className="footer__section">
          <h3 className="footer__title">Resources</h3>
          <ul className="footer__links">
            <li>
              <a
                href="https://docs.sui.io/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Sui Documentation
              </a>
            </li>
            <li>
              <a
                href="https://port.7k.ag/docs"
                target="_blank"
                rel="noopener noreferrer"
              >
                7K Aggregator
              </a>
            </li>
            <li>
              <a
                href="https://suiet.app/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Suiet Wallet
              </a>
            </li>
            <li>
              <a
                href="https://sui.io/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Sui Blockchain
              </a>
            </li>
          </ul>
        </div>

        <div className="footer__section">
          <h3 className="footer__title">Community</h3>
          <ul className="footer__links">
            <li>
              <a
                href="https://x.com/Cerebra_Net"
                target="_blank"
                rel="noopener noreferrer"
              >
                Twitter
              </a>
            </li>
            <li>
              <a
                href="https://discord.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Discord
              </a>
            </li>
            <li>
              <a
                href="https://github.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
            </li>
            <li>
              <a
                href="https://medium.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Medium
              </a>
            </li>
          </ul>
        </div>
      </div>

      {/* Add background effects */}
      <div className="footer-glow footer-glow-1"></div>
      <div className="footer-glow footer-glow-2"></div>

      {/* Copyright line with current year and last updated info */}
      <div className="footer__copyright">
        © {new Date().getFullYear()} Cerebra Network. All rights reserved.
        <span className="footer__updated">Last updated: 2025-05-09</span>
      </div>
    </footer>
  );
};

export default Footer;

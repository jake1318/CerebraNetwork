// src/components/Footer.tsx
// Last Updated: 2025-07-14 23:17:21 UTC by jake1318

import React from "react";
import { Link } from "react-router-dom";
import "./Footer.scss";
import { FaTwitter, FaDiscord, FaTelegram, FaGithub } from "react-icons/fa";

const Footer: React.FC = () => {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__grid">
          <div className="footer__brand">
            <Link to="/" className="footer-logo">
              <span className="logo-text">Cerebra</span>
              <span className="logo-network">Network</span>
            </Link>
            <p>The future of decentralized finance on the Sui blockchain.</p>
            <div className="social-links">
              <a
                href="https://twitter.com/cerebranetwork"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FaTwitter />
              </a>
              <a
                href="https://discord.gg/cerebranetwork"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FaDiscord />
              </a>
              <a
                href="https://t.me/cerebranetwork"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FaTelegram />
              </a>
              <a
                href="https://github.com/cerebranetwork"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FaGithub />
              </a>
            </div>
          </div>

          <div className="footer__links">
            <div className="footer__link-group">
              <h4>Products</h4>
              <Link to="/swap">Trade</Link>
              <Link to="/lending">Lend</Link>
              <Link to="/vaults">Vaults</Link>
              <Link to="/bridge">Bridge</Link>
              <Link to="/search">AI Search</Link>
            </div>

            <div className="footer__link-group">
              <h4>Resources</h4>
              {/* Changed links to non-clickable spans */}
              <span className="footer__link-disabled">Documentation</span>
              <span className="footer__link-disabled">FAQ</span>
              <span className="footer__link-disabled">Blog</span>
              <span className="footer__link-disabled">Roadmap</span>
            </div>

            <div className="footer__link-group">
              <h4>Company</h4>
              {/* Changed links to non-clickable spans */}
              <span className="footer__link-disabled">About Us</span>
              <span className="footer__link-disabled">Careers</span>
              <span className="footer__link-disabled">Contact</span>
            </div>
          </div>
        </div>

        <div className="footer__bottom">
          <div className="footer__copyright">
            <p>
              © {new Date().getFullYear()} Cerebra Network. All rights reserved.
            </p>
          </div>
          <div className="footer__legal">
            {/* Changed links to non-clickable spans */}
            <span className="footer__link-disabled">Privacy Policy</span>
            <span className="footer__link-disabled">Terms of Service</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

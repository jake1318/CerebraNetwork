import React, { useState, useEffect, useRef } from "react";
import { Token } from "../services/tokenService";
import "./TokenSelectorModal.scss";

interface TokenSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (token: Token) => void;
  excludeToken?: Token;
  tokens: Token[];
  loading: boolean;
}

const TokenSelectorModal: React.FC<TokenSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  excludeToken,
  tokens,
  loading,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredTokens, setFilteredTokens] = useState<Token[]>([]);
  const modalRef = useRef<HTMLDivElement>(null);

  // Filter tokens based on search query and excluded token
  useEffect(() => {
    if (!tokens) return;

    const filtered = tokens.filter((token) => {
      // Don't show the token that's already selected in the other field
      if (excludeToken && token.address === excludeToken.address) return false;

      // Return all tokens if no search query
      if (!searchQuery) return true;

      // Search by symbol, name, or address
      const query = searchQuery.toLowerCase();
      return (
        token.symbol.toLowerCase().includes(query) ||
        (token.name && token.name.toLowerCase().includes(query)) ||
        token.address.toLowerCase().includes(query)
      );
    });

    setFilteredTokens(filtered);
  }, [tokens, excludeToken, searchQuery]);

  // Handle click outside modal to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // If modal is not open, don't render anything
  if (!isOpen) return null;

  return (
    <div className="token-modal-overlay">
      <div className="token-modal" ref={modalRef}>
        <div className="token-modal-header">
          <h3>Select a Token</h3>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="search-container">
          <input
            type="text"
            placeholder="Search name or paste address"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="token-list-container">
          {loading ? (
            <div className="loading-spinner">Loading tokens...</div>
          ) : filteredTokens.length > 0 ? (
            <div className="token-list">
              {filteredTokens.map((token) => (
                <div
                  key={token.address}
                  className="token-item"
                  onClick={() => {
                    onSelect(token);
                    onClose();
                  }}
                >
                  <div className="token-icon">
                    {token.logo ? (
                      <img src={token.logo} alt={token.symbol} />
                    ) : (
                      <div className="fallback-icon">
                        {token.symbol.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="token-info">
                    <div className="token-symbol">{token.symbol}</div>
                    <div className="token-name">
                      {token.name || "Unknown Token"}
                    </div>
                  </div>
                  {token.balance && (
                    <div className="token-balance">
                      <span className="balance-amount">
                        {parseFloat(token.balance).toFixed(4)}
                      </span>
                      {token.balanceUsd && (
                        <span className="balance-usd">
                          ${parseFloat(token.balanceUsd).toFixed(2)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="no-results">No tokens found</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TokenSelectorModal;

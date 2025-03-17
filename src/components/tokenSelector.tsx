import { useState, useEffect, useRef } from "react";
import {
  Token,
  fetchTokens,
  getUserTokenBalances,
} from "../services/tokenService";
import { useWallet } from "@suiet/wallet-kit";
import "./TokenSelector.css";

interface TokenSelectorProps {
  onSelect: (token: Token) => void;
  currentToken?: Token;
  label?: string;
  excludeToken?: Token;
}

// List of important token symbols to prioritize in the selector
const PRIORITY_TOKENS = ["SUI", "USDC", "USDT", "WETH", "BTC", "ETH", "CETUS"];

export default function TokenSelector({
  onSelect,
  currentToken,
  label,
  excludeToken,
}: TokenSelectorProps) {
  const wallet = useWallet();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [filteredTokens, setFilteredTokens] = useState<Token[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load tokens
  useEffect(() => {
    const loadTokens = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const tokenList = await fetchTokens();

        // If wallet is connected, load balances
        if (wallet.connected && wallet.account?.address) {
          try {
            const tokensWithBalances = await getUserTokenBalances(
              wallet.account.address,
              tokenList
            );
            setTokens(tokensWithBalances);
            setFilteredTokens(tokensWithBalances);
          } catch (balanceError) {
            console.error("Error loading balances:", balanceError);
            setTokens(tokenList);
            setFilteredTokens(tokenList);
          }
        } else {
          setTokens(tokenList);
          setFilteredTokens(tokenList);
        }
      } catch (error: any) {
        console.error("Error loading tokens:", error);
        setError("Failed to load tokens. " + (error.message || ""));
        setTokens([]);
        setFilteredTokens([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadTokens();
  }, [wallet.connected, wallet.account?.address]);

  // Filter and sort tokens when search term or exclude token changes
  useEffect(() => {
    let filtered = tokens;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(
        (token) =>
          token.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
          token.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          token.address.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Exclude the specified token
    if (excludeToken) {
      filtered = filtered.filter(
        (token) => token.address !== excludeToken.address
      );
    }

    // Sort tokens: prioritize tokens with balances, then popular tokens, then alphabetically
    filtered = [...filtered].sort((a, b) => {
      // First priority: Tokens with positive balance
      const aBalance = a.balance ? parseFloat(a.balance) : 0;
      const bBalance = b.balance ? parseFloat(b.balance) : 0;

      if (aBalance > 0 && bBalance === 0) return -1;
      if (aBalance === 0 && bBalance > 0) return 1;
      if (aBalance > 0 && bBalance > 0) {
        if (parseFloat(a.balanceUsd || "0") > parseFloat(b.balanceUsd || "0"))
          return -1;
        if (parseFloat(a.balanceUsd || "0") < parseFloat(b.balanceUsd || "0"))
          return 1;
      }

      // Second priority: Priority tokens list
      const aPriority = PRIORITY_TOKENS.indexOf(a.symbol);
      const bPriority = PRIORITY_TOKENS.indexOf(b.symbol);

      if (aPriority !== -1 && bPriority === -1) return -1;
      if (aPriority === -1 && bPriority !== -1) return 1;
      if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;

      // Last resort: alphabetical sorting
      return a.symbol.localeCompare(b.symbol);
    });

    setFilteredTokens(filtered);
  }, [searchTerm, tokens, excludeToken]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Handle token selection
  const handleSelectToken = (token: Token) => {
    onSelect(token);
    setIsOpen(false);
    setSearchTerm("");
  };

  return (
    <div className="token-selector" ref={dropdownRef}>
      {label && <label className="token-selector-label">{label}</label>}

      <button
        className="token-selector-button"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        {currentToken ? (
          <span className="selected-token">
            {currentToken.logo && (
              <img
                src={currentToken.logo}
                alt={currentToken.symbol}
                width="24"
                height="24"
                onError={(e) => {
                  (
                    e.target as HTMLImageElement
                  ).src = `https://ui-avatars.com/api/?name=${currentToken.symbol}&background=random`;
                }}
              />
            )}
            <span className="token-symbol">{currentToken.symbol}</span>
          </span>
        ) : (
          <span>Select Token</span>
        )}
        <span className="dropdown-arrow">▼</span>
      </button>

      {isOpen && (
        <div className="token-dropdown">
          <div className="token-search">
            <input
              type="text"
              placeholder="Search tokens by name or address"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>

          <div className="token-list-container">
            {isLoading ? (
              <div className="token-loading">Loading tokens...</div>
            ) : error ? (
              <div className="token-error">{error}</div>
            ) : (
              <div className="token-list">
                {filteredTokens.length > 0 ? (
                  filteredTokens.map((token) => (
                    <div
                      key={token.address}
                      className={`token-item ${
                        currentToken?.address === token.address
                          ? "selected"
                          : ""
                      }`}
                      onClick={() => handleSelectToken(token)}
                    >
                      <div className="token-info">
                        <img
                          src={token.logo}
                          alt={token.symbol}
                          onError={(e) => {
                            (
                              e.target as HTMLImageElement
                            ).src = `https://ui-avatars.com/api/?name=${token.symbol}&background=random`;
                          }}
                        />
                        <div className="token-details">
                          <div className="token-symbol">{token.symbol}</div>
                          <div className="token-name">
                            {token.name || token.symbol}
                          </div>
                        </div>
                      </div>

                      {token.balance && (
                        <div className="token-balance">
                          <div>{token.balance}</div>
                          {token.balanceUsd && (
                            <div className="token-balance-usd">
                              ${token.balanceUsd}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="no-tokens">No tokens found</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

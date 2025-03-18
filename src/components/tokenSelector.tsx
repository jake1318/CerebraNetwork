import { useState, useEffect, useRef } from "react";
import {
  useWallet,
  useSuiProvider,
  useAccountBalance,
} from "@suiet/wallet-kit";
import { Token, fetchTokens } from "../services/tokenService";
import { getCoinMetadata, getTokenPrice } from "../services/sdkService";
import "./tokenSelector.scss";

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
  const provider = useSuiProvider();
  const { balance: suiBalance, loading: suiBalanceLoading } =
    useAccountBalance();

  const [tokens, setTokens] = useState<Token[]>([]);
  const [filteredTokens, setFilteredTokens] = useState<Token[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>(
    {}
  );
  const [loadingBalances, setLoadingBalances] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load tokens
  useEffect(() => {
    const loadTokens = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const tokenList = await fetchTokens();
        setTokens(tokenList);
        setFilteredTokens(tokenList);
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
  }, []);

  // Fetch balances when wallet is connected and tokens are loaded
  useEffect(() => {
    if (
      !wallet.connected ||
      !wallet.account?.address ||
      tokens.length === 0 ||
      !provider
    ) {
      return;
    }

    const fetchBalances = async () => {
      setLoadingBalances(true);
      const balances: Record<string, string> = {};

      try {
        // First, add SUI balance from the hook
        if (suiBalance && !suiBalanceLoading) {
          const suiToken = tokens.find((t) => t.address === "0x2::sui::SUI");
          if (suiToken) {
            // Convert from MIST to SUI (divide by 10^9)
            const suiBalanceFormatted = (parseInt(suiBalance) / 1e9).toFixed(4);
            balances["0x2::sui::SUI"] = suiBalanceFormatted;
          }
        }

        // Get balances for all tokens using getAllBalances
        try {
          const allBalances = await provider.getAllBalances({
            owner: wallet.account.address,
          });

          // Process all coin balances returned from the wallet
          for (const balance of allBalances) {
            if (
              balance.coinType === "0x2::sui::SUI" &&
              balances["0x2::sui::SUI"]
            )
              continue; // Skip SUI if we already have it

            try {
              // Get coin metadata to determine decimals
              const metadata = await provider.getCoinMetadata({
                coinType: balance.coinType,
              });
              const decimals = metadata?.decimals || 9;

              // Convert to human readable format
              const formattedBalance = (
                parseInt(balance.totalBalance) / Math.pow(10, decimals)
              ).toFixed(4);
              balances[balance.coinType] = formattedBalance;

              // If this is a new token not in our list, add it
              if (!tokens.some((t) => t.address === balance.coinType)) {
                tokens.push({
                  symbol:
                    metadata?.symbol ||
                    balance.coinType.split("::").pop() ||
                    "Unknown",
                  name: metadata?.name || "Unknown Token",
                  address: balance.coinType,
                  decimals: decimals,
                  logo: `https://ui-avatars.com/api/?name=${
                    metadata?.symbol || "Token"
                  }&background=random`,
                });
              }
            } catch (metadataError) {
              console.warn(
                `Could not get metadata for ${balance.coinType}:`,
                metadataError
              );
              // Default to 9 decimals if metadata unavailable
              const formattedBalance = (
                parseInt(balance.totalBalance) / 1e9
              ).toFixed(4);
              balances[balance.coinType] = formattedBalance;
            }
          }
        } catch (allBalancesError) {
          console.warn(
            "getAllBalances failed, falling back to individual fetches:",
            allBalancesError
          );

          // Fallback: fetch balances individually for known tokens
          for (const token of tokens) {
            if (token.address === "0x2::sui::SUI" && balances["0x2::sui::SUI"])
              continue; // Skip SUI if we already have it

            try {
              const result = await provider.getBalance({
                owner: wallet.account.address,
                coinType: token.address,
              });

              if (result?.totalBalance) {
                const decimals = token.decimals;
                const formattedBalance = (
                  parseInt(result.totalBalance) / Math.pow(10, decimals)
                ).toFixed(4);
                balances[token.address] = formattedBalance;
              }
            } catch (balanceError) {
              console.warn(
                `Could not fetch balance for ${token.symbol}:`,
                balanceError
              );
              // Skip this token if balance fetch fails
            }
          }
        }

        setTokenBalances(balances);

        // Update tokens with balances and USD values
        const tokensWithBalances = await Promise.all(
          tokens.map(async (token) => {
            const balance = balances[token.address];

            if (balance) {
              // Try to get price and calculate USD value
              let balanceUsd = "";
              let price = 0;

              try {
                price = await getTokenPrice(token.address);
                if (price) {
                  balanceUsd = (parseFloat(balance) * price).toFixed(2);
                }
              } catch (priceError) {
                console.warn(
                  `Could not get price for ${token.symbol}:`,
                  priceError
                );
              }

              return {
                ...token,
                balance,
                balanceUsd,
                price,
              };
            }

            return token;
          })
        );

        setTokens(tokensWithBalances);
        setFilteredTokens(
          applyFilters(tokensWithBalances, searchTerm, excludeToken)
        );
      } catch (error) {
        console.error("Error fetching balances:", error);
      } finally {
        setLoadingBalances(false);
      }
    };

    fetchBalances();
  }, [
    wallet.connected,
    wallet.account?.address,
    tokens.length,
    provider,
    suiBalance,
    suiBalanceLoading,
  ]);

  // Helper function to apply filters and sorting
  const applyFilters = (
    tokenList: Token[],
    search: string,
    exclude?: Token
  ) => {
    let filtered = [...tokenList];

    // Filter by search term
    if (search) {
      filtered = filtered.filter(
        (token) =>
          token.symbol.toLowerCase().includes(search.toLowerCase()) ||
          token.name?.toLowerCase().includes(search.toLowerCase()) ||
          token.address.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Exclude the specified token
    if (exclude) {
      filtered = filtered.filter((token) => token.address !== exclude.address);
    }

    // Sort tokens: prioritize tokens with balances, then popular tokens, then alphabetically
    filtered = filtered.sort((a, b) => {
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

    return filtered;
  };

  // Filter tokens when search term or exclude token changes
  useEffect(() => {
    setFilteredTokens(applyFilters(tokens, searchTerm, excludeToken));
  }, [searchTerm, excludeToken]);

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
                {wallet.connected && loadingBalances && (
                  <div className="token-loading">Fetching balances...</div>
                )}

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

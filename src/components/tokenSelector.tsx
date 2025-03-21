import { useState, useEffect, useRef } from "react";
import {
  useWallet,
  useSuiProvider,
  useAccountBalance,
  SUI_TYPE_ARG,
} from "@suiet/wallet-kit";
import { CoinMetadata } from "@mysten/sui.js/client";
import { Token, fetchTokens } from "../services/tokenService";
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
  // This hook will give us the SUI balance
  const {
    balance: suiBalance,
    loading: suiLoading,
    error: suiError,
  } = useAccountBalance();

  const [tokens, setTokens] = useState<Token[]>([]);
  const [filteredTokens, setFilteredTokens] = useState<Token[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>(
    {}
  );
  const [tokenMetadata, setTokenMetadata] = useState<
    Record<string, CoinMetadata>
  >({});

  const modalRef = useRef<HTMLDivElement>(null);
  const initialLoadRef = useRef(false);

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

  // Fetch token balances when wallet is connected
  useEffect(() => {
    if (
      !wallet.connected ||
      !wallet.account?.address ||
      !provider ||
      tokens.length === 0
    ) {
      return;
    }

    // Only run this on initial load or when explicitly refreshed
    if (initialLoadRef.current && Object.keys(tokenBalances).length > 0) {
      return;
    }

    initialLoadRef.current = true;

    const fetchBalances = async () => {
      console.log(
        "Fetching token balances for wallet:",
        wallet.account!.address
      );
      setLoadingBalances(true);

      try {
        const balances: Record<string, string> = {};
        const metadata: Record<string, CoinMetadata> = {};

        // 1. Add SUI balance from the hook
        if (!suiLoading && !suiError && suiBalance) {
          const suiBalanceInDecimals = (parseInt(suiBalance) / 1e9).toFixed(4);
          balances[SUI_TYPE_ARG] = suiBalanceInDecimals;
          console.log("SUI balance from hook:", suiBalanceInDecimals);
        }

        // 2. Get all coins owned by the wallet
        const allCoinsResponse = await provider.getAllCoins({
          owner: wallet.account!.address,
        });

        console.log("All coins response:", allCoinsResponse);

        // Group coins by type and sum their balances
        const coinsByType: Record<string, bigint> = {};

        allCoinsResponse.data.forEach((coin) => {
          const coinType = coin.coinType;
          if (!coinsByType[coinType]) {
            coinsByType[coinType] = BigInt(0);
          }
          coinsByType[coinType] += BigInt(coin.balance);
        });

        console.log("Coins grouped by type:", coinsByType);

        // 3. For each coin type, get metadata and format balance
        await Promise.all(
          Object.entries(coinsByType).map(async ([coinType, totalBalance]) => {
            // Skip SUI as we already have it from the hook
            if (coinType === SUI_TYPE_ARG && balances[SUI_TYPE_ARG]) {
              return;
            }

            try {
              // Get metadata for this coin
              const coinMetadata = await provider.getCoinMetadata({
                coinType,
              });

              if (coinMetadata) {
                metadata[coinType] = coinMetadata;
                const decimals = coinMetadata.decimals;

                // Format the balance with proper decimals
                const formattedBalance = formatBalanceWithDecimals(
                  totalBalance.toString(),
                  decimals
                );

                balances[coinType] = formattedBalance;
                console.log(
                  `${coinMetadata.symbol} balance: ${formattedBalance}`
                );
              } else {
                // If no metadata, use default 9 decimals
                const formattedBalance = formatBalanceWithDecimals(
                  totalBalance.toString(),
                  9
                );
                balances[coinType] = formattedBalance;
              }
            } catch (metadataError) {
              console.warn(
                `Error getting metadata for ${coinType}:`,
                metadataError
              );
              // Still store the balance with default formatting
              const formattedBalance = formatBalanceWithDecimals(
                totalBalance.toString(),
                9
              );
              balances[coinType] = formattedBalance;
            }
          })
        );

        setTokenBalances(balances);
        setTokenMetadata(metadata);

        // 4. Update tokens with balances
        const tokensWithBalances = tokens.map((token) => {
          if (balances[token.address]) {
            return {
              ...token,
              balance: balances[token.address],
            };
          }
          return token;
        });

        // 5. Add any coins from the wallet that aren't in our list
        const newTokens: Token[] = [];

        Object.entries(coinsByType).forEach(([coinType, _]) => {
          // If this coin type isn't in our token list yet
          if (
            !tokens.some((t) => t.address === coinType) &&
            balances[coinType]
          ) {
            // Create a new token entry for it
            const meta = metadata[coinType];
            const symbol =
              meta?.symbol || coinType.split("::").pop() || "Unknown";
            const name = meta?.name || symbol;

            newTokens.push({
              symbol,
              name,
              address: coinType,
              decimals: meta?.decimals || 9,
              logo:
                meta?.iconUrl ||
                `https://ui-avatars.com/api/?name=${symbol}&background=random`,
              balance: balances[coinType],
            });
          }
        });

        if (newTokens.length > 0) {
          const updatedTokens = [...tokensWithBalances, ...newTokens];
          setTokens(updatedTokens);
          setFilteredTokens(
            applyFilters(updatedTokens, searchTerm, excludeToken)
          );
        } else {
          setTokens(tokensWithBalances);
          setFilteredTokens(
            applyFilters(tokensWithBalances, searchTerm, excludeToken)
          );
        }
      } catch (error) {
        console.error("Error fetching token balances:", error);
        setError("Failed to load some token balances.");
      } finally {
        setLoadingBalances(false);
      }
    };

    fetchBalances();
  }, [
    wallet.connected,
    wallet.account?.address,
    provider,
    tokens.length,
    suiBalance,
    suiLoading,
    suiError,
  ]);

  // Helper function to format balance with proper decimals
  const formatBalanceWithDecimals = (
    balance: string,
    decimals: number
  ): string => {
    const balanceBigInt = BigInt(balance);
    const divisor = BigInt(10) ** BigInt(decimals);
    const wholePart = balanceBigInt / divisor;
    const fractionalPart = balanceBigInt % divisor;

    // Pad the fractional part with leading zeros
    const fractionalStr = fractionalPart.toString().padStart(decimals, "0");

    // Format to 4 decimal places
    return `${wholePart.toString()}.${fractionalStr.slice(0, 4)}`;
  };

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
          (token.name &&
            token.name.toLowerCase().includes(search.toLowerCase())) ||
          token.address.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Exclude the specified token
    if (exclude) {
      filtered = filtered.filter((token) => token.address !== exclude.address);
    }

    // Sort tokens: prioritize tokens with balances, then popular tokens, then by volume
    filtered = filtered.sort((a, b) => {
      // First priority: Tokens with balance
      const aHasBalance = !!a.balance && parseFloat(a.balance) > 0;
      const bHasBalance = !!b.balance && parseFloat(b.balance) > 0;

      if (aHasBalance && !bHasBalance) return -1;
      if (!aHasBalance && bHasBalance) return 1;

      // For tokens with balance, sort by balance amount
      if (aHasBalance && bHasBalance) {
        return parseFloat(b.balance!) - parseFloat(a.balance!);
      }

      // Second priority: Priority tokens list
      const aPriority = PRIORITY_TOKENS.indexOf(a.symbol);
      const bPriority = PRIORITY_TOKENS.indexOf(b.symbol);

      if (aPriority !== -1 && bPriority === -1) return -1;
      if (aPriority === -1 && bPriority !== -1) return 1;
      if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;

      // Third priority: Sort by trading volume
      if (a.volume24h && b.volume24h) {
        return b.volume24h - a.volume24h;
      }

      // Last resort: alphabetical sorting
      return a.symbol.localeCompare(b.symbol);
    });

    return filtered;
  };

  // Function to manually refresh balances
  const refreshBalances = () => {
    if (wallet.connected && wallet.account?.address && provider) {
      initialLoadRef.current = false; // Reset to force a refresh
      setTokenBalances({}); // Clear existing balances
      // The useEffect will handle the refresh
    }
  };

  // Filter tokens when search term or exclude token changes
  useEffect(() => {
    setFilteredTokens(applyFilters(tokens, searchTerm, excludeToken));
  }, [searchTerm, excludeToken, tokens]);

  // Close modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node) &&
        isOpen
      ) {
        setIsOpen(false);
        setSearchTerm(""); // Clear search when closing
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // ESC key to close modal
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
        setSearchTerm("");
      }
    };

    document.addEventListener("keydown", handleEscapeKey);
    return () => {
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, [isOpen]);

  // Handle token selection
  const handleSelectToken = (token: Token) => {
    onSelect(token);
    setIsOpen(false);
    setSearchTerm("");
  };

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isOpen]);

  return (
    <div className="token-selector">
      {label && <label className="token-selector-label">{label}</label>}

      <button
        className="token-selector-button"
        onClick={() => setIsOpen(true)}
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
        <div className="token-modal-overlay">
          <div className="token-modal" ref={modalRef}>
            <div className="token-modal-header">
              <h3>Select a Token</h3>
              <div className="token-modal-actions">
                {wallet.connected && (
                  <button
                    className="refresh-button"
                    onClick={refreshBalances}
                    disabled={loadingBalances}
                    title="Refresh balances"
                    type="button"
                  >
                    {loadingBalances ? "..." : "↻"}
                  </button>
                )}
                <button
                  className="close-button"
                  onClick={() => {
                    setIsOpen(false);
                    setSearchTerm("");
                  }}
                  type="button"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="token-search">
              <input
                type="text"
                placeholder="Search by name, symbol, or address"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
            </div>

            {wallet.connected && (
              <div className="wallet-tokens-section">
                <div className="section-title">
                  <span>Wallet Tokens</span>
                  {loadingBalances && (
                    <span className="loading-indicator">Loading...</span>
                  )}
                </div>
                <div className="wallet-tokens">
                  {Object.keys(tokenBalances).length > 0 ? (
                    tokens
                      .filter(
                        (token) =>
                          token.balance && parseFloat(token.balance) > 0
                      )
                      .map((token) => (
                        <div
                          key={token.address}
                          className={`wallet-token-chip ${
                            currentToken?.address === token.address
                              ? "selected"
                              : ""
                          }`}
                          onClick={() => handleSelectToken(token)}
                        >
                          {token.logo && (
                            <img
                              src={token.logo}
                              alt={token.symbol}
                              onError={(e) => {
                                (
                                  e.target as HTMLImageElement
                                ).src = `https://ui-avatars.com/api/?name=${token.symbol}&background=random`;
                              }}
                            />
                          )}
                          <span>{token.symbol}</span>
                        </div>
                      ))
                  ) : !loadingBalances ? (
                    <div className="no-wallet-tokens">
                      No tokens found in wallet
                    </div>
                  ) : (
                    <div className="no-wallet-tokens">
                      Fetching wallet tokens...
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="token-list-container">
              {isLoading ? (
                <div className="token-loading">
                  <div className="loading-spinner"></div>
                  <p>Loading tokens...</p>
                </div>
              ) : error ? (
                <div className="token-error">{error}</div>
              ) : (
                <>
                  <div className="section-title">All Tokens</div>

                  {filteredTokens.length > 0 ? (
                    <div className="token-list">
                      {filteredTokens.map((token) => (
                        <div
                          key={token.address}
                          className={`token-item ${
                            currentToken?.address === token.address
                              ? "selected"
                              : ""
                          } ${
                            token.balance && parseFloat(token.balance) > 0
                              ? "in-wallet"
                              : ""
                          }`}
                          onClick={() => handleSelectToken(token)}
                        >
                          <div className="token-info">
                            <div className="token-icon">
                              <img
                                src={token.logo}
                                alt={token.symbol}
                                onError={(e) => {
                                  (
                                    e.target as HTMLImageElement
                                  ).src = `https://ui-avatars.com/api/?name=${token.symbol}&background=random`;
                                }}
                              />
                              {token.balance &&
                                parseFloat(token.balance) > 0 && (
                                  <div
                                    className="wallet-indicator"
                                    title="In wallet"
                                  ></div>
                                )}
                            </div>
                            <div className="token-details">
                              <div className="token-symbol">{token.symbol}</div>
                              <div className="token-name">
                                {token.name || token.symbol}
                              </div>
                            </div>
                          </div>

                          {token.balance && parseFloat(token.balance) > 0 ? (
                            <div className="token-balance">
                              <div className="balance-amount">
                                {token.balance}
                              </div>
                              {token.balanceUsd && (
                                <div className="balance-usd">
                                  ${token.balanceUsd}
                                </div>
                              )}
                            </div>
                          ) : token.volume24h ? (
                            <div className="token-volume">
                              <div className="volume-label">24h Vol</div>
                              <div className="volume-amount">
                                ${(token.volume24h / 1000000).toFixed(1)}M
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="no-tokens">
                      <p>No tokens found matching "{searchTerm}"</p>
                      {searchTerm.length > 10 &&
                        searchTerm.startsWith("0x") && (
                          <div className="token-address-import">
                            <p>Is this a token address?</p>
                            <button
                              className="import-token-button"
                              onClick={() => {
                                if (
                                  searchTerm.startsWith("0x") &&
                                  searchTerm.length > 10
                                ) {
                                  try {
                                    const parts = searchTerm.split("::");
                                    const symbol =
                                      parts.length > 2 ? parts[2] : "CUSTOM";

                                    const newToken: Token = {
                                      symbol,
                                      name: `Custom ${symbol} Token`,
                                      address: searchTerm,
                                      decimals: 9, // Default decimals
                                      logo: `https://ui-avatars.com/api/?name=${symbol}&background=random`,
                                    };

                                    // Add to tokens list
                                    setTokens((prev) => [...prev, newToken]);

                                    // Select the token
                                    handleSelectToken(newToken);

                                    console.log(
                                      "Added custom token:",
                                      newToken
                                    );
                                  } catch (error) {
                                    console.error(
                                      "Failed to import token:",
                                      error
                                    );
                                    alert(
                                      "Failed to import token. Please check the address."
                                    );
                                  }
                                }
                              }}
                              type="button"
                            >
                              Import Token
                            </button>
                          </div>
                        )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

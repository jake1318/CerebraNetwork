import { useState, useEffect, useContext } from "react";
import { useWallet } from "@suiet/wallet-kit"; // Or your current wallet hook
import { birdeyeService } from "../../services/birdeyeService";
import "./PortfolioTracker.scss";

interface TokenHolding {
  symbol: string;
  name: string;
  logo: string;
  address: string;
  balance: number;
  price: number;
  value: number;
  change24h: number;
}

const PortfolioTracker = () => {
  const { account, connected } = useWallet();
  const [holdings, setHoldings] = useState<TokenHolding[]>([]);
  const [totalValue, setTotalValue] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (connected && account?.address) {
      fetchPortfolio(account.address);
    } else {
      setHoldings([]);
      setTotalValue(0);
    }
  }, [connected, account]);

  const fetchPortfolio = async (address: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await birdeyeService.getWalletTokenList(address);

      if (response && response.data) {
        const portfolioData = response.data.map((token: any) => ({
          symbol: token.symbol || "Unknown",
          name: token.name || "Unknown Token",
          logo: token.logo || "",
          address: token.address,
          balance:
            parseFloat(token.balance) / Math.pow(10, token.decimals || 9),
          price: token.price || 0,
          value:
            (parseFloat(token.balance) / Math.pow(10, token.decimals || 9)) *
            (token.price || 0),
          change24h: token.priceChange24h || 0,
        }));

        // Sort by value (highest first)
        portfolioData.sort(
          (a: TokenHolding, b: TokenHolding) => b.value - a.value
        );

        setHoldings(portfolioData);

        // Calculate total portfolio value
        const total = portfolioData.reduce(
          (sum: number, token: TokenHolding) => sum + token.value,
          0
        );
        setTotalValue(total);
      }
    } catch (err) {
      console.error("Error fetching portfolio:", err);
      setError("Failed to load portfolio. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  // Format currency
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Format percentage
  const formatPercentage = (value: number): string => {
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  };

  if (!connected) {
    return (
      <div className="portfolio-tracker portfolio-not-connected">
        <h2>Your Portfolio</h2>
        <p>Please connect your wallet to view your portfolio</p>
      </div>
    );
  }

  return (
    <div className="portfolio-tracker">
      <div className="portfolio-header">
        <h2>Your Portfolio</h2>
        <div className="portfolio-total">
          <span className="total-label">Total Value:</span>
          <span className="total-value">{formatCurrency(totalValue)}</span>
        </div>
      </div>

      {isLoading ? (
        <div className="portfolio-loading">Loading portfolio data...</div>
      ) : error ? (
        <div className="portfolio-error">{error}</div>
      ) : holdings.length === 0 ? (
        <div className="portfolio-empty">No tokens found in this wallet</div>
      ) : (
        <div className="portfolio-tokens">
          <div className="token-list-header">
            <div className="token-info">Token</div>
            <div className="token-balance">Balance</div>
            <div className="token-price">Price</div>
            <div className="token-change">24h</div>
            <div className="token-value">Value</div>
          </div>

          {holdings.map((token) => (
            <div key={token.address} className="token-item">
              <div className="token-info">
                {token.logo && (
                  <img
                    src={token.logo}
                    alt={token.symbol}
                    className="token-logo"
                  />
                )}
                <div className="token-name-container">
                  <span className="token-symbol">{token.symbol}</span>
                  <span className="token-name">{token.name}</span>
                </div>
              </div>
              <div className="token-balance">
                {token.balance.toLocaleString(undefined, {
                  maximumFractionDigits: 6,
                })}
              </div>
              <div className="token-price">{formatCurrency(token.price)}</div>
              <div
                className={`token-change ${
                  token.change24h >= 0 ? "positive" : "negative"
                }`}
              >
                {formatPercentage(token.change24h)}
              </div>
              <div className="token-value">{formatCurrency(token.value)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PortfolioTracker;

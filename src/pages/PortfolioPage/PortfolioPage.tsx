import { useState } from "react";
import PortfolioTracker from "../../components/PortfolioTracker/PortfolioTracker";
import TokenChart from "../../components/TokenChart/TokenChart";
import TokenSelector from "../../components/TokenSelector/TokenSelector";
import "./PortfolioPage.scss";

interface TokenData {
  address: string;
  symbol: string;
  name: string;
  logo: string;
  decimals: number;
  price: number;
}

const PortfolioPage = () => {
  const [selectedToken, setSelectedToken] = useState<TokenData | null>(null);
  const [isTokenSelectorOpen, setIsTokenSelectorOpen] = useState(false);

  const handleTokenSelect = (token: TokenData) => {
    setSelectedToken(token);
    setIsTokenSelectorOpen(false);
  };

  return (
    <div className="portfolio-page">
      <h1>Portfolio Dashboard</h1>

      <PortfolioTracker />

      <div className="token-chart-section">
        <div className="section-header">
          <h2>
            {selectedToken
              ? `${selectedToken.name} (${selectedToken.symbol})`
              : "Token Chart"}
          </h2>
          <button
            className="select-token-button"
            onClick={() => setIsTokenSelectorOpen(true)}
          >
            {selectedToken ? "Change Token" : "Select Token"}
          </button>
        </div>

        {selectedToken ? (
          <TokenChart tokenAddress={selectedToken.address} />
        ) : (
          <div className="select-token-prompt">
            Please select a token to view its chart
          </div>
        )}
      </div>

      <TokenSelector
        isOpen={isTokenSelectorOpen}
        onClose={() => setIsTokenSelectorOpen(false)}
        onSelect={handleTokenSelect}
      />
    </div>
  );
};

export default PortfolioPage;

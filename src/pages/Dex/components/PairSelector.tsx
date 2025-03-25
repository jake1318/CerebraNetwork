import React, { useState } from "react";
import "./PairSelector.scss";

interface TradingPair {
  id: string;
  name: string;
  baseAsset: string;
  quoteAsset: string;
  price: number;
  change24h: number;
}

interface PairSelectorProps {
  pairs: TradingPair[];
  selectedPair: TradingPair;
  onSelectPair: (pair: TradingPair) => void;
}

const PairSelector: React.FC<PairSelectorProps> = ({
  pairs,
  selectedPair,
  onSelectPair,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const toggleDropdown = () => {
    setIsDropdownOpen((prev) => !prev);
  };

  const handlePairSelect = (pair: TradingPair) => {
    onSelectPair(pair);
    setIsDropdownOpen(false);
  };

  // Filter pairs based on search query
  const filteredPairs = pairs.filter(
    (pair) =>
      pair.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pair.baseAsset.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pair.quoteAsset.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="pair-selector">
      <div className="selected-pair" onClick={toggleDropdown}>
        <span className="pair-name">{selectedPair.name}</span>
        <span
          className={`pair-change ${
            selectedPair.change24h >= 0 ? "positive" : "negative"
          }`}
        >
          {selectedPair.change24h >= 0 ? "+" : ""}
          {selectedPair.change24h.toFixed(2)}%
        </span>
        <span className="dropdown-arrow">▼</span>
      </div>

      {isDropdownOpen && (
        <div className="pair-dropdown">
          <div className="search-container">
            <input
              type="text"
              placeholder="Search pairs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>
          <div className="pair-list">
            {filteredPairs.map((pair) => (
              <div
                key={pair.id}
                className={`pair-option ${
                  selectedPair.id === pair.id ? "selected" : ""
                }`}
                onClick={() => handlePairSelect(pair)}
              >
                <span className="pair-name">{pair.name}</span>
                <div className="pair-details">
                  <span className="pair-price">
                    $
                    {pair.price.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 6,
                    })}
                  </span>
                  <span
                    className={`pair-change ${
                      pair.change24h >= 0 ? "positive" : "negative"
                    }`}
                  >
                    {pair.change24h >= 0 ? "+" : ""}
                    {pair.change24h.toFixed(2)}%
                  </span>
                </div>
              </div>
            ))}
            {filteredPairs.length === 0 && (
              <div className="no-results">No pairs found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PairSelector;

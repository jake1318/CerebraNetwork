// src/pages/Dex/components/PairSelector.tsx
// Last Updated: 2025-06-26 03:47:51 UTC by jake1318

import React, { useState } from "react";

interface TradingPair {
  id: string;
  name: string;
  baseAsset: string;
  quoteAsset: string;
  price: number;
  change24h: number;
  volume24h: number; // Still in data model but won't display
  high24h: number;
  low24h: number;
  baseAddress: string;
  quoteAddress: string;
  logo?: string;
}

interface PairSelectorProps {
  pairs: TradingPair[];
  selectedPair: TradingPair | null;
  onSelectPair: (pair: TradingPair) => void;
}

const PairSelector: React.FC<PairSelectorProps> = ({
  pairs,
  selectedPair,
  onSelectPair,
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPairs = pairs.filter((pair) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      pair.baseAsset.toLowerCase().includes(searchLower) ||
      pair.name.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="pair-selector">
      <div className="search-box">
        <input
          type="text"
          className="search-input"
          placeholder="Search pairs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="pair-list">
        {/* Column headers with updated layout */}
        <div className="pair-header">
          <div className="header-pair">Pair</div>
          <div className="header-data">
            <div className="header-price">Price</div>
            <div className="header-change">24h</div>
          </div>
        </div>

        {filteredPairs.map((pair) => (
          <div
            key={pair.id}
            className={`pair-item ${
              selectedPair?.id === pair.id ? "selected" : ""
            }`}
            onClick={() => onSelectPair(pair)}
          >
            <div className="pair-token">
              {pair.logo ? (
                <img src={pair.logo} alt={pair.baseAsset} />
              ) : (
                <div className="token-placeholder" />
              )}
              <span className="token-name">{pair.baseAsset}</span>
            </div>
            <div className="pair-data">
              <span className="price">
                $
                {pair.price < 0.01
                  ? pair.price.toFixed(6)
                  : pair.price.toFixed(4)}
              </span>
              <span
                className={`change ${
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
          <div className="no-pairs-found">
            No pairs matching "{searchQuery}"
          </div>
        )}
      </div>
    </div>
  );
};

export default PairSelector;
